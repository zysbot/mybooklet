import { getDb } from "@/lib/db";
import { getShow } from "@/lib/booklets";
import { renderCoverSvg } from "@/lib/cover";

/** 場次卡面圖（SVG），也是 token 的圖片 */
export async function GET(_req: Request, { params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  if (!/^\d+$/.test(showId)) return new Response("找不到", { status: 404 });
  const show = await getShow(getDb(), showId);
  if (!show) return new Response("找不到", { status: 404 });

  const svg = renderCoverSvg({
    title: show.title,
    companyName: show.companyName,
    startsAt: show.startsAt,
    color: show.coverColor,
    label: show.designLabel === "一般場" ? undefined : show.designLabel,
  });
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
}
