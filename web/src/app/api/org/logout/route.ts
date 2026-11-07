import { NextResponse } from "next/server";
import { clearOrgSession } from "@/lib/org-session";

export async function POST() {
  await clearOrgSession();
  return NextResponse.json({ ok: true });
}
