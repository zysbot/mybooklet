import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { formatDateTime, formatShowTime } from "@/lib/format";
import { LogoutAdmin } from "./LogoutAdmin";
import { InviteButton } from "./InviteButton";
import { ORG_KIND_LABEL, type OrgKind } from "@/lib/insights";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "營運後台｜吾冊", robots: { index: false } };

type Production = { id: string; title: string; company_name: string; default_design_id: string | null };
type Design = { id: string; production_id: string; label: string; cover_color: string; page_count: number; pdf_filename: string | null; pdf_uploaded_at: Date | null };
type Show = { id: string; production_id: string; starts_at: Date; venue: string; design_label: string; code: string | null; claims: string; minted: string; chain_configured: boolean };

export default async function AdminHome() {
  if (!(await isAdmin())) redirect("/admin/login");
  const db = getDb();

  const [productions, designs, shows, orgs] = await Promise.all([
    db.query<Production>(`SELECT id, title, company_name, default_design_id FROM productions ORDER BY id DESC`),
    db.query<Design>(`SELECT id, production_id, label, cover_color, page_count, pdf_filename, pdf_uploaded_at FROM designs ORDER BY id`),
    db.query<Show>(
      `SELECT s.id, s.production_id, s.starts_at, s.venue, s.chain_configured, d.label AS design_label,
              (SELECT code FROM claim_codes cc WHERE cc.show_id = s.id ORDER BY cc.id LIMIT 1) AS code,
              (SELECT count(*) FROM claims c WHERE c.show_id = s.id) AS claims,
              (SELECT count(*) FROM claims c WHERE c.show_id = s.id AND c.chain_status = 'minted') AS minted
         FROM shows s
         JOIN productions p ON p.id = s.production_id
         JOIN designs d ON d.id = COALESCE(s.design_id, p.default_design_id)
        ORDER BY s.starts_at`
    ),
    db.query<{ id: string; name: string; kind: OrgKind; members: string; has_invite: boolean }>(
      `SELECT o.id, o.name, o.kind, (o.invite_token IS NOT NULL) AS has_invite,
              (SELECT count(*) FROM organizer_members m WHERE m.organizer_id = o.id) AS members
         FROM organizers o ORDER BY o.kind, o.name`
    ),
  ]);

  return (
    <main className="admin">
      <div className="admin-top">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>吾冊 營運後台</h1>
          <span className="admin-tag">ADMIN</span>
        </div>
        <LogoutAdmin />
      </div>

      {orgs.rows.length > 0 && (
        <section className="panel" aria-labelledby="orgs-title">
          <div className="panel-head">
            <h2 id="orgs-title">主辦方後台</h2>
            <span className="small muted">把邀請連結交給劇團、製作方或場館的工作人員，他們登入後就能看到自己的統計</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>名稱</th><th>類型</th><th>成員</th><th aria-label="操作" /></tr>
              </thead>
              <tbody>
                {orgs.rows.map((o) => (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td className="muted">{ORG_KIND_LABEL[o.kind]}</td>
                    <td>{Number(o.members)}</td>
                    <td style={{ textAlign: "right" }}>
                      <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <Link href={`/org/${o.id}`} className="link-btn">看後台</Link>
                        <InviteButton organizerId={String(o.id)} hasInvite={o.has_invite} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {productions.rows.length === 0 && (
        <div className="panel">
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
            還沒有節目。先用 <code>npm run create-show -- shows/節目.json</code> 上架節目，再回來上傳節目單 PDF。
          </p>
        </div>
      )}

      {productions.rows.map((p) => {
        const pDesigns = designs.rows.filter((d) => String(d.production_id) === String(p.id));
        const pShows = shows.rows.filter((s) => String(s.production_id) === String(p.id));
        return (
          <section className="panel" key={p.id} aria-labelledby={`prod-${p.id}`}>
            <div className="panel-head">
              <h2 id={`prod-${p.id}`}>《{p.title}》</h2>
              <span className="muted small">{p.company_name}</span>
            </div>

            <div className="table-wrap">
              <table>
                <caption className="small muted" style={{ textAlign: "left", paddingBottom: 6 }}>卡面版本與節目單</caption>
                <thead>
                  <tr><th>卡面版本</th><th>節目單 PDF</th><th>上傳時間</th><th aria-label="操作" /></tr>
                </thead>
                <tbody>
                  {pDesigns.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <span className="swatch" style={{ background: d.cover_color }} aria-hidden="true" />
                        {d.label}
                        {String(d.id) === String(p.default_design_id) && <span className="muted small">（預設）</span>}
                      </td>
                      <td>
                        {d.page_count > 0 ? (
                          <span className="status-ok">{d.page_count} 頁・{d.pdf_filename}</span>
                        ) : (
                          <span className="status-none">尚未上傳</span>
                        )}
                      </td>
                      <td className="muted">{d.pdf_uploaded_at ? formatDateTime(d.pdf_uploaded_at) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link href={`/admin/designs/${d.id}`} className="link-btn">{d.page_count > 0 ? "更換 PDF" : "上傳 PDF"}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="table-wrap">
              <table>
                <caption className="small muted" style={{ textAlign: "left", paddingBottom: 6 }}>場次</caption>
                <thead>
                  <tr><th>演出時間</th><th>場館</th><th>卡面</th><th>已領取</th><th>已上鏈</th><th>領取頁</th></tr>
                </thead>
                <tbody>
                  {pShows.map((s) => (
                    <tr key={s.id}>
                      <td>{formatShowTime(s.starts_at)}</td>
                      <td>{s.venue}</td>
                      <td>{s.design_label}</td>
                      <td>{Number(s.claims)}</td>
                      <td>{s.chain_configured ? Number(s.minted) : <span className="status-none">合約未設定</span>}</td>
                      <td>{s.code ? <a href={`/c/${s.code}`} target="_blank" rel="noreferrer">/c/{s.code}</a> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </main>
  );
}
