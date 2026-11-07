import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requestLoginCode } from "@/lib/org-accounts";
import { sendMail } from "@/lib/email";

/** 主辦方工作帳號：申請 Email 驗證碼。不論 Email 有沒有帳號，都回應同一句話。 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email : "";
  try {
    await requestLoginCode(getDb(), email, (to, code) =>
      sendMail(
        to,
        `吾冊主辦方後台登入驗證碼：${code}`,
        `<!doctype html><html><body style="margin:0;background:#F4EFE6;font-family:sans-serif;color:#1C1A17">
  <div style="max-width:440px;margin:0 auto;padding:24px">
    <p style="font-size:15px;line-height:1.7">你的吾冊主辦方後台登入驗證碼：</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:8px 0 16px">${code}</p>
    <p style="font-size:13px;color:#6B645A;line-height:1.7">10 分鐘內有效，只能使用一次。如果不是你本人申請，請忽略這封信。</p>
  </div></body></html>`,
        `驗證碼：${code}`
      )
    );
  } catch (err) {
    console.error("寄送驗證碼失敗：", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "目前無法寄出驗證碼，請稍後再試" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, message: "如果這個 Email 已加入主辦方後台，驗證碼已寄出（10 分鐘內有效）。" });
}
