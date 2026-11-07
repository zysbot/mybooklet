import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { setClaimHidden } from "@/lib/social";

/** 隱藏或取消隱藏自己的一份節目單 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (typeof body.hidden !== "boolean") return NextResponse.json({ error: "格式錯誤" }, { status: 400 });
  const ok = await setClaimHidden(getDb(), userId, id, body.hidden);
  if (!ok) return NextResponse.json({ error: "找不到" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
