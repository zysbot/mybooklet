import type { User } from "./users";
import type { ShowInfo } from "./booklets";
import { escapeXml, formatDate, formatSerial, siteUrl } from "./format";

/**
 * 領取成功後通知觀眾：LINE 登入者推播到 LINE；Google 登入者寄 Email。
 * 通知失敗不影響領取（例如觀眾沒有加官方帳號好友，LINE 會拒絕推播）。
 */
export async function notifyClaimed(user: User, show: ShowInfo, claim: { claimId: string; serial: number }) {
  const link = `${siteUrl()}/booklet/${claim.claimId}`;
  try {
    if (user.line_user_id) {
      await pushLine(user.line_user_id, show, claim.serial, link);
    } else if (user.email && user.notify_email) {
      await sendEmail(user.email, show, claim.serial, link);
    }
  } catch (err) {
    console.warn("通知失敗（不影響領取）：", err instanceof Error ? err.message : err);
  }
}

async function pushLine(lineUserId: string, show: ShowInfo, serial: number, link: string) {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN;
  if (!token) return;

  const flex = {
    type: "bubble",
    hero: {
      type: "box",
      layout: "vertical",
      backgroundColor: show.coverColor,
      paddingAll: "16px",
      height: "120px",
      justifyContent: "space-between",
      contents: [
        { type: "text", text: `PROGRAM・No. ${formatSerial(serial)}`, size: "xxs", color: "#F4EFE6" },
        { type: "text", text: show.title, size: "xl", weight: "bold", color: "#F4EFE6" },
        { type: "text", text: show.companyName, size: "xs", color: "#F4EFE6" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: [
        { type: "text", text: "節目單已存入你的收藏冊", weight: "bold", size: "md" },
        { type: "text", text: `${formatDate(show.startsAt)}・${show.venue}`, size: "xs", color: "#6B645A", wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        { type: "button", style: "primary", color: "#B8432F", action: { type: "uri", label: "打開節目單", uri: link } },
        { type: "button", style: "link", action: { type: "uri", label: "查看我的收藏冊", uri: `${siteUrl()}/me` } },
      ],
    },
  };

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "flex", altText: `《${show.title}》節目單已存入你的收藏冊`, contents: flex }],
    }),
  });
  if (!res.ok) throw new Error(`LINE 推播失敗（${res.status}）：${await res.text()}`);
}

async function sendEmail(to: string, show: ShowInfo, serial: number, link: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return;

  const t = escapeXml(show.title);
  const html = `<!doctype html><html><body style="margin:0;background:#F4EFE6;font-family:sans-serif;color:#1C1A17">
  <div style="max-width:480px;margin:0 auto;padding:24px">
    <div style="background:${show.coverColor};color:#F4EFE6;border-radius:16px 16px 0 0;padding:20px">
      <div style="font-size:11px;letter-spacing:3px">PROGRAM・No. ${formatSerial(serial)}</div>
      <div style="font-size:26px;font-weight:700;margin-top:28px">${t}</div>
      <div style="font-size:12px">${escapeXml(show.companyName)}・${formatDate(show.startsAt)}</div>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:20px">
      <p style="font-size:15px;line-height:1.75;margin:0 0 20px">感謝你入場。你是第 ${serial} 位領取這份節目單的觀眾，節目單已經收進你的收藏冊，散場後隨時可以重讀。</p>
      <a href="${link}" style="display:block;text-align:center;background:#B8432F;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:12px">打開節目單</a>
      <p style="text-align:center;margin:16px 0 0"><a href="${siteUrl()}/me" style="color:#1C1A17">查看我的收藏冊</a></p>
    </div>
    <p style="font-size:12px;color:#6B645A;line-height:1.6">你收到這封信，是因為你在 ${escapeXml(show.venue)} 用 Google 帳號領取了節目單。</p>
  </div></body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject: `你的《${show.title}》節目單已收進吾冊`, html }),
  });
  if (!res.ok) throw new Error(`寄信失敗（${res.status}）：${await res.text()}`);
}
