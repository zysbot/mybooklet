import { describe, it, expect } from "vitest";
import { findOrCreateUser } from "@/lib/users";
import { getAdminStats } from "@/lib/admin-stats";
import { TEST_VIEWER_PREFIX } from "@/lib/test-data";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-11-07T04:00:00Z"); // 台北 11/7（週六）中午

describe("營運後台的觀眾統計", () => {
  it("總覽、趨勢、組成、回頭率與排行；預設排除測試觀眾", async () => {
    const db = await createTestDb();
    const org = async (name: string) => (await db.query<{ id: string }>(`INSERT INTO organizers (name) VALUES ($1) RETURNING id`, [name])).rows[0].id;
    const A = await org("甲團");
    const B = await org("乙團");
    const show = async (company: string, title: string, at: string) => {
      const p = (await db.query<{ id: string }>(`INSERT INTO productions (organizer_id, title, company_name) VALUES ($1, $2, 'x') RETURNING id`, [company, title])).rows[0].id;
      return (await db.query<{ id: string }>(`INSERT INTO shows (production_id, starts_at, venue) VALUES ($1, $2, '場館') RETURNING id`, [p, at])).rows[0].id;
    };
    const s1 = await show(A, "一", "2026-06-01T11:00:00Z");
    const s2 = await show(B, "二", "2026-07-01T11:00:00Z");
    const s3 = await show(A, "三", "2026-11-03T11:00:00Z");
    const claim = async (u: string, s: string, at: string, serial: number) =>
      db.query(`INSERT INTO claims (user_id, show_id, serial, claimed_at, chain_status) VALUES ($1, $2, $3, $4, $5)`, [u, s, serial, at, serial === 1 ? "minted" : "pending"]);

    const early = await findOrCreateUser(db, { provider: "line", subject: "U-early" });
    const fan = await findOrCreateUser(db, { provider: "google", subject: "g-fan" });
    const fresh = await findOrCreateUser(db, { provider: "google", subject: "g-fresh" });
    await findOrCreateUser(db, { provider: "google", subject: "g-never" }); // 有帳號但沒領過
    const bot = await findOrCreateUser(db, { provider: "google", subject: `${TEST_VIEWER_PREFIX}01` });
    await db.query(`UPDATE users SET age_group = 'adult', social_public = TRUE WHERE id = $1`, [fan.id]);
    await db.query(`UPDATE users SET age_group = 'teen' WHERE id = $1`, [fresh.id]);

    await claim(early.id, s1, "2026-06-01T10:30:00Z", 1); // 6/1 第一次
    await claim(early.id, s2, "2026-07-01T10:30:00Z", 1); // 30 天後又領，跨兩團
    await claim(fan.id, s2, "2026-07-01T10:31:00Z", 2);
    await claim(fan.id, s1, "2026-06-01T10:31:00Z", 2);
    await claim(fan.id, s3, "2026-11-03T10:30:00Z", 1);
    await claim(fresh.id, s3, "2026-11-03T10:31:00Z", 2); // 本週新觀眾
    await claim(bot.id, s3, "2026-11-03T10:32:00Z", 3);

    const r = await getAdminStats(db, { now: NOW });
    expect(r.overview).toMatchObject({ accounts: 4, viewers: 3, newThisWeek: 1, newThisMonth: 1, claims: 6, claimsPerViewer: 2, minted: 3, pending: 3 });
    expect(r.weeks).toHaveLength(12);
    expect(r.weeks.at(-1)).toMatchObject({ label: "11/2", newViewers: 1, claims: 2, active: 2 });
    expect(r.months.map((m) => m.label).slice(-2)).toEqual(["2026/10", "2026/11"]);
    expect(r.months.find((m) => m.label === "2026/06")).toMatchObject({ newViewers: 2, claims: 2, active: 2 });
    expect(r.composition).toEqual({ line: 1, google: 2, adult: 1, teen: 1, ageUnknown: 1, publicCollections: 1 });
    expect(r.retention.repeat).toBe(2);
    expect(r.retention.distribution.map((d) => d.n)).toEqual([1, 1, 1, 0, 0]);
    expect(r.retention.multiCompany).toBe(2);
    expect(r.retention.within90).toEqual({ eligible: 2, returned: 2 });
    expect(r.topCollectors[0]).toMatchObject({ pseudonym: fan.pseudonym, claims: 3, firstClaim: "2026-06-01" });
    expect(r.earliest.map((x) => x.pseudonym)).toEqual([early.pseudonym, fan.pseudonym, fresh.pseudonym]);
    // 只有化名，沒有帳號、Email
    const json = JSON.stringify(r);
    for (const k of ["U-early", "g-fan", "@"]) expect(json).not.toContain(k);

    const all = await getAdminStats(db, { now: NOW, includeTest: true });
    expect(all.overview).toMatchObject({ viewers: 4, claims: 7 });
  });
});
