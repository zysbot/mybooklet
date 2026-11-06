"use client";

export const MAX_PDF_PAGES = 60;
/** 每頁轉成的圖片寬度：手機放大看小字仍清楚，檔案又不至於太大 */
const TARGET_WIDTH = 1400;
const MAX_HEIGHT = 8000;

type PDFDoc = import("pdfjs-dist").PDFDocumentProxy;

export interface RenderedPage {
  blob: Blob;
  width: number;
  height: number;
}

async function renderPage(doc: PDFDoc, pageNo: number): Promise<RenderedPage> {
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

  const toBlob = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // 優先用 WebP；瀏覽器不支援就改用 JPEG
  let blob = await toBlob("image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.85);
  if (!blob) throw new Error(`第 ${pageNo} 頁轉檔失敗`);
  const result = { blob, width: canvas.width, height: canvas.height };
  canvas.width = canvas.height = 0; // 釋放記憶體
  return result;
}

async function uploadPage(designId: string, uploadId: string, pageNo: number, total: number, img: RenderedPage) {
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

/** 讀取 PDF，逐頁轉成圖片並上傳。回傳上傳批次與每頁預覽網址（用完請 revoke）。 */
export async function uploadPdfPages(
  file: File,
  designId: string,
  onProgress: (done: number, total: number) => void,
  opts: { previews?: boolean } = {}
): Promise<{ uploadId: string; total: number; previews: string[] }> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("請選擇 PDF 檔案");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const total = doc.numPages;
  if (total > MAX_PDF_PAGES) {
    await doc.destroy();
    throw new Error(`這份 PDF 有 ${total} 頁，超過上限 ${MAX_PDF_PAGES} 頁`);
  }
  const uploadId = crypto.randomUUID();
  const previews: string[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      onProgress(i - 1, total);
      const img = await renderPage(doc, i);
      await uploadPage(designId, uploadId, i, total, img);
      if (opts.previews !== false) previews.push(URL.createObjectURL(img.blob));
    }
    onProgress(total, total);
  } finally {
    await doc.destroy();
  }
  return { uploadId, total, previews };
}

/** 確認發布 */
export async function finalizePdfUpload(
  designId: string,
  p: { uploadId: string; total: number; filename: string; applyToProduction: boolean }
): Promise<{ designIds: string[] }> {
  const res = await fetch(`/api/admin/designs/${designId}/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "發布失敗");
  return data;
}
