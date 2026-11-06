"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 場次寫入合約失敗時重試 */
export function ConfigureButton({ showId }: { showId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button
        type="button"
        className="link-btn"
        style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/admin/shows/${showId}/configure`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (res.ok) router.refresh();
          else setError(data.error ?? "失敗");
          setBusy(false);
        }}
      >
        {busy ? "寫入中…" : "寫入合約"}
      </button>
      {error && <span className="status-none small">{error}</span>}
    </span>
  );
}
