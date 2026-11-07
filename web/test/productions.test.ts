import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import { createProduction, configureShowsOnChain, ProductionError, type ProductionInput } from "@/lib/productions";
import { seedTestViewers, clearTestViewers, TEST_VIEWER_COUNT } from "@/lib/test-data";
import { TEST_CATALOG, testClaimWindow } from "@/lib/test-catalog";
import { getInsights } from "@/lib/insights";
import { findOrCreateUser } from "@/lib/users";
import { createTestDb } from "./helpers";

const SITE = "https://mybooklet.party";
const NOW = new Date("2026-11-06T11:00:00Z");

function input(over: Partial<ProductionInput> = {}): ProductionInput {
  return {
    title: "潮汐備忘錄",
    companyName: "潮間帶劇團",
    genre: "喜劇",
    producerName: "港邊製作",
    intro: "測試",
    designs: [
      { key: "regular", label: "一般場", coverColor: "#23305C" },
      { key: "premiere", label: "首演場", coverColor: "#8A3B22" },
    ],
    defaultDesign: "regular",
    shows: [
      { startsAt: "2026-11-14T19:30:00+08:00", venue: "臺北表演藝術中心", design: "premiere", maxClaims: 300 },
      { startsAt: "2026-11-15T14:30:00+08:00", venue: "臺北表演藝術中心", maxClaims: 300 },
    ],
    ...over,
  };
}

describe("上架節目", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("建立節目、卡面、場次、領取碼，並連結劇團、製作方、場館", async () => {
    const r = await createProduction(db, input(), SITE);
    expect(r.shows).toHaveLength(2);
    expect(r.shows[0].designLabel).toBe("首演場");
    expect(r.shows[1].designLabel).toBe("一般場");
    expect(r.shows[0].code).toMatch(/^[2-9A-Z]{10}$/);

    const orgs = await db.query<{ name: string; kind: string }>(`SELECT name, kind FROM organizers ORDER BY kind, name`);
    expect(orgs.rows).toEqual([
      { name: "潮間帶劇團", kind: "company" },
      { name: "港邊製作", kind: "producer" },
      { name: "臺北表演藝術中心", kind: "venue" },
    ]);
    const show = await db.query<{ metadata_uri: string; venue_id: string }>(`SELECT metadata_uri, venue_id FROM shows WHERE id = $1`, [r.shows[0].showId]);
    expect(show.rows[0].metadata_uri).toBe(`${SITE}/api/metadata/${r.shows[0].showId}`);
    expect(show.rows[0].venue_id).not.toBeNull();
  });

  it("同名的劇團與場館沿用同一個組織", async () => {
    await createProduction(db, input(), SITE);
    await createProduction(db, input({ title: "另一檔" }), SITE);
    const n = await db.query<{ n: string }>(`SELECT count(*) AS n FROM organizers`);
    expect(Number(n.rows[0].n)).toBe(3);
  });

  it("預設的開放領取時間是開演前 90 分鐘到開演後 4 小時", async () => {
    const r = await createProduction(db, input(), SITE);
    const cc = await db.query<{ valid_from: Date; valid_to: Date }>(`SELECT valid_from, valid_to FROM claim_codes WHERE show_id = $1`, [r.shows[0].showId]);
    const start = new Date("2026-11-14T19:30:00+08:00").getTime();
    expect(new Date(cc.rows[0].valid_from).getTime()).toBe(start - 90 * 60_000);
    expect(new Date(cc.rows[0].valid_to).getTime()).toBe(start + 240 * 60_000);
  });

  it("類型、場館必須從選單選擇；其他欄位檢查", async () => {
    await expect(createProduction(db, input({ genre: "現代舞" }), SITE)).rejects.toThrow("類型");
    await expect(createProduction(db, input({ shows: [{ startsAt: "2026-11-14T19:30:00+08:00", venue: "海港劇場" }] }), SITE)).rejects.toThrow("場館");
    await expect(createProduction(db, input({ title: " " }), SITE)).rejects.toBeInstanceOf(ProductionError);
    await expect(createProduction(db, input({ shows: [{ startsAt: "不是時間", venue: "國家戲劇院" }] }), SITE)).rejects.toThrow("演出時間");
    await expect(createProduction(db, input({ defaultDesign: "nope" }), SITE)).rejects.toThrow("預設卡面");
    await expect(
      createProduction(db, input({ shows: [{ startsAt: "2026-11-14T19:30:00+08:00", venue: "國家戲劇院", opensAt: "2026-11-15T00:00:00Z", closesAt: "2026-11-14T00:00:00Z" }] }), SITE)
    ).rejects.toThrow("截止");
    const n = await db.query<{ n: string }>(`SELECT count(*) AS n FROM productions`);
    expect(Number(n.rows[0].n)).toBe(0);
  });

  it("dedupe：同團同名的節目不重複建立", async () => {
    const a = await createProduction(db, input(), SITE, { dedupe: true });
    const b = await createProduction(db, input(), SITE, { dedupe: true });
    expect(b.existing).toBe(true);
    expect(b.productionId).toBe(a.productionId);
  });

  it("寫入合約：成功的標記完成，失敗的保留原狀，已完成的略過", async () => {
    const r = await createProduction(db, input(), SITE);
    const calls: string[] = [];
    const first = await configureShowsOnChain(db, r.shows.map((s) => s.showId), async (id) => {
      calls.push(String(id));
      if (String(id) === r.shows[1].showId) throw new Error("RPC 失敗");
      return "0xtx";
    });
    expect(first.map((x) => x.ok)).toEqual([true, false]);
    const again = await configureShowsOnChain(db, r.shows.map((s) => s.showId), async (id) => {
      calls.push(String(id));
      return "0xtx";
    });
    expect(again.every((x) => x.ok)).toBe(true);
    expect(calls).toEqual([r.shows[0].showId, r.shows[1].showId, r.shows[1].showId]);
  });
});

describe("測試觀眾", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
    for (const t of TEST_CATALOG) {
      await createProduction(
        db,
        {
          title: t.title, companyName: t.company, genre: t.genre, producerName: t.producer, intro: t.intro,
          designs: [{ key: "regular", label: "一般場", coverColor: t.coverColor }], defaultDesign: "regular",
          shows: [{ startsAt: t.startsAt, venue: t.venue, maxClaims: 300, ...testClaimWindow(t.startsAt, NOW) }],
        },
        SITE,
        { dedupe: true }
      );
    }
  });

  it("50 位觀眾，每人至少兩檔、至少兩種類型，部分標記前三，一律公開收藏", async () => {
    const r = await seedTestViewers(db, { now: NOW });
    expect(r.viewers).toBe(TEST_VIEWER_COUNT);
    expect(r.shows).toBe(10);
    expect(r.skipped).toBe(0);
    expect(r.favorites).toBeGreaterThan(0);
    const per = await db.query<{ n: string; g: string }>(
      `SELECT count(*) AS n, count(DISTINCT p.genre) AS g
         FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
         JOIN users u ON u.id = c.user_id WHERE u.google_sub LIKE 'test-viewer-%' GROUP BY c.user_id`
    );
    expect(per.rows).toHaveLength(TEST_VIEWER_COUNT);
    const pub = await db.query<{ n: string }>(`SELECT count(*) AS n FROM users WHERE google_sub LIKE 'test-viewer-%' AND social_public`);
    expect(Number(pub.rows[0].n)).toBe(TEST_VIEWER_COUNT);
    for (const row of per.rows) {
      expect(Number(row.n)).toBeGreaterThanOrEqual(2);
      expect(Number(row.g)).toBeGreaterThanOrEqual(2);
    }
  });

  it("領取時間落在演出前，不晚於現在；未來場次以現在為準", async () => {
    await seedTestViewers(db, { now: NOW });
    const rows = await db.query<{ claimed_at: Date; starts_at: Date }>(
      `SELECT c.claimed_at, s.starts_at FROM claims c JOIN shows s ON s.id = c.show_id`
    );
    for (const x of rows.rows) {
      const t = new Date(x.claimed_at).getTime();
      expect(t).toBeLessThanOrEqual(NOW.getTime());
      expect(t).toBeLessThan(new Date(x.starts_at).getTime());
    }
  });

  it("重複執行不會重複領取", async () => {
    const a = await seedTestViewers(db, { now: NOW });
    const b = await seedTestViewers(db, { now: NOW });
    expect(b.claims).toBe(0);
    const n = await db.query<{ n: string }>(`SELECT count(*) AS n FROM claims`);
    expect(Number(n.rows[0].n)).toBe(a.claims);
  });

  it("可讓真實觀眾領取全部測試節目", async () => {
    const me = await findOrCreateUser(db, { provider: "line", subject: "U-me" });
    const r = await seedTestViewers(db, { now: NOW, includeUserId: me.id });
    expect(r.includedUserClaims).toBe(10);
  });

  it("製作方後台看得到足跡（觀眾達 10 人）", async () => {
    await seedTestViewers(db, { now: NOW });
    const producer = await db.query<{ id: string }>(`SELECT id FROM organizers WHERE kind = 'producer'`);
    const ins = (await getInsights(db, producer.rows[0].id))!;
    expect(ins.totals.shows).toBe(3);
    expect(ins.footprintAvailable).toBe(true);
    expect(ins.genres.length).toBeGreaterThan(0);
  });

  it("清除測試觀眾，真實觀眾不受影響", async () => {
    const me = await findOrCreateUser(db, { provider: "line", subject: "U-me" });
    await seedTestViewers(db, { now: NOW, includeUserId: me.id });
    expect(await clearTestViewers(db)).toBe(TEST_VIEWER_COUNT);
    const left = await db.query<{ n: string }>(`SELECT count(*) AS n FROM claims`);
    expect(Number(left.rows[0].n)).toBe(10);
  });
});
