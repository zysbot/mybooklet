import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentUserId } from "@/lib/session";
import { setFavorite, removeFavorite, getFavorites, FavoriteError } from "@/lib/favorites";

/** 設定或取消前三喜歡：{ claimId, rank: 1 | 2 | 3 | null } */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  const { claimId, rank } = (await req.json().catch(() => ({}))) as { claimId?: string; rank?: number | null };
  if (!claimId || !/^[0-9a-f-]{36}$/i.test(claimId)) return NextResponse.json({ error: "找不到這份節目單" }, { status: 400 });

  const db = getDb();
  try {
    if (rank === null || rank === undefined) await removeFavorite(db, userId, claimId);
    else await setFavorite(db, userId, claimId, Number(rank));
  } catch (err) {
    if (err instanceof FavoriteError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  return NextResponse.json({ favorites: await getFavorites(db, userId) });
}
