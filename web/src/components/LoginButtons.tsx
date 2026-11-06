"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Liff = typeof import("@line/liff").default;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(opts: { client_id: string; callback: (r: { credential: string }) => void }): void;
          renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
        };
      };
    };
  }
}

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface Props {
  /** 登入成功（伺服器已設好 session）後呼叫 */
  onLoggedIn: () => void;
  /** LINE 按鈕文字 */
  lineLabel: string;
  /** Google 按鈕前的說明 */
  googleHint: string;
  /** 在 LINE 裡打開、或從 LINE 登入頁回來時，自動完成登入 */
  autoLine?: boolean;
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "發生錯誤，請再試一次");
  return data;
}

/** 在 LINE 裡打開時可以「回到 LINE」 */
export async function closeLiffWindow(): Promise<boolean> {
  if (!LIFF_ID) return false;
  const liff = (await import("@line/liff")).default;
  if (liff.isInClient()) {
    liff.closeWindow();
    return true;
  }
  return false;
}

export function LoginButtons({ onLoggedIn, lineLabel, googleHint, autoLine }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liffRef = useRef<Liff | null>(null);
  const googleSlot = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const finishLine = useCallback(
    async (liff: Liff) => {
      const idToken = liff.getIDToken();
      if (!idToken) throw new Error("無法取得 LINE 登入資訊，請重新登入");
      await post("/api/auth/line", { idToken });
      onLoggedIn();
    },
    [onLoggedIn]
  );

  // LINE：初始化 LIFF；已登入（在 LINE 裡打開，或剛從 LINE 登入頁回來）就自動繼續
  useEffect(() => {
    if (!LIFF_ID || started.current) return;
    started.current = true;
    (async () => {
      const liff = (await import("@line/liff")).default;
      await liff.init({ liffId: LIFF_ID });
      liffRef.current = liff;
      if (autoLine && liff.isLoggedIn()) {
        setBusy(true);
        try {
          await finishLine(liff);
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }
    })().catch(() => setError("LINE 初始化失敗，請重新整理頁面"));
  }, [autoLine, finishLine]);

  // Google：載入官方登入按鈕
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleSlot.current) return;
    const render = () => {
      if (!window.google || !googleSlot.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          setBusy(true);
          setError(null);
          try {
            await post("/api/auth/google", { credential });
            onLoggedIn();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        },
      });
      window.google.accounts.id.renderButton(googleSlot.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        locale: "zh-TW",
        width: 300,
      });
    };
    if (window.google) return render();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, [onLoggedIn]);

  const loginWithLine = async () => {
    setError(null);
    const liff = liffRef.current;
    if (!liff) {
      setError("LINE 尚未準備好，請稍候再試");
      return;
    }
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }
    setBusy(true);
    try {
      await finishLine(liff);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      {LIFF_ID && (
        <button type="button" className="btn btn-primary" onClick={loginWithLine} disabled={busy}>
          {busy ? "處理中…" : lineLabel}
        </button>
      )}
      {GOOGLE_CLIENT_ID && (
        <>
          <p className="small muted center" style={{ margin: "4px 0 0" }}>{googleHint}</p>
          <div ref={googleSlot} className="google-slot" />
        </>
      )}
      {!LIFF_ID && !GOOGLE_CLIENT_ID && (
        <p className="error">尚未設定登入方式（NEXT_PUBLIC_LIFF_ID 或 NEXT_PUBLIC_GOOGLE_CLIENT_ID）。</p>
      )}
    </div>
  );
}
