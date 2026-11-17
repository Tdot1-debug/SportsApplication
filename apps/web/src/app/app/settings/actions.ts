"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ORG_COOKIE, requireOwnerContext } from "@/lib/auth";
import { publicEnv } from "@/lib/env";

type State = { error?: string; ok?: string } | undefined;
const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v.length ? v : null; };

export async function updateOrg(_: State, f: FormData): Promise<State> {
  const { supabase, membership } = await requireOwnerContext();
  const retention = Number(f.get("retention_days"));
  const { error } = await supabase.from("organizations").update({
    name: str(f, "name") ?? undefined, display_name: str(f, "display_name"), accent_color: str(f, "accent_color"),
    retention_days: Number.isFinite(retention) ? retention : undefined, sport: (str(f, "sport") ?? "softball") as "softball",
  }).eq("id", membership.org_id);
  if (error) return { error: error.message.includes("check") ? "Retention must be between 30 and 3650 days; colour must be a #RRGGBB value." : error.message };
  revalidatePath("/app", "layout");
  return { ok: "Organisation settings saved." };
}

export async function createTeam(_: State, f: FormData): Promise<State> {
  const { supabase, membership } = await requireOwnerContext();
  const { error } = await supabase.rpc("create_team", { p_org: membership.org_id, p_name: String(f.get("name") ?? ""), p_sport: String(f.get("sport") ?? "softball") });
  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  return { ok: "Team created." };
}

export async function archiveTeam(teamId: string, archived: boolean) {
  const { supabase } = await requireOwnerContext();
  const { error } = await supabase.from("teams").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", teamId);
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}

export async function inviteCoach(_: State, f: FormData): Promise<State> {
  const { supabase, membership } = await requireOwnerContext();
  const teamIds = f.getAll("team_ids").map(String);
  // A personal workspace has one training log, so an invited coach always sees all of it.
  const all = membership.org_kind === "personal" || f.get("all_teams") === "on";
  if (!all && teamIds.length === 0) return { error: "Choose at least one team, or give access to all teams." };
  const { data, error } = await supabase.rpc("create_invitation", {
    p_org: membership.org_id, p_email: String(f.get("email") ?? ""), p_role: "coach", p_team_ids: teamIds, p_all_teams: all,
  });
  if (error) return { error: error.message };
  const row = (data as { token: string; expires_at: string }[])[0];
  revalidatePath("/app/settings");
  return { ok: `Invitation created. Send this single-use link to the coach (valid until ${new Date(row.expires_at).toLocaleDateString()}): ${publicEnv.appUrl}/invite/${row.token}` };
}

export async function setCoachTeams(_: State, f: FormData): Promise<State> {
  const { supabase } = await requireOwnerContext();
  const { error } = await supabase.rpc("set_member_teams", {
    p_membership: String(f.get("membership_id")), p_all_teams: f.get("all_teams") === "on", p_team_ids: f.getAll("team_ids").map(String),
  });
  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  return { ok: "Team access updated." };
}

export async function removeMember(membershipId: string) {
  const { supabase } = await requireOwnerContext();
  const { error } = await supabase.rpc("remove_member", { p_membership: membershipId });
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}

export async function revokeInvitation(id: string) {
  const { supabase } = await requireOwnerContext();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation: id });
  if (error) throw new Error(error.message);
  revalidatePath("/app/settings");
}

export async function activateEvaluation() {
  const { supabase, membership } = await requireOwnerContext();
  const { error } = await supabase.rpc("activate_evaluation", { p_org: membership.org_id });
  if (error) throw new Error(error.message);
  revalidatePath("/app", "layout");
}

export async function redeemCode(_: State, f: FormData): Promise<State> {
  const { supabase, membership } = await requireOwnerContext();
  const { error } = await supabase.rpc("redeem_pilot_code", { p_org: membership.org_id, p_code: String(f.get("code") ?? "") });
  if (error) return { error: error.message };
  revalidatePath("/app", "layout");
  return { ok: "Pilot access activated." };
}

export async function deleteOrganization(_: State, f: FormData): Promise<State> {
  const { supabase, membership } = await requireOwnerContext();
  const { error } = await supabase.rpc("delete_organization", { p_org: membership.org_id, p_confirm_name: String(f.get("confirm") ?? "") });
  if (error) return { error: error.message };
  (await cookies()).delete(ORG_COOKIE);
  redirect("/onboarding?deleted=1");
}

export async function createSeason(_: State, f: FormData): Promise<State> {
  const { supabase, membership } = await requireOwnerContext();
  const { error } = await supabase.rpc("create_season", {
    p_org: membership.org_id, p_name: String(f.get("name") ?? ""), p_starts_on: str(f, "starts_on") ?? undefined, p_ends_on: str(f, "ends_on") ?? undefined,
  });
  if (error) return { error: error.message.includes("unique") ? "A season with that name already exists." : error.message };
  revalidatePath("/app/settings");
  return { ok: "Season created." };
}
