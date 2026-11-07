import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getOrganizer, ORG_KIND_LABEL } from "@/lib/insights";
import { FREE_CLAIM_LIMIT, freeUsage, getPlan, logPlanChange, PLAN_LABEL, PLANS, PlanError, setPlan } from "@/lib/plans";
import { addMember, listAccessLog, listMembers, OrgAccountError, removeMember } from "@/lib/org-accounts";
import "../../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "管理主辦方｜吾冊", robots: { index: false } };

const ACTION_LABEL: Record<string, string> = {
  login: "登入",
  view: "查看後台",
  member_added: "加入工作人員",
  member_removed: "移除工作人員",
  plan_changed: "變更方案",
};

function back(id: string, msg?: string, error?: string): never {
  const q = new URLSearchParams();
  if (msg) q.set("msg", msg);
  if (error) q.set("error", error);
  redirect(`/admin/organizers/${id}${q.size ? `?${q}` : ""}`);
}

export default async function ManageOrganizer({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  const { msg, error } = await searchParams;
  const db = getDb();
  const org = await getOrganizer(db, id);
  if (!org) notFound();
  const [plan, members, log, used] = await Promise.all([
    getPlan(db, id),
    listMembers(db, id),
    listAccessLog(db, id),
    org.kind === "company" ? freeUsage(db, id) : Promise.resolve(null),
  ]);
  if (!plan) notFound();

  async function savePlan(fd: FormData) {
    "use server";
    if (!(await isAdmin())) redirect("/admin/login");
    const newPlan = String(fd.get("plan") ?? "");
    const until = String(fd.get("until") ?? "").trim() || null;
    try {
      await setPlan(getDb(), id, newPlan, until);
      await logPlanChange(getDb(), id, newPlan, until);
    } catch (err) {
      if (err instanceof PlanError) back(id, undefined, err.message);
      throw err;
    }
    back(id, "方案已更新");
  }

  async function add(fd: FormData) {
    "use server";
    if (!(await isAdmin())) redirect("/admin/login");
    let email: string;
    try {
      email = (await addMember(getDb(), id, String(fd.get("email") ?? ""))).email;
    } catch (err) {
      if (err instanceof OrgAccountError) back(id, undefined, err.message);
      throw err;
    }
    back(id, `已加入 ${email}。請通知對方到 /org 用這個 Email 登入。`);
  }

  async function remove(fd: FormData) {
    "use server";
    if (!(await isAdmin())) redirect("/admin/login");
    const accountId = String(fd.get("accountId") ?? "");
    if (!/^\d+$/.test(accountId)) back(id, undefined, "找不到這位工作人員");
    await removeMember(getDb(), id, accountId);
    back(id, "已移除，對方立即看不到這個組織的後台");
  }

  return (
    <main className="admin">
      <div className="admin-top">
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">{ORG_KIND_LABEL[org.kind]}</span>
          <h1>{org.name}</h1>
        </div>
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={`/org/${id}`} className="link-btn">看後台</Link>
          <Link href="/admin" className="link-btn">回營運後台</Link>
        </span>
      </div>

      {msg && <p className="privacy-note" role="status">{msg}</p>}
      {error && <p className="privacy-note" role="alert" style={{ color: "var(--accent)" }}>{error}</p>}

      <section className="panel" aria-labelledby="plan-title">
        <h2 id="plan-title">合作方案</h2>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          目前適用：<strong>{PLAN_LABEL[plan.effective]}</strong>
          {plan.plan !== plan.effective && `（設定為${PLAN_LABEL[plan.plan]}，已於 ${plan.until} 到期）`}
          {used !== null && plan.effective === "free" && `・免費額度已使用 ${used} / ${FREE_CLAIM_LIMIT} 份`}
          <br />
          免費：只看每場份數，演出團隊所有場次合計最多 {FREE_CLAIM_LIMIT} 份。基本合作：看得到完整統計、不限份數；到期日當天仍有效，過了自動回到免費。
        </p>
        <form action={savePlan} className="form-grid">
          <label className="field">
            方案
            <select name="plan" defaultValue={plan.plan}>
              {PLANS.map((p) => (
                <option key={p} value={p}>{PLAN_LABEL[p]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            合作到期日（留空表示不設到期日）
            <input type="date" name="until" defaultValue={plan.until ?? ""} />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-primary">儲存方案</button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="members-title">
        <h2 id="members-title">工作人員</h2>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          輸入對方的工作 Email 加入。對方到 mybooklet.party/org 輸入這個 Email，收驗證碼登入。這是工作帳號，和觀眾收藏節目單的帳號分開。
        </p>
        {members.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Email</th><th>加入時間</th><th>最近登入</th><th aria-label="操作" /></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.accountId}>
                    <td>{m.email}</td>
                    <td className="muted">{formatDateTime(m.addedAt)}</td>
                    <td className="muted">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : "尚未登入"}</td>
                    <td style={{ textAlign: "right" }}>
                      <form action={remove}>
                        <input type="hidden" name="accountId" value={m.accountId} />
                        <button type="submit" className="link-btn" style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }}>移除</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <form action={add} className="form-grid">
          <label className="field">
            工作 Email
            <input type="email" name="email" required autoComplete="off" />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-primary">加入</button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="log-title">
        <h2 id="log-title">存取紀錄</h2>
        {log.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>還沒有紀錄</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>時間</th><th>誰</th><th>做了什麼</th><th>內容</th></tr>
              </thead>
              <tbody>
                {log.map((e, i) => (
                  <tr key={i}>
                    <td className="muted">{formatDateTime(e.at)}</td>
                    <td>{e.actor}</td>
                    <td>{ACTION_LABEL[e.action] ?? e.action}</td>
                    <td className="muted">{e.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted" style={{ margin: 0 }}>顯示最近 50 筆。</p>
      </section>
    </main>
  );
}
