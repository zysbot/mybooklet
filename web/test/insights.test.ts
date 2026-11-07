import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import { findOrCreateUser } from "@/lib/users";
import { getInsights, getFreeStats, mask, MIN_GROUP } from "@/lib/insights";
import { setFavorite, getFavorites, removeFavorite, FavoriteError } from "@/lib/favorites";
import { createTestDb } from "./helpers";

/**
 * 測試資料：
 * - 劇團「甲」：戲劇《潮線》，在「海港劇場」演 2 場
 * - 劇團「乙」：舞蹈《鹽》在「山城藝文中心」；音樂《雙聲》在「海港劇場」
 * - 劇團「丙」：小製作，只有 4 位觀眾
 */
async function build(db: Db) {
  const org = async (name: string, kind: string) =>
    (await db.query<{ id: string }>(`INSERT INTO organizers (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind])).rows[0].id;
  const companyA = await org("劇團甲", "company");
  const companyB = await org("劇團乙", "company");
  const companyC = await org("劇團丙", "company");
  const producer = await org("製作方丁", "producer");
  const harbor = await org("海港劇場", "venue");
  const hill = await org("山城藝文中心", "venue");

  const production = async (company: string, title: string, genre: string, producerId: string | null = null) => {
    const p = (await db.query<{ id: string }>(
      `INSERT INTO productions (organizer_id, title, company_name, genre, producer_id) VALUES ($1, $2, '名稱', $3, $4) RETURNING id`,
      [company, title, genre, producerId]
    )).rows[0].id;
    const d = (await db.query<{ id: string }>(`INSERT INTO designs (production_id, label) VALUES ($1, '一般場') RETURNING id`, [p])).rows[0].id;
    await db.query(`UPDATE productions SET default_design_id = $2 WHERE id = $1`, [p, d]);
    return p;
  };
  const show = async (production: string, venueId: string, venueName: string, at: string) =>
    (await db.query<{ id: string }>(
      `INSERT INTO shows (production_id, starts_at, venue, venue_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [production, at, venueName, venueId]
    )).rows[0].id;

  const tide = await production(companyA, "潮線", "戲劇", producer);
  const tide1 = await show(tide, harbor, "海港劇場", "2026-10-01T11:00:00Z");
  const tide2 = await show(tide, harbor, "海港劇場", "2026-10-02T11:00:00Z");
  const salt = await production(companyB, "鹽", "舞蹈");
  const salt1 = await show(salt, hill, "山城藝文中心", "2026-09-01T11:00:00Z");
  const duet = await production(companyB, "雙聲", "音樂");
  const duet1 = await show(duet, harbor, "海港劇場", "2026-08-01T11:00:00Z");
  const small = await production(companyC, "小品", "戲劇");
  const small1 = await show(small, hill, "山城藝文中心", "2026-07-01T11:00:00Z");

  const users: string[] = [];
  for (let i = 0; i < 20; i++) {
    users.push((await findOrCreateUser(db, { provider: "line", subject: `U-secret-${i}`, email: `p${i}@example.com` })).id);
  }
  const serial: Record<string, number> = {};
  const claim = async (user: string, showId: string, at: string) => {
    serial[showId] = (serial[showId] ?? 0) + 1;
    return (await db.query<{ id: string }>(
      `INSERT INTO claims (user_id, show_id, serial, claimed_at) VALUES ($1, $2, $3, $4) RETURNING id`,
      [user, showId, serial[showId], at]
    )).rows[0].id;
  };

  // 《潮線》第一場：觀眾 0–11（12 人）；其中 0–4 又看了第二場（5 人，回頭觀眾）
  const tideClaims: string[] = [];
  for (let i = 0; i < 12; i++) tideClaims.push(await claim(users[i], tide1, "2026-10-01T10:30:00Z"));
  for (let i = 0; i < 5; i++) await claim(users[i], tide2, "2026-10-02T10:30:00Z");
  // 《鹽》（更早）：觀眾 0–9 與 12–13 → 潮線觀眾中有 10 人看過舞蹈；潮線觀眾 10、11 是第一次用吾冊
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13]) await claim(users[i], salt1, "2026-09-01T10:30:00Z");
  // 《雙聲》（更早，同樣在海港劇場）：觀眾 0–2
  for (let i = 0; i < 3; i++) await claim(users[i], duet1, "2026-08-01T10:30:00Z");
  // 小品：觀眾 15–18（4 人）
  for (let i = 15; i < 19; i++) await claim(users[i], small1, "2026-07-01T10:30:00Z");

  return { companyA, companyB, companyC, producer, harbor, hill, users, tideClaims };
}

describe("主辦方統計與隱私", () => {
  let db: Db;
  let ctx: Awaited<ReturnType<typeof build>>;

  beforeEach(async () => {
    db = await createTestDb();
    ctx = await build(db);
  });

  it("劇團看到自己所有場次的領取數與觀眾人數", async () => {
    const r = (await getInsights(db, ctx.companyA))!;
    expect(r.totals).toEqual({ shows: 2, claims: 17, audience: 12 });
    expect(r.shows.map((s) => s.claims)).toEqual([5, 12]); // 新的場次在前
  });

  it("1 到 9 人的分群只顯示「少於 10」", async () => {
    const r = (await getInsights(db, ctx.companyA))!;
    expect(r.composition.returning).toEqual({ n: null, hidden: true, pct: null }); // 5 人
    expect(r.composition.firstTime).toEqual({ n: null, hidden: true, pct: null }); // 2 人
  });

  it("足跡：觀眾在其他地方看過的類型，達到 10 人才列出", async () => {
    const r = (await getInsights(db, ctx.companyA))!;
    const dance = r.genres.find((g) => g.genre === "舞蹈")!;
    expect(dance.count).toEqual({ n: 10, hidden: false, pct: 83 });
    expect(r.genres.find((g) => g.genre === "音樂")).toBeUndefined(); // 3 人：整列不列出
    expect(r.genres.every((g) => !g.count.hidden)).toBe(true);
  });

  it("足跡：人數太少的場館連名字都不列出", async () => {
    const r = (await getInsights(db, ctx.companyA))!;
    expect(r.venues.map((v) => v.venue)).toEqual(["山城藝文中心"]); // 10 人；海港劇場的《雙聲》只有 3 人
  });

  it("不洩漏任何觀眾身分，也不點名其他劇團", async () => {
    const r = await getInsights(db, ctx.companyA);
    const json = JSON.stringify(r);
    for (const secret of ["U-secret", "觀眾", "@example.com", "0x", "劇團乙", "劇團丙", "鹽", "雙聲"]) {
      expect(json).not.toContain(secret);
    }
    const names = await db.query<{ pseudonym: string }>(`SELECT pseudonym FROM users`);
    for (const { pseudonym } of names.rows) expect(json).not.toContain(pseudonym);
  });

  it("觀眾不到 10 人時，整個足跡不提供", async () => {
    const r = (await getInsights(db, ctx.companyC))!;
    expect(r.totals.audience).toBe(4);
    expect(r.footprintAvailable).toBe(false);
    expect(r.genres).toEqual([]);
    expect(r.venues).toEqual([]);
    expect(r.depth).toEqual([]);
  });

  it("場館看到在館內演出的所有場次，不論是哪個劇團", async () => {
    const r = (await getInsights(db, ctx.harbor))!;
    expect(r.totals).toEqual({ shows: 3, claims: 20, audience: 12 });
    expect(r.venues.find((v) => v.venue === "海港劇場")).toBeUndefined(); // 自己不算在足跡裡
  });

  it("製作方看到自己製作的節目", async () => {
    const r = (await getInsights(db, ctx.producer))!;
    expect(r.totals.claims).toBe(17);
  });

  it("收藏深度與前三喜歡", async () => {
    for (let i = 0; i < 10; i++) await setFavorite(db, ctx.users[i], ctx.tideClaims[i], 1);
    const r = (await getInsights(db, ctx.companyA))!;
    expect(r.favorites).toEqual({ n: 10, hidden: false, pct: 83 });
    const total = r.depth.reduce((sum, d) => sum + (d.count.n ?? 0), 0);
    expect(r.depth.map((d) => d.label)).toEqual(["第一份", "2 到 4 份", "5 到 9 份", "10 份以上"]);
    expect(total).toBeLessThanOrEqual(12);
  });

  it("mask：0 照實顯示，1–9 隱藏，10 以上顯示", () => {
    expect(mask(0, 50)).toEqual({ n: 0, hidden: false, pct: 0 });
    expect(mask(MIN_GROUP - 1, 50).hidden).toBe(true);
    expect(mask(MIN_GROUP, 50)).toEqual({ n: 10, hidden: false, pct: 20 });
    expect(mask(12, 5).pct).toBeNull(); // 總數太少不算比例
  });

  it("免費方案只有每場份數，沒有任何觀眾分析", async () => {
    const r = (await getFreeStats(db, ctx.companyA))!;
    expect(r.totals).toEqual({ shows: 2, claims: 17, minted: 0 });
    expect(r.shows.map((x) => x.claims)).toEqual([5, 12]);
    const json = JSON.stringify(r);
    for (const k of ["audience", "genre", "footprint", "favorites", "U-secret", "@example.com"]) expect(json).not.toContain(k);
  });
});

describe("前三喜歡", () => {
  let db: Db;
  let ctx: Awaited<ReturnType<typeof build>>;
  beforeEach(async () => {
    db = await createTestDb();
    ctx = await build(db);
  });

  async function claimsOf(user: string) {
    return (await db.query<{ id: string }>(`SELECT id FROM claims WHERE user_id = $1 ORDER BY claimed_at`, [user])).rows.map((r) => r.id);
  }

  it("放進名次、取代名次、換名次", async () => {
    const u = ctx.users[0];
    const [duet, salt, tide1, tide2] = await claimsOf(u);
    await setFavorite(db, u, tide1, 1);
    await setFavorite(db, u, salt, 2);
    await setFavorite(db, u, duet, 3);
    expect((await getFavorites(db, u)).map((f) => f.title)).toEqual(["潮線", "鹽", "雙聲"]);

    await setFavorite(db, u, tide2, 1); // 取代第 1 名
    expect((await getFavorites(db, u)).map((f) => f.claimId)).toEqual([tide2, salt, duet]);

    await setFavorite(db, u, duet, 1); // 第 3 名換到第 1 名
    const f = await getFavorites(db, u);
    expect(f.map((x) => [x.rank, x.claimId])).toEqual([[1, duet], [2, salt]]);

    await removeFavorite(db, u, salt);
    expect((await getFavorites(db, u)).length).toBe(1);
  });

  it("不能標記別人的節目單，名次只能 1 到 3", async () => {
    const [othersClaim] = await claimsOf(ctx.users[1]);
    await expect(setFavorite(db, ctx.users[0], othersClaim, 1)).rejects.toBeInstanceOf(FavoriteError);
    const [mine] = await claimsOf(ctx.users[0]);
    await expect(setFavorite(db, ctx.users[0], mine, 4)).rejects.toThrow("名次");
  });
});
