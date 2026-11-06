import { describe, it, expect, beforeEach } from "vitest";
import { runMintBatch, backoffMs } from "@/lib/mint-worker";
import { claimShow } from "@/lib/claim";
import { findOrCreateUser } from "@/lib/users";
import { claimIdToBytes32, type MintChain, type MintRequest } from "@/lib/chain";
import type { Db } from "@/lib/db";
import { createTestDb, seedShow, testXpub } from "./helpers";

const T0 = new Date("2026-11-21T11:00:00Z");

/** 假的區塊鏈：記錄送出的批次，可設定成失敗；行為模仿合約（重複 claimId 回傳原 tokenId） */
function fakeChain() {
  const minted = new Map<string, bigint>();
  let nextToken = 1n;
  const state = {
    batches: [] as MintRequest[][],
    failSend: false,
    failWait: false,
    /** 模擬：交易其實上鏈了，但等待確認時連線中斷 */
    minedButLost: false,
  };
  const chain: MintChain = {
    async sendMintBatch(requests) {
      if (state.failSend) throw new Error("RPC 連線失敗");
      state.batches.push(requests);
      const apply = () => {
        const result = new Map<string, bigint>();
        for (const r of requests) {
          const key = r.claimId.toLowerCase();
          if (!minted.has(key)) minted.set(key, nextToken++);
          result.set(key, minted.get(key)!);
        }
        return result;
      };
      return {
        txHash: "0xtx" + state.batches.length,
        async wait() {
          if (state.failWait) throw new Error("交易失敗");
          const result = apply();
          if (state.minedButLost) throw new Error("等待確認時連線中斷");
          return result;
        },
      };
    },
    async tokenOfClaim(claimId) {
      return minted.get(claimId.toLowerCase()) ?? 0n;
    },
  };
  return { chain, state, minted };
}

async function statusOf(db: Db, claimId: string) {
  const r = await db.query<{ chain_status: string; attempts: number; token_id: string | null; tx_hash: string | null; next_attempt_at: Date }>(
    `SELECT chain_status, attempts, token_id, tx_hash, next_attempt_at FROM claims WHERE id = $1`,
    [claimId]
  );
  return r.rows[0];
}

describe("背景上鏈程序", () => {
  let db: Db;
  let users: string[];

  beforeEach(async () => {
    db = await createTestDb();
    users = [];
    for (let i = 0; i < 5; i++) {
      users.push((await findOrCreateUser(db, { provider: "line", subject: "U" + i }, testXpub())).id);
    }
  });

  it("把待上鏈的紀錄合併成一筆交易鑄造，並記下 tokenId", async () => {
    const { code, showId } = await seedShow(db);
    const claims = [];
    for (const u of users) claims.push(await claimShow(db, u, code, T0));
    const { chain, state } = fakeChain();

    const report = await runMintBatch(db, chain, { now: () => T0 });

    expect(report).toMatchObject({ submitted: 5, minted: 5, retried: 0, failed: 0 });
    expect(state.batches).toHaveLength(1);
    const req = state.batches[0][0];
    expect(req.showId).toBe(BigInt(showId));
    expect(req.serial).toBe(1);
    expect(req.claimId).toBe(claimIdToBytes32(claims[0].claimId));
    expect(req.claimedAt).toBe(BigInt(T0.getTime() / 1000));
    const s = await statusOf(db, claims[0].claimId);
    expect(s.chain_status).toBe("minted");
    expect(s.token_id).toBe("1");
    expect(s.tx_hash).toBe("0xtx1");
  });

  it("鑄造到觀眾的錢包地址", async () => {
    const { code } = await seedShow(db);
    await claimShow(db, users[0], code, T0);
    const { chain, state } = fakeChain();
    await runMintBatch(db, chain, { now: () => T0 });
    const u = await db.query<{ wallet_address: string }>(`SELECT wallet_address FROM users WHERE id = $1`, [users[0]]);
    expect(state.batches[0][0].to).toBe(u.rows[0].wallet_address);
  });

  it("依批次大小分批", async () => {
    const { code } = await seedShow(db);
    for (const u of users) await claimShow(db, u, code, T0);
    const { chain, state } = fakeChain();
    await runMintBatch(db, chain, { now: () => T0, batchSize: 2 });
    await runMintBatch(db, chain, { now: () => T0, batchSize: 2 });
    await runMintBatch(db, chain, { now: () => T0, batchSize: 2 });
    expect(state.batches.map((b) => b.length)).toEqual([2, 2, 1]);
  });

  it("沒有待處理的紀錄時不送交易", async () => {
    const { chain, state } = fakeChain();
    const report = await runMintBatch(db, chain, { now: () => T0 });
    expect(report.submitted).toBe(0);
    expect(state.batches).toHaveLength(0);
  });

  it("場次尚未在合約上設定內容時先不鑄造", async () => {
    const { code } = await seedShow(db, { chainConfigured: false });
    const c = await claimShow(db, users[0], code, T0);
    const { chain, state } = fakeChain();
    await runMintBatch(db, chain, { now: () => T0 });
    expect(state.batches).toHaveLength(0);
    expect((await statusOf(db, c.claimId)).chain_status).toBe("pending");
  });

  it("送出失敗就延後重試，時間到才再送", async () => {
    const { code } = await seedShow(db);
    const c = await claimShow(db, users[0], code, T0);
    const { chain, state } = fakeChain();
    state.failSend = true;

    const r1 = await runMintBatch(db, chain, { now: () => T0 });
    expect(r1.retried).toBe(1);
    let s = await statusOf(db, c.claimId);
    expect(s.chain_status).toBe("pending");
    expect(s.attempts).toBe(1);
    expect(new Date(s.next_attempt_at).getTime()).toBe(T0.getTime() + backoffMs(1));

    // 還沒到重試時間
    state.failSend = false;
    const early = new Date(T0.getTime() + 10_000);
    await runMintBatch(db, chain, { now: () => early });
    expect(state.batches).toHaveLength(0);

    // 時間到了
    const later = new Date(T0.getTime() + backoffMs(1) + 1);
    const r2 = await runMintBatch(db, chain, { now: () => later });
    expect(r2.minted).toBe(1);
    s = await statusOf(db, c.claimId);
    expect(s.chain_status).toBe("minted");
  });

  it("超過重試上限就標為需處理（failed）", async () => {
    const { code } = await seedShow(db);
    const c = await claimShow(db, users[0], code, T0);
    const { chain, state } = fakeChain();
    state.failWait = true;
    let t = T0.getTime();
    for (let i = 0; i < 3; i++) {
      await runMintBatch(db, chain, { now: () => new Date(t), maxAttempts: 3 });
      t += 2 * 60 * 60 * 1000;
    }
    const s = await statusOf(db, c.claimId);
    expect(s.chain_status).toBe("failed");
    expect(s.attempts).toBe(3);
  });

  it("交易其實上鏈了但確認時斷線：重試時合約略過，不會重複鑄造", async () => {
    const { code } = await seedShow(db);
    const c = await claimShow(db, users[0], code, T0);
    const { chain, state, minted } = fakeChain();
    state.minedButLost = true;
    await runMintBatch(db, chain, { now: () => T0 });
    expect((await statusOf(db, c.claimId)).chain_status).toBe("pending");

    state.minedButLost = false;
    await runMintBatch(db, chain, { now: () => new Date(T0.getTime() + backoffMs(1) + 1) });
    const s = await statusOf(db, c.claimId);
    expect(s.chain_status).toBe("minted");
    expect(s.token_id).toBe("1");
    expect(minted.size).toBe(1);
  });

  it("送出後卡住的紀錄：對帳時已鑄造就標為完成，否則重新排隊", async () => {
    const { code } = await seedShow(db);
    const a = await claimShow(db, users[0], code, T0);
    const b = await claimShow(db, users[1], code, T0);
    const { chain, minted } = fakeChain();
    // 模擬程序在送出後當掉：兩筆都停在 submitted，其中 a 其實已上鏈
    await db.query(`UPDATE claims SET chain_status = 'submitted', submitted_at = $1`, [T0]);
    minted.set(claimIdToBytes32(a.claimId).toLowerCase(), 42n);

    const later = new Date(T0.getTime() + 11 * 60 * 1000);
    const report = await runMintBatch(db, chain, { now: () => later });
    expect(report.reconciled).toBe(2);
    expect((await statusOf(db, a.claimId)).token_id).toBe("42");
    // b 重新排隊後，同一輪就被送出鑄造
    expect((await statusOf(db, b.claimId)).chain_status).toBe("minted");
  });

  it("重試間隔遞增，最多一小時", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });
});
