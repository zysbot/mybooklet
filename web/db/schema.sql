-- 吾冊 My Booklet 資料庫結構
-- 用法：npm run db:migrate（讀取 DATABASE_URL）

-- 觀眾：以內部編號識別，不綁定登入方式
-- 不保存 LINE、Google 的名稱與大頭貼；觀眾在吾冊裡以系統化名（pseudonym）出現
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  line_user_id    TEXT UNIQUE,
  google_sub      TEXT UNIQUE,
  email           TEXT,
  pseudonym       TEXT,
  -- 只有觀眾綁定自有錢包（self）時才有值；代管時每份節目單各有一個地址，見 claims.custody_path
  wallet_address  TEXT,
  wallet_type     TEXT NOT NULL DEFAULT 'custodial' CHECK (wallet_type IN ('custodial', 'self')),
  notify_email    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (line_user_id IS NOT NULL OR google_sub IS NOT NULL)
);

-- 主辦方：劇團或場館
CREATE TABLE IF NOT EXISTS organizers (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  contact_email  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 節目：一檔演出，底下有多個場次
CREATE TABLE IF NOT EXISTS productions (
  id                 BIGSERIAL PRIMARY KEY,
  organizer_id       BIGINT NOT NULL REFERENCES organizers(id),
  title              TEXT NOT NULL,
  company_name       TEXT NOT NULL,
  -- 類型：戲劇、舞蹈、音樂、其他（收藏冊的篩選用）
  genre              TEXT,
  default_design_id  BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 卡面版本：例如「一般場」「首演場」「壓軸場」
CREATE TABLE IF NOT EXISTS designs (
  id               BIGSERIAL PRIMARY KEY,
  production_id    BIGINT NOT NULL REFERENCES productions(id),
  label            TEXT NOT NULL,
  cover_color      TEXT NOT NULL DEFAULT '#23305C',
  cover_image_url  TEXT,
  -- 節目單內容：{ intro, directorNote, duration, credits: [{ role, names }] }
  content          JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 第 1 階段起：內容上傳 Arweave 後的網址
  content_uri      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE productions
    ADD CONSTRAINT productions_default_design_fk FOREIGN KEY (default_design_id) REFERENCES designs(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 場次：每個場次各發一種；design_id 為空則沿用節目的預設卡面
CREATE TABLE IF NOT EXISTS shows (
  id                BIGSERIAL PRIMARY KEY,
  production_id     BIGINT NOT NULL REFERENCES productions(id),
  design_id         BIGINT REFERENCES designs(id),
  starts_at         TIMESTAMPTZ NOT NULL,
  venue             TEXT NOT NULL,
  -- 寫進合約的場次內容網址
  metadata_uri      TEXT,
  -- 合約上已設定內容網址，才能開始鑄造
  chain_configured  BOOLEAN NOT NULL DEFAULT FALSE,
  -- 下一位領取者的入場編號
  next_serial       INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 領取碼：QR code 背後的資料
CREATE TABLE IF NOT EXISTS claim_codes (
  id          BIGSERIAL PRIMARY KEY,
  show_id     BIGINT NOT NULL REFERENCES shows(id),
  code        TEXT NOT NULL UNIQUE,
  valid_from  TIMESTAMPTZ NOT NULL,
  valid_to    TIMESTAMPTZ NOT NULL,
  max_claims  INTEGER,
  kind        TEXT NOT NULL DEFAULT 'static' CHECK (kind IN ('static', 'dynamic')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 領取紀錄：核心資料，鏈上狀態跟著它走
CREATE TABLE IF NOT EXISTS claims (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            BIGINT NOT NULL REFERENCES users(id),
  show_id            BIGINT NOT NULL REFERENCES shows(id),
  serial             INTEGER NOT NULL,
  claimed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  chain_status       TEXT NOT NULL DEFAULT 'pending'
                     CHECK (chain_status IN ('pending', 'submitted', 'minted', 'failed')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  next_attempt_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at       TIMESTAMPTZ,
  last_error         TEXT,
  recipient_address  TEXT,
  tx_hash            TEXT,
  token_id           NUMERIC,
  minted_at          TIMESTAMPTZ,
  UNIQUE (user_id, show_id),
  UNIQUE (show_id, serial)
);

CREATE INDEX IF NOT EXISTS claims_mint_queue ON claims (chain_status, next_attempt_at);
CREATE INDEX IF NOT EXISTS claims_by_user ON claims (user_id, claimed_at DESC);

-- 搬家紀錄
CREATE TABLE IF NOT EXISTS migrations (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  from_address  TEXT NOT NULL,
  to_address    TEXT NOT NULL,
  signature     TEXT NOT NULL,
  tx_hash       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 節目單 PDF：上傳時在瀏覽器把每一頁轉成圖片，觀眾在手機上翻頁閱讀
-- ---------------------------------------------------------------

-- 每次上傳是一個批次；確認後才成為卡面版本目前使用的頁面，舊批次保留不刪
ALTER TABLE designs ADD COLUMN IF NOT EXISTS current_upload_id UUID;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS page_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS pdf_filename TEXT;
ALTER TABLE designs ADD COLUMN IF NOT EXISTS pdf_uploaded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS design_pages (
  design_id   BIGINT NOT NULL REFERENCES designs(id),
  upload_id   UUID NOT NULL,
  page_no     INTEGER NOT NULL CHECK (page_no >= 1),
  url         TEXT NOT NULL,
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  bytes       INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (design_id, upload_id, page_no)
);

-- ---------------------------------------------------------------
-- 主辦方：劇團、製作方、場館都是「組織」，各自登入看自己的統計
-- ---------------------------------------------------------------

ALTER TABLE organizers ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'company';
DO $$ BEGIN
  ALTER TABLE organizers ADD CONSTRAINT organizers_kind_check CHECK (kind IN ('company', 'producer', 'venue'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- 舊的邀請連結已取消（11/07）：改由營運方在後台直接加入工作帳號
ALTER TABLE organizers DROP COLUMN IF EXISTS invite_token;

-- 合作方案：free（免費，合計最多 50 份）／basic（基本合作，看得到統計）。
-- plan_until 是合作到期日（台北日期，當天仍有效）；NULL 表示不設到期日。到期後自動視為 free。
-- 11/07 加入這個欄位時，既有的組織都是測試資料，一律設為 basic、不設到期日。
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS plan TEXT;
UPDATE organizers SET plan = 'basic' WHERE plan IS NULL;
ALTER TABLE organizers ALTER COLUMN plan SET DEFAULT 'free';
ALTER TABLE organizers ALTER COLUMN plan SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE organizers ADD CONSTRAINT organizers_plan_check CHECK (plan IN ('free', 'basic'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS plan_until DATE;

-- 節目的製作方（可與演出團隊不同）；場次的場館組織（venue 欄位仍保留顯示用名稱）
ALTER TABLE productions ADD COLUMN IF NOT EXISTS producer_id BIGINT REFERENCES organizers(id);
ALTER TABLE shows ADD COLUMN IF NOT EXISTS venue_id BIGINT REFERENCES organizers(id);

-- 舊做法：用觀眾帳號加入主辦方後台（11/07 取消，觀眾身分與工作身分分開）
DROP TABLE IF EXISTS organizer_members;

-- 主辦方的工作帳號：與觀眾帳號完全分開，用 Email 驗證碼登入
CREATE TABLE IF NOT EXISTS org_accounts (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ
);

-- 工作帳號屬於哪些組織（由營運方加入、移除）
CREATE TABLE IF NOT EXISTS org_account_members (
  organizer_id  BIGINT NOT NULL REFERENCES organizers(id),
  account_id    BIGINT NOT NULL REFERENCES org_accounts(id),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organizer_id, account_id)
);

-- Email 驗證碼：只存雜湊；10 分鐘有效、最多試 5 次、用過即失效
CREATE TABLE IF NOT EXISTS login_codes (
  id          BIGSERIAL PRIMARY KEY,
  purpose     TEXT NOT NULL,
  email       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS login_codes_email_idx ON login_codes (purpose, email, created_at DESC);

-- 主辦方後台的存取紀錄：誰在什麼時候登入、查看、被加入或移除（存 Email 文字，帳號移除後紀錄仍在）
CREATE TABLE IF NOT EXISTS org_access_log (
  id            BIGSERIAL PRIMARY KEY,
  organizer_id  BIGINT REFERENCES organizers(id),
  actor         TEXT NOT NULL,
  action        TEXT NOT NULL,
  detail        TEXT,
  at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_access_log_org_idx ON org_access_log (organizer_id, at DESC);

-- 觀眾的前三喜歡：每個名次一份，同一份節目單只能佔一個名次
CREATE TABLE IF NOT EXISTS favorites (
  user_id     BIGINT NOT NULL REFERENCES users(id),
  claim_id    UUID NOT NULL REFERENCES claims(id),
  rank        SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 3),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, rank),
  UNIQUE (user_id, claim_id)
);

CREATE INDEX IF NOT EXISTS claims_by_show ON claims (show_id, user_id);

-- ---------------------------------------------------------------
-- 2026-11-07 隱私改版
-- ---------------------------------------------------------------

-- 系統化名（不重複）；舊帳號由 scripts/migrate.ts 補上
ALTER TABLE users ADD COLUMN IF NOT EXISTS pseudonym TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_pseudonym ON users (pseudonym);

-- 不再保存 LINE、Google 的名稱與大頭貼
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
ALTER TABLE users DROP COLUMN IF EXISTS picture_url;

-- 一份節目單一個代管地址：隨機推導編號存在領取紀錄上，刪除編號即切斷鏈上對照
ALTER TABLE claims ADD COLUMN IF NOT EXISTS custody_path TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS claims_custody_path ON claims (custody_path) WHERE custody_path IS NOT NULL;
-- 舊做法（一人一地址）留下的代管地址不再使用
UPDATE users SET wallet_address = NULL WHERE wallet_type = 'custodial' AND wallet_address IS NOT NULL;

-- ---------------------------------------------------------------
-- 2026-11-07 社交功能（頭像列、個人頁）
-- ---------------------------------------------------------------

-- 是否公開收藏（社交功能）。首次領取告知畫面與隱私權政策上線前，真實帳號一律預設不公開；
-- 測試觀眾由測試資料工具設為公開。
ALTER TABLE users ADD COLUMN IF NOT EXISTS social_public BOOLEAN NOT NULL DEFAULT FALSE;
-- 個人頁網址用的隨機代碼（不用資料庫編號，避免照順序翻）
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE users SET public_id = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16) WHERE public_id IS NULL;
ALTER TABLE users ALTER COLUMN public_id SET DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
ALTER TABLE users ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_id ON users (public_id);

-- 觀眾可以隱藏單一份：不出現在自己的個人頁與別人的頭像列
ALTER TABLE claims ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------
-- 2026-11-07 首次領取告知
-- ---------------------------------------------------------------

-- 觀眾同意使用條款與隱私權政策的時間與版本；勾選「我已滿 13 歲」的時間。
-- 舊帳號為 NULL，下次領取時會先看到告知畫面。
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ;
