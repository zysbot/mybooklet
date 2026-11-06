import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { findByInvite, isMember, ORG_KIND_LABEL } from "@/lib/insights";
import { LoginGate } from "@/app/me/LoginGate";
import { JoinButton } from "./JoinButton";
import "../../../admin/admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "加入主辦方後台｜吾冊", robots: { index: false } };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const org = await findByInvite(db, token);
  if (!org) notFound();
  const userId = await currentUserId();
  if (userId && (await isMember(db, org.id, userId))) redirect(`/org/${org.id}`);

  return (
    <main className="admin" style={{ maxWidth: 440 }}>
      <span className="small muted">{ORG_KIND_LABEL[org.kind]}</span>
      <h1>加入「{org.name}」的吾冊後台</h1>
      <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
        加入後可以看到節目單的領取統計與觀眾足跡。後台只提供統計，不會顯示任何觀眾的個人資料。
      </p>
      {userId ? <JoinButton token={token} /> : <LoginGate />}
    </main>
  );
}
