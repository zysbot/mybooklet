// 產生測試網用的金鑰：npm run keys:generate
//
// 請在你自己的電腦上執行，不要在別人的電腦或線上服務執行。
// 產生兩組：
//   1. 觀眾錢包主助記詞 → 只把「延伸公鑰」（WALLET_XPUB）放到網站，助記詞自己離線保管
//   2. 營運錢包（部署、鑄造、設定場次內容共用）→ 測試網階段放到 GitHub 與網站的環境變數
//
// 第 1 階段（主網）不要沿用這些金鑰：鑄造錢包改用雲端金鑰管理，管理角色改用多簽錢包。
import { HDNodeWallet, Wallet } from "ethers";

const custodial = HDNodeWallet.createRandom(undefined, "m/44'/60'/0'/0");
const operator = Wallet.createRandom();

console.log(`
================ 1. 觀眾錢包主助記詞 ================
助記詞（抄在紙上離線保管，不要放進任何網站或雲端）：
  ${custodial.mnemonic!.phrase}

網站環境變數：
  WALLET_XPUB=${custodial.neuter().extendedKey}

================ 2. 營運錢包（測試網） ================
地址（到 Kaia 測試網水龍頭領測試用 KAIA）：
  ${operator.address}

私鑰（只放進 GitHub Secrets 與主機的環境變數）：
  GitHub Secret  TESTNET_DEPLOYER_PRIVATE_KEY=${operator.privateKey}
  網站環境變數   MINTER_PRIVATE_KEY=${operator.privateKey}
  網站環境變數   CURATOR_PRIVATE_KEY=${operator.privateKey}

執行完畢後請清除終端機畫面。
`);
