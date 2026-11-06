import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getDesignPages, MAX_PAGES } from "@/lib/pages";
import { formatDateTime } from "@/lib/format";
import { PdfUploader } from "./PdfUploader";
import "../../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "上傳節目單｜吾冊後台", robots: { index: false } };

export default async function DesignUploadPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();

  const db = getDb();
  const r = await db.query<{ label: string; cover_color: string; title: string; company_name: string; pdf_filename: string | null; pdf_uploaded_at: Date | null; page_count: number }>(
    `SELECT d.label, d.cover_color, d.pdf_filename, d.pdf_uploaded_at, d.page_count, p.title, p.company_name
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
