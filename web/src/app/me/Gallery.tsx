"use client";

import { useMemo, useState } from "react";
import { ProgramCard } from "@/components/ProgramCard";
import { formatDate, formatSerial } from "@/lib/format";

export interface GalleryItem {
  claimId: string;
  title: string;
  companyName: string;
  genre: string | null;
  startsAt: string;
  serial: number;
  color: string;
}

export function Gallery({ items }: { items: GalleryItem[] }) {
  const genres = useMemo(() => {
    const set = new Set(items.map((i) => i.genre).filter((g): g is string => !!g));
    return ["全部", ...set];
  }, [items]);
  const [filter, setFilter] = useState("全部");
  const shown = filter === "全部" ? items : items.filter((i) => i.genre === filter);

  return (
    <>
      {genres.length > 2 && (
        <div className="pills" role="group" aria-label="依類型篩選">
          {genres.map((g) => (
            <button key={g} type="button" className="pill" aria-pressed={g === filter} onClick={() => setFilter(g)}>
              {g}
            </button>
          ))}
        </div>
      )}
      <div className="grid">
        {shown.map((item) => (
          <ProgramCard
            key={item.claimId}
            size="sm"
            href={`/booklet/${item.claimId}`}
            ariaLabel={`《${item.title}》節目單，${formatDate(item.startsAt)}`}
            title={item.title}
            companyName={item.companyName}
            startsAt={item.startsAt}
            color={item.color}
            kicker={item.genre ?? "PROGRAM"}
            stubRight={<span>No. {formatSerial(item.serial)}</span>}
          />
        ))}
      </div>
    </>
  );
}
