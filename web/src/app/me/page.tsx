import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { getUser } from "@/lib/users";
import { listUserBooklets } from "@/lib/booklets";
import { Brand } from "@/components/Brand";
import { Gallery } from "./Gallery";
import { LoginGate, LogoutButton } from "./LoginGate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "我的收藏冊｜吾冊" };

export default async function MyCollectionPage() {
  const db = getDb();
  const userId = await currentUserId();
  const user = userId ? await getUser(db, userId) : null;

  if (!user) {
    return (
      <main className="page">
        <div className="topbar"><Brand /></div>
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="title">我的收藏冊</h1>
          <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>用領取節目單時的帳號登入，就能看到你收藏的所有節目單。</p>
        </div>
        <LoginGate />
      </main>
    );
  }

  const booklets = await listUserBooklets(db, user.id);
  const firstYear = booklets.length ? Math.min(...booklets.map((b) => b.startsAt.getFullYear())) : null;

  return (
    <main className="page">
      <div className="topbar">
        <Brand />
        <LogoutButton />
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <h1 className="title" style={{ fontSize: 30 }}>我的收藏冊</h1>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {booklets.length > 0 ? `${booklets.length} 份節目單・${firstYear} 年起` : "還沒有節目單"}
          {user.pseudonym ? `・化名「${user.pseudonym}」` : ""}
        </p>
      </div>
      {booklets.length === 0 ? (
        <p className="empty">下次入場前掃描現場的 QR code，<br />節目單就會出現在這裡。</p>
      ) : (
        <Gallery
          items={booklets.map((b) => ({
            claimId: b.claimId,
            title: b.title,
            companyName: b.companyName,
            genre: b.genre,
            venue: b.venue,
            favoriteRank: b.favoriteRank,
            startsAt: b.startsAt.toISOString(),
            serial: b.serial,
            color: b.coverColor,
          }))}
        />
      )}
      <p className="small muted center" style={{ margin: "8px 0 0" }}>每次入場掃碼，新的節目單會自動出現在這裡</p>
    </main>
  );
}
