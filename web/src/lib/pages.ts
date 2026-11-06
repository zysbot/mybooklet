import type { Db, Queryable } from "./db";
import type { FileStore } from "./storage";

/** 一份節目單最多幾頁（劇團節目單通常不超過 50 頁，留一點餘裕） */
export const MAX_PAGES = 60;
/** 單頁圖片上限：低於 Vercel 請求上限 4.5MB */
export const MAX_PAGE_BYTES = 4 * 1024 * 1024;

const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg" };

export class PageUploadError extends Error {}

export interface PageRow {
  page_no: number;
  url: string;
  width: number;
  height: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 存一頁圖片。同一批次同一頁重送會覆蓋（網路中斷重試時用） */
export async function savePage(
  db: Db,
  store: FileStore,
  p: { designId: string; uploadId: string; pageNo: number; total: number; bytes: Uint8Array; contentType: string; width: number; height: number }
): Promise<PageRow> {
  if (!UUID.test(p.uploadId)) throw new PageUploadError("無效的上傳批次");
  if (!Number.isInteger(p.total) || p.total < 1 || p.total > MAX_PAGES) {
    throw new PageUploadError(`節目單最多 ${MAX_PAGES} 頁`);
  }
  if (!Number.isInteger(p.pageNo) || p.pageNo < 1 || p.pageNo > p.total) throw new PageUploadError("無效的頁碼");
  const ext = TYPES[p.contentType];
  if (!ext) throw new PageUploadError("只接受 WebP 或 JPEG 圖片");
  if (p.bytes.length === 0 || p.bytes.length > MAX_PAGE_BYTES) throw new PageUploadError("單頁圖片過大");
  if (!(p.width > 0 && p.height > 0 && p.width <= 6000 && p.height <= 9000)) throw new PageUploadError("無效的圖片尺寸");

  const design = await db.query(`SELECT id FROM designs WHERE id = $1`, [p.designId]);
  if (!design.rows[0]) throw new PageUploadError("找不到這個卡面版本");

  const key = `designs/${p.designId}/${p.uploadId.toLowerCase()}/${String(p.pageNo).padStart(3, "0")}.${ext}`;
  const url = await store.put(key, p.bytes, p.contentType);

  await db.query(
    `INSERT INTO design_pages (design_id, upload_id, page_no, url, width, height, bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (design_id, upload_id, page_no)
     DO UPDATE SET url = EXCLUDED.url, width = EXCLUDED.width, height = EXCLUDED.height, bytes = EXCLUDED.bytes`,
    [p.designId, p.uploadId, p.pageNo, url, Math.round(p.width), Math.round(p.height), p.bytes.length]
  );
  return { page_no: p.pageNo, url, width: Math.round(p.width), height: Math.round(p.height) };
}

/**
 * 確認上傳：每一頁都到齊，才換成觀眾看到的版本。
 * 換版本只改指標，舊批次的頁面保留，萬一要退回也找得到。
 */
export async function finalizeUpload(
  db: Db,
  p: {
    designId: string;
    uploadId: string;
    total: number;
    filename: string;
    /** 同一檔節目的其他卡面版本也使用這份節目單（通常各場次的節目單相同，只有卡面不同） */
    applyToProduction?: boolean;
  }
): Promise<{ pageCount: number; designIds: string[] }> {
  if (!UUID.test(p.uploadId)) throw new PageUploadError("無效的上傳批次");
  return db.tx(async (q) => {
    const have = await q.query<{ page_no: number }>(
      `SELECT page_no FROM design_pages WHERE design_id = $1 AND upload_id = $2 ORDER BY page_no`,
      [p.designId, p.uploadId]
    );
    const pages = have.rows.map((r) => Number(r.page_no));
    const missing = [];
    for (let i = 1; i <= p.total; i++) if (!pages.includes(i)) missing.push(i);
    if (missing.length) throw new PageUploadError(`還缺第 ${missing.slice(0, 5).join("、")} 頁，請重新上傳`);
    if (pages.length !== p.total) throw new PageUploadError("頁數不符，請重新上傳");

    let targets = [String(p.designId)];
    if (p.applyToProduction) {
      const siblings = await q.query<{ id: string }>(
        `SELECT id FROM designs WHERE production_id = (SELECT production_id FROM designs WHERE id = $1) ORDER BY id`,
        [p.designId]
      );
      targets = siblings.rows.map((r) => String(r.id));
      // 其他卡面版本共用同一批圖片（同一個網址），不重複上傳
      for (const other of targets) {
        if (other === String(p.designId)) continue;
        await q.query(
          `INSERT INTO design_pages (design_id, upload_id, page_no, url, width, height, bytes)
           SELECT $3, upload_id, page_no, url, width, height, bytes
             FROM design_pages WHERE design_id = $1 AND upload_id = $2
           ON CONFLICT (design_id, upload_id, page_no) DO NOTHING`,
          [p.designId, p.uploadId, other]
        );
      }
    }

    await q.query(
      `UPDATE designs
          SET current_upload_id = $2, page_count = $3, pdf_filename = $4, pdf_uploaded_at = now()
        WHERE id = ANY($1::bigint[])`,
      [targets, p.uploadId, p.total, p.filename.slice(0, 200)]
    );
    return { pageCount: p.total, designIds: targets };
  });
}

/** 觀眾看到的頁面：卡面版本目前使用的那一批 */
export async function getDesignPages(q: Queryable, designId: string): Promise<PageRow[]> {
  const r = await q.query<PageRow>(
    `SELECT dp.page_no, dp.url, dp.width, dp.height
       FROM designs d
       JOIN design_pages dp ON dp.design_id = d.id AND dp.upload_id = d.current_upload_id
      WHERE d.id = $1
      ORDER BY dp.page_no`,
    [designId]
  );
  return r.rows.map((x) => ({ ...x, page_no: Number(x.page_no), width: Number(x.width), height: Number(x.height) }));
}
