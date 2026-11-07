import type { Queryable } from "./db";
import { TEST_VIEWER_PREFIX } from "./test-data";

/**
 * 營運後台的觀眾統計（只有營運方看得到，不給主辦方）。
 *
 * - 「觀眾」＝至少領過一份節目單的帳號；「新觀眾」以第一次領取的時間計。
 * - 週一開始算一週，時間一律用台北時間。
 * - 排行只顯示系統化名，不顯示 LINE／Google 帳號、Email 或錢包。
 * - 預設排除測試觀眾（測試資料工具建立的帳號）。
 */

export interface Period {
  /** 例如「11/02」（週）或「2026/11」（月） */
  label: string;
  newViewers: number;
  claims: number;
  /** 這段期間有領取的觀眾人數 */
  active: number;
}

export interface Ranked {
  pseudonym: string;
  claims: number;
  /** 第一次領取（台北日期 YYYY-MM-DD） */
  firstClaim: string;
}

export interface AdminStats {
  overview: {
    accounts: number;
    viewers: number;
    newThisWeek: number;
    newThisMonth: number;
    claims: number;
    claimsPerViewer: number;
    minted: number;
    pending: number;
  };
  weeks: Period[];
  months: Period[];
  composition: {
    line: number;
    google: number;
    adult: number;
    teen: number;
    ageUnknown: number;
    publicCollections: number;
  };
  retention: {
    /** 領過 2 份以上 */
    repeat: number;
    distribution: { label: string; n: number }[];
    /** 看過 2 個以上演出團隊 */
    multiCompany: number;
    /** 第一次領取滿 90 天的觀眾中，90 天內又領了一份的人 */
    within90: { eligible: number; returned: number };
  };
  topCollectors: Ranked[];
  earliest: Ranked[];
}

const TAIPEI = "Asia/Taipei";

export async function getAdminStats(q: Queryable, opts: { includeTest?: boolean; now?: Date } = {}): Promise<AdminStats> {
  const now = opts.now ?? new Date();
  // $1：要排除的測試觀眾帳號開頭（包含測試觀眾時給一個不會出現的值）
  const exclude = opts.includeTest ? "#include-all#" : `${TEST_VIEWER_PREFIX}%`;
  const U = `(SELECT id FROM users WHERE google_sub IS NULL OR google_sub NOT LIKE $1)`;
  const firsts = `SELECT c.user_id, min(c.claimed_at) AS first_at, count(*) AS n FROM claims c WHERE c.user_id IN ${U} GROUP BY c.user_id`;

  const [overview, weeks, months, composition, dist, multi, within, top, early] = await Promise.all([
    q.query<{ accounts: string; viewers: string; new_week: string; new_month: string; claims: string; minted: string; pending: string }>(
      `WITH f AS (${firsts})
       SELECT (SELECT count(*) FROM users WHERE id IN ${U}) AS accounts,
              (SELECT count(*) FROM f) AS viewers,
              (SELECT count(*) FROM f WHERE f.first_at >= date_trunc('week', $2::timestamptz AT TIME ZONE '${TAIPEI}') AT TIME ZONE '${TAIPEI}') AS new_week,
              (SELECT count(*) FROM f WHERE f.first_at >= date_trunc('month', $2::timestamptz AT TIME ZONE '${TAIPEI}') AT TIME ZONE '${TAIPEI}') AS new_month,
              (SELECT count(*) FROM claims c WHERE c.user_id IN ${U}) AS claims,
              (SELECT count(*) FROM claims c WHERE c.user_id IN ${U} AND c.chain_status = 'minted') AS minted,
              (SELECT count(*) FROM claims c WHERE c.user_id IN ${U} AND c.chain_status <> 'minted') AS pending`,
      [exclude, now]
    ),
    periods(q, "week", 12, exclude, now),
    periods(q, "month", 12, exclude, now),
    q.query<{ line: string; google: string; adult: string; teen: string; unknown: string; pub: string }>(
      `SELECT count(*) FILTER (WHERE line_user_id IS NOT NULL) AS line,
              count(*) FILTER (WHERE line_user_id IS NULL) AS google,
              count(*) FILTER (WHERE age_group = 'adult') AS adult,
              count(*) FILTER (WHERE age_group = 'teen') AS teen,
              count(*) FILTER (WHERE age_group IS NULL) AS unknown,
              count(*) FILTER (WHERE social_public) AS pub
         FROM users WHERE id IN (SELECT user_id FROM (${firsts}) f)`,
      [exclude]
    ),
    q.query<{ bucket: string; n: string }>(
      `SELECT CASE WHEN n = 1 THEN '1' WHEN n = 2 THEN '2' WHEN n <= 5 THEN '3-5' WHEN n <= 10 THEN '6-10' ELSE '11+' END AS bucket, count(*) AS n
         FROM (${firsts}) f GROUP BY bucket`,
      [exclude]
    ),
    q.query<{ n: string }>(
      `SELECT count(*) AS n FROM (
         SELECT c.user_id FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
          WHERE c.user_id IN ${U} GROUP BY c.user_id HAVING count(DISTINCT p.organizer_id) >= 2) t`,
      [exclude]
    ),
    q.query<{ eligible: string; returned: string }>(
      `WITH f AS (${firsts})
       SELECT count(*) AS eligible,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM claims c WHERE c.user_id = f.user_id AND c.claimed_at > f.first_at AND c.claimed_at <= f.first_at + interval '90 days')) AS returned
         FROM f WHERE f.first_at <= $2::timestamptz - interval '90 days'`,
      [exclude, now]
    ),
    ranked(q, `f.n DESC, f.first_at`, exclude),
    ranked(q, `f.first_at, f.n DESC`, exclude),
  ]);

  const o = overview.rows[0];
  const n = (v: string | undefined) => Number(v ?? 0);
  const viewers = n(o.viewers);
  const c = composition.rows[0];
  const d = new Map(dist.rows.map((r) => [r.bucket, n(r.n)]));
  const buckets: [string, string][] = [["1", "1 份"], ["2", "2 份"], ["3-5", "3–5 份"], ["6-10", "6–10 份"], ["11+", "11 份以上"]];

  return {
    overview: {
      accounts: n(o.accounts),
      viewers,
      newThisWeek: n(o.new_week),
      newThisMonth: n(o.new_month),
      claims: n(o.claims),
      claimsPerViewer: viewers ? Math.round((n(o.claims) / viewers) * 10) / 10 : 0,
      minted: n(o.minted),
      pending: n(o.pending),
    },
    weeks,
    months,
    composition: {
      line: n(c.line),
      google: n(c.google),
      adult: n(c.adult),
      teen: n(c.teen),
      ageUnknown: n(c.unknown),
      publicCollections: n(c.pub),
    },
    retention: {
      repeat: viewers - (d.get("1") ?? 0),
      distribution: buckets.map(([k, label]) => ({ label, n: d.get(k) ?? 0 })),
      multiCompany: n(multi.rows[0].n),
      within90: { eligible: n(within.rows[0].eligible), returned: n(within.rows[0].returned) },
    },
    topCollectors: top,
    earliest: early,
  };
}

/** 最近 count 週（或月）的新觀眾、領取數、有領取的觀眾數；沒有資料的期間補 0 */
async function periods(q: Queryable, unit: "week" | "month", count: number, exclude: string, now: Date): Promise<Period[]> {
  const r = await q.query<{ p: string; new_viewers: string; claims: string; active: string }>(
    `WITH series AS (
       SELECT generate_series(
         date_trunc('${unit}', $2::timestamptz AT TIME ZONE '${TAIPEI}') - interval '${count - 1} ${unit}',
         date_trunc('${unit}', $2::timestamptz AT TIME ZONE '${TAIPEI}'),
         interval '1 ${unit}') AS p
     ), cl AS (
       SELECT c.user_id, date_trunc('${unit}', c.claimed_at AT TIME ZONE '${TAIPEI}') AS p FROM claims c
        WHERE c.user_id IN (SELECT id FROM users WHERE google_sub IS NULL OR google_sub NOT LIKE $1)
     ), firsts AS (
       SELECT user_id, min(p) AS p FROM cl GROUP BY user_id
     )
     SELECT to_char(series.p, 'YYYY-MM-DD') AS p,
            (SELECT count(*) FROM firsts WHERE firsts.p = series.p) AS new_viewers,
            (SELECT count(*) FROM cl WHERE cl.p = series.p) AS claims,
            (SELECT count(DISTINCT user_id) FROM cl WHERE cl.p = series.p) AS active
       FROM series ORDER BY series.p`,
    [exclude, now]
  );
  return r.rows.map((x) => {
    const [y, m, d] = x.p.split("-");
    return {
      label: unit === "week" ? `${Number(m)}/${Number(d)}` : `${y}/${m}`,
      newViewers: Number(x.new_viewers),
      claims: Number(x.claims),
      active: Number(x.active),
    };
  });
}

async function ranked(q: Queryable, order: string, exclude: string): Promise<Ranked[]> {
  const r = await q.query<{ pseudonym: string; n: string; first_day: string }>(
    `SELECT u.pseudonym, f.n, to_char(f.first_at AT TIME ZONE '${TAIPEI}', 'YYYY-MM-DD') AS first_day
       FROM (SELECT c.user_id, min(c.claimed_at) AS first_at, count(*) AS n FROM claims c
              WHERE c.user_id IN (SELECT id FROM users WHERE google_sub IS NULL OR google_sub NOT LIKE $1) GROUP BY c.user_id) f
       JOIN users u ON u.id = f.user_id
      ORDER BY ${order}, u.id LIMIT 10`,
    [exclude]
  );
  return r.rows.map((x) => ({ pseudonym: x.pseudonym, claims: Number(x.n), firstClaim: x.first_day }));
}
