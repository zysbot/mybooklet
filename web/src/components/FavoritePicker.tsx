"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Fav {
  rank: number;
  claimId: string;
  title: string;
}

/** 把這份節目單放進「我的前五喜歡」 */
export function FavoritePicker({ claimId, title, initial }: { claimId: string; title: string; initial: Fav[] }) {
  const router = useRouter();
  const [favs, setFavs] = useState<Fav[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = favs.find((f) => f.claimId === claimId)?.rank ?? null;

  async function choose(rank: number | null) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claimId, rank }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setFavs(data.favorites);
      router.refresh();
    } else setError(data.error ?? "設定失敗");
    setBusy(false);
  }

  return (
    <section className="fav" aria-labelledby="fav-title">
      <h2 id="fav-title" style={{ margin: 0, fontFamily: "var(--serif)", fontSize: 17 }}>
        {mine ? `這是你前五喜歡的第 ${mine} 名` : "放進我的前五喜歡"}
      </h2>
      <div className="fav-row" role="group" aria-label="選擇名次">
        {[1, 2, 3, 4, 5].map((rank) => {
          const holder = favs.find((f) => f.rank === rank);
          const isMine = holder?.claimId === claimId;
          return (
            <button
              key={rank}
              type="button"
              className="fav-btn"
              aria-pressed={isMine}
              disabled={busy}
              onClick={() => choose(isMine ? null : rank)}
              aria-label={isMine ? `取消第 ${rank} 名` : holder ? `第 ${rank} 名（取代《${holder.title}》）` : `設為第 ${rank} 名`}
            >
              第 {rank} 名
            </button>
          );
        })}
      </div>
      <p className="small muted" style={{ margin: 0, lineHeight: 1.6 }}>
        {(() => {
          const others = favs.filter((f) => f.claimId !== claimId);
          if (mine) return "再按一次可以取消。";
          if (others.length === 0) return `選一個名次，《${title}》就會出現在收藏冊最上方。`;
          return `目前：${others.map((f) => `第 ${f.rank} 名《${f.title}》`).join("、")}。選已有的名次會取代它。`;
        })()}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
