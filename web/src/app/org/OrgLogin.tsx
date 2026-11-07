"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 主辦方工作帳號登入：輸入 Email → 收驗證碼 → 輸入驗證碼 */
export function OrgLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/org/login/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "發生錯誤，請稍後再試");
    setMessage(data.message);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/org/login/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "發生錯誤，請稍後再試");
    router.refresh();
  }

  return (
    <div className="panel">
      {step === "email" ? (
        <form onSubmit={requestCode} className="stack" style={{ gap: 12 }}>
          <label className="field">
            <span className="small">工作用 Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || !email}>{busy ? "寄送中…" : "寄驗證碼給我"}</button>
        </form>
      ) : (
        <form onSubmit={verify} className="stack" style={{ gap: 12 }}>
          {message && <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>{message}</p>}
          <label className="field">
            <span className="small">6 位數驗證碼</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              style={{ letterSpacing: 6, fontSize: 20 }}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>{busy ? "登入中…" : "登入"}</button>
          <button
            type="button"
            className="link-btn"
            style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer", alignSelf: "flex-start" }}
            onClick={() => { setStep("email"); setCode(""); setMessage(null); setError(null); }}
          >
            換一個 Email 或重寄
          </button>
        </form>
      )}
      {error && <p role="alert" className="small" style={{ margin: "12px 0 0", color: "var(--accent)" }}>{error}</p>}
    </div>
  );
}

export function OrgLogout() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="link-btn"
      style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }}
      onClick={async () => {
        await fetch("/api/org/logout", { method: "POST" });
        router.refresh();
      }}
    >
      登出
    </button>
  );
}
