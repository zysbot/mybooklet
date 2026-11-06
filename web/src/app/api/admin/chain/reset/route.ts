import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { currentNetwork } from "@/lib/network";
import { getDb } from "@/lib/db";
import { resetChainState } from "@/lib/chain-admin";

/** 換到新合約後：所有場次與領取回到「尚未上鏈」 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  if (!currentNetwork().testnet) return NextResponse.json({ error: "只能在測試網使用" }, { status: 403 });
  const { confirm } = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (confirm !== "RESET") return NextResponse.json({ error: "缺少確認" }, { status: 400 });
  return NextResponse.json(await resetChainState(getDb()));
}
