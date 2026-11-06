import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";

/** 產生（或更換）組織的邀請連結。更換後，舊連結立即失效；已加入的成員不受影響。 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "找不到" }, { status: 404 });
  const token = randomBytes(18).toString("base64url");
  const r = await getDb().query(`UPDATE organizers SET invite_token = $2 WHERE id = $1 RETURNING id`, [id, token]);
  if (!r.rows[0]) return NextResponse.json({ error: "找不到" }, { status: 404 });
  return NextResponse.json({ token });
}
