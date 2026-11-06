"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ReaderPage {
  page_no: number;
  url: string;
  width: number;
  height: number;
}

/**
 * 節目單閱讀器：左右滑動翻頁；「全螢幕」改為上下捲動，可用兩指放大看小字。
 */
export function BookletReader({ pages, title }: { pages: ReaderPage[]; title: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [full, setFull] = useState(false);
  const total = pages.length;

  // 依捲動位置算出目前頁碼
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setCurrent(Math.min(total - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
  }, [total]);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const target = Math.min(total - 1, Math.max(0, i));
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  return (
    <section className="reader" aria-label={`《${title}》節目單，共 ${total} 頁`}>
      <div
        ref={track}
        className="reader-track"
        onScroll={onScroll}
        tabIndex={0}
        aria-roledescription="翻頁"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") go(current + 1);
          if (e.key === "ArrowLeft") go(current - 1);
        }}
      >
        {pages.map((p, i) => (
          <div className="reader-slide" key={p.page_no} aria-label={`第 ${p.page_no} 頁`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={`《${title}》節目單第 ${p.page_no} 頁`}
              width={p.width}
              height={p.height}
              loading={i < 2 ? "eager" : "lazy"}
              decoding="async"
            />
          </div>
        ))}
      </div>

      <div className="reader-bar">
        <button type="button" className="reader-btn" onClick={() => go(current - 1)} disabled={current === 0} aria-label="上一頁">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span className="reader-count" aria-live="polite">{current + 1} / {total}</span>
        <button type="button" className="reader-btn" onClick={() => go(current + 1)} disabled={current === total - 1} aria-label="下一頁">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
        </button>
        <button type="button" className="reader-full" onClick={() => setFull(true)}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
          全螢幕
        </button>
      </div>

      {full && (
        <div className="reader-overlay" role="dialog" aria-modal="true" aria-label={`《${title}》節目單全螢幕閱讀`}>
          <div className="reader-overlay-bar">
            <span>《{title}》・{total} 頁・可兩指放大</span>
            <button type="button" className="reader-close" onClick={() => setFull(false)} autoFocus>
              關閉
            </button>
          </div>
          <div className="reader-overlay-pages">
            {pages.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.page_no} src={p.url} alt={`第 ${p.page_no} 頁`} width={p.width} height={p.height} loading="lazy" decoding="async" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
