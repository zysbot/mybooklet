import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { KINDRED_MIN_COMMON, type Kindred as K } from "@/lib/social";

/**
 * 收藏冊下方：吾冊裡跟你足跡最像的五位。
 * 自己有公開收藏才看得到是誰（你看得到別人，別人也看得到你）；沒公開只顯示人數。
 */
export function Kindred({ people, total, viewerPublic }: { people: K[]; total: number; viewerPublic: boolean }) {
  return (
    <section className="stack kin" style={{ gap: 12 }} aria-labelledby="kin-title">
      <h2 id="kin-title" className="group-title">跟你足跡最像的人</h2>
      {total === 0 ? (
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          還沒有跟你一起看過 {KINDRED_MIN_COMMON} 齣以上的公開收藏者。多收藏幾份節目單，這裡就會出現和你品味相近的人。
        </p>
      ) : !viewerPublic ? (
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          吾冊裡有 {total} 位觀眾跟你一起看過 {KINDRED_MIN_COMMON} 齣以上的戲。打開下方的「公開我的收藏」就能看到他們是誰，他們也會看到你。
        </p>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>從所有公開收藏的觀眾裡，找出跟你一起看過最多齣戲的人。點進去看他還看了什麼。</p>
          <ol className="kin-list">
            {people.map((p, i) => (
              <li key={p.publicId}>
                <Link href={`/u/${p.publicId}`} className="kin-item">
                  <span className="kin-rank" aria-hidden="true">{i + 1}</span>
                  <Avatar pseudonym={p.pseudonym} size={48} />
                  <span className="kin-text">
                    <span className="kin-name">{p.pseudonym}</span>
                    <span className="kin-meta">
                      一起看過 {p.common} 齣{p.sameNights > 0 ? `・${p.sameNights} 次同一晚` : ""}
                    </span>
                  </span>
                  <span className="kin-pct">{Math.round(p.similarity * 100)}%</span>
                </Link>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
