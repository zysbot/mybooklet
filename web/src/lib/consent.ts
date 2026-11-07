import type { Queryable } from "./db";
import type { User } from "./users";
import { LEGAL_VERSION } from "@/content/legal";

/**
 * 首次領取告知：觀眾第一次領取前，要選年齡區間（18 歲以上／13–17 歲）並同意使用條款與隱私權政策，
 * 同時選擇是否公開收藏。選 13–17 歲的收藏一律不公開。
 */
export function needsConsent(user: Pick<User, "terms_accepted_at"> | null): boolean {
  return !user || !user.terms_accepted_at;
}

export type AgeGroup = "adult" | "teen";

export interface ConsentInput {
  age: AgeGroup;
  /** 公開我的收藏；13–17 歲一律為 false */
  socialPublic: boolean;
}

export function parseConsent(v: unknown): ConsentInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.agree !== true) return null;
  if (o.age !== "adult" && o.age !== "teen") return null;
  return { age: o.age, socialPublic: o.age === "adult" && o.socialPublic === true };
}

export async function recordConsent(q: Queryable, userId: string, c: ConsentInput, now: Date = new Date()): Promise<void> {
  await q.query(
    `UPDATE users SET terms_accepted_at = $2, terms_version = $3, age_confirmed_at = $2, age_group = $4, social_public = $5 WHERE id = $1`,
    [userId, now, LEGAL_VERSION, c.age, c.age === "adult" && c.socialPublic]
  );
}

/** 13–17 歲的觀眾滿 18 歲後，自己改成 18 歲以上（之後才能公開收藏） */
export async function confirmAdult(q: Queryable, userId: string): Promise<void> {
  await q.query(`UPDATE users SET age_group = 'adult', age_confirmed_at = now() WHERE id = $1`, [userId]);
}
