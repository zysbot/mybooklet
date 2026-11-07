import type { Attachment } from "@/lib/attachments";
import { linkHost } from "@/lib/attachments";

/**
 * 節目單下方「主辦方附上的資料」。預設展開，觀眾可以收起來。
 * 圖片直接顯示；PDF 與外部連結點了才開（外部連結先經過「即將離開吾冊」頁）。
 */
export function Attachments({ items, companyName, claimId }: { items: Attachment[]; companyName: string; claimId: string }) {
  if (!items.length) return null;
  return (
    <section className="section attach" aria-labelledby="attach-title">
      <details open>
        <summary>
          <h2 id="attach-title">{companyName}附上的資料</h2>
          <span className="small muted">
            {items.length} 則・<span className="when-open">收起</span><span className="when-closed">展開</span>
          </span>
        </summary>
        <div className="attach-list">
          {items.map((a) => {
            const go = a.linkUrl ? `/go/${a.id}?from=${claimId}` : null;
            const pdf = a.fileKind === "pdf" && a.fileUrl ? `/api/attachments/${a.id}/open?to=file` : null;
            return (
              <article key={a.id} className="attach-item">
                {a.fileKind === "image" && a.fileUrl && (
                  go ? (
                    <a href={go} className="attach-img" aria-label={`${a.title}（前往 ${linkHost(a.linkUrl!)}）`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.fileUrl} alt="" loading="lazy" />
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="attach-img" src={a.fileUrl} alt={a.title} loading="lazy" />
                  )
                )}
                <div className="attach-body">
                  <h3>{a.title}</h3>
                  {a.note && <p>{a.note}</p>}
                  <div className="attach-actions">
                    {pdf && (
                      <a href={pdf} target="_blank" rel="noreferrer" className="pill">開啟 PDF</a>
                    )}
                    {go && (
                      <a href={go} className="pill">前往 {linkHost(a.linkUrl!)}</a>
                    )}
                    {a.showUntil && <span className="small muted">顯示到 {a.showUntil.replaceAll("-", ".")}</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <p className="small muted" style={{ margin: 0 }}>這些資料由主辦方提供，不屬於你的收藏，下架後就看不到。吾冊不會告訴主辦方是誰點開的。</p>
      </details>
    </section>
  );
}
