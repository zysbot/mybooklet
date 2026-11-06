import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function Home() {
  return (
    <main className="page" style={{ justifyContent: "center" }}>
      <Brand />
      <div className="stack" style={{ gap: 10 }}>
        <h1 className="title" style={{ fontSize: 30 }}>每一場演出，<br />都留下一本節目單。</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.8 }}>
          入場前掃描現場的 QR code，用 LINE 或 Google 帳號領取數位節目單。散場後隨時回來重讀，收藏紀錄永久寫在區塊鏈上。
        </p>
      </div>
      <Link href="/me" className="btn btn-dark">打開我的收藏冊</Link>
    </main>
  );
}
