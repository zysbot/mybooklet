import { describe, it, expect, beforeEach } from "vitest";
import type { Db } from "@/lib/db";
import type { FileStore } from "@/lib/storage";
import { findOrCreateUser } from "@/lib/users";
import { claimShow } from "@/lib/claim";
import {
  addAttachment,
  AttachmentError,
  countClick,
  getAttachmentForViewer,
  listActiveAttachments,
  listOrgAttachments,
  normalizeLink,
  removeAttachment,
} from "@/lib/attachments";
import { createTestDb, seedShow } from "./helpers";

const NOW = new Date("2026-11-07T08:00:00Z"); // 台北 11/07
const store: FileStore & { keys: string[] } = {
  keys: [],
  async put(key) {
    this.keys.push(key);
    return `/api/files/${key}`;
  },
};

describe("主辦方附加文宣", () => {
  let db: Db;
  let show: Awaited<ReturnType<typeof seedShow>>;
  let org: string;
  const base = () => ({ organizerId: org, productionId: show.productionId, actor: "staff@example.com" });

  beforeEach(async () => {
    db = await createTestDb();
    show = await seedShow(db, { code: "A" });
    org = (await db.query<{ organizer_id: string }>(`SELECT organizer_id FROM productions WHERE id = $1`, [show.productionId])).rows[0].organizer_id;
    store.keys = [];
  });

  it("連結只接受 https", () => {
    expect(normalizeLink("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeLink("")).toBeNull();
    expect(() => normalizeLink("http://example.com")).toThrow(AttachmentError);
    expect(() => normalizeLink("javascript:alert(1)")).toThrow(AttachmentError);
    expect(() => normalizeLink("example.com")).toThrow(AttachmentError);
  });

  it("免費方案每檔 1 則、合作方案 3 則；移除或過期後可以再加", async () => {
    await addAttachment(db, store, { ...base(), title: "下一檔", link: "https://example.com" }, NOW);
    await expect(addAttachment(db, store, { ...base(), title: "第二則", link: "https://example.com" }, NOW)).rejects.toThrow(/免費方案/);

    await db.query(`UPDATE organizers SET plan = 'basic' WHERE id = $1`, [org]);
    await addAttachment(db, store, { ...base(), title: "第二則", link: "https://example.com" }, NOW);
    const third = await addAttachment(db, store, { ...base(), title: "第三則", link: "https://example.com", showUntil: "2026-11-07" }, NOW);
    await expect(addAttachment(db, store, { ...base(), title: "第四則", link: "https://example.com" }, NOW)).rejects.toThrow(/最多同時附 3 則/);

    // 第三則今天到期：明天就不算
    const tomorrow = new Date("2026-11-08T08:00:00Z");
    expect((await listActiveAttachments(db, show.productionId, NOW)).map((a) => a.title)).toEqual(["下一檔", "第二則", "第三則"]);
    expect((await listActiveAttachments(db, show.productionId, tomorrow)).map((a) => a.title)).toEqual(["下一檔", "第二則"]);
    const org1 = (await listOrgAttachments(db, org, tomorrow))[0];
    expect(org1.expired.map((a) => a.id)).toEqual([third.id]);

    const first = (await listActiveAttachments(db, show.productionId, NOW))[0];
    expect(await removeAttachment(db, org, first.id)).toBe(true);
    await addAttachment(db, store, { ...base(), title: "補上", link: "https://example.com" }, NOW);
  });

  it("檔案類型、大小與必填檢查", async () => {
    await expect(addAttachment(db, store, { ...base(), title: "空的" }, NOW)).rejects.toThrow(/至少一項/);
    await expect(addAttachment(db, store, { ...base(), title: "", link: "https://example.com" }, NOW)).rejects.toThrow(/標題/);
    await expect(
      addAttachment(db, store, { ...base(), title: "執行檔", file: { bytes: new Uint8Array([1]), contentType: "application/x-msdownload" } }, NOW)
    ).rejects.toThrow(/只接受/);
    await expect(addAttachment(db, store, { ...base(), title: "過去", link: "https://example.com", showUntil: "2026-11-06" }, NOW)).rejects.toThrow(/不能早於今天/);
    const a = await addAttachment(db, store, { ...base(), title: "海報", file: { bytes: new Uint8Array([1, 2, 3]), contentType: "image/png" } }, NOW);
    expect(a.fileKind).toBe("image");
    expect(store.keys[0]).toMatch(new RegExp(`^attachments/${show.productionId}/[0-9a-f-]+\\.png$`));
  });

  it("只能管理自己組織的節目", async () => {
    const other = (await db.query<{ id: string }>(`INSERT INTO organizers (name) VALUES ('別團') RETURNING id`)).rows[0].id;
    await expect(addAttachment(db, store, { ...base(), organizerId: other, title: "x", link: "https://example.com" }, NOW)).rejects.toThrow(/找不到這檔節目/);
    const a = await addAttachment(db, store, { ...base(), title: "x", link: "https://example.com" }, NOW);
    expect(await removeAttachment(db, other, a.id)).toBe(false);
  });

  it("只有領過這檔節目的觀眾打得開；點擊只記總數", async () => {
    const a = await addAttachment(db, store, { ...base(), title: "問卷", link: "https://example.com/q" }, NOW);
    const holder = (await findOrCreateUser(db, { provider: "line", subject: "H" })).id;
    const stranger = (await findOrCreateUser(db, { provider: "line", subject: "S" })).id;
    await claimShow(db, holder, show.code, NOW);
    expect(await getAttachmentForViewer(db, a.id, holder, NOW)).not.toBeNull();
    expect(await getAttachmentForViewer(db, a.id, stranger, NOW)).toBeNull();
    await countClick(db, a.id);
    await countClick(db, a.id);
    expect((await listActiveAttachments(db, show.productionId, NOW))[0].clicks).toBe(2);
    await removeAttachment(db, org, a.id);
    expect(await getAttachmentForViewer(db, a.id, holder, NOW)).toBeNull();
  });
});
