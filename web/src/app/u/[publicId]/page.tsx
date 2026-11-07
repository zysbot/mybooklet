import { cardBackground } from "@/components/ProgramCard";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getProfile } from "@/lib/social";
import { Avatar } from "@/components/Avatar";
import { Brand } from "@/components/Brand";

export const dynamic = "force-dynamic";
// 個人頁只給登入的吾冊觀眾看，不讓搜尋引擎收錄
export const metadata: Metadata = { title: "收藏者｜吾冊", robots: { index: false, follow: false } };

export default async function ProfilePage({ params }: { params: Promise<{ publicId: string }> }) {
  const userId = await currentUserId();
  if (!userId) redirect("/me");
  const { publicId } = await params;
  const p = await getProfile(getDb(), userId, publicId);
  if (!p) notFound();

  return (
    <main className="page page-wide">
      <div className="topbar"><Brand /><Link href="/me" className="small">我的收藏冊</Link></div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar pseudonym={p.pseudonym} size={72} />
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <h1 className="title" style={{ fontSize: 24, overflowWrap: "anywhere" }}>{p.pseudonym}</h1>
          <span className="muted" style={{ fontSize: 13 }}>公開收藏 {p.booklets.length} 份</span>
        </div>
      </div>

      {p.isSelf ? (
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          這是別人看到的你的個人頁{p.isPublic ? "" : "（你目前沒有公開，所以別人其實看不到這一頁）"}。隱藏的節目單、演出開始未滿 4 小時的節目單不會出現。
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7 }}>
          你們一起收藏了 <strong>{p.common}</strong> 齣戲
          {p.sameNights > 0 ? <>，其中 <strong>{p.sameNights}</strong> 次是同一晚</> : null}
          ・足跡相似 <strong>{Math.round(p.similarity * 100)}%</strong>
        </p>
      )}

      <section aria-label="公開的節目單" className="pbook-list">
        {p.booklets.length === 0 ? (
          <p className="empty">還沒有公開的節目單。</p>
        ) : (
          p.booklets.map((b) => {
            const inner = (
              <>
              <span className="pbook-cover" style={cardBackground(b.coverColor, b.coverImage)} aria-hidden="true" />
              <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="pbook-title">
                  {b.title}
                  {b.sameNight ? <span className="mark mark-night">同一晚</span> : b.alsoSeen ? <span className="mark mark-seen">你也看過</span> : null}
                </span>
                <span className="pbook-meta">{b.companyName}{b.genre ? `・${b.genre}` : ""}・{b.month}</span>
              </div>
              </>
            );
            // 你也收藏了的，點進去打開你自己那一份；沒收藏的不能點（節目單內頁只給領取者）
            return b.myClaimId ? (
              <Link key={b.productionId} href={`/booklet/${b.myClaimId}`} className="pbook pbook-link" aria-label={`打開你收藏的《${b.title}》`}>
                {inner}
                <span className="pbook-go" aria-hidden="true">›</span>
              </Link>
            ) : (
              <div key={b.productionId} className="pbook">{inner}</div>
            );
          })
        )}
      </section>

      <p className="small muted center" style={{ margin: "8px 0 0", lineHeight: 1.7 }}>
        化名與頭像由吾冊產生，不代表任何真實身分。只列出本人公開的節目單，日期只到年月。{p.isSelf ? "" : "你也收藏了的節目單，點一下就會打開你自己那一份。"}
      </p>
    </main>
  );
}
