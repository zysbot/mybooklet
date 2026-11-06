import type { Db } from "./db";
import { chainDate, claimIdToBytes32, type MintChain, type MintRequest } from "./chain";
import { deriveCustodialAddress, newCustodyPath } from "./wallet";

export interface MintWorkerOptions {
  /** 代管地址的延伸公鑰（WALLET_XPUB） */
  xpub: string;
  batchSize?: number;
  maxAttempts?: number;
  /** 送出後超過這個時間仍未確認，視為卡住，重新對帳 */
  staleAfterMs?: number;
  /**
   * 只處理這個時間之前領取的紀錄。每日批次傳入「台北時間今天 0 點」，
   * 讓同一天的領取一起在隔天上鏈，鏈上的交易時間看不出誰在幾點領取。
   * 不傳則不限（營運後台的「立即上鏈」測試用）。
   */
  claimedBefore?: Date;
  now?: () => Date;
}

export interface MintRunReport {
  reconciled: number;
  submitted: number;
  minted: number;
  retried: number;
  failed: number;
}

const DEFAULTS = { batchSize: 100, maxAttempts: 8, staleAfterMs: 10 * 60 * 1000 };

/** 第 n 次失敗後等待的時間：30 秒、1 分、2 分……最多 1 小時 */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 60 * 60 * 1000);
}

/** 台北時間某一天的 0 點（台灣不實施夏令時間，固定 UTC+8） */
export function startOfTaipeiDay(d: Date): Date {
  const date = String(chainDate(d));
  return new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00+08:00`);
}

interface QueuedClaim {
  id: string;
  show_id: string;
  serial: number;
  claimed_at: Date;
  attempts: number;
  custody_path: string | null;
  wallet_type: "custodial" | "self";
  wallet_address: string | null;
}

/** Fisher–Yates 洗牌：同一批交易裡的順序與領取順序無關 */
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 上鏈程序：執行一輪。
 * 1. 對帳：送出太久沒確認的紀錄，查合約是否已鑄造。
 * 2. 隨機取出待上鏈紀錄（每次最多 batchSize 筆），每份節目單配一個自己的代管地址，打亂順序後合併成一筆交易。
 * 3. 成功就記下 tokenId；失敗就依次數延後重試，超過上限標為 failed。
 *
 * 可以同時有多個程序在跑：取紀錄時用 SKIP LOCKED，不會重複處理。
 */
export async function runMintBatch(db: Db, chain: MintChain, options: MintWorkerOptions): Promise<MintRunReport> {
  const { batchSize, maxAttempts, staleAfterMs } = { ...DEFAULTS, ...options };
  const now = options.now ?? (() => new Date());
  const report: MintRunReport = { reconciled: 0, submitted: 0, minted: 0, retried: 0, failed: 0 };

  // 1. 對帳
  const stale = await db.query<{ id: string }>(
    `SELECT id FROM claims WHERE chain_status = 'submitted' AND submitted_at < $1`,
    [new Date(now().getTime() - staleAfterMs)]
  );
  for (const { id } of stale.rows) {
    const tokenId = await chain.tokenOfClaim(claimIdToBytes32(id));
    if (tokenId > 0n) {
      await db.query(
        `UPDATE claims SET chain_status = 'minted', token_id = $2, minted_at = $3, last_error = NULL WHERE id = $1`,
        [id, tokenId.toString(), now()]
      );
    } else {
      await db.query(
        `UPDATE claims SET chain_status = 'pending', next_attempt_at = $2, last_error = '送出後未確認，重新排隊' WHERE id = $1`,
        [id, now()]
      );
    }
    report.reconciled++;
  }

  // 2. 隨機取出一批，配好收件地址，標為已送出
  const batch = await db.tx(async (q) => {
    const picked = await q.query<QueuedClaim>(
      `SELECT c.id, c.show_id, c.serial, c.claimed_at, c.attempts, c.custody_path, u.wallet_type, u.wallet_address
         FROM claims c
         JOIN users u ON u.id = c.user_id
         JOIN shows s ON s.id = c.show_id
        WHERE c.chain_status = 'pending'
          AND c.next_attempt_at <= $1
          AND ($3::timestamptz IS NULL OR c.claimed_at < $3)
          AND s.chain_configured
        ORDER BY random()
        LIMIT $2
        FOR UPDATE OF c SKIP LOCKED`,
      [now(), batchSize, options.claimedBefore ?? null]
    );
    const out: (QueuedClaim & { to: string })[] = [];
    for (const c of picked.rows) {
      let to: string;
      if (c.wallet_type === "self" && c.wallet_address) {
        to = c.wallet_address; // 綁定自有錢包後，新領取直接發到本人錢包
      } else {
        const path = c.custody_path ?? newCustodyPath();
        to = deriveCustodialAddress(options.xpub, path);
        c.custody_path = path;
      }
      await q.query(
        `UPDATE claims SET chain_status = 'submitted', submitted_at = $2, custody_path = $3, recipient_address = $4 WHERE id = $1`,
        [c.id, now(), c.wallet_type === "self" && c.wallet_address ? null : c.custody_path, to]
      );
      out.push({ ...c, to });
    }
    return shuffle(out);
  });
  if (batch.length === 0) return report;

  const requests: MintRequest[] = batch.map((c) => ({
    to: c.to,
    showId: BigInt(c.show_id),
    serial: Number(c.serial),
    claimedOn: chainDate(new Date(c.claimed_at)),
    claimId: claimIdToBytes32(c.id),
  }));

  // 3. 送交易
  try {
    const sent = await chain.sendMintBatch(requests);
    report.submitted = batch.length;
    await db.query(`UPDATE claims SET tx_hash = $2 WHERE id = ANY($1::uuid[])`, [batch.map((c) => c.id), sent.txHash]);

    const minted = await sent.wait();
    for (const c of batch) {
      const tokenId = minted.get(claimIdToBytes32(c.id).toLowerCase());
      if (tokenId !== undefined) {
        await db.query(
          `UPDATE claims SET chain_status = 'minted', token_id = $2, minted_at = $3, last_error = NULL WHERE id = $1`,
          [c.id, tokenId.toString(), now()]
        );
        report.minted++;
      } else {
        // 交易成功卻沒有這筆的事件：不應發生，交給下一輪對帳
        await db.query(`UPDATE claims SET last_error = '交易成功但找不到鑄造事件' WHERE id = $1`, [c.id]);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
    for (const c of batch) {
      const attempts = Number(c.attempts) + 1;
      if (attempts >= maxAttempts) {
        await db.query(
          `UPDATE claims SET chain_status = 'failed', attempts = $2, last_error = $3 WHERE id = $1`,
          [c.id, attempts, message]
        );
        report.failed++;
      } else {
        await db.query(
          `UPDATE claims SET chain_status = 'pending', attempts = $2, last_error = $3, next_attempt_at = $4 WHERE id = $1`,
          [c.id, attempts, message, new Date(now().getTime() + backoffMs(attempts))]
        );
        report.retried++;
      }
    }
  }

  return report;
}

/**
 * 連續跑多輪，直到沒有可送的紀錄或時間用完。
 * 網站單次請求最多執行 60 秒，所以預設 45 秒後停下，剩下的交給下一次呼叫。
 */
export async function runMintUntilDone(
  db: Db,
  chain: MintChain,
  options: MintWorkerOptions & { budgetMs?: number }
): Promise<MintRunReport & { more: boolean }> {
  const started = Date.now();
  const budget = options.budgetMs ?? 45_000;
  const total = { reconciled: 0, submitted: 0, minted: 0, retried: 0, failed: 0, more: false };
  while (true) {
    const r = await runMintBatch(db, chain, options);
    for (const k of ["reconciled", "submitted", "minted", "retried", "failed"] as const) total[k] += r[k];
    if (r.submitted === 0) break;
    if (Date.now() - started > budget) {
      total.more = true;
      break;
    }
  }
  return total;
}
