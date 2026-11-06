import { NextResponse, after } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { claimShow, ClaimError, CLAIM_ERROR_MESSAGES } from "@/lib/claim";
import { getShow } from "@/lib/booklets";
import { getUser } from "@/lib/users";
import { notifyClaimed } from "@/lib/notify";
import { runMintBatch } from "@/lib/mint-worker";
import { createMintChain } from "@/lib/chain";

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code) return NextResponse.json({ error: "缺少領取碼" }, { status: 400 });

  const db = getDb();
  let result;
  try {
    result = await claimShow(db, userId, code);
  } catch (err) {
    if (err instanceof ClaimError) {
      return NextResponse.json({ error: CLAIM_ERROR_MESSAGES[err.code], code: err.code }, { status: 409 });
    }
    throw err;
  }

  // 回應觀眾之後，才在背景通知與上鏈：觀眾不用等
  if (!result.alreadyClaimed) {
    after(async () => {
      const [user, show] = await Promise.all([getUser(db, userId), getShow(db, result.showId)]);
      if (user && show) await notifyClaimed(user, show, result);
      try {
        await runMintBatch(db, createMintChain());
      } catch (err) {
        // 失敗沒關係：定時掃描會再處理
        console.warn("即時上鏈失敗，等待定時重試：", err instanceof Error ? err.message : err);
      }
    });
  }

  return NextResponse.json({
    claimId: result.claimId,
    serial: result.serial,
    alreadyClaimed: result.alreadyClaimed,
  });
}
