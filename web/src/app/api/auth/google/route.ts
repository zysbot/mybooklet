import { NextResponse } from "next/server";
import { verifyGoogleIdToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findOrCreateUser } from "@/lib/users";
import { getWalletXpub } from "@/lib/wallet";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  const { credential } = (await req.json().catch(() => ({}))) as { credential?: string };
  if (!credential) return NextResponse.json({ error: "缺少 credential" }, { status: 400 });

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential);
  } catch {
    return NextResponse.json({ error: "Google 身分驗證失敗，請重新登入" }, { status: 401 });
  }
  const user = await findOrCreateUser(getDb(), identity, getWalletXpub());
  await setSession(user.id);
  return NextResponse.json({ ok: true, displayName: user.display_name });
}
