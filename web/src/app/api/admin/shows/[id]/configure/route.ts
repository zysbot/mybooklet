import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { configureShowsOnChain } from "@/lib/productions";
import { setShowURIOnChain } from "@/lib/chain";

/** 重新把場次的內容網址寫進合約（上架時寫入失敗用） */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "找不到" }, { status: 404 });
  const [result] = await configureShowsOnChain(getDb(), [id], setShowURIOnChain);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
