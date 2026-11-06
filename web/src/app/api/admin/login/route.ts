import { NextResponse } from "next/server";
import { checkAdminPassword, setAdminSession, clearAdminSession } from "@/lib/admin";

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !checkAdminPassword(password)) {
    // 放慢連續猜密碼的速度
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }
  await setAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminSession();
  return NextResponse.json({ ok: true });
}
