import type { Queryable } from "./db";

/**
 * 主辦方的合作方案。
 * - free：免費使用。看得到每場的領取上限、已領取、已寫入鏈上份數；所有場次合計最多發 FREE_CLAIM_LIMIT 份。
 * - basic：基本合作（付費）。合作期間看得到完整統計，不限份數。
 * 到期日（plan_until，台北日期，當天仍有效）過了就自動視為 free。
 */
export type Plan = "free" | "basic";

export const PLANS: Plan[] = ["free", "basic"];

export const PLAN_LABEL: Record<Plan, string> = {
  free: "免費",
  basic: "基本合作",
};

/** 免費組織（以演出團隊計）所有場次合計可發出的份數 */
export const FREE_CLAIM_LIMIT = 50;

/** SQL 片段：組織目前實際適用的方案（o 是 organizers 的別名） */
export const EFFECTIVE_PLAN_SQL = `CASE WHEN o.plan <> 'free' AND (o.plan_until IS NULL OR o.plan_until >= (now() AT TIME ZONE 'Asia/Taipei')::date)
  THEN o.plan ELSE 'free' END`;

export interface PlanInfo {
  /** 設定的方案 */
  plan: Plan;
  /** 合作到期日（YYYY-MM-DD），null 表示不設到期日 */
  until: string | null;
  /** 目前實際適用的方案（到期後為 free） */
  effective: Plan;
}

/** 台北時間的今天（YYYY-MM-DD） */
export function taipeiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

export function effectivePlan(plan: Plan, until: string | null, now: Date = new Date()): Plan {
  if (plan === "free") return "free";
  if (until && until < taipeiToday(now)) return "free";
  return plan;
}

export async function getPlan(q: Queryable, organizerId: string, now: Date = new Date()): Promise<PlanInfo | null> {
  const r = await q.query<{ plan: Plan; until: string | null }>(
    `SELECT plan, to_char(plan_until, 'YYYY-MM-DD') AS until FROM organizers WHERE id = $1`,
    [organizerId]
  );
  const row = r.rows[0];
  if (!row) return null;
  const until = row.until ?? null;
  return { plan: row.plan, until, effective: effectivePlan(row.plan, until, now) };
}

export class PlanError extends Error {}

/** 營運方設定組織的方案與到期日 */
export async function setPlan(q: Queryable, organizerId: string, plan: string, until: string | null): Promise<void> {
  if (!PLANS.includes(plan as Plan)) throw new PlanError("方案不存在");
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new PlanError("到期日格式要是 YYYY-MM-DD");
  if (until !== null && Number.isNaN(new Date(`${until}T00:00:00+08:00`).getTime())) throw new PlanError("到期日不是有效的日期");
  const r = await q.query(`UPDATE organizers SET plan = $2, plan_until = $3 WHERE id = $1 RETURNING id`, [
    organizerId,
    plan,
    plan === "free" ? null : until,
  ]);
  if (r.rows.length === 0) throw new PlanError("找不到這個組織");
}

/** 免費組織已發出的份數（以演出團隊計，所有節目、所有場次合計） */
export async function freeUsage(q: Queryable, organizerId: string): Promise<number> {
  const r = await q.query<{ n: string }>(
    `SELECT count(*) AS n FROM claims c JOIN shows s ON s.id = c.show_id JOIN productions p ON p.id = s.production_id
      WHERE p.organizer_id = $1`,
    [organizerId]
  );
  return Number(r.rows[0].n);
}

/** 方案變更寫進主辦方的存取紀錄 */
export async function logPlanChange(q: Queryable, organizerId: string, plan: string, until: string | null): Promise<void> {
  const detail = `${PLAN_LABEL[plan as Plan] ?? plan}${plan !== "free" ? (until ? `，到 ${until}` : "，不設到期日") : ""}`;
  await q.query(`INSERT INTO org_access_log (organizer_id, actor, action, detail) VALUES ($1, '營運方', 'plan_changed', $2)`, [
    organizerId,
    detail,
  ]);
}
