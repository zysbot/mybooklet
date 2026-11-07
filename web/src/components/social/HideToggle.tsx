"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 隱藏這一份：不出現在自己的個人頁，也不出現在別人的頭像列 */
export function HideToggle({ claimId, initial }: { claimId: string; initial: boolean }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={hidden}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.checked;
          setBusy(true);
          const res = await fetch(`/api/claims/${claimId}/hidden`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hidden: next }),
          });
          if (res.ok) setHidden(next);
          setBusy(false);
          router.refresh();
        }}
      />
      <span>
        隱藏這一份
        <span className="small muted" style={{ display: "block" }}>勾選後，這份節目單不會出現在你的個人頁，你也不會出現在這齣戲的頭像列。只有你自己看得到。</span>
      </span>
    </label>
  );
}
