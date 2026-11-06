import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { configurePendingShows } from "@/lib/chain-admin";
import { setShowURIOnChain } from "@/lib/chain";

export const maxDuration = 60;

/** 把所有還沒寫入合約的場次寫入；時間用完就停，回傳剩下幾場 */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  return NextResponse.json(await configurePendingShows(getDb(), setShowURIOnChain));
}
