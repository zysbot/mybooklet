/**
 * 寄信（Resend）。需要 RESEND_API_KEY 與 EMAIL_FROM。
 * 開發環境沒設定時，把內容印在終端機，方便本機測試；正式環境沒設定則丟出錯誤。
 */
export async function sendMail(to: string, subject: string, html: string, devText?: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[開發環境，未寄出] 給 ${to}：${subject}${devText ? `\n${devText}` : ""}`);
      return;
    }
    throw new Error("未設定 RESEND_API_KEY 或 EMAIL_FROM，無法寄信");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`寄信失敗（${res.status}）：${await res.text()}`);
}
