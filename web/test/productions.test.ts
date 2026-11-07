import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import { createProduction, configureShowsOnChain, ProductionError, type ProductionInput } from "@/lib/productions";
import { seedTestViewers, clearTestViewers, syncTestCatalog, TEST_VIEWER_COUNT } from "@/lib/test-data";
import { TEST_CATALOG, testClaimWindow, testShowTimes } from "@/lib/test-catalog";
import { getKindred, setClaimHidden } from "@/lib/social";
import { setFavorite, FavoriteError } from "@/lib/favorites";
import { parseNames } from "@/lib/productions";
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
          shows: testShowTimes(t).map((at) => ({ startsAt: at, venue: t.venue, maxClaims: 300, ...testClaimWindow(at, NOW) })),
        },
        SITE,
        { dedupe: true }
      );
    }
  });

  it("週末四場的節目，觀眾分散在不同場次", async () => {
    await seedTestViewers(db, { now: NOW });
    const r = await db.query<{ title: string; shows: string; per_user: string }>(
      `SELECT p.title, count(DISTINCT c.show_id) AS shows, max(n) AS per_user
         FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
         JOIN (SELECT c2.user_id, s2.production_id, count(*) AS n FROM claims c2 JOIN shows s2 ON s2.id = c2.show_id GROUP BY 1, 2) k
           ON k.user_id = c.user_id AND k.production_id = p.id
        GROUP BY p.title`
    );
    for (const row of r.rows) {
      const single = TEST_CATALOG.find((t) => t.title === row.title)!.single;
      if (single) expect(Number(row.shows)).toBe(1);
      else expect(Number(row.shows)).toBeGreaterThan(1);
      expect(Number(row.per_user)).toBe(1); // 每人每檔只領一場
    }
  });

  it("跟你足跡最像的五位：至少一起看過兩齣、依相似度排列、不含隱藏的節目單", async () => {
    const me = await findOrCreateUser(db, { provider: "line", subject: "U-me" });
    await seedTestViewers(db, { now: NOW, includeUserId: me.id });
    const later = new Date("2027-06-01T00:00:00Z");
    const k = await getKindred(db, me.id, 5, later);
    expect(k.people).toHaveLength(5);
    expect(k.total).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < k.people.length; i++) expect(k.people[i - 1].similarity).toBeGreaterThanOrEqual(k.people[i].similarity);
    expect(k.people.every((p) => p.common >= 2)).toBe(true);
    expect(k.people.some((p) => p.sameNights > 0)).toBe(true);

    // 第一名把所有節目單都隱藏，就不再出現
    const top = await db.query<{ id: string }>(`SELECT id FROM users WHERE public_id = $1`, [k.people[0].publicId]);
    const theirs = await db.query<{ id: string }>(`SELECT id FROM claims WHERE user_id = $1`, [top.rows[0].id]);
    for (const c of theirs.rows) await setClaimHidden(db, top.rows[0].id, c.id, true);
    const after = await getKindred(db, me.id, 5, later);
    expect(after.people.map((p) => p.publicId)).not.toContain(k.people[0].publicId);
  });

  it("前五喜歡：可以標到第 5 名，第 6 名不行", async () => {
    const me = await findOrCreateUser(db, { provider: "line", subject: "U-me" });
    await seedTestViewers(db, { now: NOW, includeUserId: me.id });
    const mine = await db.query<{ id: string }>(`SELECT id FROM claims WHERE user_id = $1 ORDER BY id LIMIT 6`, [me.id]);
    for (let i = 0; i < 5; i++) await setFavorite(db, me.id, mine.rows[i].id, i + 1);
    await expect(setFavorite(db, me.id, mine.rows[5].id, 6)).rejects.toBeInstanceOf(FavoriteError);
    const n = await db.query<{ n: string }>(`SELECT count(*) AS n FROM favorites WHERE user_id = $1`, [me.id]);
    expect(Number(n.rows[0].n)).toBe(5);
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
    expect(ins.totals.shows).toBe(12); // 夜行列車、港口女孩、退潮，各四場
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

describe("測試節目的場次", () => {
  it("週末四場排在演出日所在的週末；單一場次不變", () => {
    expect(testShowTimes({ startsAt: "2026-11-14T19:30:00+08:00" })).toEqual([
      "2026-11-13T19:30:00+08:00",
      "2026-11-14T14:30:00+08:00",
      "2026-11-14T19:30:00+08:00",
      "2026-11-15T14:30:00+08:00",
    ]);
    // 週二的舊日期 → 那週的週末
    expect(testShowTimes({ startsAt: "2026-06-02T19:30:00+08:00" })[0]).toBe("2026-06-05T19:30:00+08:00");
    // 週日 → 同一個週末
    expect(testShowTimes({ startsAt: "2026-09-13T19:30:00+08:00" })[3]).toBe("2026-09-13T14:30:00+08:00");
    expect(testShowTimes({ startsAt: "2024-10-05T20:00:00+08:00", single: true })).toEqual(["2024-10-05T20:00:00+08:00"]);
    expect(TEST_CATALOG.filter((t) => t.single).map((t) => t.title)).toEqual(["第三個房間", "島嶼合唱"]);
    expect(TEST_CATALOG.filter((t) => t.festival)).toHaveLength(5);
  });

  it("舊的單場測試節目可以更新成週末四場，並補上藝術節與創作者", async () => {
    const db = await createTestDb();
    const t = TEST_CATALOG.find((x) => x.title === "鹽的聲音")!;
    const old = await createProduction(
      db,
      {
        title: t.title, companyName: t.company, genre: t.genre, intro: t.intro,
        designs: [{ key: "regular", label: "一般場", coverColor: t.coverColor }], defaultDesign: "regular",
        shows: [{ startsAt: t.startsAt, venue: t.venue, maxClaims: 300, ...testClaimWindow(t.startsAt, NOW) }],
      },
      SITE
    );
    const r = await syncTestCatalog(db, SITE, NOW);
    expect(r).toEqual({ productions: 1, showsAdded: 3, showsMoved: 1 });
    const shows = await db.query<{ id: string; starts_at: Date }>(`SELECT id, starts_at FROM shows WHERE production_id = $1 ORDER BY starts_at`, [old.productionId]);
    expect(shows.rows.map((s) => new Date(s.starts_at).toISOString())).toEqual(testShowTimes(t).map((x) => new Date(x).toISOString()));
    // 原本 9/13（週日）晚上那一場，移到同一天的下午場
    expect(String(shows.rows[3].id)).toBe(old.shows[0].showId);
    const p = await db.query<{ directors: string[] }>(`SELECT directors FROM productions WHERE id = $1`, [old.productionId]);
    expect(p.rows[0].directors).toEqual(["陳映竹"]);
    // 再執行一次不會重複
    expect(await syncTestCatalog(db, SITE, NOW)).toEqual({ productions: 1, showsAdded: 0, showsMoved: 0 });
  });

  it("姓名用頓號、逗號分開", () => {
    expect(parseNames("王小明、李小華, 陳大文，王小明")).toEqual(["王小明", "李小華", "陳大文"]);
    expect(parseNames("  ")).toEqual([]);
  });
});
