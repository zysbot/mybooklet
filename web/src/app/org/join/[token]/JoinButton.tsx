"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function JoinButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack">
      {error && <p className="error" role="alert">{error}</p>}
      <button
        type="button"
        className="btn btn-dark"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/org/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) router.replace(`/org/${data.organizerId}`);
          else {
            setError(data.error ?? "加入失敗");
            setBusy(false);
          }
        }}
      >
        {busy ? "加入中…" : "加入後台"}
      </button>
    </div>
  );
}
