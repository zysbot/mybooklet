import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 檔案儲存：節目單頁面圖片。
 * - 設定了 BLOB_READ_WRITE_TOKEN（Vercel Blob）→ 存到 Vercel Blob，回傳公開網址
 * - 沒設定 → 存在本機資料夾（開發與測試用），由 /api/files 提供
 * 第 1 階段起，確認後的節目單另外上傳 Arweave 永久保存。
 */
export interface FileStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>;
}

function localDir(): string {
  return path.resolve(process.env.LOCAL_UPLOAD_DIR ?? path.join(process.cwd(), ".data", "uploads"));
}

/** 只允許安全的路徑片段，避免寫到資料夾外 */
export function safeKey(key: string): string {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..")) throw new Error(`無效的檔案路徑：${key}`);
  return key;
}

export function createLocalStore(): FileStore {
  return {
    async put(key, bytes) {
      const file = path.join(localDir(), safeKey(key));
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      return `/api/files/${key}`;
    },
  };
}

export async function readLocalFile(key: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(localDir(), safeKey(key)));
  } catch {
    return null;
  }
}

export function createBlobStore(): FileStore {
  return {
    async put(key, bytes, contentType) {
      const { put } = await import("@vercel/blob");
      const blob = await put(safeKey(key), Buffer.from(bytes), {
        access: "public",
        contentType,
        addRandomSuffix: false,
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });
      return blob.url;
    },
  };
}

export function getFileStore(): FileStore {
  return process.env.BLOB_READ_WRITE_TOKEN ? createBlobStore() : createLocalStore();
}
