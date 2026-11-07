import type { Db, Queryable } from "./db";

export class FavoriteError extends Error {}

export interface Favorite {
  rank: 1 | 2 | 3 | 4 | 5;
  claimId: string;
  title: string;
}

/**
 * 把一份節目單放到前五喜歡的某個名次。
 * 那個名次原本的節目單會被取代；這份節目單若原本在別的名次，會移過來。
 */
export async function setFavorite(db: Db, userId: string, claimId: string, rank: number): Promise<void> {
  if (![1, 2, 3, 4, 5].includes(rank)) throw new FavoriteError("名次只能是 1 到 5");
  await db.tx(async (q) => {
    const own = await q.query(`SELECT 1 FROM claims WHERE id = $1 AND user_id = $2`, [claimId, userId]);
    if (!own.rows[0]) throw new FavoriteError("只能標記自己領過的節目單");
    await q.query(`DELETE FROM favorites WHERE user_id = $1 AND (rank = $2 OR claim_id = $3)`, [userId, rank, claimId]);
    await q.query(`INSERT INTO favorites (user_id, claim_id, rank) VALUES ($1, $2, $3)`, [userId, claimId, rank]);
  });
}

export async function removeFavorite(q: Queryable, userId: string, claimId: string): Promise<void> {
  await q.query(`DELETE FROM favorites WHERE user_id = $1 AND claim_id = $2`, [userId, claimId]);
}

export async function getFavorites(q: Queryable, userId: string): Promise<Favorite[]> {
  const r = await q.query<{ rank: number; claim_id: string; title: string }>(
    `SELECT f.rank, f.claim_id, p.title
       FROM favorites f
       JOIN claims c ON c.id = f.claim_id
       JOIN shows s ON s.id = c.show_id
       JOIN productions p ON p.id = s.production_id
      WHERE f.user_id = $1
      ORDER BY f.rank`,
    [userId]
  );
  return r.rows.map((x) => ({ rank: Number(x.rank) as Favorite["rank"], claimId: x.claim_id, title: x.title }));
}
