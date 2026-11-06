"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { LoginButtons } from "@/components/LoginButtons";

export function LoginGate() {
  const router = useRouter();
  const onLoggedIn = useCallback(() => router.refresh(), [router]);
  return (
    <LoginButtons
      onLoggedIn={onLoggedIn}
      lineLabel="用 LINE 帳號登入"
      googleHint="之前用 Google 帳號領取的話，請用 Google 登入"
      autoLine
    />
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="small muted"
      style={{ background: "none", border: 0, cursor: "pointer", font: "inherit", fontSize: 12, minHeight: 44, textDecoration: "underline" }}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.refresh();
      }}
    >
      登出
    </button>
  );
}
