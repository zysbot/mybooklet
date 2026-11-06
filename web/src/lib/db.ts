import { Pool } from "pg";

export type Row = Record<string, unknown>;

/** 可執行查詢的對象（連線池、交易中的連線、測試用資料庫） */
export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** 資料庫：可查詢，也可開交易 */
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
}

/** 正式環境：PostgreSQL 連線池 */
export function createPgDb(connectionString: string): Db {
  const pool = new Pool({ connectionString, max: 5 });
  return {
    query: (sql, params) => pool.query(sql, params as unknown[]) as never,
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (sql, params) => client.query(sql, params as unknown[]) as never });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

let shared: Db | undefined;

/** 網站共用的資料庫連線 */
export function getDb(): Db {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("缺少環境變數 DATABASE_URL");
    shared = createPgDb(url);
  }
  return shared;
}
