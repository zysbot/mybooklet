import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { setSocialPublic } from "@/lib/social";

/** 打開或關閉「公開我的收藏」；關閉後立即從所有頭像列與個人頁消失 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.public !== "boolean") return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  const ok = await setSocialPublic(getDb(), userId, body.public);
  if (!ok) return NextResponse.json({ error: "13–17 歲的觀眾不能公開收藏" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
