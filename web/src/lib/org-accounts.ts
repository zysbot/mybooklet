import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { Queryable } from "./db";
import type { Organizer, OrgKind } from "./insights";
import { getOrgRoles, rolesLabel } from "./roles";
import { EFFECTIVE_PLAN_SQL, type Plan } from "./plans";

/**
 * 主辦方的工作帳號。
 * - 與觀眾帳號完全分開：工作人員自己私下看了哪些戲，不會和工作身分連在一起。
 * - 只能由營運方加入、移除（沒有邀請連結，也沒有自行註冊）。
 * - 用 Email 驗證碼登入；驗證碼只存雜湊，10 分鐘有效、最多試 5 次。
 * - 登入、查看、加入、移除都記在 org_access_log。
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
/** 同一個 Email 一小時內最多寄幾次驗證碼 */
export const CODE_MAX_PER_HOUR = 5;
const PURPOSE = "org";

export class OrgAccountError extends Error {}

export function normalizeEmail(input: string): string | null {
  const e = input.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

function pepper(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET 至少要 32 個字元");
  return s;
}

function hashCode(email: string, code: string): string {
  return createHmac("sha256", "login-code:" + pepper()).update(`${email}:${code}`).digest("hex");
}

export async function logAccess(
  q: Queryable,
  organizerId: string | null,
  actor: string,
  action: "login" | "view" | "member_added" | "member_removed" | "plan_changed" | "attachment_added" | "attachment_removed",
  detail?: string
): Promise<void> {
  await q.query(`INSERT INTO org_access_log (organizer_id, actor, action, detail) VALUES ($1, $2, $3, $4)`, [
    organizerId,
    actor,
    action,
    detail ?? null,
  ]);
}

// ---------------------------------------------------------------
// 營運方：加入、移除、列出
// ---------------------------------------------------------------

export async function addMember(q: Queryable, organizerId: string, rawEmail: string): Promise<{ accountId: string; email: string }> {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new OrgAccountError("Email 格式不正確");
  const org = await q.query(`SELECT 1 FROM organizers WHERE id = $1`, [organizerId]);
  if (org.rows.length === 0) throw new OrgAccountError("找不到這個組織");
  const acc = await q.query<{ id: string }>(
    `INSERT INTO org_accounts (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id`,
    [email]
  );
  const accountId = String(acc.rows[0].id);
  const added = await q.query(
    `INSERT INTO org_account_members (organizer_id, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING account_id`,
    [organizerId, accountId]
  );
  if (added.rows.length > 0) await logAccess(q, organizerId, "營運方", "member_added", email);
  return { accountId, email };
}

export async function removeMember(q: Queryable, organizerId: string, accountId: string): Promise<boolean> {
  const r = await q.query<{ email: string }>(
    `DELETE FROM org_account_members m USING org_accounts a
      WHERE m.organizer_id = $1 AND m.account_id = $2 AND a.id = m.account_id
      RETURNING a.email`,
    [organizerId, accountId]
  );
  if (r.rows.length === 0) return false;
  await logAccess(q, organizerId, "營運方", "member_removed", r.rows[0].email);
  return true;
}

export interface OrgMember {
  accountId: string;
  email: string;
  addedAt: Date;
  lastLoginAt: Date | null;
}

export async function listMembers(q: Queryable, organizerId: string): Promise<OrgMember[]> {
  const r = await q.query<{ id: string; email: string; added_at: Date; last_login_at: Date | null }>(
    `SELECT a.id, a.email, m.added_at, a.last_login_at
       FROM org_account_members m JOIN org_accounts a ON a.id = m.account_id
      WHERE m.organizer_id = $1 ORDER BY m.added_at`,
    [organizerId]
  );
  return r.rows.map((x) => ({
    accountId: String(x.id),
    email: x.email,
    addedAt: new Date(x.added_at),
    lastLoginAt: x.last_login_at ? new Date(x.last_login_at) : null,
  }));
}

export interface AccessLogEntry {
  actor: string;
  action: string;
  detail: string | null;
  at: Date;
}

export async function listAccessLog(q: Queryable, organizerId: string, limit = 50): Promise<AccessLogEntry[]> {
  const r = await q.query<{ actor: string; action: string; detail: string | null; at: Date }>(
    `SELECT actor, action, detail, at FROM org_access_log WHERE organizer_id = $1 ORDER BY at DESC, id DESC LIMIT $2`,
    [organizerId, limit]
  );
  return r.rows.map((x) => ({ ...x, at: new Date(x.at) }));
}

// ---------------------------------------------------------------
// 工作人員：自己屬於哪些組織
// ---------------------------------------------------------------

export async function listAccountOrgs(q: Queryable, accountId: string): Promise<(Organizer & { plan: Plan })[]> {
  const r = await q.query<{ id: string; name: string; kind: OrgKind; plan: Plan }>(
    `SELECT o.id, o.name, o.kind, ${EFFECTIVE_PLAN_SQL} AS plan
       FROM org_account_members m JOIN organizers o ON o.id = m.organizer_id
      WHERE m.account_id = $1 ORDER BY o.name`,
    [accountId]
  );
  const out: (Organizer & { plan: Plan })[] = [];
  for (const o of r.rows) {
    const roles = await getOrgRoles(q, String(o.id));
    out.push({ id: String(o.id), name: o.name, kind: o.kind, roles, roleLabel: rolesLabel(roles, o.kind), plan: o.plan });
  }
  return out;
}

export async function isOrgMember(q: Queryable, organizerId: string, accountId: string): Promise<boolean> {
  if (!/^\d+$/.test(organizerId)) return false;
  const r = await q.query(`SELECT 1 FROM org_account_members WHERE organizer_id = $1 AND account_id = $2`, [organizerId, accountId]);
  return r.rows.length > 0;
}

export async function getAccount(q: Queryable, accountId: string): Promise<{ id: string; email: string } | null> {
  const r = await q.query<{ id: string; email: string }>(`SELECT id, email FROM org_accounts WHERE id = $1`, [accountId]);
  const a = r.rows[0];
  return a ? { id: String(a.id), email: a.email } : null;
}

// ---------------------------------------------------------------
// Email 驗證碼登入
// ---------------------------------------------------------------

/**
 * 申請驗證碼。只有「屬於至少一個組織」的 Email 才會真的寄出；
 * 不論是否寄出，呼叫端都回應同一句話，不透露這個 Email 有沒有帳號。
 */
export async function requestLoginCode(
  q: Queryable,
  rawEmail: string,
  send: (email: string, code: string) => Promise<void>,
  now: Date = new Date()
): Promise<"sent" | "skipped" | "rate_limited"> {
  const email = normalizeEmail(rawEmail);
  if (!email) return "skipped";
  const acc = await q.query(
    `SELECT 1 FROM org_accounts a JOIN org_account_members m ON m.account_id = a.id WHERE a.email = $1 LIMIT 1`,
    [email]
  );
  if (acc.rows.length === 0) return "skipped";
  const recent = await q.query<{ n: string }>(
    `SELECT count(*) AS n FROM login_codes WHERE purpose = $1 AND email = $2 AND created_at > $3`,
    [PURPOSE, email, new Date(now.getTime() - 3600_000)]
  );
  if (Number(recent.rows[0].n) >= CODE_MAX_PER_HOUR) return "rate_limited";

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // 新的驗證碼寄出後，舊的一律失效
  await q.query(`UPDATE login_codes SET used_at = $3 WHERE purpose = $1 AND email = $2 AND used_at IS NULL`, [PURPOSE, email, now]);
  await q.query(
    `INSERT INTO login_codes (purpose, email, code_hash, created_at, expires_at) VALUES ($1, $2, $3, $4, $5)`,
    [PURPOSE, email, hashCode(email, code), now, new Date(now.getTime() + CODE_TTL_MS)]
  );
  await send(email, code);
  return "sent";
}

/** 驗證碼正確就回傳帳號；錯誤、過期、試太多次都回傳 null */
export async function verifyLoginCode(
  q: Queryable,
  rawEmail: string,
  rawCode: string,
  now: Date = new Date()
): Promise<{ accountId: string; email: string } | null> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\s/g, "");
  if (!email || !/^\d{6}$/.test(code)) return null;

  const r = await q.query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM login_codes
      WHERE purpose = $1 AND email = $2 AND used_at IS NULL AND expires_at > $3
      ORDER BY created_at DESC LIMIT 1`,
    [PURPOSE, email, now]
  );
  const row = r.rows[0];
  if (!row || Number(row.attempts) >= CODE_MAX_ATTEMPTS) return null;

  await q.query(`UPDATE login_codes SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
  const a = Buffer.from(hashCode(email, code), "hex");
  const b = Buffer.from(row.code_hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  await q.query(`UPDATE login_codes SET used_at = $2 WHERE id = $1`, [row.id, now]);
  const acc = await q.query<{ id: string }>(`UPDATE org_accounts SET last_login_at = $2 WHERE email = $1 RETURNING id`, [email, now]);
  if (!acc.rows[0]) return null;
  // 登入紀錄記在這個帳號所屬的每個組織，營運方在各組織的紀錄裡都看得到
  await q.query(
    `INSERT INTO org_access_log (organizer_id, actor, action) SELECT organizer_id, $2, 'login' FROM org_account_members WHERE account_id = $1`,
    [acc.rows[0].id, email]
  );
  return { accountId: String(acc.rows[0].id), email };
}
