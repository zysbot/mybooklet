"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgramCard } from "@/components/ProgramCard";
import { LoginButtons, closeLiffWindow } from "@/components/LoginButtons";
import { getLiff } from "@/lib/liff-client";
import { formatSerial } from "@/lib/format";

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
}

type Done = { claimId: string; serial: number; alreadyClaimed: boolean };

export function ClaimFlow({ code, show, open, closedMessage, loggedIn, pseudonym }: Props) {
  const [done, setDone] = useState<Done | null>(null);
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
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "領取失敗，請再試一次");
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
          {error && <p className="error" role="alert">{error}</p>}
          {loggedIn ? (
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
          stubRight={<span style={{ fontFamily: "var(--serif)", fontSize: 13 }}>No. {formatSerial(done.serial)}</span>}
        />
      </div>

      <div className="stack center" style={{ gap: 8 }}>
        <h1 className="title">已收進你的收藏冊</h1>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          你是第 {done.serial} 位領取《{show.title}》節目單的觀眾
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
