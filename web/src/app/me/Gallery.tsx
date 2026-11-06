"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProgramCard } from "@/components/ProgramCard";
import { formatDate, formatSerial } from "@/lib/format";

export interface GalleryItem {
  claimId: string;
  title: string;
  companyName: string;
  genre: string | null;
  venue: string;
  startsAt: string;
  serial: number;
  color: string;
  favoriteRank: number | null;
}

type Mode = "time" | "genre" | "year" | "venue" | "company";

const MODES: { key: Mode; label: string }[] = [
  { key: "time", label: "時間" },
  { key: "genre", label: "類型" },
  { key: "year", label: "年份" },
  { key: "venue", label: "場館" },
  { key: "company", label: "劇團" },
];

function groupKey(item: GalleryItem, mode: Mode): string {
  if (mode === "genre") return item.genre ?? "其他";
  if (mode === "year") return String(new Date(item.startsAt).getFullYear());
  if (mode === "venue") return item.venue;
  if (mode === "company") return item.companyName;
  return "";
}

function Card({ item }: { item: GalleryItem }) {
  return (
    <ProgramCard
      size="sm"
      href={`/booklet/${item.claimId}`}
      ariaLabel={`《${item.title}》節目單，${formatDate(item.startsAt)}${item.favoriteRank ? `，前三喜歡第 ${item.favoriteRank} 名` : ""}`}
      title={item.title}
      companyName={item.companyName}
      startsAt={item.startsAt}
      color={item.color}
      kicker={item.genre ?? "PROGRAM"}
      stubRight={<span>No. {formatSerial(item.serial)}</span>}
    />
  );
}

export function Gallery({ items }: { items: GalleryItem[] }) {
  const [mode, setMode] = useState<Mode>("time");

  const top = [1, 2, 3].map((rank) => items.find((i) => i.favoriteRank === rank) ?? null);
  const hasTop = top.some(Boolean);

  const groups = useMemo(() => {
    if (mode === "time") return [{ name: "", items }];
    const map = new Map<string, GalleryItem[]>();
    for (const item of items) {
      const k = groupKey(item, mode);
      map.set(k, [...(map.get(k) ?? []), item]);
    }
    const list = [...map.entries()].map(([name, list]) => ({ name, items: list }));
    // 年份由新到舊；其他依份數多寡
    return mode === "year"
      ? list.sort((a, b) => Number(b.name) - Number(a.name))
      : list.sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name, "zh-Hant"));
  }, [items, mode]);

  return (
    <>
      <section className="stack" style={{ gap: 12 }} aria-labelledby="top3-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 id="top3-title" className="group-title">我的前三喜歡</h2>
          {!hasTop && <span className="small muted">在節目單裡標記</span>}
        </div>
        <div className="top3">
          {top.map((item, i) =>
            item ? (
              <Link key={i} href={`/booklet/${item.claimId}`} className="top3-slot" aria-label={`第 ${i + 1} 名：《${item.title}》`}>
                <span className="top3-rank" aria-hidden="true">{i + 1}</span>
                <span className="top3-card" style={{ background: item.color }}>
                  <span className="top3-title">{item.title}</span>
                </span>
                <span className="top3-meta">{formatDate(item.startsAt)}</span>
              </Link>
            ) : (
              <div key={i} className="top3-slot top3-empty" aria-label={`第 ${i + 1} 名：尚未選擇`}>
                <span className="top3-rank" aria-hidden="true">{i + 1}</span>
                <span className="top3-card" />
                <span className="top3-meta">尚未選擇</span>
              </div>
            )
          )}
        </div>
      </section>

      <div className="pills" role="group" aria-label="分組方式">
        {MODES.map((m) => (
          <button key={m.key} type="button" className="pill" aria-pressed={m.key === mode} onClick={() => setMode(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      {groups.map((g) => (
        <section key={g.name || "all"} className="stack" style={{ gap: 12 }} aria-label={g.name || "全部節目單"}>
          {g.name && (
            <h2 className="group-title">
              {g.name}
              <span className="muted small" style={{ fontWeight: 400, marginLeft: 8 }}>{g.items.length} 份</span>
            </h2>
          )}
          <div className="grid">
            {g.items.map((item) => (
              <Card key={item.claimId} item={item} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
