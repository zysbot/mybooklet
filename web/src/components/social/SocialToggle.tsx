"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** 「公開我的收藏」開關。關閉後立即從所有頭像列與個人頁消失（包括過去的場次）。 */
export function SocialToggle({ initial, publicId }: { initial: boolean; publicId: string }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={async (e) => {
            const next = e.target.checked;
            setBusy(true);
            const res = await fetch("/api/me/social", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ public: next }),
            });
            if (res.ok) setOn(next);
            setBusy(false);
            router.refresh();
          }}
        />
        <span>
          公開我的收藏
          <span className="small muted" style={{ display: "block" }}>
            打開後，登入吾冊的觀眾能在同一齣戲的節目單下方看到你的化名與頭像，點進去看到你公開的節目單（只到年月）。不會顯示你的真實姓名、LINE、Email、領取時間或編號。隨時可以關閉，關閉後過去的場次也一併隱藏。
          </span>
        </span>
      </label>
      <Link href={`/u/${publicId}`} className="small" style={{ alignSelf: "flex-start" }}>
        {on ? "看看別人眼中的我的個人頁" : "預覽我的個人頁"}
      </Link>
    </div>
  );
}
