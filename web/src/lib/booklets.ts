import type { Queryable } from "./db";

export interface ShowInfo {
  showId: string;
  designId: string;
  pageCount: number;
  title: string;
  companyName: string;
  genre: string | null;
  venue: string;
  startsAt: Date;
  coverColor: string;
  designLabel: string;
  content: BookletContent;
  metadataUri: string | null;
  /** 翻頁方向：直排節目單由右往左翻 */
  readingDirection: "ltr" | "rtl";
}

export interface BookletContent {
  intro?: string;
  directorNote?: string;
  duration?: string;
  credits?: { role: string; names: string }[];
}

export interface CodeInfo extends ShowInfo {
  validFrom: Date;
  validTo: Date;
}

export interface BookletSummary {
  claimId: string;
  showId: string;
  title: string;
  companyName: string;
  genre: string | null;
  venue: string;
  /** 前三喜歡的名次；沒有標記為 null */
  favoriteRank: number | null;
  startsAt: Date;
  serial: number;
  coverColor: string;
  chainStatus: "pending" | "submitted" | "minted" | "failed";
}

export interface BookletDetail extends ShowInfo {
  claimId: string;
  serial: number;
  claimedAt: Date;
  chainStatus: BookletSummary["chainStatus"];
  tokenId: string | null;
  txHash: string | null;
  /** 持有者：系統化名 */
  holderName: string | null;
  /** 這份節目單的鏈上地址；上鏈前為 null */
  walletAddress: string | null;
  /** 本人隱藏了這一份（不出現在個人頁與別人的頭像列） */
  hidden: boolean;
}

// 場次的卡面：場次自己指定的版本，沒有就用節目的預設版本
const SHOW_SELECT = `
  s.id AS show_id, p.title, p.company_name, p.genre, s.venue, s.starts_at, s.metadata_uri,
  d.id AS design_id, d.page_count, d.cover_color, d.label AS design_label, d.content, d.reading_direction
  FROM shows s
  JOIN productions p ON p.id = s.production_id
  JOIN designs d ON d.id = COALESCE(s.design_id, p.default_design_id)`;

type ShowRow = {
  show_id: string;
  design_id: string;
  page_count: number;
  title: string;
  company_name: string;
  genre: string | null;
  venue: string;
  starts_at: Date;
  metadata_uri: string | null;
  cover_color: string;
  design_label: string;
  content: BookletContent | string;
  reading_direction: "ltr" | "rtl";
};

function toShowInfo(r: ShowRow): ShowInfo {
  return {
    showId: String(r.show_id),
    designId: String(r.design_id),
    pageCount: Number(r.page_count ?? 0),
    title: r.title,
    companyName: r.company_name,
    genre: r.genre,
    venue: r.venue,
    startsAt: new Date(r.starts_at),
    coverColor: r.cover_color,
    designLabel: r.design_label,
    content: typeof r.content === "string" ? JSON.parse(r.content) : (r.content ?? {}),
    metadataUri: r.metadata_uri,
    readingDirection: r.reading_direction === "rtl" ? "rtl" : "ltr",
  };
}

export async function getShowByCode(q: Queryable, code: string): Promise<CodeInfo | null> {
  const r = await q.query<ShowRow & { valid_from: Date; valid_to: Date }>(
    `SELECT cc.valid_from, cc.valid_to, ${SHOW_SELECT}
       JOIN claim_codes cc ON cc.show_id = s.id
      WHERE cc.code = $1`,
    [code]
  );
  const row = r.rows[0];
  if (!row) return null;
  return { ...toShowInfo(row), validFrom: new Date(row.valid_from), validTo: new Date(row.valid_to) };
}

export async function getShow(q: Queryable, showId: string): Promise<ShowInfo | null> {
  const r = await q.query<ShowRow>(`SELECT ${SHOW_SELECT} WHERE s.id = $1`, [showId]);
  return r.rows[0] ? toShowInfo(r.rows[0]) : null;
}

export async function listUserBooklets(q: Queryable, userId: string): Promise<BookletSummary[]> {
  const r = await q.query<ShowRow & { claim_id: string; serial: number; chain_status: BookletSummary["chainStatus"]; fav_rank: number | null }>(
    `SELECT c.id AS claim_id, c.serial, c.chain_status, f.rank AS fav_rank, ${SHOW_SELECT}
       JOIN claims c ON c.show_id = s.id
       LEFT JOIN favorites f ON f.claim_id = c.id
      WHERE c.user_id = $1
      ORDER BY s.starts_at DESC`,
    [userId]
  );
  return r.rows.map((row) => ({
    claimId: row.claim_id,
    showId: String(row.show_id),
    title: row.title,
    companyName: row.company_name,
    genre: row.genre,
    venue: row.venue,
    favoriteRank: row.fav_rank === null ? null : Number(row.fav_rank),
    startsAt: new Date(row.starts_at),
    serial: Number(row.serial),
    coverColor: row.cover_color,
    chainStatus: row.chain_status,
  }));
}

/** 只回傳屬於這位觀眾的節目單 */
export async function getBooklet(q: Queryable, claimId: string, userId: string): Promise<BookletDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(claimId)) return null;
  const r = await q.query<
    ShowRow & {
      claim_id: string;
      serial: number;
      claimed_at: Date;
      chain_status: BookletSummary["chainStatus"];
      token_id: string | null;
      tx_hash: string | null;
      pseudonym: string | null;
      recipient_address: string | null;
      hidden: boolean;
    }
  >(
    `SELECT c.id AS claim_id, c.serial, c.claimed_at, c.chain_status, c.token_id, c.tx_hash, c.recipient_address, c.hidden,
            u.pseudonym, ${SHOW_SELECT}
       JOIN claims c ON c.show_id = s.id
       JOIN users u ON u.id = c.user_id
      WHERE c.id = $1 AND c.user_id = $2`,
    [claimId, userId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...toShowInfo(row),
    claimId: row.claim_id,
    serial: Number(row.serial),
    claimedAt: new Date(row.claimed_at),
    chainStatus: row.chain_status,
    tokenId: row.token_id === null ? null : String(row.token_id),
    txHash: row.tx_hash,
    holderName: row.pseudonym,
    walletAddress: row.recipient_address,
    hidden: Boolean(row.hidden),
  };
}

export interface HomeProduction {
  productionId: string;
  title: string;
  companyName: string;
  genre: string | null;
  venue: string;
  /** 即將演出：最近一場；已演出：最後一場 */
  startsAt: Date;
  upcoming: boolean;
  /** 一律用節目的預設卡面（特殊卡面不公開） */
  coverColor: string;
}

/** 首頁「這些演出有吾冊節目單」：先列即將演出（由近到遠），再補最近演完的，最多 limit 檔 */
export async function listHomeProductions(q: Queryable, now: Date = new Date(), limit = 8): Promise<HomeProduction[]> {
  const r = await q.query<{ id: string; title: string; company_name: string; genre: string | null; cover_color: string; next_at: Date | null; next_venue: string | null; last_at: Date | null; last_venue: string | null }>(
    `SELECT p.id, p.title, p.company_name, p.genre, d.cover_color,
            nx.starts_at AS next_at, nx.venue AS next_venue, ls.starts_at AS last_at, ls.venue AS last_venue
       FROM productions p
       JOIN designs d ON d.id = p.default_design_id
       LEFT JOIN LATERAL (SELECT starts_at, venue FROM shows WHERE production_id = p.id AND starts_at >= $1 ORDER BY starts_at LIMIT 1) nx ON TRUE
       LEFT JOIN LATERAL (SELECT starts_at, venue FROM shows WHERE production_id = p.id AND starts_at < $1 ORDER BY starts_at DESC LIMIT 1) ls ON TRUE
      WHERE nx.starts_at IS NOT NULL OR ls.starts_at IS NOT NULL`,
    [now]
  );
  const rows = r.rows.map((x) => {
    const upcoming = x.next_at !== null;
    return {
      productionId: String(x.id),
      title: x.title,
      companyName: x.company_name,
      genre: x.genre,
      venue: (upcoming ? x.next_venue : x.last_venue) ?? "",
      startsAt: new Date((upcoming ? x.next_at : x.last_at)!),
      upcoming,
      coverColor: x.cover_color,
    };
  });
  const up = rows.filter((x) => x.upcoming).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const past = rows.filter((x) => !x.upcoming).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return [...up, ...past].slice(0, limit);
}
