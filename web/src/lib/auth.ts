import { OAuth2Client } from "google-auth-library";
import type { LoginIdentity } from "./users";

/**
 * 驗證 LINE 的 ID token（由 LIFF 的 liff.getIDToken() 取得）。
 * 交給 LINE 伺服器驗證簽章、有效期限與 channel ID。
 */
export async function verifyLineIdToken(idToken: string): Promise<LoginIdentity> {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) throw new Error("缺少環境變數 LINE_LOGIN_CHANNEL_ID");

  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!res.ok) throw new Error(`LINE 身分驗證失敗（${res.status}）`);
  // 只取帳號編號；LINE 的名稱與大頭貼不保存（吾冊裡用系統化名）
  const data = (await res.json()) as { sub: string; email?: string };
  return { provider: "line", subject: data.sub, email: data.email };
}

let googleClient: OAuth2Client | undefined;

/** 驗證 Google 的 ID token（由 Google 登入按鈕取得） */
export async function verifyGoogleIdToken(idToken: string): Promise<LoginIdentity> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("缺少環境變數 NEXT_PUBLIC_GOOGLE_CLIENT_ID");
  googleClient ??= new OAuth2Client(clientId);

  const ticket = await googleClient.verifyIdToken({ idToken, audience: clientId });
  const p = ticket.getPayload();
  if (!p?.sub) throw new Error("Google 身分驗證失敗");
  // 只取帳號編號與 Email（寄通知用）；Google 的名稱與大頭貼不保存
  return { provider: "google", subject: p.sub, email: p.email_verified ? p.email : undefined };
}
