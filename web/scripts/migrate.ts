// 建立或更新資料庫結構：npm run db:migrate
// 讀取 .env.local 或環境變數裡的 DATABASE_URL。結構檔可重複執行，不會刪除資料。
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnvFile() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));
    console.log("資料庫結構已更新");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

export { loadEnvFile };
