# 吾冊 My Booklet

觀眾入場前掃 QR code，用 LINE 或 Google 帳號領取數位節目單，並以不可轉讓的 token 永久記錄在 Kaia 區塊鏈上。

技術規格書：吾冊 My Booklet 技術規格書（claude.ai）

## 目錄

| 資料夾 | 內容 |
| --- | --- |
| `contracts/` | 智能合約（Solidity + Hardhat）與測試 |
| `web/` | 收藏冊網站、主辦方後台、後端 API、背景上鏈程序（Next.js） |

## 合約

```bash
cd contracts
npm install
npx hardhat test
```

- 編譯器使用 npm 安裝的 solc 0.8.28，不需連網下載。
- OpenZeppelin 固定在 5.0.2，EVM 目標為 paris，確保 Kaia 主網與測試網都能執行。
- 部署到測試網：GitHub → Actions →「部署合約到 Kaia 測試網」→ Run workflow（需先設定 `TESTNET_DEPLOYER_PRIVATE_KEY`）。

### 合約重點

- 每次領取鑄造一個 ERC-721 token，記錄場次 ID、入場編號、領取時間。
- 不可轉讓（ERC-5192）：一般轉讓、授權、燒毀一律拒絕。
- 搬遷角色可把觀眾的 token 移到觀眾本人的新錢包，保留原編號。
- 重複的 claim ID 會略過，背景程序重試不會多鑄。
- 場次內容網址可修改，凍結後永久固定。
- 不可升級、不可暫停。
