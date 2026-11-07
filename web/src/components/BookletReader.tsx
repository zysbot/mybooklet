"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildSpreads, pageLabel, spreadOfPage, type ReadingDirection } from "@/lib/reader";

export interface ReaderPage {
  page_no: number;
  url: string;
  width: number;
  height: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const SWIPE_PX = 48;

type Zoom = { s: number; x: number; y: number };
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * 節目單閱讀器（2026-11-07 改版，修改清單第 21 項）
 * - 一般與全螢幕都左右翻頁：滑動、點畫面左右兩側、方向鍵、按鈕。
 * - 寬螢幕（電腦、橫放的平板）顯示跨頁，封面單獨一頁。
 * - 全螢幕可放大（兩指、雙擊、Ctrl＋滾輪、按鈕），放大後拖曳看細節；點畫面中間顯示或隱藏工具列。
 * - 直排節目單由右往左翻（reading_direction = 'rtl'）。
 * - 記住上次讀到哪一頁（只存在這台裝置的瀏覽器）。
 * - 全螢幕：支援的瀏覽器用真正的全螢幕；iPhone Safari 與 LINE 內開啟時，改為蓋滿整個畫面。
 */
export function BookletReader({
  pages,
  title,
  direction = "ltr",
  storageKey,
}: {
  pages: ReaderPage[];
  title: string;
  direction?: ReadingDirection;
  /** 記住讀到哪一頁用的鍵（每份節目單一個） */
  storageKey?: string;
}) {
  const total = pages.length;
  const rtl = direction === "rtl";
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [full, setFull] = useState(false);
  const [ui, setUi] = useState(true);
  const [wide, setWide] = useState(false);
  const [anchor, setAnchor] = useState(0); // 目前畫面的第一頁（換版面時保持在同一頁）
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const usedFullscreenApi = useRef(false);

  // 頁面本身是橫式時不做跨頁
  const portrait = useMemo(() => pages.every((p) => p.height >= p.width * 0.9), [pages]);
  const spreads = useMemo(() => buildSpreads(total, wide && portrait), [total, wide, portrait]);
  const index = spreadOfPage(spreads, anchor);
  const current = spreads[index];

  // ---- 版面：舞台夠寬又是橫向時用跨頁 ----
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setWide(width >= 700 && width > height * 1.15);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  // ---- 記住讀到哪一頁 ----
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = Number(localStorage.getItem(`mb_reader_${storageKey}`));
      if (Number.isInteger(saved) && saved > 0 && saved < total) setAnchor(saved);
    } catch {
      // 無法使用 localStorage 時從第一頁開始
    }
  }, [storageKey, total]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(`mb_reader_${storageKey}`, String(current?.[0] ?? 0));
    } catch {
      // 忽略
    }
  }, [storageKey, current]);

  const goTo = useCallback(
    (i: number) => {
      const target = clamp(i, 0, spreads.length - 1);
      setAnchor(spreads[target][0]);
      setZoom(NO_ZOOM);
    },
    [spreads]
  );
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  /** 往畫面左邊／右邊翻：由右往左翻的節目單，左邊是下一頁 */
  const goLeft = useCallback(() => (rtl ? next() : prev()), [rtl, next, prev]);
  const goRight = useCallback(() => (rtl ? prev() : next()), [rtl, next, prev]);

  const zoomBy = useCallback((f: number) => {
    setZoom((z) => {
      const s = clamp(z.s * f, MIN_ZOOM, MAX_ZOOM);
      return s === 1 ? NO_ZOOM : { s, x: (z.x * s) / z.s, y: (z.y * s) / z.s };
    });
  }, []);

  // ---- 全螢幕 ----
  const enterFull = () => {
    setFull(true);
    setUi(true);
    const el = rootRef.current as (HTMLElement & { webkitRequestFullscreen?: () => void }) | null;
    try {
      if (el?.requestFullscreen) {
        el.requestFullscreen().then(() => (usedFullscreenApi.current = true)).catch(() => {});
      } else if (el?.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        usedFullscreenApi.current = true;
      }
    } catch {
      // 不支援時用蓋滿畫面的方式
    }
  };
  const exitFull = useCallback(() => {
    setFull(false);
    setZoom(NO_ZOOM);
    if (usedFullscreenApi.current && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    usedFullscreenApi.current = false;
  }, []);

  useEffect(() => {
    const onChange = () => {
      if (usedFullscreenApi.current && !document.fullscreenElement) {
        usedFullscreenApi.current = false;
        setFull(false);
        setZoom(NO_ZOOM);
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    if (!full) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFull();
      else if (e.key === "ArrowLeft") goLeft();
      else if (e.key === "ArrowRight") goRight();
      else if (e.key === "+" || e.key === "=") zoomBy(1.5);
      else if (e.key === "-") zoomBy(1 / 1.5);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [full, exitFull, goLeft, goRight, zoomBy]);

  // ---- 手勢：滑動翻頁、點左右兩側翻頁、雙擊放大、兩指縮放、放大後拖曳 ----
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    axis: "x" | "y" | null;
    pinchDist: number;
    pinchScale: number;
  } | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (pointers.current.size === 2 && full) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { startX: 0, startY: 0, moved: true, axis: null, pinchDist: Math.hypot(a.x - b.x, a.y - b.y), pinchScale: zoom.s };
      setDx(0);
      setDragging(false);
      return;
    }
    gesture.current = { startX: e.clientX, startY: e.clientY, moved: false, axis: null, pinchDist: 0, pinchScale: zoom.s };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    const p = pointers.current.get(e.pointerId);
    if (!g || !p) return;
    const mx = e.clientX - p.x;
    const my = e.clientY - p.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && g.pinchDist > 0) {
      const [a, b] = [...pointers.current.values()];
      const s = clamp((g.pinchScale * Math.hypot(a.x - b.x, a.y - b.y)) / g.pinchDist, MIN_ZOOM, MAX_ZOOM);
      setZoom((z) => (s === 1 ? NO_ZOOM : { s, x: z.x, y: z.y }));
      return;
    }
    const tx = e.clientX - g.startX;
    const ty = e.clientY - g.startY;
    if (!g.moved && Math.hypot(tx, ty) > 6) g.moved = true;
    if (!g.moved) return;

    if (zoom.s > 1) {
      setZoom((z) => ({ ...z, x: z.x + mx, y: z.y + my }));
      return;
    }
    if (!g.axis) g.axis = Math.abs(tx) > Math.abs(ty) ? "x" : "y";
    if (g.axis === "x") {
      setDragging(true);
      setDx(tx);
    }
  };

  const handleTap = (clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const rel = (clientX - rect.left) / rect.width;
    const now = Date.now();
    const isDouble = now - lastTap.current < 280;
    lastTap.current = now;

    if (rel < 0.3 && zoom.s === 1) return goLeft();
    if (rel > 0.7 && zoom.s === 1) return goRight();
    if (!full) return;
    // 中間：單擊顯示／隱藏工具列，雙擊放大或還原
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (isDouble) {
      tapTimer.current = null;
      setZoom((z) => (z.s > 1 ? NO_ZOOM : { s: 2, x: 0, y: 0 }));
    } else {
      tapTimer.current = setTimeout(() => setUi((v) => !v), 280);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return; // 兩指縮放中，等最後一指離開
    gesture.current = null;
    setDragging(false);
    if (!g) return;
    if (g.axis === "x" && zoom.s === 1) {
      if (dx <= -SWIPE_PX) goRight();
      else if (dx >= SWIPE_PX) goLeft();
      setDx(0);
      return;
    }
    setDx(0);
    if (!g.moved && e.button === 0) handleTap(e.clientX);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!full || !e.ctrlKey) return;
    zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  };

  if (total === 0) return null;

  const offset = rtl ? index * 100 : -index * 100;
  const label = pageLabel(current, total);
  const atStart = index === 0;
  const atEnd = index === spreads.length - 1;
  const leftDisabled = rtl ? atEnd : atStart;
  const rightDisabled = rtl ? atStart : atEnd;

  const arrowLeft = (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
  );
  const arrowRight = (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
  );

  return (
    <section
      ref={rootRef}
      className={full ? "reader reader-is-full" : "reader"}
      aria-label={`《${title}》節目單，共 ${total} 頁`}
      role={full ? "dialog" : undefined}
      aria-modal={full ? true : undefined}
    >
      {full && ui && (
        <div className="reader-top">
          <span className="reader-top-title">《{title}》</span>
          <span className="reader-count" aria-live="polite">{label}</span>
          <span className="reader-top-actions">
            <button type="button" className="reader-icon" onClick={() => zoomBy(1 / 1.5)} disabled={zoom.s <= 1} aria-label="縮小">−</button>
            <button type="button" className="reader-icon" onClick={() => zoomBy(1.5)} disabled={zoom.s >= MAX_ZOOM} aria-label="放大">＋</button>
            <button type="button" className="reader-close" onClick={exitFull} autoFocus>關閉</button>
          </span>
        </div>
      )}

      <div
        ref={stageRef}
        className="reader-stage"
        tabIndex={full ? -1 : 0}
        aria-roledescription="翻頁"
        style={{ touchAction: full ? "none" : "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onKeyDown={(e) => {
          if (full) return;
          if (e.key === "ArrowLeft") goLeft();
          if (e.key === "ArrowRight") goRight();
        }}
      >
        <div
          className="reader-track"
          style={{
            flexDirection: rtl ? "row-reverse" : "row",
            transform: `translateX(calc(${offset}% + ${dx}px))`,
            transition: dragging ? "none" : "transform 260ms ease",
          }}
        >
          {spreads.map((s, si) => {
            const near = Math.abs(si - index) <= 1;
            const isCurrent = si === index;
            return (
              <div
                className="reader-slide"
                key={s.join("-")}
                aria-hidden={!isCurrent}
                style={{ flexDirection: rtl ? "row-reverse" : "row" }}
              >
                <div
                  className="reader-spread"
                  style={
                    isCurrent && zoom.s > 1
                      ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`, transition: dragging || pointers.current.size ? "none" : "transform 160ms ease" }
                      : undefined
                  }
                >
                  {s.map((pi) => {
                    const p = pages[pi];
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={p.page_no}
                        className="reader-page"
                        style={{ maxWidth: `${100 / s.length}%` }}
                        src={p.url}
                        alt={`《${title}》節目單第 ${p.page_no} 頁`}
                        width={p.width}
                        height={p.height}
                        loading={near ? "eager" : "lazy"}
                        decoding="async"
                        draggable={false}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(!full || ui) && (
        <div className="reader-bar">
          <button type="button" className="reader-btn" onClick={goLeft} disabled={leftDisabled} aria-label={rtl ? "下一頁" : "上一頁"}>
            {arrowLeft}
          </button>
          {!full && <span className="reader-count" aria-live="polite">{label}</span>}
          <button type="button" className="reader-btn" onClick={goRight} disabled={rightDisabled} aria-label={rtl ? "上一頁" : "下一頁"}>
            {arrowRight}
          </button>
          {!full && (
            <button type="button" className="reader-full" onClick={enterFull}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
              全螢幕
            </button>
          )}
          {full && <span className="reader-hint">雙擊或兩指放大・點中間隱藏工具列</span>}
        </div>
      )}
    </section>
  );
}
