"use client";

type Liff = typeof import("@line/liff").default;

export const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

let ready: Promise<Liff> | null = null;

/**
 * 取得已初始化的 LIFF。整個頁面只初始化一次：
 * LINE 登入後帶回來的授權碼只能用一次，重複初始化會讓登入失敗。
 */
export function getLiff(): Promise<Liff> {
  if (!LIFF_ID) return Promise.reject(new Error("尚未設定 NEXT_PUBLIC_LIFF_ID"));
  if (!ready) {
    ready = import("@line/liff").then(async ({ default: liff }) => {
      await liff.init({ liffId: LIFF_ID });
      return liff;
    });
    ready.catch(() => {
      ready = null; // 初始化失敗時允許重試
    });
  }
  return ready;
}

/** 網址裡帶有 LINE 登入回來的參數（liff.state、授權碼等） */
export function hasLiffParams(search: string): boolean {
  const q = new URLSearchParams(search);
  return q.has("liff.state") || q.has("liffClientId") || q.has("liffRedirectUri") || (q.has("code") && q.has("state"));
}
