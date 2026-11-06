"use client";

import { useEffect } from "react";
import { getLiff, hasLiffParams, LIFF_ID } from "@/lib/liff-client";

/**
 * 放在每一頁。LINE 登入完成後會先回到 LIFF 的端點網址（首頁），並在網址帶上參數；
 * 依 LINE 規定，這一頁要執行 liff.init()，LINE 才會把人轉回原本的頁面（例如領取頁）。
 * 沒有這些參數時什麼都不做，不影響一般瀏覽。
 */
export function LiffBootstrap() {
  useEffect(() => {
    if (!LIFF_ID || !hasLiffParams(window.location.search)) return;
    const hadTarget = new URLSearchParams(window.location.search).has("liff.state");
    getLiff()
      .then((liff) => {
        // 有 liff.state 時，liff.init 會自己轉到原本的頁面；
        // 沒有目標頁、而且停在首頁時，帶觀眾去收藏冊完成登入
        if (!hadTarget && liff.isLoggedIn() && window.location.pathname === "/") {
          window.location.replace("/me");
        }
      })
      .catch(() => {
        /* 初始化失敗時由各頁的登入按鈕顯示錯誤 */
      });
  }, []);
  return null;
}
