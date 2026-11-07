import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getAdminStats, type Period } from "@/lib/admin-stats";
import "../admin.css";
import "./stats.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "觀眾統計｜吾冊後台", robots: { index: false } };

const pct = (n: number, base: number) => (base > 0 ? `${Math.round((n / base) * 100)}%` : "—");

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

/** 單一數列的直條圖：滑過或點一下長條會顯示數字；下方可展開表格 */
function Columns({ title, data, pick, unit }: { title: string; data: Period[]; pick: (p: Period) => number; unit: string }) {
  const max = Math.max(1, ...data.map(pick));
  const total = data.reduce((n, p) => n + pick(p), 0);
  return (
    <figure className="cols">
      <figcaption>
        <span>{title}</span>
        <span className="small muted">合計 {total} {unit}・最高 {Math.max(0, ...data.map(pick))} {unit}</span>
      </figcaption>
      {total === 0 && <span className="small muted cols-empty">這段期間沒有</span>}
      <div className="cols-plot" role="img" aria-label={`${title}：${data.map((p) => `${p.label} ${pick(p)}`).join("、")}`}>
        {data.map((p) => (
          <div key={p.label} className="cols-col" tabIndex={0} title={`${p.label}：${pick(p)} ${unit}`}>
            <span className="cols-tip">{pick(p)}</span>
            <span className="cols-bar" style={{ height: `${(pick(p) / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="cols-axis" aria-hidden="true">
        {data.map((p, i) => (
          <span key={p.label}>{i % 3 === 0 || i === data.length - 1 ? p.label : ""}</span>
        ))}
      </div>
    </figure>
  );
}

function Bar({ label, n, base }: { label: string; n: number; base: number }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar-track" aria-hidden="true">
        {n > 0 && base > 0 && <span className="bar-fill" style={{ width: `${Math.max((n / base) * 100, 2)}%` }} />}
      </span>
      <span className="bar-value">{n} 人・{pct(n, base)}</span>
    </div>
  );
}

export default async function AdminStatsPage({ searchParams }: { searchParams: Promise<{ unit?: string; test?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { unit, test } = await searchParams;
  const monthly = unit === "month";
  const includeTest = test === "1";
  const s = await getAdminStats(getDb(), { includeTest });
  const o = s.overview;
  const periods = monthly ? s.months : s.weeks;
  const link = (u: string, t: boolean) => `/admin/stats?${new URLSearchParams({ ...(u === "month" ? { unit: "month" } : {}), ...(t ? { test: "1" } : {}) })}`;

  return (
    <main className="admin">
      <Link href="/admin" className="back">← 回到後台</Link>
      <div className="admin-top">
        <h1>觀眾統計</h1>
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <Link href={link(monthly ? "month" : "week", !includeTest)} className="link-btn">
            {includeTest ? "排除測試觀眾" : "包含測試觀眾"}
          </Link>
        </span>
      </div>
      <p className="privacy-note">
        只有營運方看得到這一頁，不提供給主辦方。排行只顯示系統化名。{includeTest ? "目前包含測試觀眾。" : "已排除測試觀眾（測試資料工具建立的帳號）。"}
        「觀眾」指至少領過一份節目單的帳號；「新觀眾」以第一次領取的時間計；時間一律是台北時間，每週從週一開始。
      </p>

      <section className="panel" aria-labelledby="ov-title">
        <h2 id="ov-title">總覽</h2>
        <div className="stat-grid">
          <Tile label="觀眾" value={o.viewers} note={`另有 ${Math.max(0, o.accounts - o.viewers)} 個帳號還沒領過`} />
          <Tile label="本週新觀眾" value={o.newThisWeek} />
          <Tile label="本月新觀眾" value={o.newThisMonth} />
          <Tile label="領取總數" value={o.claims} note={`平均每人 ${o.claimsPerViewer} 份`} />
          <Tile label="已寫入鏈上" value={o.minted} note={`等待每日批次 ${o.pending} 份`} />
        </div>
      </section>

      <section className="panel" aria-labelledby="trend-title">
        <div className="panel-head">
          <h2 id="trend-title">趨勢（最近 12 {monthly ? "個月" : "週"}）</h2>
          <span className="seg" role="group" aria-label="期間">
            <Link href={link("week", includeTest)} aria-current={!monthly ? "page" : undefined}>每週</Link>
            <Link href={link("month", includeTest)} aria-current={monthly ? "page" : undefined}>每月</Link>
          </span>
        </div>
        <div className="cols-grid">
          <Columns title="新觀眾" data={periods} pick={(p) => p.newViewers} unit="人" />
          <Columns title="領取數" data={periods} pick={(p) => p.claims} unit="份" />
          <Columns title="有領取的觀眾" data={periods} pick={(p) => p.active} unit="人" />
        </div>
        <details>
          <summary className="small">看表格</summary>
          <div className="table-wrap">
            <table>
              <thead><tr><th>{monthly ? "月份" : "週（週一）"}</th><th>新觀眾</th><th>領取數</th><th>有領取的觀眾</th></tr></thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.label}><td>{p.label}</td><td>{p.newViewers}</td><td>{p.claims}</td><td>{p.active}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="panel" aria-labelledby="comp-title">
        <h2 id="comp-title">觀眾組成</h2>
        <div className="stack" style={{ gap: 10 }}>
          <Bar label="LINE 登入" n={s.composition.line} base={o.viewers} />
          <Bar label="Google 登入" n={s.composition.google} base={o.viewers} />
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Bar label="18 歲以上" n={s.composition.adult} base={o.viewers} />
          <Bar label="13–17 歲" n={s.composition.teen} base={o.viewers} />
          <Bar label="還沒選年齡（舊帳號）" n={s.composition.ageUnknown} base={o.viewers} />
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Bar label="公開收藏" n={s.composition.publicCollections} base={o.viewers} />
        </div>
      </section>

      <section className="panel" aria-labelledby="ret-title">
        <h2 id="ret-title">回頭率</h2>
        <div className="stat-grid">
          <Tile label="領過 2 份以上" value={pct(s.retention.repeat, o.viewers)} note={`${s.retention.repeat} 人`} />
          <Tile label="看過 2 個以上劇團" value={pct(s.retention.multiCompany, o.viewers)} note={`${s.retention.multiCompany} 人・吾冊跨團收藏的價值`} />
          <Tile
            label="90 天內又領一份"
            value={pct(s.retention.within90.returned, s.retention.within90.eligible)}
            note={s.retention.within90.eligible ? `第一次領取滿 90 天的 ${s.retention.within90.eligible} 人中，${s.retention.within90.returned} 人` : "還沒有第一次領取滿 90 天的觀眾"}
          />
        </div>
        <h3 className="small muted" style={{ margin: "4px 0 0", fontWeight: 400 }}>每人收藏份數</h3>
        <div className="stack" style={{ gap: 10 }}>
          {s.retention.distribution.map((d) => <Bar key={d.label} label={d.label} n={d.n} base={o.viewers} />)}
        </div>
      </section>

      <section className="panel" aria-labelledby="rank-title">
        <h2 id="rank-title">排行（化名）</h2>
        <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
          只給營運方參考，例如之後邀請早期觀眾或常客參加活動。不要截圖對外公開；要聯絡本人時，請另外設計讓觀眾自己報名的方式。
        </p>
        <div className="rank-grid">
          <RankTable title="收藏最多" rows={s.topCollectors} />
          <RankTable title="最早開始使用" rows={s.earliest} />
        </div>
      </section>
    </main>
  );
}

function RankTable({ title, rows }: { title: string; rows: { pseudonym: string; claims: number; firstClaim: string }[] }) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="small muted" style={{ textAlign: "left", paddingBottom: 6 }}>{title}</caption>
        <thead><tr><th>#</th><th>化名</th><th>份數</th><th>第一次領取</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="muted">還沒有觀眾</td></tr>}
          {rows.map((r, i) => (
            <tr key={r.pseudonym}><td>{i + 1}</td><td>{r.pseudonym}</td><td>{r.claims}</td><td>{r.firstClaim}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
