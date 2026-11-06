import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runMintBatch } from "@/lib/mint-worker";
import { createMintChain } from "@/lib/chain";

export const maxDuration = 60;

/**
 * 定時掃描：處理到期的重試與卡住的紀錄。
 * 由 GitHub Actions（.github/workflows/mint-sweeper.yml）每 5 分鐘呼叫一次。
 * 需帶 Authorization: Bearer <CRON_SECRET>。
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const db = getDb();
  const chain = createMintChain();
  const total = { reconciled: 0, submitted: 0, minted: 0, retried: 0, failed: 0 };
  // 一次呼叫最多跑 5 批，避免超過執行時間
  for (let i = 0; i < 5; i++) {
    const r = await runMintBatch(db, chain);
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
    if (r.submitted === 0) break;
  }
  return NextResponse.json(total);
}
