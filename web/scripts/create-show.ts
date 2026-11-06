// 上架一檔節目：建立節目、卡面版本、場次與領取碼，把場次內容網址寫進合約，並產生 QR code 圖檔。
//
// 用法：
//   npm run create-show -- shows/example.json            正式上架（會寫入合約）
//   npm run create-show -- shows/example.json --no-chain 只寫資料庫，不碰區塊鏈（先檢查用）
//
// 第 2 階段會改由主辦方後台操作；第 0、1 階段由營運方用這支程式上架。
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { Client } from "pg";

interface Credit { role: string; names: string }
interface Content { intro?: string; directorNote?: string; duration?: string; credits?: Credit[] }

interface ShowFile {
  organizer: { name: string; contactEmail?: string };
  /** producer：製作方名稱（與演出團隊不同時才填） */
  production: { title: string; companyName: string; genre?: string; producer?: string; content: Content };
  /** 卡面版本；content 會覆蓋節目的共用內容（可只寫要不同的欄位） */
  designs: { key: string; label: string; coverColor: string; content?: Content }[];
  /** 預設卡面版本的 key */
  defaultDesign: string;
  shows: {
    startsAt: string;
    venue: string;
    /** 指定卡面版本的 key；不填則用預設 */
    design?: string;
    /** 開演前幾分鐘開放領取，預設 90 */
    opensMinutesBefore?: number;
    /** 開演後幾分鐘停止領取，預設 240 */
    closesMinutesAfter?: number;
    /** 領取上限，通常設為售票數 */
    maxClaims?: number;
  }[];
}

function loadEnvFile() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** 不易看錯的英數字：去掉 0/O、1/I/L */
function newCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  loadEnvFile();
  const file = process.argv[2];
  const skipChain = process.argv.includes("--no-chain");
  if (!file) throw new Error("用法：npm run create-show -- <節目設定檔.json> [--no-chain]");

  const spec = JSON.parse(readFileSync(file, "utf8")) as ShowFile;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!site) throw new Error("缺少 NEXT_PUBLIC_SITE_URL");
  if (!spec.designs.some((d) => d.key === spec.defaultDesign)) throw new Error(`找不到預設卡面 ${spec.defaultDesign}`);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  const created: { showId: string; code: string; startsAt: string; designLabel: string }[] = [];
  try {
    await db.query("BEGIN");
    // 同名同類型的組織只建一次（劇團、製作方、場館）
    const orgId = async (name: string, kind: "company" | "producer" | "venue", contact?: string) => {
      const found = await db.query(`SELECT id FROM organizers WHERE name = $1 AND kind = $2 ORDER BY id LIMIT 1`, [name, kind]);
      if (found.rows[0]) return found.rows[0].id as string;
      const r = await db.query(`INSERT INTO organizers (name, kind, contact_email) VALUES ($1, $2, $3) RETURNING id`, [name, kind, contact ?? null]);
      return r.rows[0].id as string;
    };
    const companyId = await orgId(spec.organizer.name, "company", spec.organizer.contactEmail);
    const producerId = spec.production.producer ? await orgId(spec.production.producer, "producer") : null;
    const prod = await db.query(
      `INSERT INTO productions (organizer_id, title, company_name, genre, producer_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [companyId, spec.production.title, spec.production.companyName, spec.production.genre ?? null, producerId]
    );
    const productionId = prod.rows[0].id;

    const designIds: Record<string, { id: string; label: string }> = {};
    for (const d of spec.designs) {
      const content = { ...spec.production.content, ...(d.content ?? {}) };
      const r = await db.query(
        `INSERT INTO designs (production_id, label, cover_color, content) VALUES ($1, $2, $3, $4) RETURNING id`,
        [productionId, d.label, d.coverColor, JSON.stringify(content)]
      );
      designIds[d.key] = { id: r.rows[0].id, label: d.label };
    }
    await db.query(`UPDATE productions SET default_design_id = $2 WHERE id = $1`, [
      productionId,
      designIds[spec.defaultDesign].id,
    ]);

    for (const s of spec.shows) {
      const startsAt = new Date(s.startsAt);
      if (Number.isNaN(startsAt.getTime())) throw new Error(`無效的演出時間：${s.startsAt}`);
      const design = s.design ? designIds[s.design] : undefined;
      if (s.design && !design) throw new Error(`找不到卡面版本 ${s.design}`);

      const venueId = await orgId(s.venue, "venue");
      const show = await db.query(
        `INSERT INTO shows (production_id, design_id, starts_at, venue, venue_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [productionId, design?.id ?? null, startsAt, s.venue, venueId]
      );
      const showId: string = show.rows[0].id;
      await db.query(`UPDATE shows SET metadata_uri = $2 WHERE id = $1`, [showId, `${site}/api/metadata/${showId}`]);

      const code = newCode();
      const opens = new Date(startsAt.getTime() - (s.opensMinutesBefore ?? 90) * 60_000);
      const closes = new Date(startsAt.getTime() + (s.closesMinutesAfter ?? 240) * 60_000);
      await db.query(
        `INSERT INTO claim_codes (show_id, code, valid_from, valid_to, max_claims) VALUES ($1, $2, $3, $4, $5)`,
        [showId, code, opens, closes, s.maxClaims ?? null]
      );
      created.push({ showId, code, startsAt: s.startsAt, designLabel: (design ?? designIds[spec.defaultDesign]).label });
    }
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }

  // 寫入合約：每個場次的內容網址
  if (!skipChain) {
    const { setShowURIOnChain } = await import("../src/lib/chain");
    for (const c of created) {
      const uri = `${site}/api/metadata/${c.showId}`;
      const tx = await setShowURIOnChain(BigInt(c.showId), uri);
      await db.query(`UPDATE shows SET chain_configured = TRUE WHERE id = $1`, [c.showId]);
      console.log(`場次 ${c.showId} 已寫入合約（${tx}）`);
    }
  }
  await db.end();

  // QR code 圖檔
  const outDir = path.join(process.cwd(), "out");
  mkdirSync(outDir, { recursive: true });
  console.log(`\n《${spec.production.title}》已上架 ${created.length} 個場次：`);
  for (const c of created) {
    const url = `${site}/c/${c.code}`;
    const png = path.join(outDir, `qr-${c.showId}.png`);
    writeFileSync(png, await QRCode.toBuffer(url, { width: 1024, margin: 2, errorCorrectionLevel: "M" }));
    console.log(`- ${c.startsAt}（${c.designLabel}）${url}  →  ${png}`);
  }
  if (skipChain) console.log("\n注意：未寫入合約（--no-chain），這些場次暫時不會上鏈。");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
