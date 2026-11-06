import { NextResponse, after } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { getWalletXpub } from "@/lib/wallet";
import { seedTestViewers, clearTestViewers } from "@/lib/test-data";
import { runMintBatch } from "@/lib/mint-worker";
import { createMintChain } from "@/lib/chain";

export const maxDuration = 60;

/** 建立 20 位測試觀眾並領取測試節目；之後在背景上鏈 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const { includeUserId } = (await req.json().catch(() => ({}))) as { includeUserId?: string };
  const db = getDb();
  const report = await seedTestViewers(db, getWalletXpub(), {
    includeUserId: includeUserId && /^\d+$/.test(includeUserId) ? includeUserId : undefined,
  });
  after(async () => {
    try {
      const chain = createMintChain();
      for (let i = 0; i < 6; i++) {
        const r = await runMintBatch(db, chain);
        if (r.submitted === 0) break;
      }
    } catch (err) {
      console.warn("測試觀眾上鏈失敗，等待定時重試：", err instanceof Error ? err.message : err);
    }
  });
  return NextResponse.json(report);
}

/** 清除測試觀眾 */
export async function DELETE() {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const removed = await clearTestViewers(getDb());
  return NextResponse.json({ removed });
}
