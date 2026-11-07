import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { confirmAdult } from "@/lib/consent";

/** 13–17 歲的觀眾滿 18 歲後，改成 18 歲以上 */
export async function POST() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  await confirmAdult(getDb(), userId);
  return NextResponse.json({ ok: true });
}
