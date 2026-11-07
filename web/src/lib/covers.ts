import { randomUUID } from "node:crypto";
import type { Queryable } from "./db";
import type { FileStore } from "./storage";

/**
 * 卡面圖片：主辦方上傳的主視覺或劇照，當卡面的底圖（劇名、類型、日期疊在上面）。
 * 圖片在上傳者的瀏覽器先縮成長邊 1200px 以內的 WebP／JPEG，再送到這裡。
 * 卡面公開顯示在首頁與收藏冊，所以請劇團不要用節目單內頁。
 */

export const MAX_COVER_BYTES = 1.5 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

export class CoverError extends Error {}

/** 這個卡面版本屬於哪個組織（節目的演出團隊）；找不到回傳 null */
export async function designOrganizer(q: Queryable, designId: string): Promise<string | null> {
  if (!/^\d+$/.test(designId)) return null;
  const r = await q.query<{ organizer_id: string }>(
    `SELECT p.organizer_id FROM designs d JOIN productions p ON p.id = d.production_id WHERE d.id = $1`,
    [designId]
  );
  return r.rows[0] ? String(r.rows[0].organizer_id) : null;
}

export async function setCoverImage(q: Queryable, store: FileStore, designId: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = TYPES[contentType];
  if (!ext) throw new CoverError("圖片只接受 WebP、JPEG 或 PNG");
  if (bytes.length === 0) throw new CoverError("沒有收到圖片");
  if (bytes.length > MAX_COVER_BYTES) throw new CoverError("圖片太大，請換一張或縮小後再上傳");
  const url = await store.put(`covers/${designId}/${randomUUID()}.${ext}`, bytes, contentType);
  await q.query(`UPDATE designs SET cover_image_url = $2 WHERE id = $1`, [designId, url]);
  return url;
}

export async function clearCoverImage(q: Queryable, designId: string): Promise<void> {
  await q.query(`UPDATE designs SET cover_image_url = NULL WHERE id = $1`, [designId]);
}

export interface OrgDesign {
  designId: string;
  productionTitle: string;
  label: string;
  coverColor: string;
  coverImage: string | null;
  genre: string | null;
  companyName: string;
  firstShow: Date | null;
}

/** 主辦方後台：自己（演出團隊）每檔節目的卡面版本 */
export async function listOrgDesigns(q: Queryable, organizerId: string): Promise<OrgDesign[]> {
  const r = await q.query<{ id: string; title: string; label: string; cover_color: string; cover_image_url: string | null; genre: string | null; company_name: string; first_show: Date | null }>(
    `SELECT d.id, p.title, d.label, d.cover_color, d.cover_image_url, p.genre, p.company_name,
            (SELECT min(s.starts_at) FROM shows s WHERE s.production_id = p.id) AS first_show
       FROM designs d JOIN productions p ON p.id = d.production_id
      WHERE p.organizer_id = $1
      ORDER BY first_show DESC NULLS LAST, p.id DESC, d.id`,
    [organizerId]
  );
  return r.rows.map((x) => ({
    designId: String(x.id),
    productionTitle: x.title,
    label: x.label,
    coverColor: x.cover_color,
    coverImage: x.cover_image_url,
    genre: x.genre,
    companyName: x.company_name,
    firstShow: x.first_show ? new Date(x.first_show) : null,
  }));
}
