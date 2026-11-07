import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getDesignPages, MAX_PAGES } from "@/lib/pages";
import { formatDateTime } from "@/lib/format";
import { PdfUploader } from "./PdfUploader";
import { FESTIVALS } from "@/lib/catalog";
import { CoverUploader } from "@/components/CoverUploader";
import { listWorkTitles, ProductionError, setProductionCategories, setProductionCredits } from "@/lib/productions";
import "../../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "上傳節目單｜吾冊後台", robots: { index: false } };

export default async function DesignUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ catError?: string }>;
}) {
  const { catError } = await searchParams;
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const db = getDb();
  const r = await db.query<{ label: string; cover_color: string; title: string; company_name: string; pdf_filename: string | null; pdf_uploaded_at: Date | null; page_count: number; reading_direction: string; production_id: string; work_title: string | null; festival: string | null; cover_image_url: string | null; genre: string | null; directors: string[]; playwrights: string[] }>(
    `SELECT d.label, d.cover_color, d.cover_image_url, p.genre, d.pdf_filename, d.pdf_uploaded_at, d.page_count, d.reading_direction, p.title, p.company_name,
            p.id AS production_id, p.work_title, p.festival, p.directors, p.playwrights
       FROM designs d JOIN productions p ON p.id = d.production_id WHERE d.id = $1`,
    [id]
  );
  const design = r.rows[0];
  if (!design) notFound();
  const pages = await getDesignPages(db, id);
  const siblings = await db.query<{ label: string }>(
    `SELECT label FROM designs WHERE production_id = (SELECT production_id FROM designs WHERE id = $1) AND id <> $1 ORDER BY id`,
    [id]
  );

  async function saveDirection(fd: FormData) {
    "use server";
    if (!(await isAdmin())) redirect("/admin/login");
    const dir = fd.get("direction") === "rtl" ? "rtl" : "ltr";
    await getDb().query(`UPDATE designs SET reading_direction = $2 WHERE id = $1`, [id, dir]);
    redirect(`/admin/designs/${id}`);
  }

  const workTitles = await listWorkTitles(db);

  async function saveCategories(fd: FormData) {
    "use server";
    if (!(await isAdmin())) redirect("/admin/login");
    try {
      await setProductionCategories(getDb(), String(design.production_id), String(fd.get("work") ?? "").trim(), String(fd.get("festival") ?? ""));
      await setProductionCredits(getDb(), String(design.production_id), String(fd.get("directors") ?? ""), String(fd.get("playwrights") ?? ""));
    } catch (err) {
      if (err instanceof ProductionError) redirect(`/admin/designs/${id}?catError=${encodeURIComponent(err.message)}`);
      throw err;
    }
    redirect(`/admin/designs/${id}`);
  }

  return (
    <main className="admin">
      <Link href="/admin" className="back">← 回到後台</Link>
      <div className="stack" style={{ gap: 6 }}>
        <h1>《{design.title}》節目單</h1>
        <p className="muted" style={{ margin: 0 }}>
          <span className="swatch" style={{ background: design.cover_color }} aria-hidden="true" />
          卡面版本：{design.label}・{design.company_name}
        </p>
      </div>

      <section className="panel" aria-labelledby="upload-title">
        <h2 id="upload-title">{pages.length ? "更換節目單 PDF" : "上傳節目單 PDF"}</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7, fontSize: 14 }}>
          PDF 會在你的瀏覽器裡轉成每一頁的圖片再上傳，觀眾在手機上左右翻頁閱讀。最多 {MAX_PAGES} 頁。
          上傳完會先讓你預覽，按「確認發布」後觀眾才會看到。
        </p>
        <PdfUploader designId={id} siblingLabels={siblings.rows.map((s) => s.label)} />
      </section>

      <section className="panel" aria-labelledby="cover-title">
        <h2 id="cover-title">卡面圖片</h2>
        <CoverUploader
          designId={id}
          title={design.title}
          companyName={design.company_name}
          startsAt={new Date().toISOString()}
          color={design.cover_color}
          image={design.cover_image_url}
          genre={design.genre}
        />
      </section>

      <section className="panel" aria-labelledby="dir-title">
        <h2 id="dir-title">翻頁方向</h2>
        <form action={saveDirection} className="form-grid">
          <label className="field">
            觀眾往哪個方向翻頁
            <select name="direction" defaultValue={design.reading_direction}>
              <option value="ltr">由左往右（橫排節目單，一般）</option>
              <option value="rtl">由右往左（直排節目單）</option>
            </select>
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-primary">儲存</button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="cat-title">
        <h2 id="cat-title">收藏冊分類</h2>
        <p className="muted small" style={{ margin: 0, lineHeight: 1.7 }}>
          這些是整檔節目共用的。導演、編劇多人用頓號分開。重演的作品請選首演的名稱，觀眾收藏冊的「作品」分類會把不同年份的版本歸在一起。縣市依場館自動判斷。
        </p>
        {catError && <p className="error" role="alert">{catError}</p>}
        <form action={saveCategories} className="form-grid">
          <label className="field">
            作品名稱（留白＝節目名稱《{design.title}》）
            <input name="work" defaultValue={design.work_title ?? ""} maxLength={80} list="work-titles" />
            <datalist id="work-titles">{workTitles.map((w) => <option key={w} value={w} />)}</datalist>
          </label>
          <label className="field">
            藝術節
            <select name="festival" defaultValue={design.festival ?? ""}>
              <option value="">不屬於藝術節</option>
              {FESTIVALS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="field">
            導演
            <input name="directors" defaultValue={(design.directors ?? []).join("、")} maxLength={300} />
          </label>
          <label className="field">
            編劇
            <input name="playwrights" defaultValue={(design.playwrights ?? []).join("、")} maxLength={300} />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" className="btn btn-primary">儲存</button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="current-title">
        <div className="panel-head">
          <h2 id="current-title">觀眾目前看到的版本</h2>
          {design.pdf_uploaded_at && (
            <span className="muted small">{design.pdf_filename}・{design.page_count} 頁・{formatDateTime(design.pdf_uploaded_at)}</span>
          )}
        </div>
        {pages.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>尚未上傳，觀眾目前只會看到文字版節目資訊。</p>
        ) : (
          <div className="thumbs">
            {pages.map((p) => (
              <div className="thumb" key={p.page_no}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`第 ${p.page_no} 頁`} loading="lazy" width={p.width} height={p.height} />
                <span>{p.page_no}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
