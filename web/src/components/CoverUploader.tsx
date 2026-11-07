"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ProgramCard } from "./ProgramCard";

const MAX_SIDE = 1200;

/** 在瀏覽器把圖片縮成長邊 1200px 以內，優先存成 WebP */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, q));
  const webp = await toBlob("image/webp", 0.85);
  if (webp && webp.type === "image/webp") return webp;
  const jpg = await toBlob("image/jpeg", 0.85);
  if (!jpg) throw new Error("無法處理這張圖片");
  return jpg;
}

/** 卡面圖片：預覽＋上傳＋移除。主辦方後台與營運後台共用。 */
export function CoverUploader({
  designId,
  title,
  companyName,
  startsAt,
  color,
  image,
  genre,
}: {
  designId: string;
  title: string;
  companyName: string;
  startsAt: string;
  color: string;
  image: string | null;
  genre: string | null;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await shrink(file);
      const res = await fetch(`/api/designs/${designId}/cover`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "上傳失敗，請再試一次");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    await fetch(`/api/designs/${designId}/cover`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="cover-up">
      <ProgramCard size="sm" title={title} companyName={companyName} startsAt={startsAt} color={color} image={image} kicker={genre ?? "PROGRAM"} stubRight={<span>No. 0001</span>} />
      <div className="stack" style={{ gap: 8, minWidth: 0 }}>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="link-btn" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "處理中…" : image ? "換一張圖片" : "上傳卡面圖片"}
          </button>
          {image && (
            <button type="button" className="link-btn" disabled={busy} onClick={remove}>
              移除圖片
            </button>
          )}
        </div>
        <span className="small muted" style={{ lineHeight: 1.6 }}>
          直式圖片效果最好（例如 3:4）。卡面會公開在首頁與收藏冊，請用主視覺或劇照，不要用節目單內頁。
        </span>
        {error && <span className="error small" role="alert">{error}</span>}
      </div>
    </div>
  );
}
