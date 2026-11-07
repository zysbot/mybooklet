import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/admin";
import { currentOrgAccount } from "@/lib/org-session";
import { isOrgMember, logAccess } from "@/lib/org-accounts";
import { getPlan, PLAN_LABEL } from "@/lib/plans";
import { getInsights, ORG_KIND_LABEL, MIN_GROUP, type Masked } from "@/lib/insights";
import { FreeView } from "./FreeView";
import { formatShowTime } from "@/lib/format";
import "../../admin/admin.css";
import "../org.css";
import { OrgBrand } from "../OrgBrand";
import { AttachmentsPanel } from "./AttachmentsPanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "主辦方後台｜吾冊", robots: { index: false } };

function people(m: Masked): string {
  if (m.hidden) return `少於 ${MIN_GROUP} 人`;
  return `${m.n} 人${m.pct !== null ? `・${m.pct}%` : ""}`;
}

function Bar({ label, m }: { label: string; m: Masked }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track" aria-hidden="true">
        {!m.hidden && m.pct !== null && (m.n ?? 0) > 0 && <span className="bar-fill" style={{ width: `${Math.max(m.pct, 2)}%` }} />}
      </span>
      <span className="bar-value">{people(m)}</span>
    </div>
  );
}

export default async function OrgDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ attError?: string }> }) {
  const { id } = await params;
  const { attError } = await searchParams;
  const db = getDb();
  const [account, admin] = await Promise.all([currentOrgAccount(), isAdmin()]);
  if (!account && !admin) redirect("/org");
  if (!admin && !(account && (await isOrgMember(db, id, account.id)))) notFound();

  const plan = await getPlan(db, id);
  if (!plan) notFound();
  // 工作人員每次查看都記錄；營運方查看不記
  if (account && !admin) await logAccess(db, id, account.email, "view");

  const adminNote = admin ? (
    <p className="privacy-note">
      營運方檢視：這個組織目前是「{PLAN_LABEL[plan.effective]}」
      {plan.plan !== plan.effective ? `（設定為${PLAN_LABEL[plan.plan]}，已於 ${plan.until} 到期）` : plan.until ? `，合作到 ${plan.until}` : ""}
      ，下面是工作人員看到的畫面。<Link href={`/admin/organizers/${id}`}>管理這個組織</Link>
    </p>
  ) : null;

  if (plan.effective === "free") return <FreeView organizerId={id} adminNote={adminNote} attError={attError} />;

  const r = await getInsights(db, id);
  if (!r) notFound();
  const { organizer, totals } = r;

  return (
    <main className="admin">
      <OrgBrand />
      <div className="admin-top">
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">{ORG_KIND_LABEL[organizer.kind]}</span>
          <h1>{organizer.name}</h1>
        </div>
        <Link href="/org" className="link-btn">我的後台</Link>
      </div>

      {adminNote}
      {plan.until && (
        <p className="small muted" style={{ margin: 0 }}>合作方案：{PLAN_LABEL[plan.effective]}，到 {plan.until} 為止。</p>
      )}

      <p className="privacy-note">
        這裡只提供統計，不會顯示任何觀眾的名字、LINE、Email 或錢包地址。人數少於 {MIN_GROUP} 人的分群只顯示「少於 {MIN_GROUP} 人」，避免推測出個別觀眾。
      </p>

      <section className="kpis" aria-label="總覽">
        <div className="kpi"><span className="kpi-n">{totals.shows}</span><span className="kpi-l">場次</span></div>
        <div className="kpi"><span className="kpi-n">{totals.claims}</span><span className="kpi-l">節目單領取</span></div>
        <div className="kpi"><span className="kpi-n">{totals.audience}</span><span className="kpi-l">不重複觀眾</span></div>
        <div className="kpi">
          <span className="kpi-n">{r.favorites.hidden ? `<${MIN_GROUP}` : r.favorites.n ?? "—"}</span>
          <span className="kpi-l">放進前三喜歡</span>
        </div>
      </section>

      <section className="panel" aria-labelledby="shows-title">
        <h2 id="shows-title">各場次領取</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>演出時間</th><th>節目</th><th>場館</th><th style={{ textAlign: "right" }}>領取</th><th style={{ textAlign: "right" }}>領取率</th></tr>
            </thead>
            <tbody>
              {r.shows.map((s) => (
                <tr key={s.showId}>
                  <td>{formatShowTime(s.startsAt)}</td>
                  <td>{s.title}</td>
                  <td>{s.venue}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.claims}</td>
                  <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {s.capacity ? `${Math.round((s.claims / s.capacity) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>領取率 = 領取數 ÷ 上架時設定的領取上限（通常是售票數）。</p>
      </section>

      {!r.footprintAvailable ? (
        <section className="panel">
          <h2>觀眾足跡</h2>
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
            觀眾累積到 {MIN_GROUP} 人以上，才會顯示觀眾組成與足跡分析。目前 {totals.audience} 人。
          </p>
        </section>
      ) : (
        <>
          <section className="panel" aria-labelledby="comp-title">
            <h2 id="comp-title">觀眾組成</h2>
            <div className="bars">
              <Bar label="在這裡領到第一份吾冊節目單" m={r.composition.firstTime} />
              <Bar label="領過你兩個以上場次（回頭觀眾）" m={r.composition.returning} />
            </div>
            <h3 className="sub">收藏深度：觀眾在吾冊總共收藏了幾份節目單</h3>
            <div className="bars">
              {r.depth.map((d) => (
                <Bar key={d.label} label={d.label} m={d.count} />
              ))}
            </div>
          </section>

          <section className="panel" aria-labelledby="foot-title">
            <h2 id="foot-title">觀眾足跡</h2>
            <p className="small muted" style={{ margin: 0 }}>你的觀眾在其他演出領過的節目單。不列出其他劇團或製作方；不到 {MIN_GROUP} 人的類型與場館不列出。</p>
            <h3 className="sub">看其他演出時，也看過的類型</h3>
            <div className="bars">
              {r.genres.length === 0 ? <p className="muted small" style={{ margin: 0 }}>尚無達到 {MIN_GROUP} 人的類型</p> : r.genres.map((g) => <Bar key={g.genre} label={g.genre} m={g.count} />)}
            </div>
            <h3 className="sub">看其他演出時，去過的場館</h3>
            <div className="bars">
              {r.venues.length === 0 ? (
                <p className="muted small" style={{ margin: 0 }}>尚無達到 {MIN_GROUP} 人的場館</p>
              ) : (
                r.venues.map((v) => <Bar key={v.venue} label={v.venue} m={v.count} />)
              )}
            </div>
          </section>
        </>
      )}
      <AttachmentsPanel organizerId={id} plan={plan.effective} error={attError} />
    </main>
  );
}
