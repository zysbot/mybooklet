import type { Queryable } from "./db";

/**
 * 主辦方後台的統計與觀眾足跡。
 *
 * 隱私原則：
 * 1. 只給統計，不給名單：不回傳任何觀眾的名字、LINE、Email、錢包地址或編號。
 * 2. 小群體隱藏：任何觀眾分群 1 到 9 人只顯示「少於 10」（0 照實顯示），避免從數字反推出是誰。
 *    觀眾總數不到 10 人時，整個足跡區塊不顯示。
 * 3. 不點名其他劇團或製作方：足跡只呈現類型與場館（公開場所）。
 */
export const MIN_GROUP = 10;

export type OrgKind = "company" | "producer" | "venue";

export const ORG_KIND_LABEL: Record<OrgKind, string> = {
  company: "劇團／演出團隊",
  producer: "製作方",
  venue: "場館",
};

/** 一個受保護的人數：hidden 為 true 時不能顯示實際數字 */
export interface Masked {
  n: number | null;
  hidden: boolean;
  /** 佔觀眾總數的百分比；隱藏或總數太少時為 null */
  pct: number | null;
}

export function mask(n: number, base?: number): Masked {
  const hidden = n > 0 && n < MIN_GROUP;
  const pct = !hidden && base && base >= MIN_GROUP ? Math.round((n / base) * 100) : null;
  return { n: hidden ? null : n, hidden, pct };
}

export interface Organizer {
  id: string;
  name: string;
  kind: OrgKind;
}

export interface ShowStat {
  showId: string;
  title: string;
  startsAt: Date;
  venue: string;
  claims: number;
  capacity: number | null;
}

export interface Insights {
  organizer: Organizer;
  totals: { shows: number; claims: number; audience: number };
  shows: ShowStat[];
  /** 觀眾總數夠多（至少 MIN_GROUP 人）才提供以下分群 */
  footprintAvailable: boolean;
  composition: {
    /** 在你這裡領到人生第一份吾冊節目單 */
    firstTime: Masked;
    /** 領過你兩個以上場次 */
    returning: Masked;
  };
  depth: { label: string; count: Masked }[];
  genres: { genre: string; count: Masked }[];
  venues: { venue: string; count: Masked }[];
  favorites: Masked;
}

/** 依組織類型決定「屬於你的場次」：劇團看演出團隊、製作方看製作、場館看在館內的場次 */
function scopeCondition(kind: OrgKind): string {
  if (kind === "company") return "p.organizer_id = $1";
  if (kind === "producer") return "p.producer_id = $1";
  return "s.venue_id = $1";
}

export async function getOrganizer(q: Queryable, id: string): Promise<Organizer | null> {
  if (!/^\d+$/.test(id)) return null;
  const r = await q.query<{ id: string; name: string; kind: OrgKind }>(`SELECT id, name, kind FROM organizers WHERE id = $1`, [id]);
  const o = r.rows[0];
  return o ? { id: String(o.id), name: o.name, kind: o.kind } : null;
}

export async function getInsights(q: Queryable, organizerId: string): Promise<Insights | null> {
  const organizer = await getOrganizer(q, organizerId);
  if (!organizer) return null;
  const cond = scopeCondition(organizer.kind);
  const scopedShows = `SELECT s.id FROM shows s JOIN productions p ON p.id = s.production_id WHERE ${cond}`;
  const scoped = `SELECT c.user_id, c.show_id, c.claimed_at FROM claims c WHERE c.show_id IN (${scopedShows})`;
  const audience = `SELECT DISTINCT user_id FROM (${scoped}) sc`;
  const id = organizer.id;

  const [shows, totals, firstTime, returning, depth, genres, venues, favorites] = await Promise.all([
    q.query<{ id: string; title: string; starts_at: Date; venue: string; claims: string; capacity: number | null }>(
      `SELECT s.id, p.title, s.starts_at, s.venue,
              (SELECT count(*) FROM claims c WHERE c.show_id = s.id) AS claims,
              (SELECT max_claims FROM claim_codes cc WHERE cc.show_id = s.id ORDER BY cc.id LIMIT 1) AS capacity
         FROM shows s JOIN productions p ON p.id = s.production_id
        WHERE ${cond}
        ORDER BY s.starts_at DESC`,
      [id]
    ),
    q.query<{ claims: string; audience: string }>(
      `SELECT count(*) AS claims, count(DISTINCT user_id) AS audience FROM (${scoped}) sc`,
      [id]
    ),
    q.query<{ n: string }>(
      `SELECT count(*) AS n
         FROM (SELECT user_id, min(claimed_at) AS first_here FROM (${scoped}) sc GROUP BY user_id) h
         JOIN (SELECT user_id, min(claimed_at) AS first_ever FROM claims GROUP BY user_id) e USING (user_id)
        WHERE h.first_here = e.first_ever`,
      [id]
    ),
    q.query<{ n: string }>(
      `SELECT count(*) AS n FROM (SELECT user_id FROM (${scoped}) sc GROUP BY user_id HAVING count(DISTINCT show_id) >= 2) r`,
      [id]
    ),
    q.query<{ bucket: string; n: string }>(
      `SELECT CASE WHEN total = 1 THEN '1' WHEN total < 5 THEN '2-4' WHEN total < 10 THEN '5-9' ELSE '10+' END AS bucket,
              count(*) AS n
         FROM (SELECT c.user_id, count(*) AS total FROM claims c WHERE c.user_id IN (${audience}) GROUP BY c.user_id) t
        GROUP BY bucket`,
      [id]
    ),
    // 足跡：你的觀眾在「你以外」的場次看過哪些類型
    q.query<{ genre: string; n: string }>(
      `SELECT p.genre, count(DISTINCT c.user_id) AS n
         FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
        WHERE c.user_id IN (${audience}) AND NOT COALESCE(${cond}, FALSE) AND p.genre IS NOT NULL
        GROUP BY p.genre ORDER BY n DESC`,
      [id]
    ),
    // 足跡：你的觀眾去過的其他場館（場館是公開場所，可以點名）
    q.query<{ venue: string; n: string }>(
      `SELECT s.venue, count(DISTINCT c.user_id) AS n
         FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
        WHERE c.user_id IN (${audience}) AND NOT COALESCE(${cond}, FALSE)
          ${organizer.kind === "venue" ? "AND (s.venue_id IS NULL OR s.venue_id <> $1)" : ""}
        GROUP BY s.venue ORDER BY n DESC LIMIT 8`,
      [id]
    ),
    q.query<{ n: string }>(
      `SELECT count(DISTINCT f.user_id) AS n
         FROM favorites f JOIN claims c ON c.id = f.claim_id
        WHERE c.show_id IN (${scopedShows})`,
      [id]
    ),
  ]);

  const audienceSize = Number(totals.rows[0].audience);
  const available = audienceSize >= MIN_GROUP;
  const depthOrder: [string, string][] = [
    ["1", "第一份"],
    ["2-4", "2 到 4 份"],
    ["5-9", "5 到 9 份"],
    ["10+", "10 份以上"],
  ];
  const depthMap = new Map(depth.rows.map((r) => [r.bucket, Number(r.n)]));

  return {
    organizer,
    totals: { shows: shows.rows.length, claims: Number(totals.rows[0].claims), audience: audienceSize },
    shows: shows.rows.map((r) => ({
      showId: String(r.id),
      title: r.title,
      startsAt: new Date(r.starts_at),
      venue: r.venue,
      claims: Number(r.claims),
      capacity: r.capacity === null ? null : Number(r.capacity),
    })),
    footprintAvailable: available,
    composition: available
      ? {
          firstTime: mask(Number(firstTime.rows[0].n), audienceSize),
          returning: mask(Number(returning.rows[0].n), audienceSize),
        }
      : { firstTime: mask(0), returning: mask(0) },
    depth: available ? depthOrder.map(([k, label]) => ({ label, count: mask(depthMap.get(k) ?? 0, audienceSize) })) : [],
    genres: available ? genres.rows.map((r) => ({ genre: r.genre, count: mask(Number(r.n), audienceSize) })) : [],
    venues: available
      ? venues.rows
          .map((r) => ({ venue: r.venue, count: mask(Number(r.n), audienceSize) }))
          // 人數太少的場館連名字都不列出，避免「某人去過某個小場館」被推測
          .filter((v) => !v.count.hidden)
      : [],
    favorites: available ? mask(Number(favorites.rows[0].n), audienceSize) : mask(0),
  };
}

// ---------------------------------------------------------------
// 後台成員
// ---------------------------------------------------------------

export async function listMemberships(q: Queryable, userId: string): Promise<Organizer[]> {
  const r = await q.query<{ id: string; name: string; kind: OrgKind }>(
    `SELECT o.id, o.name, o.kind FROM organizer_members m JOIN organizers o ON o.id = m.organizer_id
      WHERE m.user_id = $1 ORDER BY o.name`,
    [userId]
  );
  return r.rows.map((o) => ({ id: String(o.id), name: o.name, kind: o.kind }));
}

export async function isMember(q: Queryable, organizerId: string, userId: string): Promise<boolean> {
  const r = await q.query(`SELECT 1 FROM organizer_members WHERE organizer_id = $1 AND user_id = $2`, [organizerId, userId]);
  return r.rows.length > 0;
}

export async function findByInvite(q: Queryable, token: string): Promise<Organizer | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const r = await q.query<{ id: string; name: string; kind: OrgKind }>(
    `SELECT id, name, kind FROM organizers WHERE invite_token = $1`,
    [token]
  );
  const o = r.rows[0];
  return o ? { id: String(o.id), name: o.name, kind: o.kind } : null;
}

export async function joinByInvite(q: Queryable, token: string, userId: string): Promise<Organizer | null> {
  const org = await findByInvite(q, token);
  if (!org) return null;
  await q.query(
    `INSERT INTO organizer_members (organizer_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [org.id, userId]
  );
  return org;
}
