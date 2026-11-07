import { randomBytes } from "node:crypto";
import type { Db, Queryable } from "./db";
import { isFestival, isGenre, isVenue } from "./catalog";

export class ProductionError extends Error {}

export interface DesignInput {
  key: string;
  label: string;
  coverColor: string;
}

export interface ShowInput {
  /** ISO 時間，含時區，例如 2026-11-14T19:30:00+08:00 */
  startsAt: string;
  venue: string;
  /** 卡面版本的 key；不填用預設 */
  design?: string;
  /** 領取上限（通常是售票數）；不填表示不限 */
  maxClaims?: number | null;
  /** 開放領取時間；不填為開演前 90 分鐘到開演後 4 小時 */
  opensAt?: string;
  closesAt?: string;
}

export interface ProductionInput {
  title: string;
  companyName: string;
  genre: string;
  /** 製作公司（與演出團隊不同時才填）；共同製作用頓號分開 */
  producerName?: string;
  /** 發放單位的名稱：演出團隊、其中一家製作公司或其中一個場館；不填就是演出團隊 */
  issuer?: string;
  /** 作品名稱：重演時填首演的名稱；不填就是節目名稱 */
  workTitle?: string;
  /** 藝術節或系列；不屬於藝術節就不填 */
  festival?: string;
  /** 導演、編劇：多人用頓號或逗號分開 */
  directors?: string;
  playwrights?: string;
  intro?: string;
  designs: DesignInput[];
  defaultDesign: string;
  shows: ShowInput[];
}

export interface CreatedShow {
  showId: string;
  code: string;
  startsAt: Date;
  venue: string;
  designLabel: string;
}

export interface CreatedProduction {
  productionId: string;
  existing: boolean;
  defaultDesignId: string;
  /** 預設卡面目前已發布的節目單頁數 */
  defaultPageCount: number;
  designs: { id: string; key: string; label: string }[];
  shows: CreatedShow[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function parseTime(s: string | undefined, what: string): Date {
  const d = new Date(s ?? "");
  if (!s || Number.isNaN(d.getTime())) throw new ProductionError(`${what}格式不正確`);
  return d;
}

/** 不易看錯的英數字：去掉 0/O、1/I/L */
export function newClaimCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  return Array.from(randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
}

export function validateProduction(input: ProductionInput): void {
  const title = input.title?.trim();
  const company = input.companyName?.trim();
  if (!title || title.length > 80) throw new ProductionError("請填寫節目名稱（80 字以內）");
  if (!company || company.length > 80) throw new ProductionError("請填寫演出團隊（80 字以內）");
  if (!isGenre(input.genre)) throw new ProductionError("請從選單選擇類型");
  const producers = parseOrgNames(input.producerName ?? "");
  const issuer = input.issuer?.trim();
  if (issuer && issuer !== company && !producers.includes(issuer) && !(input.shows ?? []).some((s) => s.venue === issuer)) {
    throw new ProductionError("發放單位必須是演出團隊、製作公司或其中一個場館");
  }
  if ((input.workTitle ?? "").length > 80) throw new ProductionError("作品名稱請在 80 字以內");
  if (input.festival && !isFestival(input.festival)) throw new ProductionError("藝術節請從選單選擇");
  parseNames(input.directors ?? "");
  parseNames(input.playwrights ?? "");
  if ((input.intro ?? "").length > 2000) throw new ProductionError("節目介紹請在 2000 字以內");

  if (!Array.isArray(input.designs) || input.designs.length < 1 || input.designs.length > 6) {
    throw new ProductionError("卡面版本需要 1 到 6 個");
  }
  const keys = new Set<string>();
  for (const d of input.designs) {
    if (!d.key || keys.has(d.key)) throw new ProductionError("卡面版本重複");
    keys.add(d.key);
    if (!d.label?.trim() || d.label.length > 20) throw new ProductionError("請填寫卡面版本名稱（20 字以內）");
    if (!HEX.test(d.coverColor)) throw new ProductionError("卡面顏色格式不正確");
  }
  if (!keys.has(input.defaultDesign)) throw new ProductionError("找不到預設卡面");

  if (!Array.isArray(input.shows) || input.shows.length < 1 || input.shows.length > 30) {
    throw new ProductionError("場次需要 1 到 30 場");
  }
  input.shows.forEach((s, i) => {
    const n = `第 ${i + 1} 場的`;
    const start = parseTime(s.startsAt, `${n}演出時間`);
    if (!isVenue(s.venue)) throw new ProductionError(`${n}場館請從選單選擇`);
    if (s.design && !keys.has(s.design)) throw new ProductionError(`${n}卡面版本不存在`);
    if (s.maxClaims !== undefined && s.maxClaims !== null && !(Number.isInteger(s.maxClaims) && s.maxClaims >= 1 && s.maxClaims <= 100000)) {
      throw new ProductionError(`${n}領取上限需為 1 到 100000 的整數`);
    }
    const opens = s.opensAt ? parseTime(s.opensAt, `${n}開放領取時間`) : new Date(start.getTime() - 90 * 60_000);
    const closes = s.closesAt ? parseTime(s.closesAt, `${n}截止領取時間`) : new Date(start.getTime() + 240 * 60_000);
    if (closes <= opens) throw new ProductionError(`${n}截止領取時間要晚於開放時間`);
  });
}

/**
 * 依名稱找組織，找不到才新增。同一個名稱只對應一個組織，不分身分：
 * 場館自製節目時，「場館」和「演出團隊」是同一個組織，工作人員與方案只要設定一次。
 * 同名的多個舊組織（11/07 以前依身分分開建立）優先沿用身分相同的那一個。
 */
async function orgId(q: Queryable, name: string, kind: "company" | "producer" | "venue"): Promise<string> {
  const found = await q.query<{ id: string }>(`SELECT id FROM organizers WHERE name = $1 ORDER BY (kind = $2) DESC, id LIMIT 1`, [name, kind]);
  if (found.rows[0]) return String(found.rows[0].id);
  const r = await q.query<{ id: string }>(`INSERT INTO organizers (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind]);
  return String(r.rows[0].id);
}

async function describe(q: Queryable, productionId: string, existing: boolean): Promise<CreatedProduction> {
  const p = await q.query<{ default_design_id: string; page_count: number }>(
    `SELECT p.default_design_id, d.page_count FROM productions p JOIN designs d ON d.id = p.default_design_id WHERE p.id = $1`,
    [productionId]
  );
  const designs = await q.query<{ id: string; label: string }>(`SELECT id, label FROM designs WHERE production_id = $1 ORDER BY id`, [productionId]);
  const shows = await q.query<{ id: string; code: string; starts_at: Date; venue: string; label: string }>(
    `SELECT s.id, s.starts_at, s.venue, d.label,
            (SELECT code FROM claim_codes cc WHERE cc.show_id = s.id ORDER BY cc.id LIMIT 1) AS code
       FROM shows s JOIN productions p ON p.id = s.production_id
       JOIN designs d ON d.id = COALESCE(s.design_id, p.default_design_id)
      WHERE s.production_id = $1 ORDER BY s.starts_at`,
    [productionId]
  );
  return {
    productionId,
    existing,
    defaultDesignId: String(p.rows[0].default_design_id),
    defaultPageCount: Number(p.rows[0].page_count ?? 0),
    designs: designs.rows.map((d) => ({ id: String(d.id), key: String(d.id), label: d.label })),
    shows: shows.rows.map((s) => ({ showId: String(s.id), code: s.code, startsAt: new Date(s.starts_at), venue: s.venue, designLabel: s.label })),
  };
}

/**
 * 上架一檔節目：建立（或沿用）劇團、製作公司、場館，以及節目、卡面版本、場次與領取碼。
 * dedupe：同一演出團隊已有同名節目時，直接回傳既有的（測試資料重複匯入用）。
 */
export async function createProduction(
  db: Db,
  input: ProductionInput,
  siteUrl: string,
  opts: { dedupe?: boolean } = {}
): Promise<CreatedProduction> {
  validateProduction(input);
  const title = input.title.trim();
  const company = input.companyName.trim();

  if (opts.dedupe) {
    const found = await db.query<{ id: string }>(
      `SELECT id FROM productions WHERE title = $1 AND company_name = $2 ORDER BY id LIMIT 1`,
      [title, company]
    );
    if (found.rows[0]) return describe(db, String(found.rows[0].id), true);
  }

  const productionId = await db.tx(async (q) => {
    const companyId = await orgId(q, company, "company");
    const producerIds: string[] = [];
    for (const name of parseOrgNames(input.producerName ?? "")) {
      const oid = await orgId(q, name, "producer");
      if (oid !== companyId && !producerIds.includes(oid)) producerIds.push(oid);
    }
    const prod = await q.query<{ id: string }>(
      `INSERT INTO productions (organizer_id, title, company_name, genre, producer_id, work_title, festival, directors, playwrights)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [companyId, title, company, input.genre, producerIds[0] ?? null, normalizeWork(input.workTitle, title), input.festival || null,
       parseNames(input.directors ?? ""), parseNames(input.playwrights ?? "")]
    );
    const pid = String(prod.rows[0].id);
    for (const oid of producerIds) {
      await q.query(`INSERT INTO production_producers (production_id, organizer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [pid, oid]);
    }

    const designIds: Record<string, string> = {};
    for (const d of input.designs) {
      const r = await q.query<{ id: string }>(
        `INSERT INTO designs (production_id, label, cover_color, content) VALUES ($1, $2, $3, $4) RETURNING id`,
        [pid, d.label.trim(), d.coverColor, JSON.stringify(input.intro?.trim() ? { intro: input.intro.trim() } : {})]
      );
      designIds[d.key] = String(r.rows[0].id);
    }
    await q.query(`UPDATE productions SET default_design_id = $2 WHERE id = $1`, [pid, designIds[input.defaultDesign]]);

    for (const s of input.shows) {
      const start = new Date(s.startsAt);
      const venueId = await orgId(q, s.venue, "venue");
      const design = s.design && s.design !== input.defaultDesign ? designIds[s.design] : null;
      const show = await q.query<{ id: string }>(
        `INSERT INTO shows (production_id, design_id, starts_at, venue, venue_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [pid, design, start, s.venue, venueId]
      );
      const showId = String(show.rows[0].id);
      await q.query(`UPDATE shows SET metadata_uri = $2 WHERE id = $1`, [showId, `${siteUrl}/api/metadata/${showId}`]);
      const opens = s.opensAt ? new Date(s.opensAt) : new Date(start.getTime() - 90 * 60_000);
      const closes = s.closesAt ? new Date(s.closesAt) : new Date(start.getTime() + 240 * 60_000);
      await q.query(
        `INSERT INTO claim_codes (show_id, code, valid_from, valid_to, max_claims) VALUES ($1, $2, $3, $4, $5)`,
        [showId, newClaimCode(), opens, closes, s.maxClaims ?? null]
      );
    }
    // 發放單位：不是演出團隊本身時才存（場館這時已經建立好了）
    const issuer = input.issuer?.trim();
    if (issuer && issuer !== company) {
      const issuerId = await orgId(q, issuer, parseOrgNames(input.producerName ?? "").includes(issuer) ? "producer" : "venue");
      if (issuerId !== companyId) await q.query(`UPDATE productions SET issuer_id = $2 WHERE id = $1`, [pid, issuerId]);
    }
    return pid;
  });

  return describe(db, productionId, false);
}

/** 作品名稱與節目名稱相同或空白時存 NULL（就是節目名稱本身） */
function normalizeWork(work: string | undefined, title: string): string | null {
  const w = (work ?? "").trim();
  return w && w !== title ? w : null;
}

/** 製作公司名稱：用頓號或逗號分開（共同製作），最多 4 家、每家 80 字以內 */
export function parseOrgNames(raw: string): string[] {
  const names = [...new Set(raw.split(/[、,，;；\n]+/).map((x) => x.trim()).filter(Boolean))];
  if (names.length > 4) throw new ProductionError("製作公司最多填 4 家");
  if (names.some((n) => n.length > 80)) throw new ProductionError("製作公司名稱請在 80 字以內");
  return names;
}

/** 「甲、乙, 丙」→ ["甲", "乙", "丙"]；最多 8 人，每人 40 字以內 */
export function parseNames(raw: string): string[] {
  const names = [...new Set(raw.split(/[、,，;；\/／\n]+/).map((x) => x.trim()).filter(Boolean))];
  if (names.length > 8) throw new ProductionError("每個職務最多填 8 人");
  if (names.some((n) => n.length > 40)) throw new ProductionError("姓名請在 40 字以內");
  return names;
}

/** 修改既有節目的導演、編劇（營運後台） */
export async function setProductionCredits(q: Queryable, productionId: string, directors: string, playwrights: string): Promise<void> {
  await q.query(`UPDATE productions SET directors = $2, playwrights = $3 WHERE id = $1`, [productionId, parseNames(directors), parseNames(playwrights)]);
}

/** 修改既有節目的作品名稱與藝術節（營運後台） */
export async function setProductionCategories(q: Queryable, productionId: string, workTitle: string, festival: string): Promise<void> {
  if (workTitle.length > 80) throw new ProductionError("作品名稱請在 80 字以內");
  if (festival && !isFestival(festival)) throw new ProductionError("藝術節請從選單選擇");
  const p = await q.query<{ title: string }>(`SELECT title FROM productions WHERE id = $1`, [productionId]);
  if (!p.rows[0]) throw new ProductionError("找不到節目");
  await q.query(`UPDATE productions SET work_title = $2, festival = $3 WHERE id = $1`, [
    productionId,
    normalizeWork(workTitle, p.rows[0].title),
    festival || null,
  ]);
}

/** 已有的作品名稱，給後台下拉提示用（避免打錯字拆成兩部作品） */
export async function listWorkTitles(q: Queryable): Promise<string[]> {
  const r = await q.query<{ w: string }>(`SELECT DISTINCT COALESCE(NULLIF(work_title, ''), title) AS w FROM productions ORDER BY w`);
  return r.rows.map((x) => x.w);
}

/** 上架表單的選單：已經有的組織名稱（劇團、製作公司分開列；同一個組織可能兩邊都有） */
export async function listOrganizerNames(q: Queryable): Promise<{ companies: string[]; producers: string[] }> {
  const r = await q.query<{ name: string; company: boolean; producer: boolean }>(
    `SELECT o.name,
            o.kind = 'company' OR EXISTS (SELECT 1 FROM productions p WHERE p.organizer_id = o.id) AS company,
            o.kind = 'producer' OR EXISTS (SELECT 1 FROM production_producers pp WHERE pp.organizer_id = o.id) AS producer
       FROM organizers o ORDER BY o.name`
  );
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    companies: uniq(r.rows.filter((x) => x.company).map((x) => x.name)),
    producers: uniq(r.rows.filter((x) => x.producer).map((x) => x.name)),
  };
}

/** 把場次的內容網址寫進合約；已寫過的略過。回傳每個場次的結果。 */
export async function configureShowsOnChain(
  db: Db,
  showIds: string[],
  setShowURI: (showId: bigint, uri: string) => Promise<string>
): Promise<{ showId: string; ok: boolean; error?: string }[]> {
  const results = [];
  for (const id of showIds) {
    const r = await db.query<{ metadata_uri: string | null; chain_configured: boolean }>(
      `SELECT metadata_uri, chain_configured FROM shows WHERE id = $1`,
      [id]
    );
    const show = r.rows[0];
    if (!show) {
      results.push({ showId: id, ok: false, error: "找不到場次" });
      continue;
    }
    if (show.chain_configured) {
      results.push({ showId: id, ok: true });
      continue;
    }
    try {
      await setShowURI(BigInt(id), show.metadata_uri!);
      await db.query(`UPDATE shows SET chain_configured = TRUE WHERE id = $1`, [id]);
      results.push({ showId: id, ok: true });
    } catch (err) {
      results.push({ showId: id, ok: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    }
  }
  return results;
}
