# 第 0 階段設定：把吾冊架到 Base 測試網

照順序做完這 9 步，吾冊就能在 mybooklet.party 上真正運作：觀眾掃碼、用 LINE 或 Google 登入、領取節目單、隔天在 Base Sepolia 測試網上鑄造。

測試網的 ETH 沒有實際價值，這個階段不花錢在區塊鏈上。需要付費的只有網域（已購買）；其他服務都有免費方案。

> 所有密碼、私鑰、API 金鑰都只由你本人貼進各服務的設定頁。不要貼在聊天裡給任何人，包括 Claude。

---

## 1. 產生金鑰（約 5 分鐘）

用 GitHub Codespaces，在瀏覽器裡就能執行，不用在電腦上安裝任何東西。

1. 打開 https://github.com/zysbot/mybooklet ，按綠色 **Code** → **Codespaces** → **Create codespace on main**。
2. 等下方出現終端機，輸入：
   ```bash
   cd web && npm install && npm run keys:generate
   ```
3. 畫面會印出兩組東西：
   - **觀眾錢包主助記詞**（12 個英文單字）：抄在紙上，放在安全的地方。不要拍照、不要存在雲端。
   - **營運錢包地址與私鑰**：先把整段複製到你自己的密碼管理工具（例如 1Password、Bitwarden），後面幾步要用。
4. 輸入 `clear` 清除畫面。

## 2. 領 Base Sepolia 測試網 ETH（約 5 分鐘）

部署合約與每天上鏈都要付一點手續費，用的是測試網 ETH（沒有實際價值）。水龍頭的規則常變，下面任一個能領就好：

1. QuickNode 水龍頭 https://faucet.quicknode.com/base/sepolia ：貼上第 1 步的「營運錢包地址」（0x 開頭），不用註冊。
2. 領不到時改用 Superchain 水龍頭 https://console.optimism.io/faucet （要登入），或 Coinbase 開發者平台水龍頭（要註冊 Coinbase 開發者帳號）。

領到後，在 https://sepolia.basescan.org 搜尋營運錢包地址，看得到餘額就成功了。0.01 ETH 就夠測試很久。

## 3. 部署合約（約 5 分鐘）

1. 到 repo 的 **Settings → Secrets and variables → Actions → New repository secret**：
   - Name：`TESTNET_DEPLOYER_PRIVATE_KEY`
   - Secret：第 1 步的營運錢包私鑰
2. 到 **Actions** 分頁 → 左側選「部署合約到 Base 測試網」→ **Run workflow**。
3. 跑完後點進去看紀錄，最後會有一行 `BOOKLET_CONTRACT_ADDRESS=0x...`，記下來。

## 4. 資料庫（約 5 分鐘）

1. 到 https://neon.tech 註冊（可用 Google 帳號），建立一個專案，區域選 **Singapore**（離台灣最近）。
2. 複製它給的連線字串（`postgresql://` 開頭），這就是 `DATABASE_URL`。
3. 回到第 1 步的 Codespace 終端機：
   ```bash
   cd /workspaces/mybooklet/web
   DATABASE_URL='貼上連線字串' npm run db:migrate
   ```
   看到「資料庫結構已更新」就完成了。

## 5. LINE（約 20 分鐘）

**A. 官方帳號與 Messaging API**（LINE 規定 Messaging API 必須從官方帳號啟用）

1. 到 https://manager.line.biz 用你的 LINE 帳號登入，建立 LINE 官方帳號「吾冊 My Booklet」。
2. 進入帳號管理頁 → 右上角 **設定** → 左側 **Messaging API** → **啟用 Messaging API**。
3. 選擇或建立 **Provider**，名稱填「吾冊」。

**B. LINE Developers**

到 https://developers.line.biz/console/ ，用同一個 LINE 帳號登入，點進「吾冊」這個 Provider：

1. 點剛才自動產生的 **Messaging API channel**：
   - **Messaging API** 分頁最下方，發行 **Channel access token (long-lived)** → 這是 `LINE_MESSAGING_ACCESS_TOKEN`。
2. 在同一個 Provider 底下按 **Create a new channel** → **LINE Login**：
   - App types 勾選 **Web app**。
   - 建立後在 **Basic settings** 記下 **Channel ID** → 這是 `LINE_LOGIN_CHANNEL_ID`。
   - **Basic settings → Linked LINE Official Account**：選「吾冊 My Booklet」（登入時才會出現「加入好友」選項）。
   - **LIFF** 分頁 → **Add**：
     - Size：Full
     - Endpoint URL：網站網址（先用 Vercel 給的網址也可以，之後再改成 `https://mybooklet.party`）
     - Scopes：勾選 `openid`、`profile`
     - Add friend option：**On (Aggressive)**
     - 建立後記下 **LIFF ID** → 這是 `NEXT_PUBLIC_LIFF_ID`。
3. LINE Login channel 預設是 **Developing**，只有你自己能登入。要給一般觀眾使用時，按 **Publish** 改成公開。

## 6. Google 登入（約 10 分鐘）

1. 到 https://console.cloud.google.com 建立專案「mybooklet」。
2. **APIs & Services → OAuth consent screen**：App name 填「吾冊 My Booklet」，User type 選 External。
3. **Credentials → Create credentials → OAuth client ID**：
   - Application type：Web application
   - Authorized JavaScript origins：`https://mybooklet.party`
4. 記下 **Client ID** → 這是 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`。

## 7. Email 通知（約 10 分鐘）

1. 到 https://resend.com 註冊，**Domains → Add Domain** 輸入 `mybooklet.party`。
2. 照它給的 DNS 紀錄，到你買網域的地方新增，等待驗證通過。
3. **API Keys → Create** → 這是 `RESEND_API_KEY`。
4. 寄件人 `EMAIL_FROM` 程式沒有預設值：`RESEND_API_KEY` 與 `EMAIL_FROM` 兩個都要填，少一個就不會寄信（也不會報錯）。

## 8. 架站（約 15 分鐘）

1. 到 https://vercel.com 用 GitHub 帳號登入，**Add New → Project**，選 `zysbot/mybooklet`。
2. **Root Directory** 選 `web`。
3. **Environment Variables** 依照 `web/.env.example` 逐一填入：

   | 名稱 | 值 |
   | --- | --- |
   | `NEXT_PUBLIC_SITE_URL` | `https://mybooklet.party` |
   | `SESSION_SECRET` | 一串至少 32 字元的隨機字（可在 Codespace 跑 `openssl rand -hex 32`） |
   | `CRON_SECRET` | 另一串隨機字 |
   | `ADMIN_PASSWORD` | 營運後台密碼，至少 12 個字元，存進你的密碼管理工具 |
   | `DATABASE_URL` | 第 4 步 |
   | `LINE_LOGIN_CHANNEL_ID`、`NEXT_PUBLIC_LIFF_ID`、`LINE_MESSAGING_ACCESS_TOKEN` | 第 5 步 |
   | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | 第 6 步 |
   | `RESEND_API_KEY` | 第 7 步 |
   | `EMAIL_FROM` | `吾冊 My Booklet <hello@mybooklet.party>` |
   | `NEXT_PUBLIC_CHAIN_ID` | `84532`（Base Sepolia 測試網）。顯示名稱、區塊鏈瀏覽器、預設連線節點都由它決定 |
   | `CHAIN_RPC_URL` | 選填。不填就用 Base 官方公開節點 `https://sepolia.base.org` |
   | `BOOKLET_CONTRACT_ADDRESS` | 第 3 步 |
   | `WALLET_XPUB` | 第 1 步 |
   | `MINTER_PRIVATE_KEY`、`CURATOR_PRIVATE_KEY` | 第 1 步的營運錢包私鑰 |

4. **Storage → Create Database → Blob**，建立後連結到這個專案（節目單頁面圖片存在這裡）。它會自動加入 `BLOB_READ_WRITE_TOKEN`，不用自己填。
5. **Deploy**。完成後到 **Settings → Domains** 加入 `mybooklet.party`，照指示設定 DNS。
6. 回到 GitHub repo 的 **Settings → Secrets and variables → Actions**，再新增兩個：
   - `SITE_URL`：`https://mybooklet.party`
   - `CRON_SECRET`：與上面相同
   這樣每天台北時間凌晨 4 點左右，會自動把前一天以前的領取打亂順序、批次上鏈（「每日上鏈批次」）。

## 9. 上架第一檔節目

1. 在 Codespace 裡複製範例：`cp shows/example.json shows/my-first-show.json`，用編輯器改成真實內容（場次時間、場館、卡面顏色、節目單文字）。
2. 建立 `web/.env.local`，至少填入 `NEXT_PUBLIC_SITE_URL`、`DATABASE_URL`、`NEXT_PUBLIC_CHAIN_ID`、`BOOKLET_CONTRACT_ADDRESS`、`CURATOR_PRIVATE_KEY`（與 Vercel 相同）。
3. 執行：
   ```bash
   npm run create-show -- shows/my-first-show.json
   ```
4. 每個場次的 QR code 圖檔會出現在 `web/out/`，右鍵下載就能印出來放在入口。
5. 上傳節目單 PDF：打開 `https://mybooklet.party/admin`，用 `ADMIN_PASSWORD` 登入，在這檔節目的卡面版本旁按「上傳 PDF」，把劇團給的 PDF 拖進去。
   - PDF 會在你的瀏覽器裡轉成每頁圖片再上傳，50 頁大約一兩分鐘，期間不要關閉頁面。
   - 預覽沒問題後按「確認發布」。各場次節目單相同時，保留「其他卡面版本也使用這份節目單」的勾選，只要上傳一次。
   - 之後要更正錯字，重新上傳一次即可；按確認發布前，觀眾看到的都還是舊版。

6. 開通主辦方後台：在 `/admin` 最上方的「主辦方後台」表格，對劇團、製作方或場館按「產生邀請連結」，把連結傳給對方的工作人員。對方用 LINE 或 Google 登入後按「加入後台」，之後到 `https://mybooklet.party/org` 就能看到自己的統計。
   - 後台只提供統計：看不到任何觀眾的名字、LINE、Email 或錢包地址；少於 10 人的分群只顯示「少於 10 人」。
   - 邀請連結外流時，按「更換邀請連結」，舊連結立即失效。

## 示範資料（給劇團看的展示用）

在 Codespace 用一個**專門的示範資料庫**（Neon 可以另建一個 branch），把 `.env.local` 的 `DATABASE_URL` 換成它，執行：

```bash
npm run db:migrate
npm run seed:demo -- --force
```

會建立 6 檔虛構節目、60 位虛構觀眾，收藏冊與主辦方後台都有資料可以展示。不要對正式資料庫執行。

---

## 測試網階段的簡化（第 1 階段上主網前要改）

| 項目 | 第 0 階段 | 第 1 階段 |
| --- | --- | --- |
| 節目內容 | 由網站提供（`/api/metadata`） | 卡面與節目基本資訊上傳 Arweave，合約指向 Arweave 網址 |
| 節目單頁面圖片 | Vercel Blob | 仍放可刪除的儲存空間，不放 Arweave（鏈上只留雜湊） |
| 鏈 | Base Sepolia 測試網（`NEXT_PUBLIC_CHAIN_ID=84532`） | Base 主網（`8453`），連線節點改用付費服務 |
| 鑄造與內容私鑰 | 環境變數 | 雲端金鑰管理（KMS） |
| 管理角色 | 營運錢包 | 多簽錢包 |
| 合約 | 未審查 | 第三方安全審查後部署 |

## 上鏈方式（2026-11-07 起）

- **每日批次**：觀眾領取後，節目單立刻出現在收藏冊；收藏憑證在隔天凌晨的每日批次才寫入區塊鏈。批次只處理「台北時間今天以前」的領取，並打亂順序，鏈上看不出誰在幾點領取。
- **合約只記日期**（台北時間 YYYYMMDD），不記時刻。
- **一份節目單一個地址**：每份節目單的代管地址由 `WALLET_XPUB` 往下三層隨機編號推導，編號只存在資料庫。同一位觀眾的收藏在鏈上分散在不同地址，即使 `WALLET_XPUB` 外洩也試不出來。
- **化名**：吾冊不保存 LINE、Google 的名稱與大頭貼，每位觀眾有一個系統化名（例如「二樓包廂的水獺」）。
- **測試時想馬上看到上鏈**：營運後台 →「測試資料」→「立即上鏈」（只限測試網，會連今天的領取一起送出）。

## 換合約（例如從 Kaia 測試網換到 Base 測試網）

1. 照第 2、3 步在新鏈領測試幣、部署合約。
2. Vercel 改 `NEXT_PUBLIC_CHAIN_ID` 與 `BOOKLET_CONTRACT_ADDRESS`，刪掉不再使用的舊變數，重新部署。
3. 營運後台 →「測試資料」→ 第 3 區：依序按「重設上鏈狀態（換合約後）」→「把場次寫入合約」（場次多時要按幾次，直到顯示全部完成）→「立即上鏈」。

遇到任何卡關，把畫面上的錯誤訊息或截圖貼給 Claude（記得遮掉私鑰和金鑰）。
