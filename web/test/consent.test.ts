import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import { findOrCreateUser, getUser } from "@/lib/users";
import { needsConsent, parseConsent, recordConsent } from "@/lib/consent";
import { listHomeProductions } from "@/lib/booklets";
import { LEGAL_VERSION } from "@/content/legal";
import { createTestDb, seedShow } from "./helpers";

describe("首次領取告知", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("新帳號與未登入都要先看告知；同意後記下時間、版本與公開選擇", async () => {
    expect(needsConsent(null)).toBe(true);
    const u = await findOrCreateUser(db, { provider: "line", subject: "U1" });
    expect(needsConsent(u)).toBe(true);
    await recordConsent(db, u.id, { age13: true, socialPublic: false }, new Date("2026-11-07T07:00:00Z"));
    const after = (await getUser(db, u.id))!;
    expect(needsConsent(after)).toBe(false);
    expect(after.terms_version).toBe(LEGAL_VERSION);
    expect(after.age_confirmed_at).toEqual(new Date("2026-11-07T07:00:00Z"));
    expect(after.social_public).toBe(false);
  });

  it("沒勾「我已滿 13 歲」不算同意", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent({ age13: false, socialPublic: true })).toBeNull();
    expect(parseConsent({ age13: "yes" })).toBeNull();
    expect(parseConsent({ age13: true })).toEqual({ age13: true, socialPublic: false });
    expect(parseConsent({ age13: true, socialPublic: true })).toEqual({ age13: true, socialPublic: true });
  });
});

describe("首頁演出列表", () => {
  it("先列即將演出（由近到遠），再列最近演完的", async () => {
    const db = await createTestDb();
    const a = await seedShow(db, { code: "A" });
    const add = async (title: string, at: string) => {
      const org = (await db.query<{ organizer_id: string }>(`SELECT organizer_id FROM productions WHERE id = $1`, [a.productionId])).rows[0].organizer_id;
      const p = (await db.query<{ id: string }>(`INSERT INTO productions (organizer_id, title, company_name) VALUES ($1, $2, '劇團') RETURNING id`, [org, title])).rows[0].id;
      const d = (await db.query<{ id: string }>(`INSERT INTO designs (production_id, label) VALUES ($1, '一般場') RETURNING id`, [p])).rows[0].id;
      await db.query(`UPDATE productions SET default_design_id = $2 WHERE id = $1`, [p, d]);
      await db.query(`INSERT INTO shows (production_id, starts_at, venue) VALUES ($1, $2, '場館')`, [p, at]);
    };
    await add("下個月", "2026-12-07T11:00:00Z");
    await add("下週", "2026-11-14T11:00:00Z");
    await add("上個月", "2026-10-07T11:00:00Z");
    const list = await listHomeProductions(db, new Date("2026-11-08T00:00:00Z"));
    // seedShow 另有一檔 11/21 的《雨季之前》
    expect(list.map((x) => [x.title, x.upcoming])).toEqual([
      ["下週", true],
      ["雨季之前", true],
      ["下個月", true],
      ["上個月", false],
    ]);
  });
});
