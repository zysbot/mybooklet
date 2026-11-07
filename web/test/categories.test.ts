import { describe, it, expect } from "vitest";
import { getShow } from "@/lib/booklets";
import { cityOfVenue } from "@/lib/catalog";
import { listWorkTitles, ProductionError, setProductionCategories } from "@/lib/productions";
import { createTestDb, seedShow } from "./helpers";

describe("收藏冊分類：縣市、作品、藝術節", () => {
  it("縣市依場館判斷；不在選單的舊場館為 null", () => {
    expect(cityOfVenue("衛武營國家藝術文化中心")).toBe("高雄市");
    expect(cityOfVenue("[演出場館]")).toBeNull();
  });

  it("作品名稱預設為節目名稱；重演可以指到首演的作品", async () => {
    const db = await createTestDb();
    const a = await seedShow(db, { code: "A" });
    let show = (await getShow(db, a.showId))!;
    expect(show.workTitle).toBe("雨季之前");
    expect(show.festival).toBeNull();

    await setProductionCategories(db, a.productionId, "雨季之前（首演）", "臺北藝術節");
    show = (await getShow(db, a.showId))!;
    expect(show.workTitle).toBe("雨季之前（首演）");
    expect(show.festival).toBe("臺北藝術節");
    expect(await listWorkTitles(db)).toEqual(["雨季之前（首演）"]);

    // 填回節目名稱本身或留白，都視為沒有另設作品
    await setProductionCategories(db, a.productionId, "雨季之前", "");
    const row = (await db.query<{ work_title: string | null; festival: string | null }>(`SELECT work_title, festival FROM productions WHERE id = $1`, [a.productionId])).rows[0];
    expect(row).toEqual({ work_title: null, festival: null });
  });

  it("藝術節只能從選單選", async () => {
    const db = await createTestDb();
    const a = await seedShow(db, { code: "A" });
    await expect(setProductionCategories(db, a.productionId, "", "不存在的藝術節")).rejects.toBeInstanceOf(ProductionError);
  });
});
