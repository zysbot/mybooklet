# 吾冊 My Booklet

觀眾入場前掃 QR code，用 LINE 或 Google 帳號領取數位節目單，並以不可轉讓的 token 永久記錄在 Base 區塊鏈上（第 0 階段為 Base Sepolia 測試網）。

技術規格書：吾冊 My Booklet 技術規格書（claude.ai）

## 目錄

| 資料夾 | 內容 |
| --- | --- |
| `contracts/` | 智能合約（Solidity + Hardhat）與測試 |
| `web/` | 收藏冊網站、主辦方後台、後端 API、背景上鏈程序（Next.js） |

**第一次設定請看 [docs/setup.md](docs/setup.md)。**

## 網站

```bash
cd web
npm install
npm test        # 領取與上鏈程序的測試（內建 PostgreSQL，不需另外安裝）
npm run build
```

| 路徑 | 用途 |
| --- | --- |
| `/c/<領取碼>` | QR code 指向的領取頁 |
| `/me` | 我的收藏冊 |
| `/booklet/<領取紀錄>` | 節目單內頁與收藏憑證 |
| `/api/claim` | 領取：只寫資料庫、立即回應，回應後在背景通知；上鏈交給每日批次 |
| `/api/cron/mint` | 每日上鏈批次：前一天以前的領取打亂順序後鑄造，並重試與對帳（GitHub Actions 每天台北時間 04:17 呼叫） |
| `/api/metadata/<場次>`、`/api/cover/<場次>` | token 的 metadata 與卡面圖 |
| `/admin/productions/new` | 上架表單：節目資訊、類型與場館選單、多場次、卡面版本、PDF；送出時寫入合約並產生 QR code |
| `/admin/test-data` | 測試資料：批次上架測試節目、建立 20 位測試觀眾（正式上線前清除）；換合約後重設上鏈狀態、立即上鏈（只限測試網） |
| `/admin` | 營運後台：上傳節目單 PDF（瀏覽器端轉成每頁圖片），查看各場次領取與上鏈數，直接顯示 QR code，管理主辦方的合作方案與工作人員 |
| `/org` | 主辦方後台：工作人員用 Email 驗證碼登入（與觀眾帳號分開）。免費方案看每場份數；基本合作看領取統計與觀眾足跡（只給統計；少於 10 人的分群隱藏） |

| 指令 | 用途 |
| --- | --- |
| `npm run keys:generate` | 產生觀眾錢包主助記詞與營運錢包 |
| `npm run db:migrate` | 建立或更新資料庫結構 |
| `npm run create-show -- shows/xxx.json` | 上架節目、寫入合約、產生 QR code |
| `npm run seed:demo` | 建立示範資料（只限本機或專門的示範資料庫） |

上鏈流程：領取時只寫資料庫（狀態 pending）→ 每日批次隨機取出、打亂順序後鑄造（submitted → minted）→ 失敗依次數延後重試，超過上限標為 failed。一份節目單一個代管地址，由延伸公鑰往下三層隨機編號推導，伺服器不持有私鑰。觀眾以系統化名出現，不保存 LINE、Google 的名稱與大頭貼。鏈由 `NEXT_PUBLIC_CHAIN_ID` 決定（見 `web/src/lib/network.ts`）。

## 合約

```bash
cd contracts
npm install
npx hardhat test
```

- 編譯器使用 npm 安裝的 solc 0.8.28，不需連網下載。
- OpenZeppelin 固定在 5.0.2，EVM 目標為 paris，任何以太坊相容鏈都能執行。
- 部署到測試網：GitHub → Actions →「部署合約到 Base 測試網」→ Run workflow（需先設定 `TESTNET_DEPLOYER_PRIVATE_KEY`）。

### 合約重點

- 每次領取鑄造一個 ERC-721 token，記錄場次 ID、入場編號、領取日期（台北時間 YYYYMMDD，不記時刻）。
- 不可轉讓（ERC-5192）：一般轉讓、授權、燒毀一律拒絕。
- 搬遷角色可把觀眾的 token 移到觀眾本人的新錢包，保留原編號。
- 重複的 claim ID 會略過，背景程序重試不會多鑄。
- 場次內容網址可修改，凍結後永久固定。
- 不可升級、不可暫停。
