"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ORG_COOKIE, requireUser } from "@/lib/auth";

export type FormState = { error?: string } | undefined;

export async function createProgram(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser("/onboarding");
  const name = String(form.get("name") ?? "").trim();
  const team = String(form.get("team") ?? "").trim();
  if (name.length < 2) return { error: "Enter a program name (at least 2 characters)." };
  if (!team) return { error: "Enter a name for your first team." };
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_sport: String(form.get("sport") ?? "softball"),
    p_team_name: team,
    p_recording_attested: form.get("attest") === "on",
    p_notice_accepted: form.get("notice") === "on",
    p_display_name: String(form.get("display_name") ?? ""),
  });
  if (error) return { error: error.message };
  (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  redirect("/onboarding/access");
}

export async function choosePilotAccess(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser("/onboarding/access");
  const org = (await cookies()).get(ORG_COOKIE)?.value;
  if (!org) return { error: "No program selected." };
  const choice = String(form.get("choice"));
  if (choice === "code") {
    const code = String(form.get("code") ?? "").trim();
    if (!code) return { error: "Enter your pilot access code." };
    const { error } = await supabase.rpc("redeem_pilot_code", { p_org: org, p_code: code });
    if (error) return { error: error.message };
  } else if (choice === "evaluation") {
    const { error } = await supabase.rpc("activate_evaluation", { p_org: org });
    if (error) return { error: error.message };
  }
  redirect("/app/dashboard?welcome=1");
}

export async function createPersonalWorkspace(_: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await requireUser("/onboarding/personal");
  const sports = form.getAll("sports").map(String);
  if (sports.length === 0) return { error: "Choose at least one sport." };
  const { data, error } = await supabase.rpc("create_personal_workspace", {
    p_display_name: String(form.get("display_name") ?? ""),
    p_sports: sports,
    p_adult_confirmed: form.get("adult") === "on",
    p_recording_attested: form.get("attest") === "on",
    p_notice_accepted: form.get("notice") === "on",
    p_goal: String(form.get("goal") ?? ""),
  });
  if (error) return { error: error.message };
  (await cookies()).set(ORG_COOKIE, data as string, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  redirect("/onboarding/access");
}
