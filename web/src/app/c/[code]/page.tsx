import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { getShowByCode } from "@/lib/booklets";
import { currentUserId } from "@/lib/session";
import { getUser } from "@/lib/users";
import { formatShowTime, formatDateTime } from "@/lib/format";
import { Brand } from "@/components/Brand";
import { ClaimFlow } from "./ClaimFlow";
import { needsConsent } from "@/lib/consent";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const show = await getShowByCode(getDb(), code);
  return { title: show ? `領取《${show.title}》節目單｜吾冊` : "吾冊 My Booklet" };
}

export default async function ClaimPage({ params }: Params) {
  const { code } = await params;
  const db = getDb();
  const show = await getShowByCode(db, code);
  if (!show) notFound();

  const now = new Date();
  let closedMessage: string | null = null;
  if (now < show.validFrom) closedMessage = `節目單將於 ${formatDateTime(show.validFrom)} 開放領取。`;
  else if (now > show.validTo) closedMessage = "這個場次的節目單領取時間已經結束。";

  const userId = await currentUserId();
  const user = userId ? await getUser(db, userId) : null;

  return (
    <main className="page">
      <div className="topbar">
        <Brand />
        <span className="small muted">入場驗證完成</span>
      </div>
      <ClaimFlow
        code={code}
        open={closedMessage === null}
        closedMessage={closedMessage}
        loggedIn={!!user}
        pseudonym={user?.pseudonym ?? null}
        needsConsent={needsConsent(user)}
        show={{
          title: show.title,
          companyName: show.companyName,
          venue: show.venue,
          startsAt: show.startsAt.toISOString(),
          startsAtLabel: formatShowTime(show.startsAt),
          color: show.coverColor,
          image: show.coverImage,
        }}
      />
    </main>
  );
}
