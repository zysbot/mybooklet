import { HDNodeWallet, getAddress } from "ethers";

/**
 * 代管錢包地址推導。
 *
 * 伺服器只持有「延伸公鑰」（xpub，路徑 m/44'/60'/0'/0），只能算出地址，無法簽名。
 * 對應的助記詞離線保管，平時完全不需要動用：token 不可轉讓，搬家由合約的搬遷角色執行。
 * 第 n 位觀眾（users.id = n）的地址 = xpub 的第 n 個子節點。
 */
export function deriveCustodialAddress(xpub: string, userId: number | bigint): string {
  const index = Number(userId);
  if (!Number.isSafeInteger(index) || index < 0 || index >= 2 ** 31) {
    throw new Error(`無效的觀眾編號：${userId}`);
  }
  const node = HDNodeWallet.fromExtendedKey(xpub);
  if (node.depth !== 4) {
    throw new Error("WALLET_XPUB 必須是 m/44'/60'/0'/0 這一層的延伸公鑰");
  }
  return getAddress(node.deriveChild(index).address);
}

export function getWalletXpub(): string {
  const xpub = process.env.WALLET_XPUB;
  if (!xpub) throw new Error("缺少環境變數 WALLET_XPUB");
  return xpub;
}
