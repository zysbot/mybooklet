import { randomInt } from "node:crypto";
import { HDNodeWallet, getAddress } from "ethers";

/**
 * 代管地址推導：一份節目單一個地址。
 *
 * 伺服器只持有「延伸公鑰」（xpub，路徑 m/44'/60'/0'/0），只能算出地址，無法簽名。
 * 對應的助記詞離線保管，平時完全不需要動用：token 不可轉讓，搬家由合約的搬遷角色執行。
 *
 * 每份節目單的地址 = xpub 往下三層、每層一個隨機編號（0 到 2^31−1），例如 "1834620771/90214477/2044012399"。
 * - 同一位觀眾的每份節目單地址都不同，鏈上無法把一個人的收藏串起來。
 * - 編號是隨機的（約 93 位元），即使 xpub 外洩，也無法逐一試出哪些地址屬於吾冊。
 * - 編號只存在資料庫（claims.custody_path）。刪除帳號時刪掉編號，鏈上紀錄就連吾冊也無法對回本人。
 * - 需要時，持有助記詞的人可用完整路徑 m/44'/60'/0'/0/<編號> 推導私鑰。
 */
export const CUSTODY_PATH_DEPTH = 3;
const MAX_INDEX = 2 ** 31; // 非強化推導的上限

export function newCustodyPath(): string {
  return Array.from({ length: CUSTODY_PATH_DEPTH }, () => randomInt(0, MAX_INDEX)).join("/");
}

export function parseCustodyPath(path: string): number[] {
  const parts = path.split("/");
  if (parts.length !== CUSTODY_PATH_DEPTH) throw new Error(`無效的代管路徑：${path}`);
  return parts.map((p) => {
    const n = Number(p);
    if (!/^\d+$/.test(p) || !Number.isSafeInteger(n) || n >= MAX_INDEX) throw new Error(`無效的代管路徑：${path}`);
    return n;
  });
}

export function deriveCustodialAddress(xpub: string, custodyPath: string): string {
  let node = HDNodeWallet.fromExtendedKey(xpub);
  if (node.depth !== 4) {
    throw new Error("WALLET_XPUB 必須是 m/44'/60'/0'/0 這一層的延伸公鑰");
  }
  for (const index of parseCustodyPath(custodyPath)) node = node.deriveChild(index);
  return getAddress(node.address);
}

export function getWalletXpub(): string {
  const xpub = process.env.WALLET_XPUB;
  if (!xpub) throw new Error("缺少環境變數 WALLET_XPUB");
  return xpub;
}
