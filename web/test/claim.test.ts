import { describe, it, expect, beforeEach } from "vitest";
import { HDNodeWallet, Mnemonic } from "ethers";
import { claimShow, ClaimError } from "@/lib/claim";
import { findOrCreateUser, backfillPseudonyms } from "@/lib/users";
import { deriveCustodialAddress, newCustodyPath } from "@/lib/wallet";
import { randomPseudonym, PSEUDONYM_SPACE } from "@/lib/pseudonym";
import type { Db } from "@/lib/db";
import { createTestDb, seedShow, testXpub, TEST_MNEMONIC } from "./helpers";

const NOW = new Date("2026-11-21T11:00:00Z");

describe("觀眾帳號與化名", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("第一次登入建立帳號並配一個化名；不保存 LINE、Google 的名稱與大頭貼", async () => {
    const u = await findOrCreateUser(db, { provider: "line", subject: "U123" });
    expect(u.pseudonym).toMatch(/^.+的.+$/);
    expect(u.wallet_type).toBe("custodial");
    expect(u.wallet_address).toBeNull();
    const cols = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
    );
    const names = cols.rows.map((c) => c.column_name);
    expect(names).not.toContain("display_name");
    expect(names).not.toContain("picture_url");
  });

  it("再次登入是同一位觀眾，化名不變；Email 會更新", async () => {
    const a = await findOrCreateUser(db, { provider: "google", subject: "G1", email: "old@example.com" });
    const b = await findOrCreateUser(db, { provider: "google", subject: "G1", email: "new@example.com" });
    expect(b.id).toBe(a.id);
    expect(b.pseudonym).toBe(a.pseudonym);
    expect(b.email).toBe("new@example.com");
  });

  it("LINE 與 Google 登入是不同觀眾", async () => {
    const a = await findOrCreateUser(db, { provider: "line", subject: "U1" });
    const b = await findOrCreateUser(db, { provider: "google", subject: "G1", email: "x@example.com" });
    expect(a.id).not.toBe(b.id);
  });

  it("化名不重複", async () => {
    const users = [];
    for (let i = 0; i < 200; i++) users.push(await findOrCreateUser(db, { provider: "line", subject: "many-" + i }));
    expect(new Set(users.map((u) => u.pseudonym)).size).toBe(200);
  });

  it("化名在 12 字以內，可能的組合超過一萬個", () => {
    for (let i = 0; i < 2000; i++) expect([...randomPseudonym()].length).toBeLessThanOrEqual(12);
    expect(PSEUDONYM_SPACE).toBeGreaterThan(10000);
  });

  it("同時大量註冊，每人都拿到不同的化名", async () => {
    const users = await Promise.all(Array.from({ length: 30 }, (_, i) => findOrCreateUser(db, { provider: "google", subject: "c-" + i })));
    expect(new Set(users.map((u) => u.pseudonym)).size).toBe(30);
  });

  it("舊帳號（沒有化名）在資料庫更新時補上", async () => {
    await db.query(`INSERT INTO users (line_user_id) VALUES ('old-1'), ('old-2')`);
    expect(await backfillPseudonyms(db)).toBe(2);
    const r = await db.query<{ pseudonym: string | null }>(`SELECT pseudonym FROM users`);
    expect(r.rows.every((x) => x.pseudonym)).toBe(true);
    expect(await backfillPseudonyms(db)).toBe(0);
  });
});

describe("代管地址：一份節目單一個地址", () => {
  it("編號三層、每層隨機，每次都不同", () => {
    const paths = new Set(Array.from({ length: 1000 }, () => newCustodyPath()));
    expect(paths.size).toBe(1000);
    for (const p of paths) expect(p).toMatch(/^\d+\/\d+\/\d+$/);
  });

  it("伺服器只用公鑰推導出的地址，與離線助記詞推導的私鑰地址一致", () => {
    const path = "1834620771/90214477/2044012399";
    const fromPrivate = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(TEST_MNEMONIC), `m/44'/60'/0'/0/${path}`).address;
    expect(deriveCustodialAddress(testXpub(), path)).toBe(fromPrivate);
  });

  it("拒絕格式錯誤或超出範圍的編號", () => {
    for (const bad of ["1/2", "1/2/3/4", "a/b/c", "1/2/2147483648", "-1/2/3", ""]) {
      expect(() => deriveCustodialAddress(testXpub(), bad)).toThrow();
    }
  });
});

describe("掃碼領取", () => {
  let db: Db;
  let userA: string;
  let userB: string;

  beforeEach(async () => {
    db = await createTestDb();
    userA = (await findOrCreateUser(db, { provider: "line", subject: "UA" })).id;
    userB = (await findOrCreateUser(db, { provider: "google", subject: "GB" })).id;
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
      Array.from({ length: 30 }, (_, i) => findOrCreateUser(db, { provider: "line", subject: "bulk-" + i }))
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
