"use client";

import { useState } from "react";
import { GENRES, VENUES, COVER_COLORS, FESTIVALS } from "@/lib/catalog";
import { networkLabel } from "@/lib/network";
import { testClaimWindow } from "@/lib/test-catalog";
import { PdfUploader } from "../../designs/[id]/PdfUploader";
import { QrButton } from "../../QrButton";

interface DesignRow {
  key: string;
  label: string;
  coverColor: string;
}
interface ShowRow {
  id: number;
  startsAt: string; // datetime-local（臺北時間）
  venue: string;
  design: string;
  maxClaims: string;
}

interface Created {
  defaultDesignId: string;
  designs: { id: string; label: string }[];
  shows: { showId: string; code: string; startsAt: string; venue: string; designLabel: string }[];
  chain: { showId: string; ok: boolean; error?: string }[];
}

const toIso = (local: string) => `${local}:00+08:00`;
let rowId = 1;

export function ProductionForm({ workTitles }: { workTitles: string[] }) {
  const [title, setTitle] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [festival, setFestival] = useState("");
  const [genre, setGenre] = useState("");
  const [company, setCompany] = useState("");
  const [producer, setProducer] = useState("");
  const [intro, setIntro] = useState("");
  const [designs, setDesigns] = useState<DesignRow[]>([{ key: "d0", label: "一般場", coverColor: COVER_COLORS[0] }]);
  const [defaultDesign, setDefaultDesign] = useState("d0");
  const [shows, setShows] = useState<ShowRow[]>([{ id: 0, startsAt: "", venue: "", design: "d0", maxClaims: "" }]);
  const [testWindow, setTestWindow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const setShow = (id: number, patch: Partial<ShowRow>) => setShows((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setDesign = (key: string, patch: Partial<DesignRow>) => setDesigns((xs) => xs.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (shows.some((s) => !s.startsAt || !s.venue)) {
      setError("每一場都要填演出時間與場館");
      return;
    }
    setBusy(true);
    const body = {
      title,
      genre,
      companyName: company,
      producerName: producer || undefined,
      workTitle: workTitle || undefined,
      festival: festival || undefined,
      intro,
      designs,
      defaultDesign,
      shows: shows.map((s) => ({
        startsAt: toIso(s.startsAt),
        venue: s.venue,
        design: s.design,
        maxClaims: s.maxClaims ? Number(s.maxClaims) : null,
        ...(testWindow ? testClaimWindow(toIso(s.startsAt)) : {}),
      })),
    };
    try {
      const res = await fetch("/api/admin/productions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "上架失敗");
      setCreated(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const failed = created.chain.filter((c) => !c.ok);
    return (
      <div className="stack" style={{ gap: 20 }}>
        <section className="panel" aria-labelledby="done-title">
          <h2 id="done-title">《{title}》已上架 {created.shows.length} 個場次</h2>
          {failed.length > 0 && (
            <p className="error" role="alert">
              有 {failed.length} 個場次寫入合約失敗，這些場次暫時不會上鏈。回到後台首頁按「寫入合約」重試。
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>演出時間</th><th>場館</th><th>卡面</th><th>合約</th><th>領取頁</th><th aria-label="QR code" /></tr>
              </thead>
              <tbody>
                {created.shows.map((s) => {
                  const ok = created.chain.find((c) => c.showId === s.showId)?.ok;
                  return (
                    <tr key={s.showId}>
                      <td>{new Date(s.startsAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", dateStyle: "medium", timeStyle: "short" })}</td>
                      <td>{s.venue}</td>
                      <td>{s.designLabel}</td>
                      <td className={ok ? "status-ok" : "status-none"}>{ok ? "已寫入" : "失敗"}</td>
                      <td><a href={`/c/${s.code}`} target="_blank" rel="noreferrer">/c/{s.code}</a></td>
                      <td><QrButton showId={s.showId} caption={`${title}・${s.venue}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel" aria-labelledby="pdf-title">
          <h2 id="pdf-title">上傳節目單 PDF</h2>
          <PdfUploader
            designId={created.defaultDesignId}
            siblingLabels={created.designs.filter((d) => d.id !== created.defaultDesignId).map((d) => d.label)}
          />
        </section>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <a href="/admin" className="link-btn">回到後台</a>
          <a href="/admin/productions/new" className="link-btn">再上架一檔</a>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" style={{ gap: 20 }} onSubmit={submit}>
      <section className="panel" aria-labelledby="info-title">
        <h2 id="info-title">節目資訊</h2>
        <div className="form-grid">
          <label className="field">
            <span>節目名稱</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
          </label>
          <label className="field">
            <span>類型</span>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} required>
              <option value="" disabled>請選擇</option>
              {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
          <label className="field">
            <span>演出團隊（劇團名稱）</span>
            <input value={company} onChange={(e) => setCompany(e.target.value)} maxLength={80} required />
          </label>
          <label className="field">
            <span>製作方（與演出團隊不同時才填）</span>
            <input value={producer} onChange={(e) => setProducer(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span>作品名稱（重演時選首演的名稱；不是重演就留白）</span>
            <input value={workTitle} onChange={(e) => setWorkTitle(e.target.value)} maxLength={80} list="work-titles" placeholder={title || "留白＝節目名稱"} />
            <datalist id="work-titles">{workTitles.map((w) => <option key={w} value={w} />)}</datalist>
          </label>
          <label className="field">
            <span>藝術節（選填）</span>
            <select value={festival} onChange={(e) => setFestival(e.target.value)}>
              <option value="">不屬於藝術節</option>
              {FESTIVALS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>節目介紹（選填；有上傳 PDF 時觀眾主要看 PDF）</span>
          <textarea value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={2000} rows={4} />
        </label>
      </section>

      <section className="panel" aria-labelledby="design-title">
        <div className="panel-head">
          <h2 id="design-title">卡面版本</h2>
          <span className="small muted">例如首演場、壓軸場要用不同卡面時，再新增版本</span>
        </div>
        {designs.map((d) => (
          <div className="row-form" key={d.key}>
            <label className="field" style={{ flex: "1 1 160px" }}>
              <span>版本名稱</span>
              <input value={d.label} onChange={(e) => setDesign(d.key, { label: e.target.value })} maxLength={20} required />
            </label>
            <fieldset className="swatches">
              <legend>卡面顏色</legend>
              {COVER_COLORS.map((c) => (
                <button key={c} type="button" className="swatch-btn" style={{ background: c }} aria-label={`顏色 ${c}`}
                  aria-pressed={d.coverColor === c} onClick={() => setDesign(d.key, { coverColor: c })} />
              ))}
            </fieldset>
            <label className="inline-check">
              <input type="radio" name="default-design" checked={defaultDesign === d.key} onChange={() => setDefaultDesign(d.key)} />
              預設
            </label>
            {designs.length > 1 && (
              <button type="button" className="link-btn" style={{ background: "transparent", font: "inherit", fontSize: 13 }}
                onClick={() => {
                  setDesigns((xs) => xs.filter((x) => x.key !== d.key));
                  if (defaultDesign === d.key) setDefaultDesign(designs.find((x) => x.key !== d.key)!.key);
                  setShows((xs) => xs.map((s) => (s.design === d.key ? { ...s, design: defaultDesign === d.key ? designs.find((x) => x.key !== d.key)!.key : defaultDesign } : s)));
                }}>
                移除
              </button>
            )}
          </div>
        ))}
        {designs.length < 6 && (
          <button type="button" className="link-btn" style={{ alignSelf: "flex-start", background: "transparent", font: "inherit", fontSize: 13 }}
            onClick={() => {
              const key = `d${rowId++}`;
              setDesigns((xs) => [...xs, { key, label: xs.length === 1 ? "首演場" : "壓軸場", coverColor: COVER_COLORS[xs.length % COVER_COLORS.length] }]);
            }}>
            ＋ 新增卡面版本
          </button>
        )}
      </section>

      <section className="panel" aria-labelledby="shows-title">
        <h2 id="shows-title">場次</h2>
        {shows.map((s, i) => (
          <div className="row-form" key={s.id}>
            <span className="row-n" aria-hidden="true">{i + 1}</span>
            <label className="field" style={{ flex: "1 1 180px" }}>
              <span>演出時間（臺北）</span>
              <input type="datetime-local" value={s.startsAt} onChange={(e) => setShow(s.id, { startsAt: e.target.value })} required />
            </label>
            <label className="field" style={{ flex: "1 1 180px" }}>
              <span>場館</span>
              <select value={s.venue} onChange={(e) => setShow(s.id, { venue: e.target.value })} required>
                <option value="" disabled>請選擇</option>
                {VENUES.map((v) => <option key={v.name} value={v.name}>{v.name}（{v.city}）</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: "1 1 120px" }}>
              <span>卡面</span>
              <select value={s.design} onChange={(e) => setShow(s.id, { design: e.target.value })}>
                {designs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: "0 1 120px" }}>
              <span>領取上限</span>
              <input type="number" min={1} max={100000} inputMode="numeric" placeholder="不限" value={s.maxClaims}
                onChange={(e) => setShow(s.id, { maxClaims: e.target.value })} />
            </label>
            {shows.length > 1 && (
              <button type="button" className="link-btn" style={{ background: "transparent", font: "inherit", fontSize: 13 }}
                onClick={() => setShows((xs) => xs.filter((x) => x.id !== s.id))} aria-label={`移除第 ${i + 1} 場`}>
                移除
              </button>
            )}
          </div>
        ))}
        <button type="button" className="link-btn" style={{ alignSelf: "flex-start", background: "transparent", font: "inherit", fontSize: 13 }}
          onClick={() => setShows((xs) => [...xs, { ...xs[xs.length - 1], id: rowId++, startsAt: "" }])}>
          ＋ 新增場次
        </button>
        <label className="inline-check" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={testWindow} onChange={(e) => setTestWindow(e.target.checked)} />
          <span>
            測試階段：從現在起 30 天內都開放領取
            <br />
            <span className="small muted">取消勾選時，開放時間為開演前 90 分鐘到開演後 4 小時（正式上線用）</span>
          </span>
        </label>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary" disabled={busy} style={{ alignSelf: "flex-start", minWidth: 200 }}>
        {busy ? "上架中，寫入合約…" : "上架並寫入合約"}
      </button>
      <p className="small muted" style={{ margin: 0 }}>送出後會把每個場次寫進{networkLabel()}的合約，接著就能上傳節目單 PDF。</p>
    </form>
  );
}
