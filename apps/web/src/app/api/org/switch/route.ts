import { NextResponse, type NextRequest } from "next/server";
import { ORG_COOKIE } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const org = String(form.get("org") ?? "");
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const { data } = await supabase.from("memberships").select("id").eq("org_id", org).eq("user_id", user.user.id)
    .eq("status", "active").in("role", ["owner", "coach"]).maybeSingle();
  const res = NextResponse.redirect(new URL("/app/dashboard", request.url), { status: 303 });
  if (data) res.cookies.set(ORG_COOKIE, org, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  return res;
}
