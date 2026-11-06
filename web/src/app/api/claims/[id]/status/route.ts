import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";

/** 領取成功畫面每幾秒查一次：收藏憑證寫入了沒 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "找不到" }, { status: 404 });

  const r = await getDb().query<{ chain_status: string; token_id: string | null }>(
    `SELECT chain_status, token_id FROM claims WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  const row = r.rows[0];
  if (!row) return NextResponse.json({ error: "找不到" }, { status: 404 });
  return NextResponse.json({ chainStatus: row.chain_status, tokenId: row.token_id === null ? null : String(row.token_id) });
}
