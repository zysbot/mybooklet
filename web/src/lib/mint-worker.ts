import type { Db } from "./db";
import { claimIdToBytes32, type MintChain, type MintRequest } from "./chain";

export interface MintWorkerOptions {
  batchSize?: number;
  maxAttempts?: number;
  /** 送出後超過這個時間仍未確認，視為卡住，重新對帳 */
  staleAfterMs?: number;
  now?: () => Date;
}

export interface MintRunReport {
  reconciled: number;
  submitted: number;
  minted: number;
  retried: number;
  failed: number;
}

const DEFAULTS = { batchSize: 50, maxAttempts: 8, staleAfterMs: 10 * 60 * 1000 };

/** 第 n 次失敗後等待的時間：30 秒、1 分、2 分……最多 1 小時 */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 60 * 60 * 1000);
}

interface QueuedClaim {
  id: string;
  show_id: string;
  serial: number;
  claimed_at: Date;
  attempts: number;
  wallet_address: string;
}

/**
 * 背景上鏈程序：執行一輪。
 * 1. 對帳：送出太久沒確認的紀錄，查合約是否已鑄造。
 * 2. 取出待上鏈紀錄（每次最多 batchSize 筆），合併成一筆交易批次鑄造。
 * 3. 成功就記下 tokenId；失敗就依次數延後重試，超過上限標為 failed。
 *
 * 可以同時有多個程序在跑：取紀錄時用 SKIP LOCKED，不會重複處理。
 */
export async function runMintBatch(db: Db, chain: MintChain, options: MintWorkerOptions = {}): Promise<MintRunReport> {
  const { batchSize, maxAttempts, staleAfterMs } = { ...DEFAULTS, ...options };
  const now = options.now ?? (() => new Date());
  const report: MintRunReport = { reconciled: 0, submitted: 0, minted: 0, retried: 0, failed: 0 };

  // 1. 對帳
  const stale = await db.query<{ id: string }>(
    `SELECT id FROM claims WHERE chain_status = 'submitted' AND submitted_at < $1`,
    [new Date(now().getTime() - staleAfterMs)]
  );
  for (const { id } of stale.rows) {
    const tokenId = await chain.tokenOfClaim(claimIdToBytes32(id));
    if (tokenId > 0n) {
      await db.query(
        `UPDATE claims SET chain_status = 'minted', token_id = $2, minted_at = $3, last_error = NULL WHERE id = $1`,
        [id, tokenId.toString(), now()]
      );
    } else {
      await db.query(
        `UPDATE claims SET chain_status = 'pending', next_attempt_at = $2, last_error = '送出後未確認，重新排隊' WHERE id = $1`,
        [id, now()]
      );
    }
    report.reconciled++;
  }

  // 2. 取出一批並標為已送出
  const batch = await db.tx(async (q) => {
    const picked = await q.query<QueuedClaim>(
      `SELECT c.id, c.show_id, c.serial, c.claimed_at, c.attempts, u.wallet_address
         FROM claims c
         JOIN users u ON u.id = c.user_id
         JOIN shows s ON s.id = c.show_id
        WHERE c.chain_status = 'pending'
          AND c.next_attempt_at <= $1
          AND s.chain_configured
          AND u.wallet_address IS NOT NULL
        ORDER BY c.claimed_at
        LIMIT $2
        FOR UPDATE OF c SKIP LOCKED`,
      [now(), batchSize]
    );
    if (picked.rows.length === 0) return [];
    await q.query(
      `UPDATE claims c SET chain_status = 'submitted', submitted_at = $2, recipient_address = u.wallet_address
         FROM users u
        WHERE u.id = c.user_id AND c.id = ANY($1::uuid[])`,
      [picked.rows.map((r) => r.id), now()]
    );
    return picked.rows;
  });
  if (batch.length === 0) return report;

  const requests: MintRequest[] = batch.map((c) => ({
    to: c.wallet_address,
    showId: BigInt(c.show_id),
    serial: Number(c.serial),
    claimedAt: BigInt(Math.floor(new Date(c.claimed_at).getTime() / 1000)),
    claimId: claimIdToBytes32(c.id),
  }));

  // 3. 送交易
  try {
    const sent = await chain.sendMintBatch(requests);
    report.submitted = batch.length;
    await db.query(`UPDATE claims SET tx_hash = $2 WHERE id = ANY($1::uuid[])`, [batch.map((c) => c.id), sent.txHash]);

    const minted = await sent.wait();
    for (const c of batch) {
      const tokenId = minted.get(claimIdToBytes32(c.id).toLowerCase());
      if (tokenId !== undefined) {
        await db.query(
          `UPDATE claims SET chain_status = 'minted', token_id = $2, minted_at = $3, last_error = NULL WHERE id = $1`,
          [c.id, tokenId.toString(), now()]
        );
        report.minted++;
      } else {
        // 交易成功卻沒有這筆的事件：不應發生，交給下一輪對帳
        await db.query(`UPDATE claims SET last_error = '交易成功但找不到鑄造事件' WHERE id = $1`, [c.id]);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
    for (const c of batch) {
      const attempts = Number(c.attempts) + 1;
      if (attempts >= maxAttempts) {
        await db.query(
          `UPDATE claims SET chain_status = 'failed', attempts = $2, last_error = $3 WHERE id = $1`,
          [c.id, attempts, message]
        );
        report.failed++;
      } else {
        await db.query(
          `UPDATE claims SET chain_status = 'pending', attempts = $2, last_error = $3, next_attempt_at = $4 WHERE id = $1`,
          [c.id, attempts, message, new Date(now().getTime() + backoffMs(attempts))]
        );
        report.retried++;
      }
    }
  }

  return report;
}
