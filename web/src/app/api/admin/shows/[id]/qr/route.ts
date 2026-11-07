import QRCode from "qrcode";
import { isAdmin } from "@/lib/admin";
import { getDb } from "@/lib/db";
import { siteUrl } from "@/lib/format";

/**
 * 場次的領取 QR code（PNG，適合列印）。
 * 預設直接顯示在瀏覽器；加 ?download=1 則下載成檔案。
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response("請先登入後台", { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("找不到", { status: 404 });
  const r = await getDb().query<{ code: string; title: string }>(
    `SELECT cc.code, p.title FROM claim_codes cc JOIN shows s ON s.id = cc.show_id JOIN productions p ON p.id = s.production_id
      WHERE cc.show_id = $1 ORDER BY cc.id LIMIT 1`,
    [id]
  );
  const row = r.rows[0];
  if (!row) return new Response("找不到", { status: 404 });
  const png = await QRCode.toBuffer(`${siteUrl()}/c/${row.code}`, { width: 1024, margin: 2, errorCorrectionLevel: "M" });
  const filename = encodeURIComponent(`吾冊-${row.title}-場次${id}.png`);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
    },
  });
}
