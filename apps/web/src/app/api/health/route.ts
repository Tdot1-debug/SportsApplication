import { NextResponse } from "next/server";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, string> = { web: "ok" };
  if (!isSupabaseConfigured()) checks.supabase = "not_configured";
  else {
    try {
      const r = await fetch(`${publicEnv.supabaseUrl}/auth/v1/health`, { headers: { apikey: publicEnv.supabasePublishableKey }, cache: "no-store", signal: AbortSignal.timeout(3000) });
      checks.supabase = r.ok ? "ok" : `http_${r.status}`;
    } catch {
      checks.supabase = "unreachable";
    }
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json({ ok, checks, version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" }, { status: ok ? 200 : 503 });
}
