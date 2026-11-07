"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** 「公開我的收藏」開關。關閉後立即從所有頭像列與個人頁消失（包括過去的場次）。13–17 歲不能打開。 */
export function SocialToggle({ initial, publicId, teen }: { initial: boolean; publicId: string; teen: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [askAdult, setAskAdult] = useState(false);

  if (teen) {
    return (
      <div className="stack" style={{ gap: 8 }}>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          你第一次領取時選了「13–17 歲」，所以收藏不公開，其他觀眾看不到你的化名與頭像。
        </p>
        {askAdult ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span className="small">確定你已滿 18 歲？</span>
            <button
              type="button"
              className="pill"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await fetch("/api/me/age", { method: "POST" });
                setBusy(false);
                router.refresh();
              }}
            >
              是，我已滿 18 歲
            </button>
            <button type="button" className="pill" onClick={() => setAskAdult(false)}>取消</button>
          </div>
        ) : (
          <button type="button" className="pill" style={{ alignSelf: "flex-start" }} onClick={() => setAskAdult(true)}>
            我已經滿 18 歲了
          </button>
        )}
      </div>
    );
  }

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
