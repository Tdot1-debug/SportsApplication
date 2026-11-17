"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaffContext } from "@/lib/auth";
import { publicEnv } from "@/lib/env";

type State = { error?: string; ok?: string } | undefined;

const str = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v.length ? v : null;
};

export async function createPlayer(_: State, f: FormData): Promise<State> {
  const { supabase, user, membership } = await requireStaffContext();
  const name = str(f, "display_name");
  const team = str(f, "team_id");
  if (!name || !team) return { error: "Name and team are required." };
  const { data, error } = await supabase.from("players").insert({
    org_id: membership.org_id, team_id: team, display_name: name, jersey_number: str(f, "jersey_number"),
    position: str(f, "position"), bats_throws: str(f, "bats_throws"), notes: str(f, "notes"),
    consent_status: (str(f, "consent_status") ?? "not_recorded") as "not_recorded", created_by: user.id,
  }).select("id").single();
  if (error) return { error: error.message.includes("row-level security") ? "You do not have access to that team." : error.message };
  revalidatePath("/app/roster");
  redirect(`/app/roster/${data.id}?created=1`);
}

export async function updatePlayer(_: State, f: FormData): Promise<State> {
  const { supabase } = await requireStaffContext();
  const id = str(f, "id")!;
  const { error } = await supabase.from("players").update({
    display_name: str(f, "display_name") ?? undefined, jersey_number: str(f, "jersey_number"), position: str(f, "position"),
    bats_throws: str(f, "bats_throws"), notes: str(f, "notes"),
    consent_status: (str(f, "consent_status") ?? "not_recorded") as "not_recorded",
    team_id: str(f, "team_id") ?? undefined,
  }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/app/roster/${id}`);
  return { ok: "Saved." };
}

export async function setArchived(id: string, archived: boolean) {
  const { supabase } = await requireStaffContext();
  const { error } = await supabase.from("players").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/app/roster");
  revalidatePath(`/app/roster/${id}`);
}

export async function inviteAthlete(_: State, f: FormData): Promise<State> {
  const { supabase, membership } = await requireStaffContext();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_org: membership.org_id, p_email: String(f.get("email") ?? ""), p_role: "athlete", p_player: String(f.get("player_id")),
  });
  if (error) return { error: error.message };
  const row = (data as { token: string; expires_at: string }[])[0];
  revalidatePath(`/app/roster/${f.get("player_id")}`);
  return { ok: `Invitation created. Send this single-use link to the athlete (expires ${new Date(row.expires_at).toLocaleDateString()}): ${publicEnv.appUrl}/invite/${row.token}` };
}

export async function revokeAthleteLink(linkId: string, playerId: string) {
  const { supabase } = await requireStaffContext();
  const { error } = await supabase.rpc("revoke_athlete_link", { p_link: linkId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/roster/${playerId}`);
}

const GOAL_SPORTS = ["strength", "softball", "tennis", "boxing", "other"] as const;

export async function saveGoal(_: State, f: FormData): Promise<State> {
  const { supabase } = await requireStaffContext();
  const player = String(f.get("player_id") ?? "");
  const text = str(f, "text");
  const sport = String(f.get("sport") ?? "other");
  if (!text || text.length < 3) return { error: "Describe the goal in a few words." };
  if (!(GOAL_SPORTS as readonly string[]).includes(sport)) return { error: "Choose a sport." };
  const { error } = await supabase.rpc("upsert_goal", {
    p_goal: (str(f, "goal_id") ?? null) as unknown as string, p_player: player, p_sport: sport, p_text: text,
    p_status: String(f.get("status") ?? "active"), p_target_date: str(f, "target_date") ?? undefined,
  });
  if (error) return { error: error.message };
  revalidatePath(`/app/roster/${player}`);
  return { ok: "Goal saved." };
}

export async function addToRoster(_: State, f: FormData): Promise<State> {
  const { supabase } = await requireStaffContext();
  const player = String(f.get("player_id") ?? "");
  const { error } = await supabase.rpc("add_to_roster", { p_player: player, p_team: String(f.get("team_id") ?? ""), p_season: str(f, "season_id") ?? undefined });
  if (error) return { error: error.message };
  revalidatePath(`/app/roster/${player}`);
  return { ok: "Added to team." };
}

export async function endRosterEntry(entryId: string, playerId: string) {
  const { supabase } = await requireStaffContext();
  const { error } = await supabase.rpc("end_roster_entry", { p_entry: entryId });
  if (error) throw new Error(error.message);
  revalidatePath(`/app/roster/${playerId}`);
}
