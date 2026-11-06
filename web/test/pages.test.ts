import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { savePage, finalizeUpload, getDesignPages, PageUploadError, MAX_PAGES } from "@/lib/pages";
import type { FileStore } from "@/lib/storage";
import { safeKey } from "@/lib/storage";
import type { Db } from "@/lib/db";
import { createTestDb, seedShow } from "./helpers";

function memoryStore() {
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  const store: FileStore = {
    async put(key, bytes, type) {
      files.set(key, { bytes, type });
      return `mem://${key}`;
    },
  };
  return { store, files };
}

const img = (n = 100) => new Uint8Array(n).fill(7);

describe("節目單頁面上傳", () => {
  let db: Db;
  let designId: string;

  beforeEach(async () => {
    db = await createTestDb();
    designId = (await seedShow(db)).designId;
  });

  async function uploadAll(store: FileStore, total: number, uploadId = randomUUID()) {
    for (let i = 1; i <= total; i++) {
      await savePage(db, store, { designId, uploadId, pageNo: i, total, bytes: img(), contentType: "image/webp", width: 1400, height: 1980 });
    }
    return uploadId;
  }

  it("上傳每一頁、確認後，觀眾看到依頁碼排好的頁面", async () => {
    const { store, files } = memoryStore();
    const uploadId = await uploadAll(store, 3);
    expect(await getDesignPages(db, designId)).toEqual([]); // 確認前看不到

    await finalizeUpload(db, { designId, uploadId, total: 3, filename: "節目單.pdf" });
    const pages = await getDesignPages(db, designId);
    expect(pages.map((p) => p.page_no)).toEqual([1, 2, 3]);
    expect(pages[0].url).toBe(`mem://designs/${designId}/${uploadId}/001.webp`);
    expect(files.size).toBe(3);

    const d = await db.query<{ page_count: number; pdf_filename: string }>(`SELECT page_count, pdf_filename FROM designs WHERE id = $1`, [designId]);
    expect(d.rows[0]).toMatchObject({ page_count: 3, pdf_filename: "節目單.pdf" });
  });

  it("缺頁就不能確認，觀眾仍看到舊版", async () => {
    const { store } = memoryStore();
    const first = await uploadAll(store, 2);
    await finalizeUpload(db, { designId, uploadId: first, total: 2, filename: "v1.pdf" });

    const second = randomUUID();
    await savePage(db, store, { designId, uploadId: second, pageNo: 1, total: 3, bytes: img(), contentType: "image/webp", width: 10, height: 10 });
    await savePage(db, store, { designId, uploadId: second, pageNo: 3, total: 3, bytes: img(), contentType: "image/webp", width: 10, height: 10 });
    await expect(finalizeUpload(db, { designId, uploadId: second, total: 3, filename: "v2.pdf" })).rejects.toThrow("還缺第 2 頁");
    expect((await getDesignPages(db, designId)).length).toBe(2);
  });

  it("換成新版後，觀眾只看到新版的頁面", async () => {
    const { store } = memoryStore();
    const v1 = await uploadAll(store, 4);
    await finalizeUpload(db, { designId, uploadId: v1, total: 4, filename: "v1.pdf" });
    const v2 = await uploadAll(store, 2);
    await finalizeUpload(db, { designId, uploadId: v2, total: 2, filename: "v2.pdf" });
    const pages = await getDesignPages(db, designId);
    expect(pages.length).toBe(2);
    expect(pages.every((p) => p.url.includes(v2))).toBe(true);
  });

  it("勾選套用整檔節目：其他卡面版本共用同一批頁面，不重複上傳", async () => {
    const prod = await db.query<{ production_id: string }>(`SELECT production_id FROM designs WHERE id = $1`, [designId]);
    const premiere = await db.query<{ id: string }>(
      `INSERT INTO designs (production_id, label) VALUES ($1, '首演場') RETURNING id`,
      [prod.rows[0].production_id]
    );
    const other = await seedShow(db); // 別檔節目，不應受影響
    const { store, files } = memoryStore();
    const uploadId = await uploadAll(store, 2);

    const r = await finalizeUpload(db, { designId, uploadId, total: 2, filename: "共用.pdf", applyToProduction: true });
    expect(r.designIds.sort()).toEqual([designId, premiere.rows[0].id].map(String).sort());
    const a = await getDesignPages(db, designId);
    const b = await getDesignPages(db, premiere.rows[0].id);
    expect(b.map((p) => p.url)).toEqual(a.map((p) => p.url));
    expect(files.size).toBe(2);
    expect(await getDesignPages(db, other.designId)).toEqual([]);
  });

  it("不勾選時只影響這個卡面版本", async () => {
    const prod = await db.query<{ production_id: string }>(`SELECT production_id FROM designs WHERE id = $1`, [designId]);
    const finale = await db.query<{ id: string }>(
      `INSERT INTO designs (production_id, label) VALUES ($1, '壓軸場') RETURNING id`,
      [prod.rows[0].production_id]
    );
    const { store } = memoryStore();
    const uploadId = await uploadAll(store, 1);
    await finalizeUpload(db, { designId, uploadId, total: 1, filename: "a.pdf" });
    expect(await getDesignPages(db, finale.rows[0].id)).toEqual([]);
  });

  it("同一頁重送會覆蓋，不會重複", async () => {
    const { store } = memoryStore();
    const uploadId = randomUUID();
    for (let k = 0; k < 2; k++) {
      await savePage(db, store, { designId, uploadId, pageNo: 1, total: 1, bytes: img(50 + k), contentType: "image/jpeg", width: 10, height: 10 });
    }
    await finalizeUpload(db, { designId, uploadId, total: 1, filename: "a.pdf" });
    const pages = await getDesignPages(db, designId);
    expect(pages.length).toBe(1);
    expect(pages[0].url.endsWith(".jpg")).toBe(true);
  });

  it("拒絕不合規的上傳", async () => {
    const { store } = memoryStore();
    const base = { designId, uploadId: randomUUID(), pageNo: 1, total: 1, bytes: img(), contentType: "image/webp", width: 10, height: 10 };
    await expect(savePage(db, store, { ...base, total: MAX_PAGES + 1 })).rejects.toBeInstanceOf(PageUploadError);
    await expect(savePage(db, store, { ...base, pageNo: 2 })).rejects.toThrow("無效的頁碼");
    await expect(savePage(db, store, { ...base, contentType: "application/pdf" })).rejects.toThrow("只接受");
    await expect(savePage(db, store, { ...base, bytes: new Uint8Array(0) })).rejects.toThrow("過大");
    await expect(savePage(db, store, { ...base, uploadId: "../../etc" })).rejects.toThrow("無效的上傳批次");
    await expect(savePage(db, store, { ...base, designId: "99999" })).rejects.toThrow("找不到");
  });

  it("檔案路徑不能跳出儲存資料夾", () => {
    expect(() => safeKey("../secret")).toThrow();
    expect(() => safeKey("designs/1/../../x")).toThrow();
    expect(() => safeKey("/etc/passwd")).toThrow();
    expect(safeKey("designs/1/abc/001.webp")).toBe("designs/1/abc/001.webp");
  });
});
