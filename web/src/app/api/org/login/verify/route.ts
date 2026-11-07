import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyLoginCode } from "@/lib/org-accounts";
import { setOrgSession } from "@/lib/org-session";

/** 主辦方工作帳號：輸入驗證碼登入 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  const code = typeof body.code === "string" ? body.code : "";
  const account = await verifyLoginCode(getDb(), email, code);
  if (!account) return NextResponse.json({ error: "驗證碼錯誤或已過期，請重新申請" }, { status: 400 });
  await setOrgSession(account.accountId);
  return NextResponse.json({ ok: true });
}
