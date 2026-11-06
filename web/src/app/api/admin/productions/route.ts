import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { siteUrl } from "@/lib/format";
import { createProduction, configureShowsOnChain, ProductionError, type ProductionInput } from "@/lib/productions";
import { setShowURIOnChain } from "@/lib/chain";

export const maxDuration = 60;

/** 上架節目：寫入資料庫，再把每個場次的內容網址寫進合約 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "請先登入後台" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as (ProductionInput & { dedupe?: boolean }) | null;
  if (!body) return NextResponse.json({ error: "資料格式不正確" }, { status: 400 });

  const db = getDb();
  let created;
  try {
    created = await createProduction(db, body, siteUrl(), { dedupe: body.dedupe === true });
  } catch (err) {
    if (err instanceof ProductionError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  const chain = await configureShowsOnChain(db, created.shows.map((s) => s.showId), setShowURIOnChain);
  return NextResponse.json({ ...created, chain });
}
