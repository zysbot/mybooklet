import { readLocalFile } from "@/lib/storage";

const TYPES: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg" };

/** 只在本機開發時使用：正式環境的頁面圖片放在 Vercel Blob，有自己的網址 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (process.env.BLOB_READ_WRITE_TOKEN) return new Response("找不到", { status: 404 });
  const { key } = await params;
  const path = key.join("/");
  const ext = path.split(".").pop() ?? "";
  if (!TYPES[ext]) return new Response("找不到", { status: 404 });

  let bytes: Buffer | null = null;
  try {
    bytes = await readLocalFile(path);
  } catch {
    bytes = null;
  }
  if (!bytes) return new Response("找不到", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": TYPES[ext], "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
