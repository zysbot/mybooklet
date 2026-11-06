import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { HDNodeWallet, Mnemonic } from "ethers";
import type { Db, Queryable } from "@/lib/db";

/** 測試用：記憶體中的真 PostgreSQL（PGlite），載入正式的資料庫結構 */
export async function createTestDb(): Promise<Db> {
  const pg = new PGlite();
  const schema = readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pg.exec(schema);
  const wrap = (x: { query: PGlite["query"] }): Queryable => ({
    query: (sql, params) => x.query(sql, params as unknown[]) as never,
  });
  return {
    ...wrap(pg),
    tx: (fn) => pg.transaction((t) => fn(wrap(t))),
  };
}

/** 固定的測試助記詞（只用在測試） */
export const TEST_MNEMONIC = "test test test test test test test test test test test junk";

export function testXpub(): string {
  const root = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(TEST_MNEMONIC), "m/44'/60'/0'/0");
  return root.neuter().extendedKey;
}

/** 建立一檔節目、一個場次與一個領取碼 */
export async function seedShow(
  db: Db,
  opts: { code?: string; validFrom?: Date; validTo?: Date; maxClaims?: number | null; chainConfigured?: boolean } = {}
) {
  const org = await db.query<{ id: string }>(`INSERT INTO organizers (name) VALUES ('[劇團名稱]') RETURNING id`);
  const prod = await db.query<{ id: string }>(
    `INSERT INTO productions (organizer_id, title, company_name) VALUES ($1, '雨季之前', '[劇團名稱]') RETURNING id`,
    [org.rows[0].id]
  );
  const design = await db.query<{ id: string }>(
    `INSERT INTO designs (production_id, label) VALUES ($1, '一般場') RETURNING id`,
    [prod.rows[0].id]
  );
  await db.query(`UPDATE productions SET default_design_id = $2 WHERE id = $1`, [prod.rows[0].id, design.rows[0].id]);
  const show = await db.query<{ id: string }>(
    `INSERT INTO shows (production_id, starts_at, venue, chain_configured) VALUES ($1, '2026-11-21T11:30:00Z', '[演出場館]', $2) RETURNING id`,
    [prod.rows[0].id, opts.chainConfigured ?? true]
  );
  const code = opts.code ?? "CODE-" + show.rows[0].id;
  await db.query(
    `INSERT INTO claim_codes (show_id, code, valid_from, valid_to, max_claims) VALUES ($1, $2, $3, $4, $5)`,
    [
      show.rows[0].id,
      code,
      opts.validFrom ?? new Date("2026-01-01T00:00:00Z"),
      opts.validTo ?? new Date("2027-01-01T00:00:00Z"),
      opts.maxClaims ?? null,
    ]
  );
  return { showId: show.rows[0].id, productionId: prod.rows[0].id, designId: design.rows[0].id, code };
}
