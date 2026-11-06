"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEST_CATALOG, testClaimWindow, type TestProduction } from "@/lib/test-catalog";
import { uploadPdfPages, finalizePdfUpload } from "@/lib/pdf-upload";

type Status = { text: string; state: "wait" | "work" | "ok" | "skip" | "error" };

export function TestDataTools({ realUsers, testViewerCount }: { realUsers: { id: string; label: string }[]; testViewerCount: number }) {
  const router = useRouter();
  const auto = TEST_CATALOG.filter((t) => !t.manual);
  const manual = TEST_CATALOG.filter((t) => t.manual);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const [includeUser, setIncludeUser] = useState(realUsers.find((u) => u.label.includes("LINE"))?.id ?? "");
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);

  const set = (t: TestProduction, s: Status) => setStatus((x) => ({ ...x, [t.file]: s }));

  function pick(list: FileList | null) {
    if (!list) return;
    const next: Record<string, File> = { ...files };
    for (const f of Array.from(list)) {
      const t = TEST_CATALOG.find((x) => f.name.startsWith(x.file));
      if (t) next[t.file] = f;
    }
    setFiles(next);
  }

  async function importOne(t: TestProduction) {
    const file = files[t.file];
    set(t, { text: "建立節目並寫入合約…", state: "work" });
    const res = await fetch("/api/admin/productions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dedupe: true,
        title: t.title,
        companyName: t.company,
        genre: t.genre,
        producerName: t.producer,
        intro: t.intro,
        designs: [{ key: "regular", label: "一般場", coverColor: t.coverColor }],
        defaultDesign: "regular",
        shows: [{ startsAt: t.startsAt, venue: t.venue, maxClaims: 300, ...testClaimWindow(t.startsAt) }],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "上架失敗");
    if (data.chain?.some((c: { ok: boolean }) => !c.ok)) throw new Error("寫入合約失敗，請到後台首頁按「寫入合約」重試");
    if (data.existing && data.defaultPageCount > 0) {
      set(t, { text: `已存在（${data.defaultPageCount} 頁），略過`, state: "skip" });
      return;
    }
    if (!file) {
      set(t, { text: "已上架，但沒有選到 PDF", state: "skip" });
      return;
    }
    const up = await uploadPdfPages(file, data.defaultDesignId, (done, total) => set(t, { text: `上傳節目單 ${done} / ${total} 頁`, state: "work" }), { previews: false });
    await finalizePdfUpload(data.defaultDesignId, { uploadId: up.uploadId, total: up.total, filename: file.name, applyToProduction: true });
    set(t, { text: `完成：${up.total} 頁`, state: "ok" });
  }

  async function runImport() {
    setRunning(true);
    for (const t of auto) {
      try {
        await importOne(t);
      } catch (e) {
        set(t, { text: (e as Error).message, state: "error" });
      }
    }
    setRunning(false);
    router.refresh();
  }

  async function seed() {
    setSeedBusy(true);
    setSeedMsg(null);
    const res = await fetch("/api/admin/test-data/viewers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeUserId: includeUser || undefined }),
    });
    const r = await res.json().catch(() => ({}));
    setSeedMsg(
      res.ok
        ? `完成：${r.viewers} 位測試觀眾，找到 ${r.shows} 檔測試節目，新增 ${r.claims} 份領取、${r.favorites} 個前三喜歡${r.includedUserClaims ? `；你的帳號新增 ${r.includedUserClaims} 份` : ""}${r.skipped ? `；${r.skipped} 份因不在開放時間略過` : ""}。上鏈在背景進行，幾分鐘內完成。`
        : r.error ?? "失敗"
    );
    setSeedBusy(false);
    router.refresh();
  }

  async function clear() {
    if (!confirm("確定清除所有測試觀眾與他們的領取紀錄？真實觀眾不受影響。")) return;
    setSeedBusy(true);
    const res = await fetch("/api/admin/test-data/viewers", { method: "DELETE" });
    const r = await res.json().catch(() => ({}));
    setSeedMsg(res.ok ? `已清除 ${r.removed} 位測試觀眾。` : r.error ?? "失敗");
    setSeedBusy(false);
    router.refresh();
  }

  const icon = (s?: Status) => (!s ? "・" : s.state === "ok" ? "✓" : s.state === "error" ? "✕" : s.state === "skip" ? "－" : "…");

  return (
    <>
      <section className="panel" aria-labelledby="import-title">
        <h2 id="import-title">1. 批次上架 {auto.length} 檔測試節目</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7, fontSize: 14 }}>
          選取「吾冊測試節目單」裡的 PDF（可一次全選），系統依檔名自動填入類型、場館、演出團隊與時間。
          {manual.map((t) => `《${t.title}》`).join("、")}留給你用上架表單手動建立，這裡會略過。可以重複執行，已上架的不會重複。
        </p>
        <label className="link-btn" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
          選擇 PDF 檔案
          <input type="file" accept="application/pdf,.pdf" multiple onChange={(e) => pick(e.target.files)} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
        </label>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th aria-label="狀態" /><th>節目</th><th>類型</th><th>演出團隊</th><th>場館</th><th>演出時間</th><th>PDF</th><th>進度</th></tr>
            </thead>
            <tbody>
              {auto.map((t) => (
                <tr key={t.file}>
                  <td aria-hidden="true">{icon(status[t.file])}</td>
                  <td>{t.title}</td>
                  <td>{t.genre}</td>
                  <td>{t.company}{t.producer ? <span className="small muted"><br />製作：{t.producer}</span> : null}</td>
                  <td>{t.venue}</td>
                  <td>{t.startsAt.slice(0, 10)}</td>
                  <td className={files[t.file] ? "status-ok" : "muted"}>{files[t.file] ? "已選" : "未選"}</td>
                  <td className={status[t.file]?.state === "error" ? "status-none" : ""}>{status[t.file]?.text ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-primary" style={{ alignSelf: "flex-start", minWidth: 200 }} onClick={runImport}
          disabled={running || Object.keys(files).length === 0}>
          {running ? "上架中，請不要關閉頁面…" : "開始批次上架"}
        </button>
      </section>

      <section className="panel" aria-labelledby="viewers-title">
        <h2 id="viewers-title">2. 建立 20 位測試觀眾並領取</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7, fontSize: 14 }}>
          測試觀眾依節目熱門程度領取，每人至少兩檔、至少兩種類型，約六成會標記前三喜歡。測試觀眾無法登入。
          目前已有 {testViewerCount} 位測試觀眾。請在手動上架的節目建立後再執行，才會包含進來；可以重複執行。
        </p>
        <label className="field" style={{ maxWidth: 480 }}>
          <span>同時讓這個帳號領取全部測試節目（用來看自己的收藏冊排列）</span>
          <select value={includeUser} onChange={(e) => setIncludeUser(e.target.value)}>
            <option value="">不要</option>
            {realUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-dark" onClick={seed} disabled={seedBusy}>{seedBusy ? "處理中…" : "建立測試觀眾並領取"}</button>
          <button type="button" className="btn btn-quiet" onClick={clear} disabled={seedBusy || testViewerCount === 0}>清除測試觀眾</button>
        </div>
        {seedMsg && <p role="status" style={{ margin: 0, lineHeight: 1.7 }}>{seedMsg}</p>}
      </section>
    </>
  );
}
