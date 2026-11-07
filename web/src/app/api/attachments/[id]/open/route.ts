import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { countClick, getAttachmentForViewer } from "@/lib/attachments";

/**
 * 觀眾點開附加文宣：記一次點擊（只記總數），再轉到檔案或外部連結。
 * ?to=file 開啟主辦方上傳的 PDF 或圖片；?to=link 前往外部網址（觀眾已在 /go/[id] 看過要去哪個網站）。
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return NextResponse.redirect(new URL("/me", req.url));
  const db = getDb();
  const a = await getAttachmentForViewer(db, id, userId);
  if (!a) return new NextResponse("這則資料已經下架", { status: 404 });
  const to = new URL(req.url).searchParams.get("to");
  const target = to === "file" ? a.fileUrl : to === "link" ? a.linkUrl : null;
  if (!target) return new NextResponse("找不到", { status: 404 });
  await countClick(db, a.id);
  return NextResponse.redirect(new URL(target, req.url), 302);
}
