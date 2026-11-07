import type { Queryable } from "./db";
import type { OrgKind } from "./insights";

/**
 * 組織在節目裡的身分。一個組織可以同時有好幾種（例如場館自製節目：既是場館也是演出團隊）。
 *
 * - 演出團隊：productions.organizer_id
 * - 製作公司：production_producers（共同製作可以有多家）
 * - 場館：shows.venue_id（巡演時每場各自的場館）
 * - 發放單位：productions.issuer_id，NULL＝演出團隊。付費方案、免費 50 份額度、卡面與附加文宣都歸它。
 */

/** SQL：這檔節目的發放單位（p 是 productions 的別名） */
export const ISSUER_SQL = "COALESCE(p.issuer_id, p.organizer_id)";

/**
 * SQL 條件：場次屬於這個組織（p 是 productions、s 是 shows 的別名；param 是組織 id 的參數）。
 * 劇團看自己演出的全部場次；製作公司看自己製作的場次（可跨多個劇團）；場館只看在本館演出的場次。
 */
export function scopeSql(param = "$1"): string {
  return `(p.organizer_id = ${param} OR s.venue_id = ${param}
    OR EXISTS (SELECT 1 FROM production_producers pp WHERE pp.production_id = p.id AND pp.organizer_id = ${param}))`;
}

export interface OrgRoles {
  company: boolean;
  producer: boolean;
  venue: boolean;
  /** 至少一檔節目由它發放 */
  issuer: boolean;
}

export async function getOrgRoles(q: Queryable, organizerId: string): Promise<OrgRoles> {
  const r = await q.query<{ company: boolean; producer: boolean; venue: boolean; issuer: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM productions WHERE organizer_id = $1) AS company,
            EXISTS (SELECT 1 FROM production_producers WHERE organizer_id = $1) AS producer,
            EXISTS (SELECT 1 FROM shows WHERE venue_id = $1) AS venue,
            EXISTS (SELECT 1 FROM productions p WHERE ${ISSUER_SQL} = $1) AS issuer`,
    [organizerId]
  );
  const x = r.rows[0];
  return { company: Boolean(x.company), producer: Boolean(x.producer), venue: Boolean(x.venue), issuer: Boolean(x.issuer) };
}

/** 身分的中文標示，例如「演出團隊・場館」；還沒出現在任何節目時用主要身分 */
export function rolesLabel(roles: OrgRoles, kind: OrgKind): string {
  const labels = [roles.company && "演出團隊", roles.producer && "製作公司", roles.venue && "場館"].filter(Boolean) as string[];
  if (labels.length === 0) return { company: "演出團隊", producer: "製作公司", venue: "場館" }[kind];
  return labels.join("・");
}

export class RoleError extends Error {}

export interface Party {
  id: string;
  name: string;
  /** 這個組織在這檔節目裡的身分，例如「演出團隊」「製作公司・場館」 */
  roleLabel: string;
  isIssuer: boolean;
}

/** 這檔節目的所有參與組織（演出團隊、製作公司、各場次的場館），發放單位從中挑選 */
export async function productionParties(q: Queryable, productionId: string): Promise<Party[]> {
  const r = await q.query<{ id: string; name: string; company: boolean; producer: boolean; venue: boolean; issuer: boolean }>(
    `WITH parties AS (
       SELECT organizer_id AS id, 'company' AS role FROM productions WHERE id = $1
       UNION SELECT organizer_id, 'producer' FROM production_producers WHERE production_id = $1
       UNION SELECT venue_id, 'venue' FROM shows WHERE production_id = $1 AND venue_id IS NOT NULL
     )
     SELECT o.id, o.name,
            bool_or(pa.role = 'company') AS company, bool_or(pa.role = 'producer') AS producer, bool_or(pa.role = 'venue') AS venue,
            bool_or(o.id = (SELECT ${ISSUER_SQL} FROM productions p WHERE p.id = $1)) AS issuer
       FROM parties pa JOIN organizers o ON o.id = pa.id
      GROUP BY o.id, o.name
      ORDER BY bool_or(pa.role = 'company') DESC, bool_or(pa.role = 'producer') DESC, o.name`,
    [productionId]
  );
  return r.rows.map((x) => ({
    id: String(x.id),
    name: x.name,
    roleLabel: [x.company && "演出團隊", x.producer && "製作公司", x.venue && "場館"].filter(Boolean).join("・"),
    isIssuer: Boolean(x.issuer),
  }));
}

/** 改發放單位：只能是這檔節目的參與組織之一；選演出團隊本身時存 NULL */
export async function setIssuer(q: Queryable, productionId: string, organizerId: string): Promise<void> {
  const parties = await productionParties(q, productionId);
  if (!parties.some((p) => p.id === organizerId)) throw new RoleError("發放單位必須是這檔節目的演出團隊、製作公司或場館");
  await q.query(`UPDATE productions SET issuer_id = NULLIF($2::bigint, organizer_id) WHERE id = $1`, [productionId, organizerId]);
}

export interface OrgProduction {
  productionId: string;
  title: string;
  companyName: string;
  roleLabel: string;
  isIssuer: boolean;
  shows: number;
  claims: number;
}

/** 這個組織參與的節目（營運後台的組織管理頁用） */
export async function listOrgProductions(q: Queryable, organizerId: string): Promise<OrgProduction[]> {
  const r = await q.query<{ id: string; title: string; company_name: string; company: boolean; producer: boolean; venue: boolean; issuer: boolean; shows: string; claims: string }>(
    `SELECT p.id, p.title, p.company_name,
            p.organizer_id = $1 AS company,
            EXISTS (SELECT 1 FROM production_producers pp WHERE pp.production_id = p.id AND pp.organizer_id = $1) AS producer,
            EXISTS (SELECT 1 FROM shows s WHERE s.production_id = p.id AND s.venue_id = $1) AS venue,
            ${ISSUER_SQL} = $1 AS issuer,
            (SELECT count(*) FROM shows s WHERE s.production_id = p.id AND ${scopeSql()}) AS shows,
            (SELECT count(*) FROM claims c JOIN shows s ON s.id = c.show_id WHERE s.production_id = p.id AND ${scopeSql()}) AS claims
       FROM productions p
      WHERE p.organizer_id = $1 OR ${ISSUER_SQL} = $1
         OR EXISTS (SELECT 1 FROM production_producers pp WHERE pp.production_id = p.id AND pp.organizer_id = $1)
         OR EXISTS (SELECT 1 FROM shows s WHERE s.production_id = p.id AND s.venue_id = $1)
      ORDER BY p.id DESC`,
    [organizerId]
  );
  return r.rows.map((x) => ({
    productionId: String(x.id),
    title: x.title,
    companyName: x.company_name,
    roleLabel: [x.company && "演出團隊", x.producer && "製作公司", x.venue && "場館"].filter(Boolean).join("・"),
    isIssuer: Boolean(x.issuer),
    shows: Number(x.shows),
    claims: Number(x.claims),
  }));
}

export interface AdminOrgRow {
  id: string;
  name: string;
  kind: OrgKind;
  roles: OrgRoles;
  /** 演出的節目數（演出團隊） */
  asCompany: number;
  /** 製作的節目數、合作過的劇團數（製作公司） */
  asProducer: number;
  producerCompanies: number;
  /** 在本館演出的節目數、場次數（場館） */
  asVenue: number;
  venueShows: number;
  /** 由它發放的節目數 */
  issued: number;
  /** 它看得到的範圍內，總共領取了幾份 */
  claims: number;
  members: number;
}

/** 營運後台首頁：所有組織與各身分的數字（一次查完） */
export async function listOrgsForAdmin(q: Queryable): Promise<AdminOrgRow[]> {
  const r = await q.query<{
    id: string; name: string; kind: OrgKind; as_company: string; as_producer: string; producer_companies: string;
    as_venue: string; venue_shows: string; issued: string; claims: string; members: string;
  }>(
    `SELECT o.id, o.name, o.kind,
            (SELECT count(*) FROM productions p WHERE p.organizer_id = o.id) AS as_company,
            (SELECT count(*) FROM production_producers pp WHERE pp.organizer_id = o.id) AS as_producer,
            (SELECT count(DISTINCT p.organizer_id) FROM production_producers pp JOIN productions p ON p.id = pp.production_id
              WHERE pp.organizer_id = o.id AND p.organizer_id <> o.id) AS producer_companies,
            (SELECT count(DISTINCT s.production_id) FROM shows s WHERE s.venue_id = o.id) AS as_venue,
            (SELECT count(*) FROM shows s WHERE s.venue_id = o.id) AS venue_shows,
            (SELECT count(*) FROM productions p WHERE ${ISSUER_SQL} = o.id) AS issued,
            (SELECT count(*) FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
              WHERE ${scopeSql("o.id")}) AS claims,
            (SELECT count(*) FROM org_account_members m WHERE m.organizer_id = o.id) AS members
       FROM organizers o ORDER BY o.name`
  );
  return r.rows.map((x) => {
    const n = (v: string) => Number(v);
    return {
      id: String(x.id),
      name: x.name,
      kind: x.kind,
      roles: { company: n(x.as_company) > 0, producer: n(x.as_producer) > 0, venue: n(x.venue_shows) > 0, issuer: n(x.issued) > 0 },
      asCompany: n(x.as_company),
      asProducer: n(x.as_producer),
      producerCompanies: n(x.producer_companies),
      asVenue: n(x.as_venue),
      venueShows: n(x.venue_shows),
      issued: n(x.issued),
      claims: n(x.claims),
      members: n(x.members),
    };
  });
}

/** 這個組織要列在哪幾張表：有實際身分就列在對應的表；還沒參與任何節目時，依主要身分 */
export function adminTables(row: AdminOrgRow): OrgKind[] {
  const t: OrgKind[] = [];
  if (row.roles.company) t.push("company");
  if (row.roles.producer) t.push("producer");
  if (row.roles.venue) t.push("venue");
  return t.length ? t : [row.kind];
}
