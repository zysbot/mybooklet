import { Contract, JsonRpcProvider, Wallet, zeroPadValue, type Log } from "ethers";

/** 網站用到的合約介面（與 contracts/contracts/MyBooklet.sol 一致） */
export const BOOKLET_ABI = [
  "function mintBatch((address to,uint64 showId,uint32 serial,uint64 claimedAt,bytes32 claimId)[] requests)",
  "function tokenOfClaim(bytes32 claimId) view returns (uint256)",
  "function setShowURI(uint64 showId, string uri)",
  "function showURI(uint64 showId) view returns (string)",
  "function migrate(uint256[] tokenIds, address to)",
  "event Claimed(bytes32 indexed claimId, uint256 indexed tokenId, address indexed to, uint64 showId, uint32 serial)",
  "event ClaimSkipped(bytes32 indexed claimId, uint256 indexed existingTokenId)",
];

export interface MintRequest {
  to: string;
  showId: bigint;
  serial: number;
  claimedAt: bigint;
  claimId: string; // bytes32
}

/** 背景程序對區塊鏈的需求；測試時可換成假的實作 */
export interface MintChain {
  /** 送出批次鑄造交易，回傳交易雜湊與等待確認的函式（確認後回傳 claimId → tokenId） */
  sendMintBatch(requests: MintRequest[]): Promise<{ txHash: string; wait: () => Promise<Map<string, bigint>> }>;
  /** 查詢某個 claimId 是否已經鑄造（0 代表尚未） */
  tokenOfClaim(claimId: string): Promise<bigint>;
}

/** 資料庫的領取紀錄 UUID → 合約用的 bytes32 */
export function claimIdToBytes32(uuid: string): string {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`無效的領取紀錄 ID：${uuid}`);
  return zeroPadValue("0x" + hex, 32);
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少環境變數 ${name}`);
  return v;
}

export function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(requireEnv("KAIA_RPC_URL"), Number(process.env.KAIA_CHAIN_ID ?? 1001));
}

/** 正式的區塊鏈實作：以鑄造錢包送交易 */
export function createMintChain(): MintChain {
  const provider = getProvider();
  // 第 0 階段（測試網）用環境變數裡的私鑰；第 1 階段改接雲端金鑰管理（KMS）
  const signer = new Wallet(requireEnv("MINTER_PRIVATE_KEY"), provider);
  const contract = new Contract(requireEnv("BOOKLET_CONTRACT_ADDRESS"), BOOKLET_ABI, signer);

  return {
    async sendMintBatch(requests) {
      const tx = await contract.mintBatch(requests);
      return {
        txHash: tx.hash as string,
        async wait() {
          const receipt = await tx.wait();
          if (!receipt || receipt.status !== 1) throw new Error(`交易失敗：${tx.hash}`);
          const minted = new Map<string, bigint>();
          for (const log of receipt.logs as Log[]) {
            let parsed;
            try {
              parsed = contract.interface.parseLog(log);
            } catch {
              continue;
            }
            if (parsed?.name === "Claimed") minted.set(String(parsed.args.claimId).toLowerCase(), parsed.args.tokenId);
            if (parsed?.name === "ClaimSkipped")
              minted.set(String(parsed.args.claimId).toLowerCase(), parsed.args.existingTokenId);
          }
          return minted;
        },
      };
    },
    async tokenOfClaim(claimId) {
      return contract.tokenOfClaim(claimId);
    },
  };
}

/** 場次內容角色：把場次的內容網址寫進合約 */
export async function setShowURIOnChain(showId: bigint, uri: string): Promise<string> {
  const provider = getProvider();
  const signer = new Wallet(requireEnv("CURATOR_PRIVATE_KEY"), provider);
  const contract = new Contract(requireEnv("BOOKLET_CONTRACT_ADDRESS"), BOOKLET_ABI, signer);
  const tx = await contract.setShowURI(showId, uri);
  await tx.wait();
  return tx.hash;
}
