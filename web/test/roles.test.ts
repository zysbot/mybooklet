import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import { createProduction, ProductionError, type ProductionInput } from "@/lib/productions";
import { getInsights, getFreeStats, getOrganizer } from "@/lib/insights";
import { listOrgsForAdmin, adminTables, productionParties, setIssuer, RoleError, listOrgProductions } from "@/lib/roles";
import { claimShow } from "@/lib/claim";
import { FREE_CLAIM_LIMIT, freeUsage } from "@/lib/plans";
import { designOrganizer, listOrgDesigns } from "@/lib/covers";
import { listOrgAttachments } from "@/lib/attachments";
import { findOrCreateUser } from "@/lib/users";
import { createTestDb } from "./helpers";

const SITE = "https://mybooklet.party";
const AT = "2026-11-14T19:30:00+08:00";
const OPEN = { opensAt: "2026-01-01T00:00:00Z", closesAt: "2027-01-01T00:00:00Z" };

function input(over: Partial<ProductionInput> = {}): ProductionInput {
  return {
    title: "潮線",
    companyName: "潮間帶劇團",
    genre: "戲劇",
    designs: [{ key: "r", label: "一般場", coverColor: "#23305C" }],
    defaultDesign: "r",
    shows: [{ startsAt: AT, venue: "國家戲劇院", ...OPEN }],
    ...over,
  };
}

const orgByName = async (db: Db, name: string) =>
  String((await db.query<{ id: string }>(`SELECT id FROM organizers WHERE name = $1`, [name])).rows[0].id);

describe("劇團、製作公司、場館", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("同一個名稱只建立一個組織：場館自製節目時，場館也是演出團隊", async () => {
    await createProduction(db, input({ title: "館內之一", companyName: "臺北表演藝術中心", shows: [{ startsAt: AT, venue: "臺北表演藝術中心", ...OPEN }] }), SITE);
    const n = await db.query<{ n: string }>(`SELECT count(*) AS n FROM organizers WHERE name = '臺北表演藝術中心'`);
    expect(Number(n.rows[0].n)).toBe(1);
    const org = (await getOrganizer(db, await orgByName(db, "臺北表演藝術中心")))!;
    expect(org.roles).toMatchObject({ company: true, venue: true, producer: false, issuer: true });
    expect(org.roleLabel).toBe("演出團隊・場館");
    const rows = await listOrgsForAdmin(db);
    expect(adminTables(rows.find((r) => r.name === "臺北表演藝術中心")!)).toEqual(["company", "venue"]);
  });

  it("共同製作：兩家製作公司都看得到這檔節目；演出團隊不重複算成製作公司", async () => {
    const p = await createProduction(db, input({ producerName: "港邊製作、山城製作，潮間帶劇團" }), SITE);
    const parties = await productionParties(db, p.productionId);
    expect(parties.map((x) => [x.name, x.roleLabel])).toEqual([
      ["潮間帶劇團", "演出團隊"],
      ["山城製作", "製作公司"],
      ["港邊製作", "製作公司"],
      ["國家戲劇院", "場館"],
    ]);
    for (const name of ["港邊製作", "山城製作"]) {
      expect((await getFreeStats(db, await orgByName(db, name)))!.shows).toHaveLength(1);
    }
    await expect(createProduction(db, input({ title: "太多", producerName: "甲、乙、丙、丁、戊" }), SITE)).rejects.toBeInstanceOf(ProductionError);
  });

  it("巡演：每個場館只看到在本館的場次", async () => {
    await createProduction(db, input({
      shows: [
        { startsAt: AT, venue: "國家戲劇院", ...OPEN },
        { startsAt: "2026-11-21T19:30:00+08:00", venue: "臺中國家歌劇院", ...OPEN },
        { startsAt: "2026-11-28T19:30:00+08:00", venue: "衛武營國家藝術文化中心", ...OPEN },
      ],
    }), SITE);
    expect((await getFreeStats(db, await orgByName(db, "臺中國家歌劇院")))!.shows.map((s) => s.venue)).toEqual(["臺中國家歌劇院"]);
    expect((await getFreeStats(db, await orgByName(db, "潮間帶劇團")))!.shows).toHaveLength(3);
    const venue = (await getInsights(db, await orgByName(db, "國家戲劇院")))!;
    expect(venue.shows).toHaveLength(1);
  });

  it("發放單位：免費額度、卡面、附加文宣都歸發放單位；預設是演出團隊", async () => {
    const plain = await createProduction(db, input({ title: "一般" }), SITE);
    expect(await designOrganizer(db, plain.defaultDesignId)).toBe(await orgByName(db, "潮間帶劇團"));

    const p = await createProduction(db, input({ title: "場館發放", issuer: "國家戲劇院", shows: [{ startsAt: AT, venue: "國家戲劇院", ...OPEN }] }), SITE);
    const venue = await orgByName(db, "國家戲劇院");
    const company = await orgByName(db, "潮間帶劇團");
    expect(await designOrganizer(db, p.defaultDesignId)).toBe(venue);
    expect((await listOrgDesigns(db, venue)).map((d) => d.productionTitle)).toEqual(["場館發放"]);
    expect((await listOrgDesigns(db, company)).map((d) => d.productionTitle)).toEqual(["一般"]);
    expect((await listOrgAttachments(db, venue)).map((x) => x.title)).toEqual(["場館發放"]);

    // 領取算在場館的免費額度，不算在劇團
    const u = await findOrCreateUser(db, { provider: "google", subject: "v1" });
    await claimShow(db, u.id, p.shows[0].code, new Date("2026-11-14T11:00:00Z"));
    expect(await freeUsage(db, venue)).toBe(1);
    expect(await freeUsage(db, company)).toBe(0);
    expect(FREE_CLAIM_LIMIT).toBe(50);

    // 劇團仍是參與者，看得到自己的場次統計
    expect((await getFreeStats(db, company))!.shows).toHaveLength(2);

    // 發放單位必須是參與者
    await expect(createProduction(db, input({ title: "亂填", issuer: "不相干的公司" }), SITE)).rejects.toBeInstanceOf(ProductionError);
    const other = await createProduction(db, input({ title: "別團", companyName: "別的劇團" }), SITE);
    await expect(setIssuer(db, p.productionId, await orgByName(db, "別的劇團"))).rejects.toBeInstanceOf(RoleError);
    expect(other.productionId).toBeTruthy();

    // 改回演出團隊：存成 NULL
    await setIssuer(db, p.productionId, company);
    const r = await db.query<{ issuer_id: string | null }>(`SELECT issuer_id FROM productions WHERE id = $1`, [p.productionId]);
    expect(r.rows[0].issuer_id).toBeNull();
    expect(await designOrganizer(db, p.defaultDesignId)).toBe(company);
  });

  it("組織管理頁：列出參與的節目與身分", async () => {
    await createProduction(db, input({ producerName: "港邊製作", issuer: "港邊製作" }), SITE);
    await createProduction(db, input({ title: "別團", companyName: "別的劇團", producerName: "港邊製作" }), SITE);
    const list = await listOrgProductions(db, await orgByName(db, "港邊製作"));
    expect(list.map((x) => [x.title, x.roleLabel, x.isIssuer])).toEqual([
      ["別團", "製作公司", false],
      ["潮線", "製作公司", true],
    ]);
    const row = (await listOrgsForAdmin(db)).find((x) => x.name === "港邊製作")!;
    expect(row).toMatchObject({ asProducer: 2, producerCompanies: 2, issued: 1 });
  });
});
