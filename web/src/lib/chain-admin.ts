import type { Db } from "./db";
import { configureShowsOnChain } from "./productions";

/**
 * 換到新合約（例如從 Kaia 測試網換到 Base 測試網）後使用：
 * 所有場次標為「尚未寫入合約」，所有領取紀錄回到「待上鏈」，清掉舊鏈上的 token、交易與代管地址。
 * 節目、場次、節目單與觀眾的收藏都保留。舊鏈上已鑄造的 token 留在舊鏈，不再對應。
 */
export async function resetChainState(db: Db, now: Date = new Date()): Promise<{ shows: number; claims: number }> {
  return db.tx(async (q) => {
    const shows = await q.query<{ id: string }>(`UPDATE shows SET chain_configured = FALSE RETURNING id`);
    const claims = await q.query<{ id: string }>(
      `UPDATE claims
          SET chain_status = 'pending', attempts = 0, next_attempt_at = $1,
              submitted_at = NULL, last_error = NULL, tx_hash = NULL, token_id = NULL, minted_at = NULL,
              recipient_address = NULL, custody_path = NULL
        RETURNING id`,
      [now]
    );
    return { shows: shows.rows.length, claims: claims.rows.length };
  });
}

/**
 * 把還沒寫入合約的場次逐一寫入，時間用完就停（網站單次請求最多 60 秒）。
 * 回傳完成數、失敗與剩下的數量；剩下的再按一次即可。
 */
export async function configurePendingShows(
  db: Db,
  setShowURI: (showId: bigint, uri: string) => Promise<string>,
  budgetMs = 40_000
): Promise<{ done: number; failed: { showId: string; error?: string }[]; remaining: number }> {
  const started = Date.now();
  const pending = await db.query<{ id: string }>(
    `SELECT id FROM shows WHERE NOT chain_configured AND metadata_uri IS NOT NULL ORDER BY starts_at`
  );
  const ids = pending.rows.map((r) => String(r.id));
  let done = 0;
  const failed: { showId: string; error?: string }[] = [];
  let i = 0;
  for (; i < ids.length; i++) {
    if (Date.now() - started > budgetMs) break;
    const [r] = await configureShowsOnChain(db, [ids[i]], setShowURI);
    if (r.ok) done++;
    else failed.push({ showId: r.showId, error: r.error });
  }
  return { done, failed, remaining: ids.length - i };
}
