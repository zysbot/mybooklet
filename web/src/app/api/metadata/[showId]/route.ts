import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getShow } from "@/lib/booklets";
import { formatDate, siteUrl } from "@/lib/format";

/**
 * 場次的 ERC-721 metadata，讓錢包與區塊鏈瀏覽器顯示節目單。
 * 第 0 階段（測試網）由網站提供；第 1 階段起改為上傳 Arweave，合約指向 Arweave 網址。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  if (!/^\d+$/.test(showId)) return NextResponse.json({ error: "找不到" }, { status: 404 });
  const show = await getShow(getDb(), showId);
  if (!show) return NextResponse.json({ error: "找不到" }, { status: 404 });

  return NextResponse.json(
    {
      name: `${show.title}｜${formatDate(show.startsAt)}`,
      description: `${show.companyName}《${show.title}》入場紀念節目單。${show.venue}，${formatDate(show.startsAt)}。吾冊 My Booklet。`,
      image: `${siteUrl()}/api/cover/${show.showId}`,
      external_url: siteUrl(),
      attributes: [
        { trait_type: "節目", value: show.title },
        { trait_type: "演出團隊", value: show.companyName },
        { trait_type: "場館", value: show.venue },
        { trait_type: "演出日期", value: formatDate(show.startsAt) },
        { trait_type: "卡面", value: show.designLabel },
        ...(show.genre ? [{ trait_type: "類型", value: show.genre }] : []),
      ],
    },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
