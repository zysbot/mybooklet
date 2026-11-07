import type { Queryable } from "./db";
import type { User } from "./users";
import { LEGAL_VERSION } from "@/content/legal";

/**
 * 首次領取告知：觀眾第一次領取前，要勾選「我已滿 13 歲」並同意使用條款與隱私權政策，
 * 同時選擇是否公開收藏（預設公開；未滿 18 歲請不要公開）。
 */
export function needsConsent(user: Pick<User, "terms_accepted_at"> | null): boolean {
  return !user || !user.terms_accepted_at;
}

export interface ConsentInput {
  /** 勾選「我已滿 13 歲，並同意使用條款與隱私權政策」 */
  age13: boolean;
  /** 公開我的收藏 */
  socialPublic: boolean;
}

export function parseConsent(v: unknown): ConsentInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o.age13 !== true) return null;
  return { age13: true, socialPublic: o.socialPublic === true };
}

export async function recordConsent(q: Queryable, userId: string, c: ConsentInput, now: Date = new Date()): Promise<void> {
  await q.query(
    `UPDATE users SET terms_accepted_at = $2, terms_version = $3, age_confirmed_at = $2, social_public = $4 WHERE id = $1`,
    [userId, now, LEGAL_VERSION, c.socialPublic]
  );
}
