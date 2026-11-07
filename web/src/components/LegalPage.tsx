import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Markdown } from "@/components/Markdown";
import { LEGAL_EFFECTIVE } from "@/content/legal";

export function LegalPage({ title, source }: { title: string; source: string }) {
  return (
    <main className="page legal">
      <div className="topbar"><Brand /></div>
      <h1 className="title">{title}</h1>
      {LEGAL_EFFECTIVE ? (
        <p className="small muted" style={{ margin: 0 }}>生效日：{LEGAL_EFFECTIVE}</p>
      ) : (
        <p className="legal-draft" role="note">草案：本文件正由律師審閱，內容可能調整，尚未生效。</p>
      )}
      <Markdown source={source} />
      <nav aria-label="其他條款" className="legal-nav">
        <Link href="/privacy">隱私權政策</Link>
        <Link href="/terms">使用條款</Link>
        <Link href="/terms/organizers">主辦方服務條款</Link>
        <Link href="/">回首頁</Link>
      </nav>
    </main>
  );
}
