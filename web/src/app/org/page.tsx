import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { listMemberships, ORG_KIND_LABEL } from "@/lib/insights";
import { LoginGate } from "@/app/me/LoginGate";
import "../admin/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "主辦方後台｜吾冊", robots: { index: false } };

export default async function OrgHome() {
  const userId = await currentUserId();
  if (!userId) {
    return (
      <main className="admin" style={{ maxWidth: 440 }}>
        <h1>吾冊 主辦方後台</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>劇團、製作方與場館的工作人員，請用加入後台時的帳號登入。</p>
        <LoginGate />
      </main>
    );
  }

  const orgs = await listMemberships(getDb(), userId);
  return (
    <main className="admin">
      <h1>吾冊 主辦方後台</h1>
      {orgs.length === 0 ? (
        <div className="panel">
          <p style={{ margin: 0, lineHeight: 1.7 }}>
            這個帳號還沒有加入任何劇團、製作方或場館的後台。請向吾冊營運方索取邀請連結，打開後即可加入。
          </p>
        </div>
      ) : (
        <div className="stack">
          {orgs.map((o) => (
            <Link key={o.id} href={`/org/${o.id}`} className="panel" style={{ textDecoration: "none", color: "inherit" }}>
              <span className="small muted">{ORG_KIND_LABEL[o.kind]}</span>
              <strong style={{ fontSize: 18 }}>{o.name}</strong>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
