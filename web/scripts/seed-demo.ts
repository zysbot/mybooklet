// 建立示範資料：多個劇團、場館、節目與 60 位虛構觀眾，用來展示收藏冊與主辦方後台。
//
//   npm run seed:demo
//
// 只能用在本機或專門的示範資料庫：預設拒絕連到非 localhost 的資料庫，避免汙染正式資料。
// 所有名稱都是虛構的。
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createPgDb } from "../src/lib/db";
import { findOrCreateUser } from "../src/lib/users";

function loadEnvFile() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/** 固定種子的亂數，每次產生一樣的資料 */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

async function main() {
  loadEnvFile();
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url) && !process.argv.includes("--force")) {
    throw new Error("示範資料只能寫入本機資料庫。若確定要寫入其他資料庫（例如專門的示範資料庫），加上 --force。");
  }
  const db = createPgDb(url);
  const rand = rng(20261106);

  const org = async (name: string, kind: string) => {
    const found = await db.query<{ id: string }>(`SELECT id FROM organizers WHERE name = $1 AND kind = $2`, [name, kind]);
    if (found.rows[0]) return found.rows[0].id;
    return (await db.query<{ id: string }>(`INSERT INTO organizers (name, kind) VALUES ($1, $2) RETURNING id`, [name, kind])).rows[0].id;
  };
  const venues = {
    harbor: { id: await org("海港劇場", "venue"), name: "海港劇場" },
    hill: { id: await org("山城藝文中心", "venue"), name: "山城藝文中心" },
    river: { id: await org("河岸小劇場", "venue"), name: "河岸小劇場" },
  };
  const producer = await org("港邊製作", "producer");

  const catalog = [
    { company: "潮間帶劇團", title: "雨季之前", genre: "戲劇", color: "#23305C", producer, venue: venues.harbor, dates: ["2026-11-20T19:30:00+08:00", "2026-11-21T19:30:00+08:00", "2026-11-22T14:30:00+08:00"], reach: 0.55 },
    { company: "潮間帶劇團", title: "潮線", genre: "戲劇", color: "#3E5A3A", producer: null, venue: venues.river, dates: ["2026-06-12T19:30:00+08:00", "2026-06-13T14:30:00+08:00"], reach: 0.35 },
    { company: "鹽舞團", title: "鹽的聲音", genre: "舞蹈", color: "#7A5518", producer: null, venue: venues.hill, dates: ["2026-09-13T19:30:00+08:00", "2026-09-14T14:30:00+08:00"], reach: 0.45 },
    { company: "鹽舞團", title: "退潮", genre: "舞蹈", color: "#2F3B3F", producer: null, venue: venues.harbor, dates: ["2025-12-06T19:30:00+08:00"], reach: 0.3 },
    { company: "雙聲室內樂團", title: "夜行列車", genre: "音樂", color: "#5B2C45", producer: null, venue: venues.harbor, dates: ["2026-06-02T19:30:00+08:00", "2026-06-03T19:30:00+08:00"], reach: 0.4 },
    { company: "小島實驗室", title: "第三個房間", genre: "戲劇", color: "#8A3B22", producer, venue: venues.river, dates: ["2026-03-28T19:30:00+08:00"], reach: 0.12 },
  ];

  const viewers: string[] = [];
  for (let i = 0; i < 60; i++) {
    viewers.push((await findOrCreateUser(db, { provider: "google", subject: `demo-viewer-${i}` })).id);
  }

  let showCount = 0;
  let claimCount = 0;
  for (const item of catalog) {
    const company = await org(item.company, "company");
    const prod = (await db.query<{ id: string }>(
      `INSERT INTO productions (organizer_id, title, company_name, genre, producer_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [company, item.title, item.company, item.genre, item.producer]
    )).rows[0].id;
    const design = (await db.query<{ id: string }>(
      `INSERT INTO designs (production_id, label, cover_color, content) VALUES ($1, '一般場', $2, $3) RETURNING id`,
      [prod, item.color, JSON.stringify({ intro: "（示範資料）", duration: "約 90 分鐘" })]
    )).rows[0].id;
    await db.query(`UPDATE productions SET default_design_id = $2 WHERE id = $1`, [prod, design]);

    for (const date of item.dates) {
      const show = (await db.query<{ id: string }>(
        `INSERT INTO shows (production_id, starts_at, venue, venue_id, chain_configured) VALUES ($1, $2, $3, $4, TRUE) RETURNING id`,
        [prod, date, item.venue.name, item.venue.id]
      )).rows[0].id;
      showCount++;
      await db.query(
        `INSERT INTO claim_codes (show_id, code, valid_from, valid_to, max_claims) VALUES ($1, $2, $3, $4, 40)`,
        [show, `DEMO${show}${Math.floor(rand() * 1e6)}`, new Date(new Date(date).getTime() - 5400_000), new Date(new Date(date).getTime() + 14400_000)]
      );
      let serial = 0;
      for (const v of viewers) {
        if (rand() > item.reach / item.dates.length + 0.05) continue;
        serial++;
        const at = new Date(new Date(date).getTime() - Math.floor(rand() * 80 + 5) * 60_000);
        const r = await db.query(
          `INSERT INTO claims (user_id, show_id, serial, claimed_at, chain_status, token_id, minted_at)
           VALUES ($1, $2, $3, $4, 'minted', $5, $4) ON CONFLICT DO NOTHING RETURNING id`,
          [v, show, serial, at, 1000 + claimCount]
        );
        if (r.rows[0]) claimCount++;
        else serial--;
      }
      await db.query(`UPDATE shows SET next_serial = $2 WHERE id = $1`, [show, serial + 1]);
    }
  }

  // 部分觀眾標記前三喜歡
  for (const v of viewers) {
    const mine = await db.query<{ id: string }>(`SELECT id FROM claims WHERE user_id = $1 ORDER BY random() LIMIT 3`, [v]);
    for (let i = 0; i < mine.rows.length; i++) {
      if (rand() < 0.6) await db.query(`INSERT INTO favorites (user_id, claim_id, rank) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [v, mine.rows[i].id, i + 1]);
    }
  }

  console.log(`示範資料：${catalog.length} 檔節目、${showCount} 個場次、${viewers.length} 位觀眾、${claimCount} 份領取`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
