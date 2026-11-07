import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import {
  addMember,
  removeMember,
  listMembers,
  listAccountOrgs,
  isOrgMember,
  listAccessLog,
  requestLoginCode,
  verifyLoginCode,
  CODE_MAX_ATTEMPTS,
  CODE_MAX_PER_HOUR,
  CODE_TTL_MS,
} from "@/lib/org-accounts";
import { createTestDb } from "./helpers";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters";
});

describe("主辦方工作帳號", () => {
  let db: Db;
  let orgA: string;
  let orgB: string;
  const now = new Date("2026-11-07T02:00:00Z");

  beforeEach(async () => {
    db = await createTestDb();
    const org = async (name: string) =>
      String((await db.query<{ id: string }>(`INSERT INTO organizers (name, kind) VALUES ($1, 'company') RETURNING id`, [name])).rows[0].id);
    orgA = await org("劇團甲");
    orgB = await org("劇團乙");
  });

  /** 申請驗證碼並攔下寄出的內容 */
  async function codeFor(email: string, at = now): Promise<string | null> {
    let sent: string | null = null;
    await requestLoginCode(db, email, async (_to, code) => { sent = code; }, at);
    return sent;
  }

  it("營運方加入、移除工作人員，Email 不分大小寫，都有紀錄", async () => {
    const { accountId, email } = await addMember(db, orgA, "  Staff@Example.COM ");
    expect(email).toBe("staff@example.com");
    await addMember(db, orgB, "staff@example.com"); // 同一個人可以屬於多個組織
    expect((await listMembers(db, orgA)).map((m) => m.email)).toEqual(["staff@example.com"]);
    expect((await listAccountOrgs(db, accountId)).map((o) => o.name).sort()).toEqual(["劇團乙", "劇團甲"]);

    expect(await removeMember(db, orgA, accountId)).toBe(true);
    expect(await isOrgMember(db, orgA, accountId)).toBe(false);
    expect(await isOrgMember(db, orgB, accountId)).toBe(true);
    expect((await listAccessLog(db, orgA)).map((e) => e.action)).toEqual(["member_removed", "member_added"]);
  });

  it("Email 格式不對就拒絕", async () => {
    await expect(addMember(db, orgA, "not-an-email")).rejects.toThrow("Email");
  });

  it("用驗證碼登入；登入記在所屬的每個組織", async () => {
    await addMember(db, orgA, "staff@example.com");
    const code = await codeFor("staff@example.com");
    expect(code).toMatch(/^\d{6}$/);
    const acc = await verifyLoginCode(db, "STAFF@example.com", code!, now);
    expect(acc?.email).toBe("staff@example.com");
    expect((await listAccessLog(db, orgA))[0].action).toBe("login");
    // 用過即失效
    expect(await verifyLoginCode(db, "staff@example.com", code!, now)).toBeNull();
  });

  it("沒有加入任何組織的 Email 不會寄出驗證碼；被移除後也不會", async () => {
    expect(await codeFor("stranger@example.com")).toBeNull();
    const { accountId } = await addMember(db, orgA, "staff@example.com");
    await removeMember(db, orgA, accountId);
    expect(await codeFor("staff@example.com")).toBeNull();
  });

  it("驗證碼 10 分鐘後失效", async () => {
    await addMember(db, orgA, "staff@example.com");
    const code = await codeFor("staff@example.com");
    expect(await verifyLoginCode(db, "staff@example.com", code!, new Date(now.getTime() + CODE_TTL_MS + 1000))).toBeNull();
  });

  it("錯太多次就鎖住，正確的碼也不能用", async () => {
    await addMember(db, orgA, "staff@example.com");
    const code = await codeFor("staff@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < CODE_MAX_ATTEMPTS; i++) expect(await verifyLoginCode(db, "staff@example.com", wrong, now)).toBeNull();
    expect(await verifyLoginCode(db, "staff@example.com", code!, now)).toBeNull();
  });

  it("重新申請後舊的碼失效；一小時內申請次數有上限", async () => {
    await addMember(db, orgA, "staff@example.com");
    const first = await codeFor("staff@example.com");
    const second = await codeFor("staff@example.com", new Date(now.getTime() + 1000));
    if (first !== second) expect(await verifyLoginCode(db, "staff@example.com", first!, now)).toBeNull();
    for (let i = 2; i < CODE_MAX_PER_HOUR; i++) await codeFor("staff@example.com", new Date(now.getTime() + i * 1000));
    const r = await requestLoginCode(db, "staff@example.com", async () => {}, new Date(now.getTime() + 60_000));
    expect(r).toBe("rate_limited");
  });

  it("驗證碼只存雜湊", async () => {
    await addMember(db, orgA, "staff@example.com");
    const code = await codeFor("staff@example.com");
    const rows = await db.query<{ code_hash: string }>(`SELECT code_hash FROM login_codes`);
    expect(rows.rows[0].code_hash).not.toContain(code!);
    expect(rows.rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
