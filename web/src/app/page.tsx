import Link from "next/link";
import { getDb } from "@/lib/db";
import { listHomeProductions, type HomeProduction } from "@/lib/booklets";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import "./home.css";

// 演出列表每 10 分鐘更新一次即可
export const revalidate = 600;

/** 介紹社交功能用的示意化名（不是真實觀眾） */
const SAMPLE_PEOPLE = [
  { name: "二樓包廂的水獺", pct: 64 },
  { name: "第七排靠走道的狐狸", pct: 51 },
  { name: "謝幕後的貓頭鷹", pct: 47 },
  { name: "最後一排的刺蝟", pct: 38 },
  { name: "中場休息的山羌", pct: 33 },
  { name: "樓座邊邊的鯨魚", pct: 25 },
];

async function loadShows(): Promise<HomeProduction[]> {
  try {
    return await listHomeProductions(getDb());
  } catch {
    return []; // 資料庫暫時連不上時，首頁其他內容照常顯示
  }
}

function Ticket({ title, date, color, tag, className }: { title: string; date?: string; color: string; tag?: string; className?: string }) {
  return (
    <div className={`home-ticket ${className ?? ""}`} style={{ background: color }}>
      <div className="home-ticket-body">
        <div className="home-ticket-side">
          <span>PROGRAM</span>
          {date && <span>{date}</span>}
        </div>
        <span className="home-ticket-title">{title}</span>
      </div>
      {tag && (
        <>
          <div className="home-ticket-rule" />
          <div className="home-ticket-stub">
            <span>入場紀念</span>
            <span className="home-ticket-tag">{tag}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default async function Home() {
  const shows = await loadShows();

  return (
    <div className="home">
      <header className="home-wrap home-header">
        <Link href="/" className="home-brand">
          <span className="home-brand-zh">吾冊</span>
          <span className="home-brand-en">My Booklet</span>
        </Link>
        <nav aria-label="主要選單" className="home-nav">
          {shows.length > 0 && <a href="#shows">演出</a>}
          <a href="#how">怎麼用</a>
          <a href="#companies">給劇團</a>
          <Link href="/me" className="home-nav-btn">我的收藏冊</Link>
        </nav>
      </header>

      <section className="home-wrap home-hero">
        <div className="home-hero-text">
          <p className="home-eyebrow">表演藝術的數位節目單</p>
          <h1><span className="home-line">每一場演出，</span><span className="home-line">都留下一本節目單。</span></h1>
          <p className="home-lead">入場時掃一下 QR code，這場演出的節目單就收進你的收藏冊。免下載 App，用 LINE 或 Google 登入，散場後隨時重讀。</p>
          <div className="home-ctas">
            <Link href="/me" className="home-btn home-btn-primary">打開我的收藏冊</Link>
            <a href="#companies" className="home-btn home-btn-quiet">我是劇團或場館</a>
          </div>
        </div>
        <div className="home-hero-art" aria-hidden="true">
          <div className="home-fan">
            <Ticket title="退潮" color="#2F3B3F" className="home-fan-left" />
            <Ticket title="夜行列車" color="#5B2C45" className="home-fan-right" />
            <Ticket title="潮汐備忘錄" date="2026.11.14" color="#23305C" tag="已收藏" className="home-fan-front" />
          </div>
        </div>
      </section>

      {shows.length > 0 && (
        <section id="shows" className="home-band">
          <div className="home-wrap home-section">
            <div className="home-section-head">
              <h2>這些演出有吾冊節目單</h2>
              <p>入場時在現場掃 QR code 領取</p>
            </div>
            <div className="home-shows">
              {shows.map((s) => (
                <article key={s.productionId} className="home-show">
                  <div className="home-show-cover" style={{ background: s.coverColor }}>
                    <span className="home-show-genre">{s.genre ?? ""}</span>
                    <span className="home-show-vtitle" aria-hidden="true">{s.title}</span>
                  </div>
                  <div className="home-show-meta">
                    <h3>{s.title}</h3>
                    <span className="muted">{s.companyName}</span>
                    <span>{formatDate(s.startsAt)}・{s.venue}</span>
                  </div>
                  <span className={s.upcoming ? "home-tag home-tag-soon" : "home-tag"}>
                    {s.upcoming ? "即將演出・入場掃碼領取" : "已演出"}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="how" className="home-wrap home-section">
        <h2>三個步驟，不用下載任何東西</h2>
        <ol className="home-steps">
          <li>
            <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></svg>
            <span className="home-step-no">01</span>
            <h3>入場時掃碼</h3>
            <p>現場會有吾冊的 QR code。用手機相機掃，用 LINE 或 Google 登入，約 5 秒完成。</p>
          </li>
          <li>
            <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16l-8-4-8 4z" /></svg>
            <span className="home-step-no">02</span>
            <h3>收進你的收藏冊</h3>
            <p>節目單立刻可以讀。看過的每一場都排在同一本收藏冊裡，可以依年份、類型、場館翻找。</p>
          </li>
          <li>
            <svg aria-hidden="true" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6c-2-1.5-5-2-8-1.5V19c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V4.5C17 4 14 4.5 12 6z" /><path d="M12 6v14.5" /></svg>
            <span className="home-step-no">03</span>
            <h3>散場後慢慢讀</h3>
            <p>在回家的捷運上、在幾年後的某一天。節目單不會被折爛，也不會在搬家時弄丟。</p>
          </li>
        </ol>
      </section>

      <section className="home-wrap home-social">
        <div className="home-social-text">
          <h2>也看見和你<br />看了同一齣戲的人</h2>
          <p>每位觀眾在吾冊都有一個系統產生的化名與印章頭像。打開公開收藏後，你會在節目單下方看到同一齣戲的收藏者，依足跡相似度排列，看看誰和你看過最多同樣的戲。</p>
          <p className="small muted">吾冊不顯示真實姓名、LINE、Email、照片或領取時間。公開與否由你決定，隨時可以關閉。</p>
        </div>
        <figure className="home-social-card">
          <figcaption>也收藏了《退潮》的人<span className="small muted">（示意）</span></figcaption>
          <div className="people home-people">
            {SAMPLE_PEOPLE.map((p) => (
              <div key={p.name} className="person">
                <Avatar pseudonym={p.name} size={52} />
                <span className="person-name">{p.name}</span>
                <span className="person-pct">相似 {p.pct}%</span>
              </div>
            ))}
          </div>
        </figure>
      </section>

      <section className="home-chain">
        <div className="home-wrap home-chain-grid">
          <div>
            <h3>每一份都真的發出過</h3>
            <p>每份節目單在區塊鏈上都有一筆公開紀錄，發了幾份、哪一場，任何人都能查證，無法偽造或灌水。</p>
          </div>
          <div>
            <h3>鏈上沒有你的個人資料</h3>
            <p>鏈上只記節目、場次和日期，不記你的名字，也不記你幾點入場。每份節目單放在各自的地址，串不出同一個人的紀錄。</p>
          </div>
          <div>
            <h3>收藏屬於你</h3>
            <p>就算有一天吾冊不在了，紀錄仍然在鏈上。</p>
          </div>
        </div>
      </section>

      <section id="companies" className="home-dark">
        <div className="home-wrap home-companies">
          <div className="home-companies-text">
            <p className="home-eyebrow">給劇團、製作方與場館</p>
            <h2>把節目單交給吾冊，<br />把觀眾留在作品裡。</h2>
            <p>上傳節目單 PDF，吾冊產生入場 QR code。觀眾掃碼就能讀，不需要你另外印刷或架網站。下一檔演出的消息、問卷或優惠，也可以附在節目單下方。</p>
            <a href="mailto:gm@volumedao.xyz?subject=%E5%90%BE%E5%86%8A%E5%90%88%E4%BD%9C%E6%B4%BD%E8%AB%87" className="home-btn home-btn-light">洽談合作</a>
          </div>
          <ul className="home-benefits">
            <li>
              <strong>省下印刷，響應無紙化</strong>
              <span>數位節目單取代紙本：少印幾百份、少一趟運送，散場後也不會留下一地被丟掉的節目單。內容可以比紙本更完整，演出前一刻還能更新。</span>
            </li>
            <li>
              <strong>公開、可查證的發行紀錄</strong>
              <span>每場發了幾份都記在鏈上，可以放進結案報告或補助申請。</span>
            </li>
            <li>
              <strong>認識你的觀眾，但不碰個資</strong>
              <span>合作期間，後台提供觀眾組成、回頭率、還看過哪些類型的匿名統計。少於 10 人的分群一律不顯示。</span>
            </li>
          </ul>
        </div>
      </section>

      <footer className="home-wrap home-footer">
        <div className="home-footer-co">
          <span className="home-footer-brand">吾冊<span className="home-brand-en"> My Booklet</span></span>
          <span>由眾聲道有限公司營運・統一編號 93591775</span>
          <span>臺北市信義區基隆路2段22號2樓之3</span>
        </div>
        <nav aria-label="頁尾選單" className="home-footer-nav">
          <Link href="/privacy">隱私權政策</Link>
          <Link href="/terms">使用條款</Link>
          <Link href="/terms/organizers">主辦方服務條款</Link>
          <a href="mailto:gm@volumedao.xyz">gm@volumedao.xyz</a>
        </nav>
      </footer>
    </div>
  );
}
