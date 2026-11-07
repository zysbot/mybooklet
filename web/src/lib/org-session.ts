import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { getAccount } from "./org-accounts";

/** 主辦方工作帳號的登入狀態：與觀眾（mb_session）、營運後台（mb_admin）各自獨立 */
const COOKIE = "mb_org";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET 至少要 32 個字元");
  return new TextEncoder().encode("org:" + s);
}

export async function setOrgSession(accountId: string): Promise<void> {
  const token = await new SignJWT({ aid: accountId, role: "org" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_SITE_URL?.startsWith("http://"),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearOrgSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** 目前登入的工作帳號；帳號已不存在也視為未登入 */
export async function currentOrgAccount(): Promise<{ id: string; email: string } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.role !== "org" || typeof payload.aid !== "string") return null;
    return await getAccount(getDb(), payload.aid);
  } catch {
    return null;
  }
}
