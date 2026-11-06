"use client";

import { useState } from "react";

/** 產生邀請連結，交給劇團、製作方或場館的工作人員 */
export function InviteButton({ organizerId, hasInvite }: { organizerId: string; hasInvite: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (hasInvite && !link && !confirm("產生新的邀請連結後，舊連結會失效（已加入的成員不受影響）。繼續？")) return;
    setBusy(true);
    const res = await fetch(`/api/admin/organizers/${organizerId}/invite`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setLink(`${window.location.origin}/org/join/${data.token}`);
    setBusy(false);
  }

  if (link) {
    return (
      <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
        <code className="small" style={{ wordBreak: "break-all" }}>{link}</code>
        <button
          type="button"
          className="link-btn"
          style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
          }}
        >
          {copied ? "已複製" : "複製"}
        </button>
      </span>
    );
  }
  return (
    <button type="button" className="link-btn" style={{ background: "transparent", font: "inherit", fontSize: 13, cursor: "pointer" }} onClick={create} disabled={busy}>
      {hasInvite ? "更換邀請連結" : "產生邀請連結"}
    </button>
  );
}
