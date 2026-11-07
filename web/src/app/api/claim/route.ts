import { NextResponse, after } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { claimShow, ClaimError, CLAIM_ERROR_MESSAGES } from "@/lib/claim";
import { getShow } from "@/lib/booklets";
import { getUser } from "@/lib/users";
import { notifyClaimed } from "@/lib/notify";

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
      // 免費方案用完對外一律顯示「已發完」，不透露主辦方的方案
      const publicCode = err.code === "FREE_LIMIT" ? "SOLD_OUT" : err.code;
      return NextResponse.json({ error: CLAIM_ERROR_MESSAGES[err.code], code: publicCode }, { status: 409 });
    }
    throw err;
  }

  // 回應觀眾之後，才在背景通知：觀眾不用等。
  // 上鏈不在這裡做：每天批次一次（/api/cron/mint），鏈上看不出領取的確切時間。
  if (!result.alreadyClaimed) {
    after(async () => {
      const [user, show] = await Promise.all([getUser(db, userId), getShow(db, result.showId)]);
      if (user && show) await notifyClaimed(user, show, result);
    });
  }

  return NextResponse.json({
    claimId: result.claimId,
    alreadyClaimed: result.alreadyClaimed,
  });
}
