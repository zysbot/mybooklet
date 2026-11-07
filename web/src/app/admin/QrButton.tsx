"use client";

import { useRef } from "react";

/** 營運後台：點一下直接看到場次的領取 QR code，可下載或開新分頁列印 */
export function QrButton({ showId, label = "QR", caption }: { showId: string; label?: string; caption?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const src = `/api/admin/shows/${showId}/qr`;
  return (
    <>
      <button
        type="button"
        className="link-btn"
        style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }}
        onClick={() => ref.current?.showModal()}
      >
        {label}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close(); // 點背景關閉
        }}
        style={{ border: "none", borderRadius: 16, padding: 20, maxWidth: "min(92vw, 420px)", width: "100%" }}
      >
        <div className="stack" style={{ gap: 12, alignItems: "center" }}>
          {caption && <p className="small muted center" style={{ margin: 0 }}>{caption}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="領取 QR code" loading="lazy" style={{ width: "100%", height: "auto", imageRendering: "pixelated" }} />
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
            <a className="link-btn" href={`${src}?download=1`}>下載 PNG</a>
            <a className="link-btn" href={src} target="_blank" rel="noreferrer">開新分頁（列印用）</a>
            <button
              type="button"
              className="link-btn"
              style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }}
              onClick={() => ref.current?.close()}
            >
              關閉
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
