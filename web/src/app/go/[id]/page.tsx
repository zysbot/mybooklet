import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getAttachmentForViewer, linkHost } from "@/lib/attachments";
import { Brand } from "@/components/Brand";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "即將離開吾冊｜吾冊", robots: { index: false } };

/** 前往主辦方附上的外部連結前，先讓觀眾看清楚要去哪個網站 */
export default async function LeavePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  const userId = await currentUserId();
  if (!userId) redirect("/me");
  const a = await getAttachmentForViewer(getDb(), id, userId);
  if (!a || !a.linkUrl) notFound();
  const back = from && /^[0-9a-f-]{36}$/i.test(from) ? `/booklet/${from}` : "/me";

  return (
    <main className="page" style={{ maxWidth: 520 }}>
      <div className="topbar"><Brand /></div>
      <div className="stack" style={{ gap: 16 }}>
        <h1 className="title" style={{ fontSize: 24 }}>即將離開吾冊</h1>
        <p style={{ margin: 0, lineHeight: 1.8 }}>
          「{a.title}」是主辦方附上的連結，會前往：
        </p>
        <p className="leave-host">{linkHost(a.linkUrl)}</p>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          這個網站不是吾冊經營的。吾冊不會把你的化名、帳號或任何資料告訴對方；如果對方要你輸入 LINE、Google 或吾冊的帳號密碼，請不要輸入。
        </p>
        <a href={`/api/attachments/${a.id}/open?to=link`} className="btn btn-primary" rel="noreferrer">前往 {linkHost(a.linkUrl)}</a>
        <Link href={back} className="btn btn-quiet">回到節目單</Link>
      </div>
    </main>
  );
}
