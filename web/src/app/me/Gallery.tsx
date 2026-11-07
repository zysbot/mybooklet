"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ProgramCard, cardBackground } from "@/components/ProgramCard";
import { formatDate, formatSerial } from "@/lib/format";

export interface GalleryItem {
  claimId: string;
  title: string;
  companyName: string;
  genre: string | null;
  venue: string;
  city: string | null;
  productionId: string;
  workTitle: string;
  festival: string | null;
  directors: string[];
  playwrights: string[];
  startsAt: string;
  serial: number;
  color: string;
  image: string | null;
  favoriteRank: number | null;
}

type Mode = "time" | "genre" | "year" | "city" | "venue" | "company" | "work" | "festival" | "creator";

/** 創作者的職務；之後再加演員、舞台、燈光 */
type Role = "directors" | "playwrights";
const ROLES: { key: Role; label: string }[] = [
  { key: "directors", label: "導演" },
  { key: "playwrights", label: "編劇" },
];

/** 前五喜歡 */
const FAVORITE_SLOTS = [1, 2, 3, 4, 5];

const MODES: { key: Mode; label: string }[] = [
  { key: "time", label: "時間" },
  { key: "genre", label: "類型" },
  { key: "year", label: "年份" },
  { key: "city", label: "縣市" },
  { key: "venue", label: "場館" },
  { key: "company", label: "劇團" },
  { key: "work", label: "作品" },
  { key: "festival", label: "藝術節" },
  { key: "creator", label: "創作者" },
];

const NO_FESTIVAL = "不屬於藝術節";

function groupKey(item: GalleryItem, mode: Mode): string {
  if (mode === "genre") return item.genre ?? "其他";
  if (mode === "year") return String(new Date(item.startsAt).getFullYear());
  if (mode === "city") return item.city ?? "其他";
  if (mode === "venue") return item.venue;
  if (mode === "company") return item.companyName;
  if (mode === "work") return item.workTitle;
  if (mode === "festival") return item.festival ?? NO_FESTIVAL;
  return "";
}

/** 同一部作品有幾個版本（不同製作，例如首演與重演） */
function versions(items: GalleryItem[]): number {
  return new Set(items.map((i) => i.productionId)).size;
}

function Card({ item }: { item: GalleryItem }) {
  return (
    <ProgramCard
      size="sm"
      href={`/booklet/${item.claimId}`}
      ariaLabel={`《${item.title}》節目單，${formatDate(item.startsAt)}${item.favoriteRank ? `，前五喜歡第 ${item.favoriteRank} 名` : ""}`}
      title={item.title}
      companyName={item.companyName}
      startsAt={item.startsAt}
      color={item.color}
      image={item.image}
      kicker={item.genre ?? "PROGRAM"}
      stubRight={<span>No. {formatSerial(item.serial)}</span>}
    />
  );
}

export function Gallery({ items }: { items: GalleryItem[] }) {
  const [mode, setMode] = useState<Mode>("time");
  const [role, setRole] = useState<Role>("directors");

  const top = FAVORITE_SLOTS.map((rank) => items.find((i) => i.favoriteRank === rank) ?? null);
  const hasTop = top.some(Boolean);

  const groups = useMemo(() => {
    if (mode === "time") return [{ name: "", items }];
    if (mode === "creator") {
      // 一份節目單可能有好幾位導演，會出現在每一位底下；沒有資料的放最後
      const label = ROLES.find((r) => r.key === role)!.label;
      const none = `尚未登錄${label}的節目單`;
      const byName = new Map<string, GalleryItem[]>();
      for (const item of items) {
        const names = item[role].length ? item[role] : [none];
        for (const n of names) byName.set(n, [...(byName.get(n) ?? []), item]);
      }
      return [...byName.entries()]
        .map(([name, list]) => ({ name, items: list }))
        .sort((a, b) => Number(a.name === none) - Number(b.name === none) || b.items.length - a.items.length || a.name.localeCompare(b.name, "zh-Hant"));
    }
    const map = new Map<string, GalleryItem[]>();
    for (const item of items) {
      const k = groupKey(item, mode);
      map.set(k, [...(map.get(k) ?? []), item]);
    }
    const list = [...map.entries()].map(([name, list]) => ({ name, items: list }));
    const byCount = (a: { name: string; items: GalleryItem[] }, b: { name: string; items: GalleryItem[] }) =>
      b.items.length - a.items.length || a.name.localeCompare(b.name, "zh-Hant");
    // 年份由新到舊；作品先列有重演的；藝術節把「不屬於藝術節」放最後；其他依份數多寡
    if (mode === "year") return list.sort((a, b) => Number(b.name) - Number(a.name));
    if (mode === "work") {
      // 有重演（兩個以上版本）的作品各自一組；只看過一個版本的合成一組放最後
      const multi = list.filter((g) => versions(g.items) > 1).sort((a, b) => versions(b.items) - versions(a.items) || byCount(a, b));
      const single = list.filter((g) => versions(g.items) <= 1).flatMap((g) => g.items);
      single.sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      return single.length ? [...multi, { name: multi.length ? "其他作品" : "還沒有看過同一部作品的不同版本", items: single, merged: true }] : multi;
    }
    if (mode === "festival") return list.sort((a, b) => Number(a.name === NO_FESTIVAL) - Number(b.name === NO_FESTIVAL) || byCount(a, b));
    return list.sort(byCount);
  }, [items, mode, role]);

  return (
    <>
      <section className="stack" style={{ gap: 12 }} aria-labelledby="top3-title">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 id="top3-title" className="group-title">我的前五喜歡</h2>
          {!hasTop && <span className="small muted">在節目單裡標記</span>}
        </div>
        <div className="top3">
          {top.map((item, i) =>
            item ? (
              <Link key={i} href={`/booklet/${item.claimId}`} className="top3-slot" aria-label={`第 ${i + 1} 名：《${item.title}》`}>
                <span className="top3-rank" aria-hidden="true">{i + 1}</span>
                <span className="top3-card" style={cardBackground(item.color, item.image)}>
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

      {mode === "creator" && (
        <div className="pills subpills" role="group" aria-label="創作者的職務">
          {ROLES.map((r) => (
            <button key={r.key} type="button" className="pill" aria-pressed={r.key === role} onClick={() => setRole(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      )}

      {groups.map((g) => (
        <section key={`${mode}-${g.name || "all"}`} className="stack" style={{ gap: 12 }} aria-label={g.name || "全部節目單"}>
          {g.name && (
            <h2 className="group-title">
              {g.name}
              <span className="muted small" style={{ fontWeight: 400, marginLeft: 8 }}>
                {g.items.length} 份{mode === "work" && !("merged" in g) && versions(g.items) > 1 ? `・${versions(g.items)} 個版本` : ""}
              </span>
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
