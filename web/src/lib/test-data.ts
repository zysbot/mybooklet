import type { Db } from "./db";
import { findOrCreateUser } from "./users";
import { claimShow, ClaimError } from "./claim";
import { setFavorite } from "./favorites";
import { TEST_CATALOG } from "./test-catalog";

/** 測試觀眾的識別：Google 帳號 ID 以這個開頭（不是真的 Google 帳號，無法登入） */
export const TEST_VIEWER_PREFIX = "test-viewer-";
export const TEST_VIEWER_COUNT = 20;

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

async function findTestShows(db: Db): Promise<TestShow[]> {
  const r = await db.query<{ show_id: string; title: string; genre: string; code: string; starts_at: Date; valid_from: Date; valid_to: Date }>(
    `SELECT s.id AS show_id, p.title, p.genre, cc.code, s.starts_at, cc.valid_from, cc.valid_to
       FROM shows s
       JOIN productions p ON p.id = s.production_id
       JOIN claim_codes cc ON cc.show_id = s.id
      WHERE p.title = ANY($1::text[])
      ORDER BY s.starts_at`,
    [TEST_CATALOG.map((t) => t.title)]
  );
  // 同一檔節目若被建立多次，只取第一筆
  const seen = new Set<string>();
  return r.rows
    .filter((x) => (seen.has(x.title) ? false : (seen.add(x.title), true)))
    .map((x) => ({
      showId: String(x.show_id),
      title: x.title,
      genre: x.genre,
      code: x.code,
      startsAt: new Date(x.starts_at),
      validFrom: new Date(x.valid_from),
      validTo: new Date(x.valid_to),
    }));
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
}

/**
 * 建立 20 位測試觀眾，依每檔節目的熱門程度領取，每人至少涉及兩種類型；部分觀眾標記前三喜歡。
 * includeUserId：另外讓這位真實觀眾領取所有測試節目（用來測試自己的收藏冊排列）。
 * 可以重複執行，已領過的不會重複。
 */
export async function seedTestViewers(db: Db, opts: { includeUserId?: string; now?: Date } = {}): Promise<SeedReport> {
  const now = opts.now ?? new Date();
  const shows = await findTestShows(db);
  const report: SeedReport = { viewers: 0, shows: shows.length, claims: 0, skipped: 0, favorites: 0, includedUserClaims: 0 };
  if (shows.length === 0) return report;

  // 測試節目的主辦方一律設為基本合作（不設到期日），才看得到完整統計，也不受免費 50 份上限影響
  await db.query(
    `UPDATE organizers SET plan = 'basic', plan_until = NULL
      WHERE plan = 'free' AND id IN (
        SELECT organizer_id FROM productions WHERE title = ANY($1::text[])
        UNION SELECT producer_id FROM productions WHERE title = ANY($1::text[]) AND producer_id IS NOT NULL
        UNION SELECT s.venue_id FROM shows s JOIN productions p ON p.id = s.production_id WHERE p.title = ANY($1::text[]) AND s.venue_id IS NOT NULL)`,
    [TEST_CATALOG.map((t) => t.title)]
  );

  const reach = new Map(TEST_CATALOG.map((t) => [t.title, t.reach]));
  const r = rng(20261106);

  const claimOne = async (userId: string, show: TestShow) => {
    const t = claimTime(show, now, r);
    if (!t) return null;
    try {
      return await claimShow(db, userId, show.code, t);
    } catch (err) {
      if (err instanceof ClaimError) return null;
      throw err;
    }
  };

  for (let i = 1; i <= TEST_VIEWER_COUNT; i++) {
    const n = String(i).padStart(2, "0");
    const user = await findOrCreateUser(db, { provider: "google", subject: `${TEST_VIEWER_PREFIX}${n}` });
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
    // 約六成的觀眾標記前三喜歡
    if (claimIds.length > 0 && r() < 0.6) {
      const ranked = [...claimIds].sort(() => r() - 0.5).slice(0, 3);
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
