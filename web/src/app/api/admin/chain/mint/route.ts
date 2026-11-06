import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { currentNetwork } from "@/lib/network";
import { getDb } from "@/lib/db";
import { runMintUntilDone } from "@/lib/mint-worker";
import { createMintChain } from "@/lib/chain";
import { getWalletXpub } from "@/lib/wallet";

export const maxDuration = 60;

/**
 * 測試用：立即上鏈，不等每日批次，也包含今天的領取。
 * 正式上線後不要使用：當天立即上鏈會讓鏈上的交易時間接近領取時間。
 */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  if (!currentNetwork().testnet) return NextResponse.json({ error: "只能在測試網使用" }, { status: 403 });
  try {
    return NextResponse.json(await runMintUntilDone(getDb(), createMintChain(), { xpub: getWalletXpub() }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message.slice(0, 300) : String(err) }, { status: 502 });
  }
}
