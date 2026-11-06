import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { TEST_VIEWER_PREFIX } from "@/lib/test-data";
import { currentUserId } from "@/lib/session";
import { networkLabel } from "@/lib/network";
import { TestDataTools } from "./TestDataTools";
import "../admin.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "測試資料｜吾冊後台", robots: { index: false } };

export default async function TestDataPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const db = getDb();
  const [users, testCount, chainStats, me] = await Promise.all([
    db.query<{ id: string; pseudonym: string | null; line_user_id: string | null; claims: string }>(
      `SELECT u.id, u.pseudonym, u.line_user_id, (SELECT count(*) FROM claims c WHERE c.user_id = u.id) AS claims
         FROM users u WHERE u.google_sub IS NULL OR u.google_sub NOT LIKE $1 ORDER BY u.id`,
      [`${TEST_VIEWER_PREFIX}%`]
    ),
    db.query<{ n: string }>(`SELECT count(*) AS n FROM users WHERE google_sub LIKE $1`, [`${TEST_VIEWER_PREFIX}%`]),
    db.query<{ unconfigured: string; pending: string; minted: string }>(
      `SELECT (SELECT count(*) FROM shows WHERE NOT chain_configured) AS unconfigured,
              (SELECT count(*) FROM claims WHERE chain_status IN ('pending', 'submitted')) AS pending,
              (SELECT count(*) FROM claims WHERE chain_status = 'minted') AS minted`
    ),
    currentUserId(),
  ]);
  const stats = chainStats.rows[0];
  return (
    <main className="admin">
      <Link href="/admin" className="back">← 回到後台</Link>
      <div className="stack" style={{ gap: 6 }}>
        <h1>測試資料</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.7 }}>只在測試階段使用。正式上線前，用最下方的按鈕清除測試觀眾。</p>
      </div>
      <TestDataTools
        realUsers={users.rows.map((u) => ({
          id: String(u.id),
          current: String(u.id) === me,
          label: `${u.pseudonym ?? "（未命名）"}・${u.line_user_id ? "LINE" : "Google"}・已領 ${Number(u.claims)} 份${String(u.id) === me ? "・這個瀏覽器目前登入的帳號" : ""}`,
        }))}
        testViewerCount={Number(testCount.rows[0].n)}
        chain={{
          network: networkLabel(),
          unconfiguredShows: Number(stats.unconfigured),
          pendingClaims: Number(stats.pending),
          mintedClaims: Number(stats.minted),
        }}
      />
    </main>
  );
}
