import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { seedTestViewers, clearTestViewers, syncTestCatalog } from "@/lib/test-data";
import { siteUrl } from "@/lib/format";

export const maxDuration = 60;

/** 建立 50 位測試觀眾並領取測試節目；上鏈交給每日批次（或後台的「立即上鏈」）。約 45 秒後停下，回傳 more 時再呼叫一次。 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const { includeUserId } = (await req.json().catch(() => ({}))) as { includeUserId?: string };
  const report = await seedTestViewers(getDb(), {
    includeUserId: includeUserId && /^\d+$/.test(includeUserId) ? includeUserId : undefined,
    budgetMs: 45_000,
  });
  return NextResponse.json(report);
}

/** 清除測試觀眾 */
export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const removed = await clearTestViewers(getDb());
  return NextResponse.json({ removed });
}

/** 把已上架的測試節目更新成目前的測試目錄（場次、藝術節、導演、編劇） */
export async function PUT() {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  return NextResponse.json(await syncTestCatalog(getDb(), siteUrl()));
}
