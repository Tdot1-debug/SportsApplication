import Link from "next/link";
import { ActionForm } from "@/components/FormStateForm";
import { PlayerFields } from "@/components/PlayerFields";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { requireStaffContext } from "@/lib/auth";
import { createPlayer } from "./actions";

export const metadata = { title: "Roster" };

export default async function Roster({ searchParams }: { searchParams: Promise<{ archived?: string; team?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireStaffContext();
  const { data: teams } = await supabase.from("teams").select("id, name").eq("org_id", membership.org_id).is("archived_at", null).order("name");
  let q = supabase.from("players").select("id, display_name, jersey_number, position, consent_status, archived_at, team_id, teams!players_team_id_fkey(name), athlete_links(id, revoked_at)")
    .eq("org_id", membership.org_id).order("display_name");
  q = sp.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
  if (sp.team) {
    // Include athletes whose primary team is elsewhere but who are currently rostered on this team.
    const { data: entries } = await supabase.from("roster_entries").select("player_id").eq("team_id", sp.team).is("ended_at", null);
    q = q.in("id", [...new Set((entries ?? []).map((e) => e.player_id))]);
  }
  const { data: players, error } = await q;
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader title="Roster" subtitle="Players are private to your organisation. There is no public roster directory." />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div>
          <nav className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Roster filters">
            <Link className={`rounded-full border px-3 py-1 ${!sp.archived ? "border-ink bg-ink text-white" : "border-line bg-white"}`} href="/app/roster">Active</Link>
            <Link className={`rounded-full border px-3 py-1 ${sp.archived ? "border-ink bg-ink text-white" : "border-line bg-white"}`} href="/app/roster?archived=1">Archived</Link>
            {(teams ?? []).length > 1 ? (teams ?? []).map((t) => (
              <Link key={t.id} className={`rounded-full border px-3 py-1 ${sp.team === t.id ? "border-ink" : "border-line bg-white"}`} href={`/app/roster?team=${t.id}`}>{t.name}</Link>
            )) : null}
          </nav>
          {players?.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {players.map((p) => (
                <li key={p.id}>
                  <Link href={`/app/roster/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                    <span>
                      <span className="font-medium">{p.display_name}</span>
                      {p.jersey_number ? <span className="ml-2 text-sm text-muted">#{p.jersey_number}</span> : null}
                      <span className="block text-xs text-muted">{(p.teams as unknown as { name: string })?.name}{p.position ? ` · ${p.position}` : ""}</span>
                    </span>
                    <span className="flex gap-1">
                      {(p.athlete_links ?? []).some((l) => !l.revoked_at) ? <Badge tone="ok">Athlete account</Badge> : null}
                      {p.consent_status === "withdrawn" ? <Badge tone="danger">Consent withdrawn</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title={sp.archived ? "No archived players" : "No players yet"}>
              {sp.archived ? null : "Add your first player with the form. Athlete accounts are optional."}
            </EmptyState>
          )}
        </div>
        <Card>
          <h2 className="mb-4 font-semibold">Add player</h2>
          {teams?.length ? (
            <ActionForm action={createPlayer} submitLabel="Add player">
              <PlayerFields teams={teams} />
            </ActionForm>
          ) : (
            <p className="text-sm text-muted">You are not assigned to any team yet. Ask the organisation owner to assign you.</p>
          )}
        </Card>
      </div>
    </>
  );
}
