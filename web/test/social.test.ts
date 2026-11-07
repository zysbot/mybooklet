import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import { findOrCreateUser } from "@/lib/users";
import { getCoCollectors, getProfile, setClaimHidden, setSocialPublic } from "@/lib/social";
import { avatarFor, animalOf } from "@/lib/avatar";
import { createTestDb } from "./helpers";

const NOW = new Date("2026-11-07T12:00:00Z");

/** 三齣戲：A 有兩晚（A1、A2），B、C 各一晚，都已演完；F 下週才演 */
async function build(db: Db) {
  const org = (await db.query<{ id: string }>(`INSERT INTO organizers (name) VALUES ('劇團') RETURNING id`)).rows[0].id;
  const production = async (title: string) => {
    const p = (await db.query<{ id: string }>(`INSERT INTO productions (organizer_id, title, company_name) VALUES ($1, $2, '劇團') RETURNING id`, [org, title])).rows[0].id;
    const d = (await db.query<{ id: string }>(`INSERT INTO designs (production_id, label) VALUES ($1, '一般場') RETURNING id`, [p])).rows[0].id;
    await db.query(`UPDATE productions SET default_design_id = $2 WHERE id = $1`, [p, d]);
    return p;
  };
  const show = async (p: string, at: string) =>
    (await db.query<{ id: string }>(`INSERT INTO shows (production_id, starts_at, venue) VALUES ($1, $2, '場館') RETURNING id`, [p, at])).rows[0].id;
  const A = await production("甲");
  const B = await production("乙");
  const C = await production("丙");
  const F = await production("未來");
  const shows = {
    A1: await show(A, "2026-10-01T11:00:00Z"),
    A2: await show(A, "2026-10-02T11:00:00Z"),
    B: await show(B, "2026-09-01T11:00:00Z"),
    C: await show(C, "2026-08-01T11:00:00Z"),
    F: await show(F, "2026-11-14T11:00:00Z"),
  };
  const serial: Record<string, number> = {};
  const claim = async (user: string, s: keyof typeof shows) => {
    serial[s] = (serial[s] ?? 0) + 1;
    return (await db.query<{ id: string }>(`INSERT INTO claims (user_id, show_id, serial) VALUES ($1, $2, $3) RETURNING id`, [user, shows[s], serial[s]])).rows[0].id;
  };
  const user = async (name: string, isPublic = true) => {
    const u = await findOrCreateUser(db, { provider: "google", subject: name });
    if (isPublic) await setSocialPublic(db, u.id, true);
    return u;
  };
  const me = await user("me", false);
  const twin = await user("twin"); // 和我看一樣的三齣，A 同一晚
  const other = await user("other"); // 只看 A（另一晚）
  const shy = await user("shy", false); // 不公開
  const mine = { A1: await claim(me.id, "A1"), B: await claim(me.id, "B"), C: await claim(me.id, "C"), F: await claim(me.id, "F") };
  const twinA = await claim(twin.id, "A1");
  await claim(twin.id, "B");
  await claim(twin.id, "C");
  await claim(other.id, "A2");
  await claim(other.id, "F");
  await claim(shy.id, "A1");
  return { me, twin, other, shy, mine, twinA };
}

describe("社交：頭像列與個人頁", () => {
  let db: Db;
  let ctx: Awaited<ReturnType<typeof build>>;
  beforeEach(async () => {
    db = await createTestDb();
    ctx = await build(db);
  });

  it("頭像列：只列公開的人，依相似度排序，標出同一晚；不公開的只算人數", async () => {
    const r = (await getCoCollectors(db, ctx.me.id, ctx.mine.A1, NOW))!;
    expect(r.open).toBe(true);
    expect(r.people.map((p) => p.pseudonym)).toEqual([ctx.twin.pseudonym, ctx.other.pseudonym]);
    expect(r.people[0]).toMatchObject({ sameNight: true, common: 3, similarity: 3 / 4 }); // 我 4 齣（含未來）、他 3 齣
    expect(r.people[1]).toMatchObject({ sameNight: false, common: 1 }); // other 的「未來」還沒滿 4 小時，不算
    expect(r.notPublic).toBe(1);
    expect(JSON.stringify(r)).not.toContain(ctx.shy.pseudonym);
  });

  it("演出開始未滿 4 小時不列出任何人", async () => {
    const r = (await getCoCollectors(db, ctx.me.id, ctx.mine.F, NOW))!;
    expect(r.open).toBe(false);
    expect(r.people).toEqual([]);
  });

  it("不能看別人的節目單的頭像列", async () => {
    expect(await getCoCollectors(db, ctx.other.id, ctx.mine.A1, NOW)).toBeNull();
  });

  it("隱藏單一份：從自己的個人頁與別人的頭像列消失", async () => {
    expect(await setClaimHidden(db, ctx.twin.id, ctx.twinA, true)).toBe(true);
    const r = (await getCoCollectors(db, ctx.me.id, ctx.mine.A1, NOW))!;
    expect(r.people.map((p) => p.pseudonym)).toEqual([ctx.other.pseudonym]);
    const prof = (await getProfile(db, ctx.me.id, ctx.twin.public_id, NOW))!;
    expect(prof.booklets.map((b) => b.title)).toEqual(["乙", "丙"]);
    expect(await setClaimHidden(db, ctx.me.id, ctx.twinA, false)).toBe(false); // 不是本人的不能改
  });

  it("個人頁：重疊的排前面，同一晚優先；只到年月，不含編號與時間", async () => {
    const p = (await getProfile(db, ctx.me.id, ctx.other.public_id, NOW))!;
    expect(p.booklets.map((b) => [b.title, b.sameNight, b.alsoSeen])).toEqual([["甲", false, true]]); // 「未來」還沒滿 4 小時
    const t = (await getProfile(db, ctx.me.id, ctx.twin.public_id, NOW))!;
    expect(t.booklets[0]).toMatchObject({ title: "甲", sameNight: true });
    expect(t).toMatchObject({ common: 3, sameNights: 3 }); // 乙、丙都只有一晚，也是同一晚
    expect(t.booklets[0].month).toBe("2026 年 10 月");
    const json = JSON.stringify(t);
    for (const k of ["serial", "claimed", "address", "token", "@"]) expect(json).not.toContain(k);
  });

  it("不公開的人沒有個人頁；本人可以預覽自己的", async () => {
    expect(await getProfile(db, ctx.me.id, ctx.shy.public_id, NOW)).toBeNull();
    const self = (await getProfile(db, ctx.me.id, ctx.me.public_id, NOW))!;
    expect(self).toMatchObject({ isSelf: true, isPublic: false });
    expect(await getProfile(db, ctx.me.id, "not-a-valid-id", NOW)).toBeNull();
  });

  it("關閉公開後，立即從頭像列消失（包括過去的場次）", async () => {
    await setSocialPublic(db, ctx.twin.id, false);
    const r = (await getCoCollectors(db, ctx.me.id, ctx.mine.A1, NOW))!;
    expect(r.people.map((p) => p.pseudonym)).toEqual([ctx.other.pseudonym]);
    expect(r.notPublic).toBe(2);
  });

  it("新帳號預設不公開，個人頁代碼是 16 碼隨機", async () => {
    const u = await findOrCreateUser(db, { provider: "line", subject: "U-new" });
    expect(u.social_public).toBe(false);
    expect(u.public_id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("頭像由化名產生：取動物的字，顏色固定", () => {
    expect(animalOf("二樓包廂的水獺")).toBe("水獺");
    expect(animalOf("第三排靠走道的貓頭鷹12號")).toBe("貓頭鷹");
    expect(avatarFor("二樓包廂的水獺").char).toBe("獺");
    expect(avatarFor("二樓包廂的水獺")).toEqual(avatarFor("二樓包廂的水獺"));
  });
});
