import { describe, it, expect, beforeEach } from "vitest";
import { HDNodeWallet, Mnemonic } from "ethers";
import { claimShow, ClaimError } from "@/lib/claim";
import { findOrCreateUser } from "@/lib/users";
import { deriveCustodialAddress } from "@/lib/wallet";
import type { Db } from "@/lib/db";
import { createTestDb, seedShow, testXpub, TEST_MNEMONIC } from "./helpers";

const NOW = new Date("2026-11-21T11:00:00Z");

describe("觀眾帳號與代管錢包", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("第一次登入建立帳號，並推導出代管錢包地址", async () => {
    const u = await findOrCreateUser(db, { provider: "line", subject: "U123", displayName: "觀眾甲" }, testXpub());
    expect(u.wallet_type).toBe("custodial");
    expect(u.wallet_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("再次登入是同一位觀眾，地址不變", async () => {
    const a = await findOrCreateUser(db, { provider: "line", subject: "U123" }, testXpub());
    const b = await findOrCreateUser(db, { provider: "line", subject: "U123", displayName: "改名了" }, testXpub());
    expect(b.id).toBe(a.id);
    expect(b.wallet_address).toBe(a.wallet_address);
    expect(b.display_name).toBe("改名了");
  });

  it("LINE 與 Google 登入是不同觀眾，地址也不同", async () => {
    const a = await findOrCreateUser(db, { provider: "line", subject: "U1" }, testXpub());
    const b = await findOrCreateUser(db, { provider: "google", subject: "G1", email: "x@example.com" }, testXpub());
    expect(a.id).not.toBe(b.id);
    expect(a.wallet_address).not.toBe(b.wallet_address);
  });

  it("伺服器只用公鑰推導出的地址，與離線助記詞推導的私鑰地址一致", () => {
    const fromPrivate = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(TEST_MNEMONIC), "m/44'/60'/0'/0/7").address;
    expect(deriveCustodialAddress(testXpub(), 7)).toBe(fromPrivate);
  });
});

describe("掃碼領取", () => {
  let db: Db;
  let userA: string;
  let userB: string;

  beforeEach(async () => {
    db = await createTestDb();
    userA = (await findOrCreateUser(db, { provider: "line", subject: "UA" }, testXpub())).id;
    userB = (await findOrCreateUser(db, { provider: "google", subject: "GB" }, testXpub())).id;
  });

  it("依領取順序配發入場編號", async () => {
    const { code } = await seedShow(db);
    const a = await claimShow(db, userA, code, NOW);
    const b = await claimShow(db, userB, code, NOW);
    expect(a.serial).toBe(1);
    expect(b.serial).toBe(2);
    expect(a.alreadyClaimed).toBe(false);
  });

  it("同一位觀眾重複掃碼，回傳原本的紀錄，不重發編號", async () => {
    const { code } = await seedShow(db);
    const first = await claimShow(db, userA, code, NOW);
    const again = await claimShow(db, userA, code, NOW);
    expect(again.claimId).toBe(first.claimId);
    expect(again.serial).toBe(1);
    expect(again.alreadyClaimed).toBe(true);
    const b = await claimShow(db, userB, code, NOW);
    expect(b.serial).toBe(2);
  });

  it("不同場次的編號各自計算", async () => {
    const s1 = await seedShow(db);
    const s2 = await seedShow(db);
    expect((await claimShow(db, userA, s1.code, NOW)).serial).toBe(1);
    expect((await claimShow(db, userA, s2.code, NOW)).serial).toBe(1);
  });

  it("找不到領取碼", async () => {
    await expect(claimShow(db, userA, "NOPE", NOW)).rejects.toMatchObject({ code: "CODE_NOT_FOUND" });
  });

  it("不在開放時段", async () => {
    const { code } = await seedShow(db, {
      validFrom: new Date("2026-11-21T10:00:00Z"),
      validTo: new Date("2026-11-21T14:00:00Z"),
    });
    await expect(claimShow(db, userA, code, new Date("2026-11-21T09:59:00Z"))).rejects.toBeInstanceOf(ClaimError);
    await expect(claimShow(db, userA, code, new Date("2026-11-21T14:01:00Z"))).rejects.toMatchObject({
      code: "CODE_NOT_ACTIVE",
    });
    await expect(claimShow(db, userA, code, new Date("2026-11-21T12:00:00Z"))).resolves.toMatchObject({ serial: 1 });
  });

  it("達到領取上限後不能再領，但已領過的人仍可取回紀錄", async () => {
    const { code } = await seedShow(db, { maxClaims: 1 });
    await claimShow(db, userA, code, NOW);
    await expect(claimShow(db, userB, code, NOW)).rejects.toMatchObject({ code: "SOLD_OUT" });
    await expect(claimShow(db, userA, code, NOW)).resolves.toMatchObject({ alreadyClaimed: true });
  });

  it("同時大量領取，編號連續且不重複", async () => {
    const { code, showId } = await seedShow(db);
    const users = await Promise.all(
      Array.from({ length: 30 }, (_, i) => findOrCreateUser(db, { provider: "line", subject: "bulk-" + i }, testXpub()))
    );
    const results = await Promise.all(users.map((u) => claimShow(db, u.id, code, NOW)));
    const serials = results.map((r) => r.serial).sort((a, b) => a - b);
    expect(serials).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    const count = await db.query<{ n: string }>(`SELECT count(*) AS n FROM claims WHERE show_id = $1`, [showId]);
    expect(Number(count.rows[0].n)).toBe(30);
  });

  it("領取後狀態為待上鏈", async () => {
    const { code } = await seedShow(db);
    const r = await claimShow(db, userA, code, NOW);
    const row = await db.query<{ chain_status: string }>(`SELECT chain_status FROM claims WHERE id = $1`, [r.claimId]);
    expect(row.rows[0].chain_status).toBe("pending");
  });
});
