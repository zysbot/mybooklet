import type { Db } from "./db";
import { findOrCreateUser } from "./users";
import { claimShow, ClaimError } from "./claim";
import { setFavorite } from "./favorites";
import { TEST_CATALOG, TEST_COVER_PREFIX, testClaimWindow, testCoverUrl, testShowTimes } from "./test-catalog";
import { newClaimCode, parseNames } from "./productions";

/** 測試觀眾的識別：Google 帳號 ID 以這個開頭（不是真的 Google 帳號，無法登入） */
export const TEST_VIEWER_PREFIX = "test-viewer-";
export const TEST_VIEWER_COUNT = 50;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

interface TestShow {
  showId: string;
  title: string;
  genre: string;
  code: string;
  startsAt: Date;
  validFrom: Date;
  validTo: Date;
}

interface TestProd {
  productionId: string;
  title: string;
  genre: string;
  startsAt: Date;
  shows: TestShow[];
}

/** 測試節目與它的所有場次（同名節目被建立多次時，只取最早建立的那一檔） */
async function findTestProductions(db: Db): Promise<TestProd[]> {
  const r = await db.query<{ production_id: string; show_id: string; title: string; genre: string; code: string; starts_at: Date; valid_from: Date; valid_to: Date }>(
    `SELECT p.id AS production_id, s.id AS show_id, p.title, p.genre, cc.code, s.starts_at, cc.valid_from, cc.valid_to
       FROM shows s
       JOIN productions p ON p.id = s.production_id
       JOIN claim_codes cc ON cc.show_id = s.id
      WHERE p.id IN (SELECT min(id) FROM productions WHERE title = ANY($1::text[]) GROUP BY title)
      ORDER BY s.starts_at, s.id`,
    [TEST_CATALOG.map((t) => t.title)]
  );
  const byProd = new Map<string, TestProd>();
  for (const x of r.rows) {
    const id = String(x.production_id);
    const show: TestShow = {
      showId: String(x.show_id),
      title: x.title,
      genre: x.genre,
      code: x.code,
      startsAt: new Date(x.starts_at),
      validFrom: new Date(x.valid_from),
      validTo: new Date(x.valid_to),
    };
    const p = byProd.get(id);
    if (p) p.shows.push(show);
    else byProd.set(id, { productionId: id, title: x.title, genre: x.genre, startsAt: show.startsAt, shows: [show] });
  }
  return [...byProd.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** 領取時間：演出前 20 到 80 分鐘；在開放時間之內，且不晚於現在 */
function claimTime(show: TestShow, now: Date, r: () => number): Date | null {
  let t = show.startsAt.getTime() - (20 + Math.floor(r() * 60)) * 60_000;
  t = Math.min(t, now.getTime());
  t = Math.max(t, show.validFrom.getTime() + 60_000);
  if (t > now.getTime() || t > show.validTo.getTime()) return null;
  return new Date(t);
}

export interface SeedReport {
  viewers: number;
  shows: number;
  claims: number;
  skipped: number;
  favorites: number;
  includedUserClaims: number;
  /** 時間用完還沒做完，再執行一次即可（可以重複執行） */
  more: boolean;
}

/**
 * 建立 50 位測試觀眾，依每檔節目的熱門程度領取，每人至少涉及兩種類型；部分觀眾標記前五喜歡。
 * 測試觀眾一律「公開收藏」，用來測試節目單下方的頭像列與個人頁。
 * includeUserId：另外讓這位真實觀眾領取所有測試節目（用來測試自己的收藏冊排列）。
 * 可以重複執行，已領過的不會重複。
 */
export async function seedTestViewers(db: Db, opts: { includeUserId?: string; now?: Date; budgetMs?: number } = {}): Promise<SeedReport> {
  const now = opts.now ?? new Date();
  const started = Date.now();
  const budget = opts.budgetMs ?? Infinity;
  const shows = await findTestProductions(db);
  const report: SeedReport = { viewers: 0, shows: shows.length, claims: 0, skipped: 0, favorites: 0, includedUserClaims: 0, more: false };
  if (shows.length === 0) return report;

  // 測試節目的主辦方一律設為基本合作（不設到期日），才看得到完整統計，也不受免費 50 份上限影響
  await db.query(
    `UPDATE organizers SET plan = 'basic', plan_until = NULL
      WHERE plan = 'free' AND id IN (
        SELECT organizer_id FROM productions WHERE title = ANY($1::text[])
        UNION SELECT pp.organizer_id FROM production_producers pp JOIN productions p ON p.id = pp.production_id WHERE p.title = ANY($1::text[])
        UNION SELECT s.venue_id FROM shows s JOIN productions p ON p.id = s.production_id WHERE p.title = ANY($1::text[]) AND s.venue_id IS NOT NULL)`,
    [TEST_CATALOG.map((t) => t.title)]
  );

  const reach = new Map(TEST_CATALOG.map((t) => [t.title, t.reach]));
  // 每位觀眾各自一組固定亂數：重複執行時挑到的節目一樣，不會越領越多
  let r = rng(20261106);

  /** 領這檔節目：已領過任一場就沿用；否則隨機挑一場 */
  const claimOne = async (userId: string, prod: TestProd) => {
    const had = await db.query<{ id: string }>(
      `SELECT c.id FROM claims c JOIN shows s ON s.id = c.show_id WHERE c.user_id = $1 AND s.production_id = $2 LIMIT 1`,
      [userId, prod.productionId]
    );
    if (had.rows[0]) return { claimId: had.rows[0].id, alreadyClaimed: true };
    const order = [...prod.shows].sort(() => r() - 0.5);
    for (const show of order) {
      const t = claimTime(show, now, r);
      if (!t) continue;
      try {
        return await claimShow(db, userId, show.code, t);
      } catch (err) {
        if (err instanceof ClaimError) continue;
        throw err;
      }
    }
    return null;
  };

  for (let i = 1; i <= TEST_VIEWER_COUNT; i++) {
    if (Date.now() - started > budget) {
      report.more = true;
      return report;
    }
    r = rng(20261106 + i * 7919);
    const n = String(i).padStart(2, "0");
    const user = await findOrCreateUser(db, { provider: "google", subject: `${TEST_VIEWER_PREFIX}${n}` });
    await db.query(`UPDATE users SET social_public = TRUE WHERE id = $1`, [user.id]);
    report.viewers++;

    let picks = shows.filter((s) => r() < (reach.get(s.title) ?? 0.3));
    // 至少兩檔、至少兩種類型
    const genres = () => new Set(picks.map((s) => s.genre));
    for (const s of [...shows].sort(() => r() - 0.5)) {
      if (picks.length >= 2 && genres().size >= 2) break;
      if (!picks.includes(s) && (picks.length < 2 || !genres().has(s.genre))) picks.push(s);
    }
    picks = picks.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    const claimIds: string[] = [];
    for (const s of picks) {
      const c = await claimOne(user.id, s);
      if (c) {
        claimIds.push(c.claimId);
        if (!c.alreadyClaimed) report.claims++;
      } else report.skipped++;
    }
    // 約六成的觀眾標記前五喜歡（1 到 5 名，看領了幾份）
    const hasFav = await db.query(`SELECT 1 FROM favorites WHERE user_id = $1 LIMIT 1`, [user.id]);
    if (claimIds.length > 0 && !hasFav.rows[0] && r() < 0.6) {
      const ranked = [...claimIds].sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 5));
      for (let k = 0; k < ranked.length; k++) {
        await setFavorite(db, user.id, ranked[k], k + 1);
        report.favorites++;
      }
    }
  }

  if (opts.includeUserId) {
    for (const s of shows) {
      const c = await claimOne(opts.includeUserId, s);
      if (c && !c.alreadyClaimed) report.includedUserClaims++;
    }
  }
  return report;
}

/** 清除測試觀眾與他們的領取紀錄（鏈上已鑄造的 token 留在測試網，不影響） */
export async function clearTestViewers(db: Db): Promise<number> {
  return db.tx(async (q) => {
    const users = await q.query<{ id: string }>(`SELECT id FROM users WHERE google_sub LIKE $1`, [`${TEST_VIEWER_PREFIX}%`]);
    const ids = users.rows.map((u) => u.id);
    if (ids.length === 0) return 0;
    await q.query(`DELETE FROM favorites WHERE user_id = ANY($1::bigint[])`, [ids]);
    await q.query(`DELETE FROM claims WHERE user_id = ANY($1::bigint[])`, [ids]);
    await q.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [ids]);
    return ids.length;
  });
}

export interface CatalogSyncReport {
  productions: number;
  coversSet: number;
  showsAdded: number;
  showsMoved: number;
}

/**
 * 把資料庫裡已上架的測試節目更新成測試目錄現在的樣子：藝術節、導演、編劇、示範卡面圖，以及場次
 * （週末四場或單一場次）。新增的場次要再按「把場次寫入合約」。可以重複執行。
 */
export async function syncTestCatalog(db: Db, siteUrl: string, now: Date = new Date()): Promise<CatalogSyncReport> {
  const report: CatalogSyncReport = { productions: 0, coversSet: 0, showsAdded: 0, showsMoved: 0 };
  for (const t of TEST_CATALOG) {
    const p = await db.query<{ id: string }>(`SELECT min(id) AS id FROM productions WHERE title = $1`, [t.title]);
    const pid = p.rows[0]?.id;
    if (!pid) continue;
    report.productions++;
    await db.query(`UPDATE productions SET festival = $2, directors = $3, playwrights = $4 WHERE id = $1`, [
      pid,
      t.festival ?? null,
      parseNames(t.directors ?? ""),
      parseNames(t.playwrights ?? ""),
    ]);
    // 示範卡面圖：只填沒有圖的卡面（或換掉舊的示範圖），營運方或劇團自己上傳的圖不動
    const covers = await db.query(
      `UPDATE designs SET cover_image_url = $2
        WHERE production_id = $1 AND (cover_image_url IS NULL OR (cover_image_url LIKE $3 AND cover_image_url <> $2))
        RETURNING id`,
      [pid, testCoverUrl(t), `${TEST_COVER_PREFIX}%`]
    );
    report.coversSet += covers.rows.length;

    const wanted = testShowTimes(t).map((x) => new Date(x));
    const existing = await db.query<{ id: string; starts_at: Date; venue: string; venue_id: string | null }>(
      `SELECT id, starts_at, venue, venue_id FROM shows WHERE production_id = $1 ORDER BY starts_at, id`,
      [pid]
    );
    const has = (d: Date) => existing.rows.some((s) => new Date(s.starts_at).getTime() === d.getTime());
    const missing = wanted.filter((d) => !has(d));
    // 舊的單一場次不在新時間表上：移到同一天的場次（沒有就移到第一場）
    for (const s of existing.rows) {
      if (!missing.length) break;
      const at = new Date(s.starts_at);
      if (wanted.some((d) => d.getTime() === at.getTime())) continue;
      const taipeiDay = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
      const sameDay = missing.find((d) => taipeiDay(d) === taipeiDay(at)) ?? missing[0];
      const w = testClaimWindow(sameDay.toISOString(), now);
      await db.query(`UPDATE shows SET starts_at = $2 WHERE id = $1`, [s.id, sameDay]);
      await db.query(`UPDATE claim_codes SET valid_from = $2, valid_to = $3 WHERE show_id = $1`, [s.id, w.opensAt, w.closesAt]);
      missing.splice(missing.indexOf(sameDay), 1);
      report.showsMoved++;
    }
    const base = existing.rows[0];
    if (!base) continue;
    for (const d of missing) {
      const show = await db.query<{ id: string }>(
        `INSERT INTO shows (production_id, starts_at, venue, venue_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [pid, d, base.venue, base.venue_id]
      );
      const showId = String(show.rows[0].id);
      await db.query(`UPDATE shows SET metadata_uri = $2 WHERE id = $1`, [showId, `${siteUrl}/api/metadata/${showId}`]);
      const w = testClaimWindow(d.toISOString(), now);
      await db.query(`INSERT INTO claim_codes (show_id, code, valid_from, valid_to, max_claims) VALUES ($1, $2, $3, $4, 300)`, [
        showId,
        newClaimCode(),
        w.opensAt,
        w.closesAt,
      ]);
      report.showsAdded++;
    }
  }
  return report;
}
