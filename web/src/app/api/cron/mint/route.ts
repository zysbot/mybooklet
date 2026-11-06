import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMintUntilDone, startOfTaipeiDay } from "@/lib/mint-worker";
import { createMintChain } from "@/lib/chain";
import { getWalletXpub } from "@/lib/wallet";

export const maxDuration = 60;

/**
 * 每日上鏈批次：把「台北時間今天以前」領取的節目單，隨機打亂後批次鑄造。
 * 由 GitHub Actions（.github/workflows/mint-sweeper.yml）每天呼叫；回應的 more 為 true 時表示還有剩，會再呼叫一次。
 * 需帶 Authorization: Bearer <CRON_SECRET>。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const report = await runMintUntilDone(getDb(), createMintChain(), {
    xpub: getWalletXpub(),
    claimedBefore: startOfTaipeiDay(new Date()),
  });
  return NextResponse.json(report);
}
