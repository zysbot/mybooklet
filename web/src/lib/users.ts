import type { Db, Queryable } from "./db";
import { deriveCustodialAddress } from "./wallet";

export interface User {
  id: string;
  line_user_id: string | null;
  google_sub: string | null;
  email: string | null;
  display_name: string | null;
  picture_url: string | null;
  wallet_address: string;
  wallet_type: "custodial" | "self";
  notify_email: boolean;
}

export type LoginIdentity =
  | { provider: "line"; subject: string; displayName?: string; pictureUrl?: string; email?: string }
  | { provider: "google"; subject: string; displayName?: string; pictureUrl?: string; email?: string };

/** 依登入身分找到觀眾；第一次來就建立帳號並推導代管錢包地址 */
export async function findOrCreateUser(db: Db, identity: LoginIdentity, xpub: string): Promise<User> {
  const column = identity.provider === "line" ? "line_user_id" : "google_sub";

  return db.tx(async (q) => {
    const existing = await q.query<User>(`SELECT * FROM users WHERE ${column} = $1`, [identity.subject]);
    if (existing.rows[0]) {
      // 更新顯示名稱與大頭貼，保持最新
      const updated = await q.query<User>(
        `UPDATE users
            SET display_name = COALESCE($2, display_name),
                picture_url  = COALESCE($3, picture_url),
                email        = COALESCE($4, email)
          WHERE id = $1 RETURNING *`,
        [existing.rows[0].id, identity.displayName ?? null, identity.pictureUrl ?? null, identity.email ?? null]
      );
      return updated.rows[0];
    }

    const inserted = await q.query<{ id: string }>(
      `INSERT INTO users (${column}, display_name, picture_url, email)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [identity.subject, identity.displayName ?? null, identity.pictureUrl ?? null, identity.email ?? null]
    );
    const id = inserted.rows[0].id;
    const address = deriveCustodialAddress(xpub, BigInt(id));
    const created = await q.query<User>(`UPDATE users SET wallet_address = $2 WHERE id = $1 RETURNING *`, [id, address]);
    return created.rows[0];
  });
}

export async function getUser(q: Queryable, userId: string): Promise<User | null> {
  const r = await q.query<User>(`SELECT * FROM users WHERE id = $1`, [userId]);
  return r.rows[0] ?? null;
}
