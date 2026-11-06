import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { joinByInvite } from "@/lib/insights";

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  const org = token ? await joinByInvite(getDb(), token, userId) : null;
  if (!org) return NextResponse.json({ error: "邀請連結無效或已更換" }, { status: 404 });
  return NextResponse.json({ organizerId: org.id });
}
