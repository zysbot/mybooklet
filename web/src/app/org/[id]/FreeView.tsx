import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getFreeStats } from "@/lib/insights";
import { FREE_CLAIM_LIMIT, freeUsage } from "@/lib/plans";
import { formatShowTime } from "@/lib/format";
import { OrgBrand } from "../OrgBrand";
import { AttachmentsPanel } from "./AttachmentsPanel";
import { CoversPanel } from "./CoversPanel";

/** 免費方案的主辦方後台：只有每場份數與鏈上寫入數，沒有觀眾分析 */
export async function FreeView({ organizerId, adminNote, attError }: { organizerId: string; adminNote: React.ReactNode; attError?: string }) {
  const db = getDb();
  const r = await getFreeStats(db, organizerId);
  if (!r) notFound();
  const { organizer, totals } = r;
  // 份數上限以發放單位計；只參與、不發放的組織沒有上限
  const used = organizer.roles.issuer ? await freeUsage(db, organizerId) : null;

  return (
    <main className="admin">
      <OrgBrand />
      <div className="admin-top">
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">{organizer.roleLabel}・免費方案</span>
          <h1>{organizer.name}</h1>
        </div>
        <Link href="/org" className="link-btn">我的後台</Link>
      </div>

      {adminNote}

      <section className="kpis" aria-label="總覽">
        <div className="kpi"><span className="kpi-n">{totals.shows}</span><span className="kpi-l">場次</span></div>
        <div className="kpi"><span className="kpi-n">{totals.claims}</span><span className="kpi-l">節目單已領取</span></div>
        <div className="kpi"><span className="kpi-n">{totals.minted}</span><span className="kpi-l">已寫入區塊鏈</span></div>
        {used !== null && (
          <div className="kpi">
            <span className="kpi-n">{used} / {FREE_CLAIM_LIMIT}</span>
            <span className="kpi-l">免費額度已使用</span>
          </div>
        )}
      </section>

      {used !== null && used >= FREE_CLAIM_LIMIT && (
        <p className="privacy-note">免費額度已用完，觀眾掃碼會看到「節目單已全數領取完畢」。如需繼續發放，請聯絡吾冊營運方洽談合作。</p>
      )}

      <section className="panel" aria-labelledby="shows-title">
        <h2 id="shows-title">各場次份數</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>演出時間</th><th>節目</th><th>場館</th>
                <th style={{ textAlign: "right" }}>領取上限</th>
                <th style={{ textAlign: "right" }}>已領取</th>
                <th style={{ textAlign: "right" }}>已寫入鏈上</th>
              </tr>
            </thead>
            <tbody>
              {r.shows.map((s) => (
                <tr key={s.showId}>
                  <td>{formatShowTime(s.startsAt)}</td>
                  <td>{s.title}</td>
                  <td>{s.venue}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.capacity ?? "—"}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.claims}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.minted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          領取後隔天寫入區塊鏈（每天批次一次）。鏈上的發行紀錄公開、無法竄改，可作為結案報告或補助申請的觀眾數佐證。
        </p>
      </section>

      <CoversPanel organizerId={organizerId} />
      <AttachmentsPanel organizerId={organizerId} plan="free" error={attError} />

      <section className="panel">
        <h2>合作方案可以看到更多</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
          與吾冊合作期間，後台會提供觀眾組成（第一次使用吾冊、回頭觀眾）、收藏深度、觀眾在其他演出看過的類型與場館等匿名統計，且不限發放份數，每檔節目可附 3 則文宣。統計一律不含觀眾個人資料。
        </p>
      </section>
    </main>
  );
}
