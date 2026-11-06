import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { finalizeUpload, PageUploadError } from "@/lib/pages";

/** 確認發布：每一頁都到齊後，觀眾才會看到這個版本 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "找不到" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { uploadId?: string; total?: number; filename?: string; applyToProduction?: boolean };
  try {
    const result = await finalizeUpload(getDb(), {
      designId: id,
      uploadId: body.uploadId ?? "",
      total: Number(body.total),
      filename: body.filename ?? "節目單.pdf",
      applyToProduction: body.applyToProduction === true,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof PageUploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
