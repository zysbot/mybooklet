import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getBooklet } from "@/lib/booklets";
import { formatDateTime, formatSerial, formatShowTime } from "@/lib/format";
import { explorerName, explorerTxUrl, networkLabel } from "@/lib/network";
import { ProgramCard } from "@/components/ProgramCard";
import { BookletReader } from "@/components/BookletReader";
import { getDesignPages } from "@/lib/pages";
import { getFavorites } from "@/lib/favorites";
import { FavoritePicker } from "@/components/FavoritePicker";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const userId = await currentUserId();
  const b = userId ? await getBooklet(getDb(), id, userId) : null;
  return { title: b ? `${b.title}｜吾冊` : "節目單｜吾冊" };
}

function shortAddress(a: string | null) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

export default async function BookletPage({ params }: Params) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) redirect("/me");
  const db = getDb();
  const b = await getBooklet(db, id, userId);
  if (!b) notFound();
  const [pages, favorites] = await Promise.all([
    b.pageCount > 0 ? getDesignPages(db, b.designId) : Promise.resolve([]),
    getFavorites(db, userId),
  ]);

  const { content } = b;
  const minted = b.chainStatus === "minted";
  const txUrl = minted && b.txHash ? explorerTxUrl(b.txHash) : null;

  return (
    <main className="page" style={{ gap: 32 }}>
      <Link href="/me" className="back">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        我的收藏冊
      </Link>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <ProgramCard
          size="xl"
          title={b.title}
          companyName={b.companyName}
          startsAt={b.startsAt}
          color={b.coverColor}
          stubRight={<span style={{ fontFamily: "var(--serif)", fontSize: 13 }}>No. {formatSerial(b.serial)}</span>}
        />
      </div>

      <div className="stack" style={{ gap: 14 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1 className="title" style={{ fontSize: 30 }}>{b.title}</h1>
          <span className="muted" style={{ fontSize: 14 }}>{b.companyName} 出品</span>
        </div>
        <div className="rows">
          <div className="row"><span className="row-label">日期</span><span>{formatShowTime(b.startsAt)}</span></div>
          <div className="row"><span className="row-label">場地</span><span>{b.venue}</span></div>
          {content.duration && <div className="row"><span className="row-label">長度</span><span>{content.duration}</span></div>}
        </div>
      </div>

      <FavoritePicker claimId={b.claimId} title={b.title} initial={favorites} />

      <hr className="rule" />

      {pages.length > 0 ? (
        <section className="section">
          <h2>節目單</h2>
          <BookletReader pages={pages} title={b.title} />
        </section>
      ) : (
        <>
        {content.intro && (
          <section className="section">
            <h2>節目介紹</h2>
            <p>{content.intro}</p>
          </section>
        )}
        {content.directorNote && (
          <section className="section">
            <h2>導演的話</h2>
            <p>{content.directorNote}</p>
          </section>
        )}
        {content.credits && content.credits.length > 0 && (
          <section className="section">
            <h2>演出與製作團隊</h2>
            <div className="rows" style={{ gap: 10 }}>
              {content.credits.map((c, i) => (
                <div className="row" key={i}><span className="row-label">{c.role}</span><span>{c.names}</span></div>
              ))}
            </div>
          </section>
        )}

        </>
      )}

      <section className="cert" aria-labelledby="cert-title">
        <div className="cert-head">
          <h2 id="cert-title">收藏憑證</h2>
          {minted ? (
            <span className="chip chip-good">
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
              已上鏈
            </span>
          ) : (
            <span className="chip chip-wait"><span className="dot pulse" aria-hidden="true" />寫入中</span>
          )}
        </div>
        <div className="cert-rows">
          <div className="cert-row"><span className="muted">收藏編號</span><span>No. {formatSerial(b.serial)}</span></div>
          <div className="cert-row"><span className="muted">領取時間</span><span>{formatDateTime(b.claimedAt)}</span></div>
          {b.holderName && <div className="cert-row"><span className="muted">持有者</span><span>{b.holderName}</span></div>}
          <div className="cert-row"><span className="muted">區塊鏈</span><span>{networkLabel()}</span></div>
          {b.tokenId && <div className="cert-row"><span className="muted">Token ID</span><span>{b.tokenId}</span></div>}
          {b.walletAddress && <div className="cert-row"><span className="muted">錢包地址</span><span className="mono">{shortAddress(b.walletAddress)}</span></div>}
        </div>
        {txUrl && (
          <a href={txUrl} target="_blank" rel="noreferrer" className="btn btn-dark" style={{ minHeight: 44, fontSize: 14, fontWeight: 500 }}>
            在 {explorerName()} 查看鏈上紀錄
          </a>
        )}
        <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {minted
            ? "這份節目單的收藏紀錄已寫入公開區塊鏈，即使不透過本服務也能查證。鏈上只記日期，不記領取時刻。"
            : "收藏紀錄會在領取後隔天寫入區塊鏈（每天批次寫入一次），不影響你閱讀節目單。"}
        </p>
      </section>
    </main>
  );
}
