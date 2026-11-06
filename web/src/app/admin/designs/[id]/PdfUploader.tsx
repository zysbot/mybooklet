"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_PAGES = 60;
/** 每頁轉成的圖片寬度：手機放大看小字仍清楚，檔案又不至於太大 */
const TARGET_WIDTH = 1400;
const MAX_HEIGHT = 8000;

type Stage =
  | { kind: "idle" }
  | { kind: "working"; done: number; total: number; step: string }
  | { kind: "review"; uploadId: string; total: number; filename: string; previews: string[] }
  | { kind: "publishing" }
  | { kind: "published"; total: number; versions: number };

async function renderPage(
  doc: import("pdfjs-dist").PDFDocumentProxy,
  pageNo: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(TARGET_WIDTH / base.width, MAX_HEIGHT / base.height);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();

  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // 優先用 WebP；瀏覽器不支援就改用 JPEG
  let blob = await toBlob("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);
  if (!blob) throw new Error(`第 ${pageNo} 頁轉檔失敗`);
  const result = { blob, width: canvas.width, height: canvas.height };
  canvas.width = canvas.height = 0; // 釋放記憶體
  return result;
}

async function uploadPage(designId: string, uploadId: string, pageNo: number, total: number, img: { blob: Blob; width: number; height: number }) {
  const qs = new URLSearchParams({ uploadId, page: String(pageNo), total: String(total), width: String(img.width), height: String(img.height) });
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`/api/admin/designs/${designId}/pages?${qs}`, {
        method: "POST",
        headers: { "Content-Type": img.blob.type },
        body: img.blob,
      });
      if (res.ok) return;
      lastError = (await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`;
      if (res.status < 500) break; // 內容有問題，重送也沒用
    } catch (e) {
      lastError = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`第 ${pageNo} 頁上傳失敗：${lastError}`);
}

export function PdfUploader({ designId, siblingLabels }: { designId: string; siblingLabels: string[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [applyAll, setApplyAll] = useState(siblingLabels.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("請選擇 PDF 檔案");
      return;
    }
    try {
      setStage({ kind: "working", done: 0, total: 0, step: "讀取 PDF…" });
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const total = doc.numPages;
      if (total > MAX_PAGES) throw new Error(`這份 PDF 有 ${total} 頁，超過上限 ${MAX_PAGES} 頁`);

      const uploadId = crypto.randomUUID();
      const previews: string[] = [];
      for (let i = 1; i <= total; i++) {
        setStage({ kind: "working", done: i - 1, total, step: `轉檔並上傳第 ${i} 頁` });
        const img = await renderPage(doc, i);
        await uploadPage(designId, uploadId, i, total, img);
        previews.push(URL.createObjectURL(img.blob));
      }
      await doc.destroy();
      setStage({ kind: "review", uploadId, total, filename: file.name, previews });
    } catch (e) {
      setError((e as Error).message || "處理 PDF 時發生錯誤");
      setStage({ kind: "idle" });
    }
  }

  async function publish() {
    if (stage.kind !== "review") return;
    const { uploadId, total, filename, previews } = stage;
    setStage({ kind: "publishing" });
    const res = await fetch(`/api/admin/designs/${designId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, total, filename, applyToProduction: applyAll }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "發布失敗");
      setStage({ kind: "review", uploadId, total, filename, previews });
      return;
    }
    const result = (await res.json()) as { designIds: string[] };
    previews.forEach((u) => URL.revokeObjectURL(u));
    setStage({ kind: "published", total, versions: result.designIds.length });
    router.refresh();
  }

  function cancel() {
    if (stage.kind === "review") stage.previews.forEach((u) => URL.revokeObjectURL(u));
    setStage({ kind: "idle" });
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      {error && <p className="error" role="alert">{error}</p>}

      {(stage.kind === "idle" || stage.kind === "published") && (
        <>
          {stage.kind === "published" && (
            <p className="chip chip-good" style={{ alignSelf: "flex-start", margin: 0 }} role="status">
              已發布 {stage.total} 頁{stage.versions > 1 ? `，套用到 ${stage.versions} 個卡面版本` : ""}，觀眾現在看到的就是這個版本
            </p>
          )}
          <label
            className="dropzone"
            data-over={over}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <svg aria-hidden="true" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            <strong>把 PDF 拖到這裡，或點一下選擇檔案</strong>
            <span className="small muted">劇團提供的節目單 PDF，最多 {MAX_PAGES} 頁</span>
          </label>
        </>
      )}

      {stage.kind === "working" && (
        <div className="stack" role="status" aria-live="polite">
          <span>{stage.step}{stage.total ? `（${stage.done} / ${stage.total}）` : ""}</span>
          <div className="progress" aria-hidden="true">
            <span style={{ width: stage.total ? `${(stage.done / stage.total) * 100}%` : "4%" }} />
          </div>
          <span className="small muted">轉檔期間請不要關閉這個頁面</span>
        </div>
      )}

      {stage.kind === "review" && (
        <div className="stack" style={{ gap: 16 }}>
          <p style={{ margin: 0 }}>
            <strong>{stage.filename}</strong>・共 {stage.total} 頁已上傳。請檢查每一頁都正確，再按確認發布。
          </p>
          <div className="thumbs">
            {stage.previews.map((src, i) => (
              <div className="thumb" key={src}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`預覽第 ${i + 1} 頁`} />
                <span>{i + 1}</span>
              </div>
            ))}
          </div>
          {siblingLabels.length > 0 && (
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} style={{ width: 18, height: 18, margin: "2px 0 0", accentColor: "#1C1A17" }} />
              <span>
                同一檔節目的其他卡面版本（{siblingLabels.join("、")}）也使用這份節目單
                <br />
                <span className="small muted">各場次節目單相同、只有卡面不同時勾選；若某個場次有專屬節目單，取消勾選後另外上傳。</span>
              </span>
            </label>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-primary" onClick={publish}>確認發布</button>
            <button type="button" className="btn btn-quiet" onClick={cancel}>取消，重新選擇</button>
          </div>
        </div>
      )}

      {stage.kind === "publishing" && <p role="status">發布中…</p>}
    </div>
  );
}
