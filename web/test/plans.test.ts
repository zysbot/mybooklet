import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import { claimShow, ClaimError } from "@/lib/claim";
import { findOrCreateUser } from "@/lib/users";
import { effectivePlan, FREE_CLAIM_LIMIT, freeUsage, getPlan, setPlan, taipeiToday } from "@/lib/plans";
import { createTestDb, seedShow } from "./helpers";

describe("合作方案", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("新組織預設免費；設為基本合作後到期日當天仍有效，隔天回到免費", () => {
    const now = new Date("2026-11-07T15:59:00Z"); // 台北 11/7 23:59
    expect(taipeiToday(now)).toBe("2026-11-07");
    expect(effectivePlan("basic", "2026-11-07", now)).toBe("basic");
    expect(effectivePlan("basic", "2026-11-06", now)).toBe("free");
    expect(effectivePlan("basic", null, now)).toBe("basic");
    expect(effectivePlan("free", "2099-01-01", now)).toBe("free");
  });

  it("設定方案：檢查方案名稱與日期格式；改回免費時清掉到期日", async () => {
    const { showId } = await seedShow(db);
    const org = (await db.query<{ id: string }>(`SELECT p.organizer_id AS id FROM shows s JOIN productions p ON p.id = s.production_id WHERE s.id = $1`, [showId])).rows[0].id;
    expect((await getPlan(db, String(org)))!.plan).toBe("free");
    await setPlan(db, String(org), "basic", "2099-12-31");
    expect(await getPlan(db, String(org))).toEqual({ plan: "basic", until: "2099-12-31", effective: "basic" });
    await expect(setPlan(db, String(org), "gold", null)).rejects.toThrow("方案");
    await expect(setPlan(db, String(org), "basic", "12/31/2099")).rejects.toThrow("YYYY-MM-DD");
    await setPlan(db, String(org), "free", "2099-12-31");
    expect((await getPlan(db, String(org)))!.until).toBeNull();
  });

  it(`免費組織所有場次合計最多 ${FREE_CLAIM_LIMIT} 份；改成基本合作就不受限`, async () => {
    const a = await seedShow(db, { code: "A" });
    const org = String((await db.query<{ id: string }>(`SELECT organizer_id AS id FROM productions WHERE id = $1`, [a.productionId])).rows[0].id);
    // 同一個劇團的第二個場次
    const show2 = (await db.query<{ id: string }>(
      `INSERT INTO shows (production_id, starts_at, venue, chain_configured) VALUES ($1, '2026-11-22T11:30:00Z', '[演出場館]', TRUE) RETURNING id`,
      [a.productionId]
    )).rows[0].id;
    await db.query(`INSERT INTO claim_codes (show_id, code, valid_from, valid_to) VALUES ($1, 'B', '2026-01-01', '2027-01-01')`, [show2]);

    const at = new Date("2026-11-01T00:00:00Z");
    for (let i = 0; i < FREE_CLAIM_LIMIT; i++) {
      const u = await findOrCreateUser(db, { provider: "google", subject: `free-${i}` });
      await claimShow(db, u.id, i % 2 === 0 ? "A" : "B", at);
    }
    expect(await freeUsage(db, org)).toBe(FREE_CLAIM_LIMIT);

    const extra = await findOrCreateUser(db, { provider: "google", subject: "free-extra" });
    await expect(claimShow(db, extra.id, "B", at)).rejects.toMatchObject({ code: "FREE_LIMIT" });
    await expect(claimShow(db, extra.id, "A", at)).rejects.toBeInstanceOf(ClaimError);

    // 已經領過的人重新掃碼，照樣回傳原本那份
    const first = await findOrCreateUser(db, { provider: "google", subject: "free-0" });
    expect((await claimShow(db, first.id, "A", at)).alreadyClaimed).toBe(true);

    await setPlan(db, org, "basic", null);
    expect((await claimShow(db, extra.id, "A", at)).alreadyClaimed).toBe(false);
  });
});
