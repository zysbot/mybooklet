import type { Queryable } from "./db";

/**
 * 社交功能：節目單下方的「也收藏了這齣戲的人」與個人頁。
 *
 * 誰會被列出（PUBLIC_CLAIM）：
 * - 觀眾打開了「公開收藏」（users.social_public）；
 * - 這一份沒有被本人隱藏（claims.hidden）；
 * - 演出開始已滿 4 小時（避免即時透露「誰此刻在這個劇場」）。
 *
 * 足跡相似度＝共同收藏的節目 ÷ 兩人收藏節目的聯集（以節目計，同一齣不同晚也算重疊）。
 * 對方只算公開的那幾份；自己全部都算（結果只有自己看得到）。
 * 不顯示領取編號、領取時間、錢包地址或鏈上連結；別人的節目單只顯示到年月。
 */

export const PUBLIC_DELAY_MS = 4 * 3600_000;

const PUBLIC_CLAIM = `u.social_public AND NOT c.hidden AND s.starts_at <= $NOW`;

export interface CoCollector {
  publicId: string;
  pseudonym: string;
  /** 和你看了同一場（同一晚） */
  sameNight: boolean;
  /** 共同收藏的節目數 */
  common: number;
  /** 0–1 */
  similarity: number;
}

export interface CoCollectorsResult {
  /** 演出開始未滿 4 小時時為 false，這時不列出任何人 */
  open: boolean;
  opensAt: Date;
  people: CoCollector[];
  /** 也收藏了這齣戲、但沒有公開（或隱藏了這一份）的人數 */
  notPublic: number;
}

function jaccard(common: number, a: number, b: number): number {
  const union = a + b - common;
  return union > 0 ? common / union : 0;
}

/** 相似度高的在前；相同的打亂，不透露領取先後 */
function rank<T extends { similarity: number; sameNight: boolean }>(items: T[]): T[] {
  return items
    .map((x) => ({ x, k: Math.random() }))
    .sort((a, b) => b.x.similarity - a.x.similarity || Number(b.x.sameNight) - Number(a.x.sameNight) || a.k - b.k)
    .map((e) => e.x);
}

/** 節目單下方：也收藏了同一齣戲的人（不含自己） */
export async function getCoCollectors(q: Queryable, viewerId: string, claimId: string, now: Date = new Date()): Promise<CoCollectorsResult | null> {
  const own = await q.query<{ show_id: string; production_id: string; starts_at: Date }>(
    `SELECT c.show_id, s.production_id, s.starts_at FROM claims c JOIN shows s ON s.id = c.show_id WHERE c.id = $1 AND c.user_id = $2`,
    [claimId, viewerId]
  );
  const mine = own.rows[0];
  if (!mine) return null;
  const opensAt = new Date(new Date(mine.starts_at).getTime() + PUBLIC_DELAY_MS);
  const cutoff = new Date(now.getTime() - PUBLIC_DELAY_MS);

  const total = await q.query<{ n: string }>(
    `SELECT count(DISTINCT c.user_id) AS n FROM claims c JOIN shows s ON s.id = c.show_id WHERE s.production_id = $1 AND c.user_id <> $2`,
    [mine.production_id, viewerId]
  );
  const totalOthers = Number(total.rows[0].n);
  if (opensAt > now) return { open: false, opensAt, people: [], notPublic: totalOthers };

  const r = await q.query<{ public_id: string; pseudonym: string; n_u: string; common: string; same_night: boolean; n_v: string }>(
    `WITH mine AS (
       SELECT DISTINCT s.production_id FROM claims c JOIN shows s ON s.id = c.show_id WHERE c.user_id = $1
     ), pub AS (
       SELECT c.user_id, s.production_id, c.show_id
         FROM claims c JOIN shows s ON s.id = c.show_id JOIN users u ON u.id = c.user_id
        WHERE ${PUBLIC_CLAIM.replace("$NOW", "$4")}
     ), cand AS (
       SELECT DISTINCT user_id FROM pub WHERE production_id = $2 AND user_id <> $1
     ), st AS (
       SELECT p.user_id,
              count(DISTINCT p.production_id) AS n_u,
              count(DISTINCT p.production_id) FILTER (WHERE p.production_id IN (SELECT production_id FROM mine)) AS common,
              bool_or(p.show_id = $3) AS same_night
         FROM pub p JOIN cand USING (user_id)
        GROUP BY p.user_id
     )
     SELECT u.public_id, u.pseudonym, st.n_u, st.common, st.same_night, (SELECT count(*) FROM mine) AS n_v
       FROM st JOIN users u ON u.id = st.user_id`,
    [viewerId, mine.production_id, mine.show_id, cutoff]
  );
  const people = rank(
    r.rows.map((x) => ({
      publicId: x.public_id,
      pseudonym: x.pseudonym,
      sameNight: Boolean(x.same_night),
      common: Number(x.common),
      similarity: jaccard(Number(x.common), Number(x.n_v), Number(x.n_u)),
    }))
  );
  return { open: true, opensAt, people, notPublic: Math.max(0, totalOthers - people.length) };
}

export interface ProfileBooklet {
  productionId: string;
  title: string;
  companyName: string;
  genre: string | null;
  /** 只到年月，例如「2026 年 3 月」 */
  month: string;
  coverColor: string;
  coverImage: string | null;
  /** 你也收藏了這齣戲 */
  alsoSeen: boolean;
  /** 你們看的是同一場（同一晚） */
  sameNight: boolean;
}

export interface Profile {
  publicId: string;
  pseudonym: string;
  isSelf: boolean;
  /** 本人是否公開（看自己的頁面時才有意義） */
  isPublic: boolean;
  booklets: ProfileBooklet[];
  common: number;
  sameNights: number;
  similarity: number;
}

function taipeiMonth(d: Date): string {
  const t = new Date(d.getTime() + 8 * 3600_000);
  return `${t.getUTCFullYear()} 年 ${t.getUTCMonth() + 1} 月`;
}

/** 個人頁：未公開的人不存在（回傳 null），除非看的是自己 */
export async function getProfile(q: Queryable, viewerId: string, publicId: string, now: Date = new Date()): Promise<Profile | null> {
  if (!/^[0-9a-f]{16}$/.test(publicId)) return null;
  const u = await q.query<{ id: string; pseudonym: string; social_public: boolean }>(
    `SELECT id, pseudonym, social_public FROM users WHERE public_id = $1`,
    [publicId]
  );
  const user = u.rows[0];
  if (!user) return null;
  const isSelf = String(user.id) === String(viewerId);
  if (!user.social_public && !isSelf) return null;

  const cutoff = new Date(now.getTime() - PUBLIC_DELAY_MS);
  // 看自己的頁面時，顯示「別人會看到的樣子」：一樣排除隱藏的與未滿 4 小時的
  const theirs = await q.query<{ show_id: string; production_id: string; title: string; company_name: string; genre: string | null; starts_at: Date; cover_color: string; cover_image_url: string | null }>(
    `SELECT c.show_id, s.production_id, p.title, p.company_name, p.genre, s.starts_at, d.cover_color, d.cover_image_url
       FROM claims c
       JOIN shows s ON s.id = c.show_id
       JOIN productions p ON p.id = s.production_id
       JOIN designs d ON d.id = p.default_design_id
      WHERE c.user_id = $1 AND NOT c.hidden AND s.starts_at <= $2
      ORDER BY s.starts_at DESC`,
    [user.id, cutoff]
  );
  const mine = await q.query<{ show_id: string; production_id: string }>(
    `SELECT c.show_id, s.production_id FROM claims c JOIN shows s ON s.id = c.show_id WHERE c.user_id = $1`,
    [viewerId]
  );
  const myShows = new Set(mine.rows.map((r) => String(r.show_id)));
  const myProductions = new Set(mine.rows.map((r) => String(r.production_id)));

  // 同一齣戲收藏了多場時合併成一列（同一晚優先）
  const byProduction = new Map<string, ProfileBooklet & { startsAt: number }>();
  for (const r of theirs.rows) {
    const pid = String(r.production_id);
    const sameNight = !isSelf && myShows.has(String(r.show_id));
    const prev = byProduction.get(pid);
    if (prev) {
      prev.sameNight ||= sameNight;
      continue;
    }
    byProduction.set(pid, {
      productionId: pid,
      title: r.title,
      companyName: r.company_name,
      genre: r.genre,
      month: taipeiMonth(new Date(r.starts_at)),
      coverColor: r.cover_color,
      coverImage: r.cover_image_url,
      alsoSeen: !isSelf && myProductions.has(pid),
      sameNight,
      startsAt: new Date(r.starts_at).getTime(),
    });
  }
  const list = [...byProduction.values()].sort(
    (a, b) => Number(b.sameNight) - Number(a.sameNight) || Number(b.alsoSeen) - Number(a.alsoSeen) || b.startsAt - a.startsAt
  );
  const common = list.filter((b) => b.alsoSeen).length;
  return {
    publicId,
    pseudonym: user.pseudonym,
    isSelf,
    isPublic: user.social_public,
    booklets: list.map(({ startsAt: _s, ...b }) => b),
    common,
    sameNights: list.filter((b) => b.sameNight).length,
    similarity: isSelf ? 1 : jaccard(common, myProductions.size, list.length),
  };
}

/** 打開或關閉公開收藏。13–17 歲的觀眾不能打開，回傳 false。 */
export async function setSocialPublic(q: Queryable, userId: string, isPublic: boolean): Promise<boolean> {
  const r = await q.query(
    `UPDATE users SET social_public = $2 WHERE id = $1 AND ($2 = FALSE OR age_group IS DISTINCT FROM 'teen') RETURNING id`,
    [userId, isPublic]
  );
  return r.rows.length > 0;
}

/** 隱藏或取消隱藏自己的一份節目單；不是本人的回傳 false */
export async function setClaimHidden(q: Queryable, userId: string, claimId: string, hidden: boolean): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(claimId)) return false;
  const r = await q.query(`UPDATE claims SET hidden = $3 WHERE id = $1 AND user_id = $2 RETURNING id`, [claimId, userId, hidden]);
  return r.rows.length > 0;
}

export interface Kindred {
  publicId: string;
  pseudonym: string;
  /** 共同收藏的節目數 */
  common: number;
  /** 其中看同一場（同一晚）的次數 */
  sameNights: number;
  /** 0–1 */
  similarity: number;
}

/** 至少一起看過幾齣，才算「足跡相近」 */
export const KINDRED_MIN_COMMON = 2;

/**
 * 收藏冊下方「跟你足跡最像的人」：在所有公開收藏的觀眾裡，找出和你共同收藏最多的人。
 * 規則和頭像列相同（PUBLIC_CLAIM）：只看對方公開、沒隱藏、演出已開始滿 4 小時的節目單。
 * 至少一起看過 KINDRED_MIN_COMMON 齣才列入。total 是符合條件的總人數（不公開的觀眾只看得到這個數字）。
 */
export async function getKindred(q: Queryable, viewerId: string, limit = 5, now: Date = new Date()): Promise<{ people: Kindred[]; total: number }> {
  const cutoff = new Date(now.getTime() - PUBLIC_DELAY_MS);
  const r = await q.query<{ public_id: string; pseudonym: string; n_u: string; common: string; same_nights: string; n_v: string }>(
    `WITH mine AS (
       SELECT DISTINCT s.production_id FROM claims c JOIN shows s ON s.id = c.show_id WHERE c.user_id = $1
     ), mine_shows AS (
       SELECT DISTINCT show_id FROM claims WHERE user_id = $1
     ), pub AS (
       SELECT c.user_id, s.production_id, c.show_id
         FROM claims c JOIN shows s ON s.id = c.show_id JOIN users u ON u.id = c.user_id
        WHERE ${PUBLIC_CLAIM.replace("$NOW", "$2")} AND c.user_id <> $1
     ), st AS (
       SELECT user_id,
              count(DISTINCT production_id) AS n_u,
              count(DISTINCT production_id) FILTER (WHERE production_id IN (SELECT production_id FROM mine)) AS common,
              count(DISTINCT show_id) FILTER (WHERE show_id IN (SELECT show_id FROM mine_shows)) AS same_nights
         FROM pub GROUP BY user_id
     )
     SELECT u.public_id, u.pseudonym, st.n_u, st.common, st.same_nights, (SELECT count(*) FROM mine) AS n_v
       FROM st JOIN users u ON u.id = st.user_id
      WHERE st.common >= $3`,
    [viewerId, cutoff, KINDRED_MIN_COMMON]
  );
  const all = r.rows
    .map((x) => ({
      publicId: x.public_id,
      pseudonym: x.pseudonym,
      common: Number(x.common),
      sameNights: Number(x.same_nights),
      similarity: jaccard(Number(x.common), Number(x.n_v), Number(x.n_u)),
      k: Math.random(),
    }))
    .sort((a, b) => b.similarity - a.similarity || b.common - a.common || b.sameNights - a.sameNights || a.k - b.k);
  return { people: all.slice(0, limit).map(({ k: _k, ...p }) => p), total: all.length };
}
