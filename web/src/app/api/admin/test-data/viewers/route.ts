import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { seedTestViewers, clearTestViewers } from "@/lib/test-data";

export const maxDuration = 60;

/** 建立 20 位測試觀眾並領取測試節目；上鏈交給每日批次（或後台的「立即上鏈」） */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const { includeUserId } = (await req.json().catch(() => ({}))) as { includeUserId?: string };
  const report = await seedTestViewers(getDb(), {
    includeUserId: includeUserId && /^\d+$/.test(includeUserId) ? includeUserId : undefined,
  });
  return NextResponse.json(report);
}

/** 清除測試觀眾 */
export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const removed = await clearTestViewers(getDb());
  return NextResponse.json({ removed });
}
