import type { Db } from "./db";
import { EFFECTIVE_PLAN_SQL, FREE_CLAIM_LIMIT } from "./plans";
import { ISSUER_SQL } from "./roles";

export type ClaimErrorCode = "CODE_NOT_FOUND" | "CODE_NOT_ACTIVE" | "SOLD_OUT" | "FREE_LIMIT";

export class ClaimError extends Error {
  constructor(public code: ClaimErrorCode) {
    super(code);
  }
}

export const CLAIM_ERROR_MESSAGES: Record<ClaimErrorCode, string> = {
  CODE_NOT_FOUND: "找不到這個 QR code，請向現場工作人員確認。",
  CODE_NOT_ACTIVE: "這個 QR code 目前不在開放領取的時段。",
  SOLD_OUT: "這個場次的節目單已全數領取完畢。",
  // 免費方案的份數用完：對觀眾只說發完了，不提方案
  FREE_LIMIT: "這個節目的節目單已全數領取完畢。",
};

export interface ClaimResult {
  claimId: string;
  showId: string;
  serial: number;
  claimedAt: Date;
  /** true 表示這位觀眾先前已經領過，這次只是回傳原本的紀錄 */
  alreadyClaimed: boolean;
}

/**
 * 觀眾掃碼領取。
 * - 同一場次每人只能領一份；重複領取回傳原本的紀錄（不報錯、不重發編號）。
 * - 入場編號依領取順序連續配發，不跳號。
 * - 只寫資料庫，立即回應；上鏈交給背景程序。
 */
export async function claimShow(db: Db, userId: string, code: string, now: Date = new Date()): Promise<ClaimResult> {
  const found = await db.query<{ show_id: string; valid_from: Date; valid_to: Date; max_claims: number | null }>(
    `SELECT show_id, valid_from, valid_to, max_claims FROM claim_codes WHERE code = $1`,
    [code]
  );
  const claimCode = found.rows[0];
  if (!claimCode) throw new ClaimError("CODE_NOT_FOUND");
  if (now < new Date(claimCode.valid_from) || now > new Date(claimCode.valid_to)) {
    throw new ClaimError("CODE_NOT_ACTIVE");
  }

  return db.tx(async (q) => {
    // 鎖住場次這一列：同一場次的領取依序處理，編號才不會重複或跳號
    await q.query(`SELECT id FROM shows WHERE id = $1 FOR UPDATE`, [claimCode.show_id]);

    const existing = await q.query<{ id: string; serial: number; claimed_at: Date }>(
      `SELECT id, serial, claimed_at FROM claims WHERE user_id = $1 AND show_id = $2`,
      [userId, claimCode.show_id]
    );
    if (existing.rows[0]) {
      const c = existing.rows[0];
      return {
        claimId: c.id,
        showId: String(claimCode.show_id),
        serial: Number(c.serial),
        claimedAt: new Date(c.claimed_at),
        alreadyClaimed: true,
      };
    }

    if (claimCode.max_claims !== null) {
      const count = await q.query<{ n: string }>(`SELECT count(*) AS n FROM claims WHERE show_id = $1`, [
        claimCode.show_id,
      ]);
      if (Number(count.rows[0].n) >= claimCode.max_claims) throw new ClaimError("SOLD_OUT");
    }

    // 免費方案：發放單位（預設是演出團隊）所有節目、所有場次合計最多 FREE_CLAIM_LIMIT 份。
    // 鎖住組織這一列，跨場次同時領取也不會超發。
    const org = await q.query<{ id: string; plan: string }>(
      `SELECT o.id, ${EFFECTIVE_PLAN_SQL} AS plan
         FROM shows s JOIN productions p ON p.id = s.production_id JOIN organizers o ON o.id = ${ISSUER_SQL}
        WHERE s.id = $1
        FOR UPDATE OF o`,
      [claimCode.show_id]
    );
    if (org.rows[0]?.plan === "free") {
      const used = await q.query<{ n: string }>(
        `SELECT count(*) AS n FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
          WHERE ${ISSUER_SQL} = $1`,
        [org.rows[0].id]
      );
      if (Number(used.rows[0].n) >= FREE_CLAIM_LIMIT) throw new ClaimError("FREE_LIMIT");
    }

    const serialRow = await q.query<{ serial: number }>(
      `UPDATE shows SET next_serial = next_serial + 1 WHERE id = $1 RETURNING next_serial - 1 AS serial`,
      [claimCode.show_id]
    );
    const serial = Number(serialRow.rows[0].serial);

    const inserted = await q.query<{ id: string; claimed_at: Date }>(
      `INSERT INTO claims (user_id, show_id, serial, claimed_at)
       VALUES ($1, $2, $3, $4) RETURNING id, claimed_at`,
      [userId, claimCode.show_id, serial, now]
    );

    return {
      claimId: inserted.rows[0].id,
      showId: String(claimCode.show_id),
      serial,
      claimedAt: new Date(inserted.rows[0].claimed_at),
      alreadyClaimed: false,
    };
  });
}
