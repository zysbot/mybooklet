import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { CoCollectorsResult } from "@/lib/social";
import { formatShowTime } from "@/lib/format";

/** 節目單下方：也收藏了這齣戲的人（依和你的足跡相似度排序） */
export function CoCollectors({ title, r, viewerPublic }: { title: string; r: CoCollectorsResult; viewerPublic: boolean }) {
  return (
    <section className="section" aria-labelledby="co-title">
      <h2 id="co-title">也收藏了《{title}》的人</h2>
      {!r.open ? (
        <p className="muted" style={{ fontSize: 14 }}>演出開始 4 小時後（{formatShowTime(r.opensAt)}）才會列出其他收藏者。</p>
      ) : r.people.length === 0 ? (
        <p className="muted" style={{ fontSize: 14 }}>目前沒有公開的收藏者{r.notPublic > 0 ? `（另有 ${r.notPublic} 位未公開）` : ""}。</p>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>依和你的足跡相似度排列。點頭像看他收藏了哪些節目單。</p>
          <div className="people">
            {r.people.map((p) => (
              <Link key={p.publicId} href={`/u/${p.publicId}`} className="person">
                <Avatar pseudonym={p.pseudonym} size={52} />
                <span className="person-name">{p.pseudonym}</span>
                {p.sameNight ? <span className="person-tag">同一晚</span> : null}
                <span className="person-pct">相似 {Math.round(p.similarity * 100)}%</span>
              </Link>
            ))}
          </div>
          {r.notPublic > 0 && <p className="small muted" style={{ margin: 0 }}>另有 {r.notPublic} 位未公開。</p>}
        </>
      )}
      {!viewerPublic && (
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          你目前沒有公開收藏，所以別人看不到你。要出現在這裡，到<Link href="/me">我的收藏冊</Link>打開「公開我的收藏」。
        </p>
      )}
    </section>
  );
}
