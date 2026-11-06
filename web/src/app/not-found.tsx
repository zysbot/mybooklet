import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function NotFound() {
  return (
    <main className="page">
      <Brand />
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="title">找不到這個頁面</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>QR code 可能已失效，或這份節目單不屬於目前登入的帳號。</p>
      </div>
      <Link href="/me" className="btn btn-outline">回到我的收藏冊</Link>
    </main>
  );
}
