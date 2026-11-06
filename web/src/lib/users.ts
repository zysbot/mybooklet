import type { Db, Queryable } from "./db";
import { pseudonymCandidates, pseudonymWithSuffix } from "./pseudonym";

export interface User {
  id: string;
  line_user_id: string | null;
  google_sub: string | null;
  email: string | null;
  /** 系統產生的化名，例如「二樓包廂的水獺」；吾冊不保存 LINE、Google 的名稱與大頭貼 */
  pseudonym: string;
  /** 只有觀眾綁定自有錢包（wallet_type = self）時才有值；代管時每份節目單各有一個地址，存在 claims */
  wallet_address: string | null;
  wallet_type: "custodial" | "self";
  notify_email: boolean;
}

/** 登入身分：只取帳號編號與 Email（Email 只用來寄通知），不取名稱與大頭貼 */
export type LoginIdentity = { provider: "line" | "google"; subject: string; email?: string };

/** 從候選中挑一個還沒人用的化名 */
export async function pickFreePseudonym(q: Queryable): Promise<string> {
  for (let round = 0; round < 3; round++) {
    const candidates = pseudonymCandidates(20);
    const taken = await q.query<{ pseudonym: string }>(`SELECT pseudonym FROM users WHERE pseudonym = ANY($1::text[])`, [candidates]);
    const used = new Set(taken.rows.map((r) => r.pseudonym));
    const free = candidates.find((c) => !used.has(c));
    if (free) return free;
  }
  return pseudonymWithSuffix();
}

/** 依登入身分找到觀眾；第一次來就建立帳號並配一個化名 */
export async function findOrCreateUser(db: Db, identity: LoginIdentity): Promise<User> {
  const column = identity.provider === "line" ? "line_user_id" : "google_sub";

  for (let attempt = 0; attempt < 5; attempt++) {
    const user = await db.tx(async (q) => {
      const existing = await q.query<User>(`SELECT * FROM users WHERE ${column} = $1`, [identity.subject]);
      if (existing.rows[0]) {
        if (identity.email && identity.email !== existing.rows[0].email) {
          const updated = await q.query<User>(`UPDATE users SET email = $2 WHERE id = $1 RETURNING *`, [existing.rows[0].id, identity.email]);
          return updated.rows[0];
        }
        return existing.rows[0];
      }
      // 同時有人註冊（同一帳號或撞到同一化名）時 DO NOTHING，交給下一輪重試
      const inserted = await q.query<User>(
        `INSERT INTO users (${column}, email, pseudonym) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING *`,
        [identity.subject, identity.email ?? null, await pickFreePseudonym(q)]
      );
      return inserted.rows[0] ?? null;
    });
    if (user) return user;
  }
  throw new Error("建立帳號失敗，請再試一次");
}

export async function getUser(q: Queryable, userId: string): Promise<User | null> {
  const r = await q.query<User>(`SELECT * FROM users WHERE id = $1`, [userId]);
  return r.rows[0] ?? null;
}

/** 舊帳號（改版前建立、還沒有化名）補上化名。資料庫更新時執行，可重複執行。 */
export async function backfillPseudonyms(q: Queryable): Promise<number> {
  const missing = await q.query<{ id: string }>(`SELECT id FROM users WHERE pseudonym IS NULL ORDER BY id`);
  let n = 0;
  for (const { id } of missing.rows) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const r = await q.query(
        `UPDATE users SET pseudonym = $2
          WHERE id = $1 AND pseudonym IS NULL
            AND NOT EXISTS (SELECT 1 FROM users WHERE pseudonym = $2)
        RETURNING id`,
        [id, await pickFreePseudonym(q)]
      );
      if (r.rows.length > 0) {
        n++;
        break;
      }
    }
  }
  return n;
}
