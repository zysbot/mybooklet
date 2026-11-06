/**
 * 吾冊使用的區塊鏈。由公開的環境變數 NEXT_PUBLIC_CHAIN_ID 決定，觀眾端與伺服器端共用。
 * 換鏈時只要改 NEXT_PUBLIC_CHAIN_ID（必要時加 CHAIN_RPC_URL），不用改程式。
 */
export interface Network {
  chainId: number;
  /** 顯示給觀眾的名稱，例如「已寫入 Base 區塊鏈」 */
  name: string;
  /** 主網為 false；測試網的收藏沒有長期保存承諾 */
  testnet: boolean;
  /** 未設定 CHAIN_RPC_URL 時用的官方公開節點（有流量限制，正式上線建議改用付費服務） */
  defaultRpcUrl: string;
  explorerName: string;
  explorerUrl: string;
}

export const NETWORKS: Record<number, Network> = {
  84532: {
    chainId: 84532,
    name: "Base Sepolia 測試網",
    testnet: true,
    defaultRpcUrl: "https://sepolia.base.org",
    explorerName: "BaseScan",
    explorerUrl: "https://sepolia.basescan.org",
  },
  8453: {
    chainId: 8453,
    name: "Base",
    testnet: false,
    defaultRpcUrl: "https://mainnet.base.org",
    explorerName: "BaseScan",
    explorerUrl: "https://basescan.org",
  },
};

/** 目前設定的鏈；沒設定或不認得時拋出錯誤 */
export function currentNetwork(): Network {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!raw) throw new Error("缺少環境變數 NEXT_PUBLIC_CHAIN_ID（Base 測試網為 84532）");
  const n = NETWORKS[Number(raw)];
  if (!n) throw new Error(`不認得的 NEXT_PUBLIC_CHAIN_ID：${raw}（可用：${Object.keys(NETWORKS).join("、")}）`);
  return n;
}

/** 顯示用：沒設定時不讓頁面壞掉，只顯示「區塊鏈」 */
export function networkLabel(): string {
  try {
    return currentNetwork().name;
  } catch {
    return "區塊鏈";
  }
}

export function explorerTxUrl(txHash: string): string | null {
  try {
    return `${currentNetwork().explorerUrl}/tx/${txHash}`;
  } catch {
    return null;
  }
}

export function explorerName(): string {
  try {
    return currentNetwork().explorerName;
  } catch {
    return "區塊鏈瀏覽器";
  }
}
