import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { currentOrgAccount } from "@/lib/org-session";
import { isOrgMember } from "@/lib/org-accounts";
import { getFileStore } from "@/lib/storage";
import { clearCoverImage, CoverError, designOrganizer, MAX_COVER_BYTES, setCoverImage } from "@/lib/covers";

/** 營運方，或這檔節目所屬劇團的工作帳號，才能改卡面圖片 */
async function allowed(designId: string): Promise<boolean> {
  const db = getDb();
  const org = await designOrganizer(db, designId);
  if (!org) return false;
  if (await isAdmin()) return true;
  const account = await currentOrgAccount();
  return Boolean(account && (await isOrgMember(db, org, account.id)));
}

/** 上傳卡面圖片：內容是圖片本身（瀏覽器已縮圖） */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await allowed(id))) return NextResponse.json({ error: "沒有權限" }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_COVER_BYTES) return NextResponse.json({ error: "圖片太大" }, { status: 413 });
  const bytes = new Uint8Array(await req.arrayBuffer());
  try {
    const url = await setCoverImage(getDb(), getFileStore(), id, bytes, (req.headers.get("content-type") ?? "").split(";")[0].trim());
    return NextResponse.json({ url });
  } catch (err) {
    if (err instanceof CoverError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

/** 移除卡面圖片，回到單色 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await allowed(id))) return NextResponse.json({ error: "沒有權限" }, { status: 403 });
  await clearCoverImage(getDb(), id);
  return NextResponse.json({ ok: true });
}
