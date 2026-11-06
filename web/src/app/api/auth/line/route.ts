import { NextResponse } from "next/server";
import { verifyLineIdToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findOrCreateUser } from "@/lib/users";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  const { idToken } = (await req.json().catch(() => ({}))) as { idToken?: string };
  if (!idToken) return NextResponse.json({ error: "缺少 idToken" }, { status: 400 });

  let identity;
  try {
    identity = await verifyLineIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "LINE 身分驗證失敗，請重新登入" }, { status: 401 });
  }
  const user = await findOrCreateUser(getDb(), identity);
  await setSession(user.id);
  return NextResponse.json({ ok: true, pseudonym: user.pseudonym });
}
