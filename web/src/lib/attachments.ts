import { randomUUID } from "node:crypto";
import type { Db, Queryable } from "./db";
import type { FileStore } from "./storage";
import { ATTACHMENT_LIMIT, getPlan, taipeiToday } from "./plans";

/**
 * 主辦方附加文宣：主辦方放在自己節目單下方給觀眾的資料（下一檔演出、優惠、問卷等）。
 * - 只有領過這檔節目的觀眾看得到；不上鏈、不算收藏、不推播。
 * - 每檔節目同時顯示的則數依方案（ATTACHMENT_LIMIT）。
 * - 外部連結只接受 https，觀眾點了先看到「即將前往哪個網站」。
 * - 只記總點擊數，不記是誰點的。
 */

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const FILE_TYPES: Record<string, { ext: string; kind: "image" | "pdf" }> = {
  "image/jpeg": { ext: "jpg", kind: "image" },
  "image/png": { ext: "png", kind: "image" },
  "image/webp": { ext: "webp", kind: "image" },
  "application/pdf": { ext: "pdf", kind: "pdf" },
};

export class AttachmentError extends Error {}

export interface Attachment {
  id: string;
  productionId: string;
  title: string;
  note: string | null;
  fileUrl: string | null;
  fileKind: "image" | "pdf" | null;
  linkUrl: string | null;
  /** 顯示到這天（YYYY-MM-DD，台北日期，當天仍顯示） */
  showUntil: string | null;
  clicks: number;
  createdAt: Date;
}

type Row = {
  id: string;
  production_id: string;
  title: string;
  note: string | null;
  file_url: string | null;
  file_kind: "image" | "pdf" | null;
  link_url: string | null;
  show_until: string | null;
  clicks: number;
  created_at: Date;
};

const COLUMNS = `a.id, a.production_id, a.title, a.note, a.file_url, a.file_kind, a.link_url,
  to_char(a.show_until, 'YYYY-MM-DD') AS show_until, a.clicks, a.created_at`;

function toAttachment(r: Row): Attachment {
  return {
    id: String(r.id),
    productionId: String(r.production_id),
    title: r.title,
    note: r.note,
    fileUrl: r.file_url,
    fileKind: r.file_kind,
    linkUrl: r.link_url,
    showUntil: r.show_until,
    clicks: Number(r.clicks),
    createdAt: new Date(r.created_at),
  };
}

/** 還在顯示中：沒有移除、沒有過期 */
const ACTIVE = `a.removed_at IS NULL AND (a.show_until IS NULL OR a.show_until >= $2::date)`;

/** 只接受 https 的完整網址 */
export function normalizeLink(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new AttachmentError("連結格式不正確，請貼上完整網址（https:// 開頭）");
  }
  if (u.protocol !== "https:") throw new AttachmentError("連結只接受 https:// 開頭的網址");
  if (u.username || u.password) throw new AttachmentError("連結格式不正確");
  if (u.href.length > 500) throw new AttachmentError("連結太長");
  return u.href;
}

/** 觀眾看到的：這檔節目目前顯示中的文宣 */
export async function listActiveAttachments(q: Queryable, productionId: string, now: Date = new Date()): Promise<Attachment[]> {
  const r = await q.query<Row>(
    `SELECT ${COLUMNS} FROM attachments a WHERE a.production_id = $1 AND ${ACTIVE} ORDER BY a.created_at, a.id`,
    [productionId, taipeiToday(now)]
  );
  return r.rows.map(toAttachment);
}

export interface OrgProductionAttachments {
  productionId: string;
  title: string;
  /** 最後一場的演出時間，用來排序 */
  lastShow: Date | null;
  active: Attachment[];
  expired: Attachment[];
}

/** 主辦方後台：自己（演出團隊）的每檔節目與它的文宣 */
export async function listOrgAttachments(q: Queryable, organizerId: string, now: Date = new Date()): Promise<OrgProductionAttachments[]> {
  const prods = await q.query<{ id: string; title: string; last_show: Date | null }>(
    `SELECT p.id, p.title, (SELECT max(s.starts_at) FROM shows s WHERE s.production_id = p.id) AS last_show
       FROM productions p WHERE p.organizer_id = $1 ORDER BY last_show DESC NULLS LAST, p.id DESC`,
    [organizerId]
  );
  if (!prods.rows.length) return [];
  const today = taipeiToday(now);
  const atts = await q.query<Row>(
    `SELECT ${COLUMNS} FROM attachments a
      WHERE a.production_id = ANY($1::bigint[]) AND a.removed_at IS NULL ORDER BY a.created_at, a.id`,
    [prods.rows.map((p) => p.id)]
  );
  return prods.rows.map((p) => {
    const mine = atts.rows.filter((a) => String(a.production_id) === String(p.id)).map(toAttachment);
    return {
      productionId: String(p.id),
      title: p.title,
      lastShow: p.last_show ? new Date(p.last_show) : null,
      active: mine.filter((a) => !a.showUntil || a.showUntil >= today),
      expired: mine.filter((a) => a.showUntil && a.showUntil < today),
    };
  });
}

export interface NewAttachment {
  organizerId: string;
  productionId: string;
  title: string;
  note?: string;
  link?: string;
  /** YYYY-MM-DD，空白表示不設期限 */
  showUntil?: string;
  file?: { bytes: Uint8Array; contentType: string } | null;
  /** 誰新增的（工作帳號 Email 或「營運方」） */
  actor: string;
}

export async function addAttachment(db: Db, store: FileStore, input: NewAttachment, now: Date = new Date()): Promise<Attachment> {
  const title = input.title.trim();
  if (!title || title.length > 40) throw new AttachmentError("請填寫標題（40 字以內）");
  const note = (input.note ?? "").trim();
  if (note.length > 120) throw new AttachmentError("說明請在 120 字以內");
  const link = normalizeLink(input.link ?? "");
  const until = (input.showUntil ?? "").trim() || null;
  if (until) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(new Date(until).getTime())) throw new AttachmentError("顯示期限的日期格式不正確");
    if (until < taipeiToday(now)) throw new AttachmentError("顯示期限不能早於今天");
  }
  const file = input.file && input.file.bytes.length > 0 ? input.file : null;
  const type = file ? FILE_TYPES[file.contentType] : null;
  if (file && !type) throw new AttachmentError("檔案只接受 JPG、PNG、WebP 圖片或 PDF");
  if (file && file.bytes.length > MAX_ATTACHMENT_BYTES) throw new AttachmentError("檔案請在 4 MB 以內");
  if (!file && !link) throw new AttachmentError("請上傳圖片或 PDF，或填寫連結（至少一項）");

  const plan = await getPlan(db, input.organizerId, now);
  if (!plan) throw new AttachmentError("找不到組織");
  const limit = ATTACHMENT_LIMIT[plan.effective];

  // 先檢查一次，避免超過則數還上傳檔案
  await checkRoom(db, input.organizerId, input.productionId, limit, now);
  const fileUrl = file && type ? await store.put(`attachments/${input.productionId}/${randomUUID()}.${type.ext}`, file.bytes, file.contentType) : null;

  return db.tx(async (q) => {
    // 鎖住這檔節目，兩個人同時新增也不會超過則數
    await q.query(`SELECT id FROM productions WHERE id = $1 FOR UPDATE`, [input.productionId]);
    await checkRoom(q, input.organizerId, input.productionId, limit, now);
    const r = await q.query<Row>(
      `INSERT INTO attachments (production_id, title, note, file_url, file_kind, link_url, show_until, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, production_id, title, note, file_url, file_kind, link_url, to_char(show_until, 'YYYY-MM-DD') AS show_until, clicks, created_at`,
      [input.productionId, title, note || null, fileUrl, type?.kind ?? null, link, until, input.actor]
    );
    return toAttachment(r.rows[0]);
  });
}

async function checkRoom(q: Queryable, organizerId: string, productionId: string, limit: number, now: Date) {
  const own = await q.query(`SELECT 1 FROM productions WHERE id = $1 AND organizer_id = $2`, [productionId, organizerId]);
  if (!own.rows.length) throw new AttachmentError("找不到這檔節目");
  const n = await q.query<{ n: string }>(
    `SELECT count(*) AS n FROM attachments a WHERE a.production_id = $1 AND ${ACTIVE}`,
    [productionId, taipeiToday(now)]
  );
  if (Number(n.rows[0].n) >= limit) {
    throw new AttachmentError(
      limit === ATTACHMENT_LIMIT.free
        ? `免費方案每檔節目可以附 ${limit} 則文宣，請先移除舊的，或洽詢合作方案`
        : `每檔節目最多同時附 ${limit} 則文宣，請先移除舊的`
    );
  }
}

/** 移除（觀眾立刻看不到）；只能移除自己組織的。回傳是否成功 */
export async function removeAttachment(q: Queryable, organizerId: string, attachmentId: string): Promise<boolean> {
  if (!/^\d+$/.test(attachmentId)) return false;
  const r = await q.query(
    `UPDATE attachments a SET removed_at = now()
       FROM productions p
      WHERE a.id = $1 AND p.id = a.production_id AND p.organizer_id = $2 AND a.removed_at IS NULL
      RETURNING a.id`,
    [attachmentId, organizerId]
  );
  return r.rows.length > 0;
}

/** 觀眾點開：必須領過這檔節目，且文宣還在顯示中 */
export async function getAttachmentForViewer(q: Queryable, attachmentId: string, userId: string, now: Date = new Date()): Promise<Attachment | null> {
  if (!/^\d+$/.test(attachmentId)) return null;
  const r = await q.query<Row>(
    `SELECT ${COLUMNS} FROM attachments a
      WHERE a.id = $1 AND ${ACTIVE}
        AND EXISTS (SELECT 1 FROM claims c JOIN shows s ON s.id = c.show_id WHERE c.user_id = $3 AND s.production_id = a.production_id)`,
    [attachmentId, taipeiToday(now), userId]
  );
  return r.rows[0] ? toAttachment(r.rows[0]) : null;
}

/** 點擊數＋1（不記是誰） */
export async function countClick(q: Queryable, attachmentId: string): Promise<void> {
  await q.query(`UPDATE attachments SET clicks = clicks + 1 WHERE id = $1`, [attachmentId]);
}

/** 給觀眾看的網域名稱，例如 www.example.com */
export function linkHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
