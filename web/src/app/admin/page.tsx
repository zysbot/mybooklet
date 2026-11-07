import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { formatDateTime, formatShowTime } from "@/lib/format";
import { LogoutAdmin } from "./LogoutAdmin";
import { ConfigureButton } from "./ConfigureButton";
import { QrButton } from "./QrButton";
import { type OrgKind } from "@/lib/insights";
import { EFFECTIVE_PLAN_SQL, PLAN_LABEL, type Plan } from "@/lib/plans";
import { adminTables, listOrgsForAdmin, productionParties, RoleError, setIssuer, type AdminOrgRow, type Party } from "@/lib/roles";
import { VENUES } from "@/lib/catalog";
import { revalidatePath } from "next/cache";
import "./admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "營運後台｜吾冊", robots: { index: false } };

type Production = { id: string; title: string; company_name: string; default_design_id: string | null };
type Design = { id: string; production_id: string; label: string; cover_color: string; page_count: number; pdf_filename: string | null; pdf_uploaded_at: Date | null };
type Show = { id: string; production_id: string; starts_at: Date; venue: string; design_label: string; code: string | null; claims: string; minted: string; chain_configured: boolean };

export default async function AdminHome() {
  if (!(await isAdmin())) redirect("/admin/login");
  const db = getDb();

  const [productions, designs, shows, planRows] = await Promise.all([
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
    db.query<{ id: string; plan: Plan; effective: Plan; until: string | null }>(
      `SELECT o.id, o.plan, ${EFFECTIVE_PLAN_SQL} AS effective, to_char(o.plan_until, 'YYYY-MM-DD') AS until FROM organizers o`
    ),
  ]);
  const orgRows = await listOrgsForAdmin(db);
  const plans = new Map(planRows.rows.map((x) => [String(x.id), x]));
  const orgs: OrgListRow[] = orgRows.map((o) => {
    const pl = plans.get(o.id)!;
    return { ...o, plan: pl.plan, effective: pl.effective, until: pl.until };
  });
  const orgTable = (kind: OrgKind) => orgs.filter((o) => adminTables(o).includes(kind));
  const parties = new Map(await Promise.all(productions.rows.map(async (p) => [String(p.id), await productionParties(db, String(p.id))] as const)));

  async function changeIssuer(fd: FormData) {
    "use server";
    if (!(await isAdmin())) redirect("/admin/login");
    const productionId = String(fd.get("productionId") ?? "");
    const organizerId = String(fd.get("organizerId") ?? "");
    if (/^\d+$/.test(productionId) && /^\d+$/.test(organizerId)) {
      try {
        await setIssuer(getDb(), productionId, organizerId);
      } catch (err) {
        if (!(err instanceof RoleError)) throw err;
      }
    }
    revalidatePath("/admin");
  }

  return (
    <main className="admin">
      <div className="admin-top">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1>吾冊 營運後台</h1>
          <span className="admin-tag">ADMIN</span>
        </div>
        <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/admin/productions/new" className="link-btn" style={{ background: "var(--ink)", color: "var(--paper)" }}>＋ 上架節目</Link>
          <Link href="/admin/stats" className="link-btn">觀眾統計</Link>
          <Link href="/admin/test-data" className="link-btn">測試資料</Link>
          <LogoutAdmin />
        </span>
      </div>

      {orgs.length > 0 && (
        <section className="panel" aria-labelledby="orgs-title">
          <div className="panel-head">
            <h2 id="orgs-title">主辦方後台</h2>
            <span className="small muted">在「管理」設定合作方案、加入工作人員的 Email；他們用 Email 驗證碼登入 /org</span>
          </div>
          <p className="small muted" style={{ margin: 0, lineHeight: 1.7 }}>
            同一個組織可以有好幾種身分（例如場館自製節目），會同時出現在對應的表裡，方案與工作人員是同一份。
            「發放」是由它發放節目單的節目數：用它的方案與免費額度，也由它管理卡面與附加文宣。
          </p>
          <OrgTable
            title="演出團隊"
            rows={orgTable("company")}
            cols={[["節目", (o) => o.asCompany], ["發放", (o) => o.issued]]}
          />
          <OrgTable
            title="製作公司"
            rows={orgTable("producer")}
            cols={[["製作節目", (o) => o.asProducer], ["合作劇團", (o) => o.producerCompanies], ["發放", (o) => o.issued]]}
          />
          <OrgTable
            title="場館"
            rows={orgTable("venue")}
            cols={[["縣市", (o) => VENUES.find((v) => v.name === o.name)?.city ?? "—"], ["在本館的節目", (o) => o.asVenue], ["場次", (o) => o.venueShows], ["發放", (o) => o.issued]]}
          />
        </section>
      )}

      {productions.rows.length === 0 && (
        <div className="panel">
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>
            還沒有節目。按右上角「＋ 上架節目」開始。
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

            <IssuerRow productionId={String(p.id)} parties={parties.get(String(p.id)) ?? []} action={changeIssuer} />

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
                  <tr><th>演出時間</th><th>場館</th><th>卡面</th><th>已領取</th><th>已上鏈</th><th>領取頁</th><th aria-label="QR code" /></tr>
                </thead>
                <tbody>
                  {pShows.map((s) => (
                    <tr key={s.id}>
                      <td>{formatShowTime(s.starts_at)}</td>
                      <td>{s.venue}</td>
                      <td>{s.design_label}</td>
                      <td>{Number(s.claims)}</td>
                      <td>{s.chain_configured ? Number(s.minted) : <ConfigureButton showId={String(s.id)} />}</td>
                      <td>{s.code ? <a href={`/c/${s.code}`} target="_blank" rel="noreferrer">/c/{s.code}</a> : "—"}</td>
                      <td>{s.code && <QrButton showId={String(s.id)} caption={`${p.title}・${formatShowTime(s.starts_at)}・${s.venue}`} />}</td>
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

type OrgListRow = AdminOrgRow & { plan: Plan; effective: Plan; until: string | null };
type Col = [string, (o: OrgListRow) => number | string];

const ROLE_SHORT: Record<OrgKind, string> = { company: "演出團隊", producer: "製作公司", venue: "場館" };

function OrgTable({ title, rows, cols }: { title: string; rows: OrgListRow[]; cols: Col[] }) {
  const kind = (Object.keys(ROLE_SHORT) as OrgKind[]).find((k) => ROLE_SHORT[k] === title)!;
  return (
    <div className="table-wrap">
      <table>
        <caption className="small muted" style={{ textAlign: "left", paddingBottom: 6 }}>{title}（{rows.length}）</caption>
        <thead>
          <tr>
            <th>名稱</th>
            {cols.map(([h]) => <th key={h}>{h}</th>)}
            <th>已領取</th><th>方案</th><th>工作人員</th><th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={cols.length + 5} className="muted">還沒有</td></tr>
          )}
          {rows.map((o) => {
            const also = adminTables(o).filter((k) => k !== kind).map((k) => ROLE_SHORT[k]);
            return (
              <tr key={o.id}>
                <td>
                  {o.name}
                  {also.length > 0 && <span className="small muted">（也是{also.join("、")}）</span>}
                </td>
                {cols.map(([h, f]) => <td key={h}>{f(o)}</td>)}
                <td>{o.claims}</td>
                <td>
                  {PLAN_LABEL[o.effective]}
                  {o.plan !== o.effective ? <span className="small muted">（已到期）</span> : o.until ? <span className="small muted">（到 {o.until}）</span> : null}
                </td>
                <td>{o.members}</td>
                <td style={{ textAlign: "right" }}>
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Link href={`/org/${o.id}`} className="link-btn">看後台</Link>
                    <Link href={`/admin/organizers/${o.id}`} className="link-btn">管理</Link>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 節目的參與組織與發放單位（可改） */
function IssuerRow({ productionId, parties, action }: { productionId: string; parties: Party[]; action: (fd: FormData) => Promise<void> }) {
  const issuer = parties.find((x) => x.isIssuer);
  return (
    <form action={action} className="issuer-row">
      <input type="hidden" name="productionId" value={productionId} />
      <span className="small muted">
        參與：{parties.map((x) => `${x.name}（${x.roleLabel}）`).join("、")}
      </span>
      <label className="small" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        發放單位
        <select name="organizerId" defaultValue={issuer?.id} key={issuer?.id}>
          {parties.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <button type="submit" className="link-btn" style={{ font: "inherit", fontSize: 13 }}>儲存</button>
    </form>
  );
}
