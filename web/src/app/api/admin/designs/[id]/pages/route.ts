import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getFileStore } from "@/lib/storage";
import { savePage, PageUploadError, MAX_PAGE_BYTES } from "@/lib/pages";

/**
 * 上傳一頁圖片（後台瀏覽器已把 PDF 的這一頁轉成 WebP 或 JPEG）。
 * 參數放在網址：?uploadId=&page=&total=&width=&height=，內容是圖片本身。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "找不到" }, { status: 404 });

  const q = new URL(req.url).searchParams;
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_PAGE_BYTES) return NextResponse.json({ error: "單頁圖片過大" }, { status: 413 });

  const bytes = new Uint8Array(await req.arrayBuffer());
  try {
    const page = await savePage(getDb(), getFileStore(), {
      designId: id,
      uploadId: q.get("uploadId") ?? "",
      pageNo: Number(q.get("page")),
      total: Number(q.get("total")),
      width: Number(q.get("width")),
      height: Number(q.get("height")),
      contentType: (req.headers.get("content-type") ?? "").split(";")[0].trim(),
      bytes,
    });
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof PageUploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
