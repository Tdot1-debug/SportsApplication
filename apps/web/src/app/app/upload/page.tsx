import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Uploader } from "@/components/upload/Uploader";
import { requireStaffContext } from "@/lib/auth";

export const metadata = { title: "Upload" };

export default async function UploadPage({ searchParams }: { searchParams: Promise<{ team?: string; player?: string; session?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireStaffContext();
  const [teams, players, sessions, usage, worker, org] = await Promise.all([
    supabase.from("teams").select("id, name").eq("org_id", membership.org_id).is("archived_at", null).order("name"),
    supabase.from("players").select("id, display_name, team_id, sports, roster_entries(team_id, ended_at)").eq("org_id", membership.org_id).is("archived_at", null).order("display_name"),
    supabase.from("practice_sessions").select("id, title, team_id, drill_type, intended_target").eq("org_id", membership.org_id).order("session_date", { ascending: false }).limit(50),
    supabase.rpc("get_usage_summary", { p_org: membership.org_id }),
    supabase.rpc("analysis_available"),
    supabase.from("organizations").select("sport").eq("id", membership.org_id).maybeSingle(),
  ]);
  const active = players.data ?? [];
  // A personal workspace (or a one-player roster) has an obvious default: the only athlete.
  const only = active.length === 1 ? active[0] : null;
  const defaults = { ...sp, player: sp.player ?? only?.id, team: sp.team ?? only?.team_id };
  const firstSport = only?.sports?.[0];
  const defaultDrill = membership.org_kind === "personal" && firstSport
    ? (firstSport === "strength" ? "gym_test" : firstSport === "softball" ? "softball_hitting" : "general_movement")
    : org.data?.sport === "gym" ? "gym_test" : org.data?.sport === "multi" ? "general_movement" : "softball_hitting";
  const u = usage.data as { analysis_blocked?: boolean } | null;
  const analysisAvailable = Boolean(worker.data) && !u?.analysis_blocked;
  return (
    <>
      <PageHeader title="Upload practice video" subtitle={<>Choose MP4 or MOV files from your phone or computer. <Link className="underline" href="/app/guide">Read the upload guide</Link>.</>} />
      <Uploader teams={teams.data ?? []} players={active.map(({ id, display_name, team_id, roster_entries }) => ({ id, display_name, team_id, team_ids: (roster_entries ?? []).filter((r) => !r.ended_at).map((r) => r.team_id) }))} sessions={sessions.data ?? []} defaults={defaults} analysisAvailable={analysisAvailable} defaultDrill={defaultDrill} />
    </>
  );
}
