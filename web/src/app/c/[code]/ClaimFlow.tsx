"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgramCard } from "@/components/ProgramCard";
import { LoginButtons, closeLiffWindow } from "@/components/LoginButtons";
import { getLiff } from "@/lib/liff-client";

interface ShowProps {
  title: string;
  companyName: string;
  venue: string;
  startsAt: string;
  startsAtLabel: string;
  color: string;
}

interface Props {
  code: string;
  show: ShowProps;
  open: boolean;
  closedMessage: string | null;
  loggedIn: boolean;
  /** 系統化名，例如「二樓包廂的水獺」 */
  pseudonym: string | null;
  /** 還沒看過首次領取告知（未登入，或舊帳號尚未同意） */
  needsConsent: boolean;
}

type Consent = { age: "adult" | "teen" | null; agree: boolean; socialPublic: boolean };
const EMPTY_CONSENT: Consent = { age: null, agree: false, socialPublic: true };
const consentReady = (c: Consent) => c.age !== null && c.agree;
const CONSENT_KEY = "mb_consent";

/** 勾選狀態暫存在這個分頁：從 LINE 登入頁跳回來時不用重勾 */
function loadConsent(): Consent {
  try {
    const raw = sessionStorage.getItem(CONSENT_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Partial<Consent>;
      const age = c.age === "adult" || c.age === "teen" ? c.age : null;
      return { age, agree: c.agree === true, socialPublic: age !== "teen" && c.socialPublic !== false };
    }
  } catch {
    // 無法使用 sessionStorage 時就重勾
  }
  return EMPTY_CONSENT;
}

function saveConsent(c: Consent) {
  try {
    sessionStorage.setItem(CONSENT_KEY, JSON.stringify(c));
  } catch {
    // 忽略
  }
}

type Done = { claimId: string; alreadyClaimed: boolean };

export function ClaimFlow({ code, show, open, closedMessage, loggedIn, pseudonym, needsConsent }: Props) {
  const [done, setDone] = useState<Done | null>(null);
  const [askConsent, setAskConsent] = useState(needsConsent);
  const [consent, setConsentState] = useState<Consent>(EMPTY_CONSENT);
  const consentRef = useRef(consent);
  useEffect(() => {
    const c = loadConsent();
    consentRef.current = c;
    setConsentState(c);
  }, []);
  const setConsent = (c: Consent) => {
    consentRef.current = c;
    setConsentState(c);
    saveConsent(c);
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claiming = useRef(false);

  const claim = useCallback(async () => {
    if (claiming.current) return;
    claiming.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, consent: consentReady(consentRef.current) ? consentRef.current : undefined }),
      });
      const data = await res.json();
      if (res.status === 428 && data.code === "CONSENT_REQUIRED") {
        // 已登入但還沒同意過：顯示告知，勾選後再按一次領取
        setAskConsent(true);
        claiming.current = false;
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "領取失敗，請再試一次");
      try {
        sessionStorage.removeItem(CONSENT_KEY);
      } catch {
        // 忽略
      }
      setDone(data);
    } catch (e) {
      setError((e as Error).message);
      claiming.current = false;
    } finally {
      setBusy(false);
    }
  }, [code]);

  if (done) return <ClaimDone show={show} done={done} />;

  return (
    <>
      <div className="stack" style={{ gap: 6 }}>
        <p className="eyebrow">{show.venue}・{show.startsAtLabel}</p>
        <h1 className="title">
          這場演出的節目單
          <br />
          已經為你準備好了
        </h1>
      </div>

      <div className="grow-center">
        <ProgramCard
          size="lg"
          title={show.title}
          companyName={show.companyName}
          startsAt={show.startsAt}
          color={show.color}
          stubRight={<span style={{ padding: "3px 8px", border: "1px solid rgba(244,239,230,0.6)", borderRadius: 999 }}>待領取</span>}
        />
      </div>

      {!open ? (
        <p className="error" role="alert">{closedMessage}</p>
      ) : (
        <div className="stack">
          {askConsent && <ConsentNotice consent={consent} onChange={setConsent} />}
          {error && <p className="error" role="alert">{error}</p>}
          {askConsent && !consentReady(consent) ? (
            <button type="button" className="btn btn-primary" disabled>
              {consent.age === null ? "請先選擇年齡" : "請先勾選同意"}
            </button>
          ) : loggedIn ? (
            <>
              <button type="button" className="btn btn-primary" onClick={claim} disabled={busy}>
                {busy ? "領取中…" : "領取節目單"}
              </button>
              {pseudonym && <p className="small muted center" style={{ margin: 0 }}>以「{pseudonym}」的身分領取</p>}
            </>
          ) : (
            <LoginButtons onLoggedIn={claim} lineLabel="用 LINE 帳號領取" googleHint="沒有 LINE？用 Google 帳號領取" autoLine />
          )}
          <p className="small muted center" style={{ margin: 0 }}>免下載 App・免註冊・約 5 秒完成</p>
        </div>
      )}
    </>
  );
}

/** 首次領取告知：要短到入場時讀得完，完整內容在隱私權政策 */
function ConsentNotice({ consent, onChange }: { consent: Consent; onChange: (c: Consent) => void }) {
  return (
    <section className="consent" aria-labelledby="consent-title">
      <h2 id="consent-title">領取前，花 10 秒看一下</h2>
      <ul>
        <li>吾冊由眾聲道有限公司營運，只取得你的 LINE 或 Google 帳號編號（Google 還有 Email），不取得名字與大頭貼。</li>
        <li>你在吾冊的名字是系統產生的化名，例如「二樓包廂的水獺」。</li>
        <li>收藏公開時，登入吾冊的觀眾會在同一齣戲的節目單下方看到你的化名，以及你收藏過哪些演出（只到年月），劇團的工作人員也可能看到。隨時可以在「我的收藏冊」關閉。</li>
        <li>領取紀錄會在隔天寫入公開的區塊鏈，只記日期、不記個人資料，寫入後無法刪除。</li>
      </ul>
      <fieldset className="age-choice">
        <legend>你的年齡</legend>
        <label>
          <input type="radio" name="age" checked={consent.age === "adult"} onChange={() => onChange({ ...consent, age: "adult" })} />
          <span>18 歲以上</span>
        </label>
        <label>
          <input type="radio" name="age" checked={consent.age === "teen"} onChange={() => onChange({ ...consent, age: "teen", socialPublic: false })} />
          <span>13–17 歲</span>
        </label>
        <span className="small muted">未滿 13 歲請不要使用吾冊。</span>
      </fieldset>
      <label className="toggle-row">
        <input type="checkbox" checked={consent.agree} onChange={(e) => onChange({ ...consent, agree: e.target.checked })} />
        <span>
          我同意
          <a href="/terms" target="_blank" rel="noreferrer">使用條款</a>與<a href="/privacy" target="_blank" rel="noreferrer">隱私權政策</a>
          {consent.age === "teen" && <span className="small muted" style={{ display: "block" }}>13–17 歲請和家長或監護人一起看過條款再同意。</span>}
        </span>
      </label>
      {consent.age === "teen" ? (
        <p className="small muted" style={{ margin: 0 }}>13–17 歲的收藏不公開，其他觀眾看不到你的化名與頭像。滿 18 歲後可以在「我的收藏冊」改。</p>
      ) : (
        <label className="toggle-row">
          <input type="checkbox" checked={consent.socialPublic} onChange={(e) => onChange({ ...consent, socialPublic: e.target.checked })} />
          <span>
            公開我的收藏
            <span className="small muted" style={{ display: "block" }}>之後隨時可以在「我的收藏冊」改。</span>
          </span>
        </label>
      )}
    </section>
  );
}

function ClaimDone({ show, done }: { show: ShowProps; done: Done }) {
  const [inLine, setInLine] = useState(false);

  useEffect(() => {
    getLiff()
      .then((liff) => setInLine(liff.isInClient()))
      .catch(() => setInLine(false));
  }, []);

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--accent)", letterSpacing: "0.06em" }}>
          {done.alreadyClaimed ? "你已經領過了" : "領取完成"}
        </span>
      </div>

      <div className="grow-center">
        <ProgramCard
          size="lg"
          animate
          title={show.title}
          companyName={show.companyName}
          startsAt={show.startsAt}
          color={show.color}
          stubRight={<span style={{ padding: "3px 8px", border: "1px solid rgba(244,239,230,0.6)", borderRadius: 999 }}>已收藏</span>}
        />
      </div>

      <div className="stack center" style={{ gap: 8 }}>
        <h1 className="title">已收進你的收藏冊</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          《{show.title}》的節目單，散場後也能隨時重讀
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <span className="chip chip-wait">
          <span className="dot" aria-hidden="true" />
          收藏憑證明天寫入區塊鏈，不影響你閱讀
        </span>
      </div>

      <div className="stack" style={{ gap: 10 }}>
        <Link href={`/booklet/${done.claimId}`} className="btn btn-primary">打開節目單</Link>
        {inLine ? (
          <button type="button" className="btn btn-outline" onClick={() => closeLiffWindow()}>回到 LINE</button>
        ) : (
          <Link href="/me" className="btn btn-outline">查看我的收藏冊</Link>
        )}
        <p className="small muted center" style={{ margin: "2px 0 0" }}>
          {inLine ? "節目單連結已傳到你的 LINE，散場後也能隨時打開" : "散場後隨時可以回到收藏冊重讀"}
        </p>
      </div>
    </>
  );
}
