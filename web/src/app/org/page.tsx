import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { currentOrgAccount } from "@/lib/org-session";
import { listAccountOrgs } from "@/lib/org-accounts";
import { ORG_KIND_LABEL } from "@/lib/insights";
import { PLAN_LABEL } from "@/lib/plans";
import { OrgLogin, OrgLogout } from "./OrgLogin";
import "../admin/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "主辦方後台｜吾冊", robots: { index: false } };

export default async function OrgHome() {
  const account = await currentOrgAccount();
  if (!account) {
    return (
      <main className="admin" style={{ maxWidth: 440 }}>
        <h1>吾冊 主辦方後台</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          劇團、製作方與場館的工作人員，請用吾冊營運方為你登記的工作 Email 登入。這個帳號和你在吾冊收藏節目單的帳號是分開的。
        </p>
        <OrgLogin />
      </main>
    );
  }

  const orgs = await listAccountOrgs(getDb(), account.id);
  return (
    <main className="admin">
      <div className="admin-top">
        <h1>吾冊 主辦方後台</h1>
        <span style={{ display: "inline-flex", gap: 12, alignItems: "center" }}>
          <span className="small muted">{account.email}</span>
          <OrgLogout />
        </span>
      </div>
      {orgs.length === 0 ? (
        <div className="panel">
          <p style={{ margin: 0, lineHeight: 1.7 }}>這個帳號目前沒有屬於任何劇團、製作方或場館。如有需要，請聯絡吾冊營運方。</p>
        </div>
      ) : (
        <div className="stack">
          {orgs.map((o) => (
            <Link key={o.id} href={`/org/${o.id}`} className="panel" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="small muted">{ORG_KIND_LABEL[o.kind]}・{PLAN_LABEL[o.plan]}</span>
              <strong style={{ fontSize: 18 }}>{o.name}</strong>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
