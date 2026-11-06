-- 吾冊 My Booklet 資料庫結構
-- 用法：npm run db:migrate（讀取 DATABASE_URL）

-- 觀眾：以內部編號識別，不綁定登入方式
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  line_user_id    TEXT UNIQUE,
  google_sub      TEXT UNIQUE,
  email           TEXT,
  display_name    TEXT,
  picture_url     TEXT,
  -- 代管錢包地址由主公鑰依 users.id 推導；觀眾綁定自有錢包後改為 self
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
-- 邀請連結：營運方產生後交給組織的工作人員，用來加入後台
ALTER TABLE organizers ADD COLUMN IF NOT EXISTS invite_token TEXT UNIQUE;

-- 節目的製作方（可與演出團隊不同）；場次的場館組織（venue 欄位仍保留顯示用名稱）
ALTER TABLE productions ADD COLUMN IF NOT EXISTS producer_id BIGINT REFERENCES organizers(id);
ALTER TABLE shows ADD COLUMN IF NOT EXISTS venue_id BIGINT REFERENCES organizers(id);

-- 組織的後台成員（用 LINE 或 Google 登入的帳號）
CREATE TABLE IF NOT EXISTS organizer_members (
  organizer_id  BIGINT NOT NULL REFERENCES organizers(id),
  user_id       BIGINT NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organizer_id, user_id)
);

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
