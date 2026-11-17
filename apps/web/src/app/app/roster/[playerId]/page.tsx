import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/ConfirmButton";
import { ActionForm } from "@/components/FormStateForm";
import { GoalsCard } from "@/components/GoalsCard";
import { PlayerFields } from "@/components/PlayerFields";
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { VideoStatusBadge } from "@/components/video/StatusBadge";
import { requireStaffContext } from "@/lib/auth";
import { DRILLS, type DrillType } from "@/lib/drills";
import { fmtDate, fmtSeconds } from "@/lib/format";
import { addToRoster, endRosterEntry, inviteAthlete, revokeAthleteLink, setArchived, updatePlayer } from "../actions";

export const metadata = { title: "Player" };

export default async function PlayerPage({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<{ created?: string; page?: string }> }) {
  const { playerId } = await params;
  const sp = await searchParams;
  const PAGE_SIZE = 50;
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const { supabase, membership, user } = await requireStaffContext();
  const { data: player } = await supabase.from("players").select("*").eq("id", playerId).maybeSingle();
  if (!player) notFound();
  const isSelf = player.self_user_id === user.id;
  const isSelfRecord = Boolean(player.self_user_id);
  const [teams, videos, links, invites, goals, roster, seasons] = await Promise.all([
    supabase.from("teams").select("id, name").eq("org_id", membership.org_id).is("archived_at", null).order("name"),
    supabase.from("videos").select("id, drill_type, status, upload_status, duration_s, created_at, session_id, practice_sessions(title, session_date)", { count: "exact" })
      .eq("player_id", playerId).order("created_at", { ascending: false }).order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("athlete_links").select("id, user_id, created_at, revoked_at").eq("player_id", playerId).order("created_at", { ascending: false }),
    supabase.from("invitations").select("id, email, expires_at, accepted_at, revoked_at, created_at").eq("player_id", playerId).order("created_at", { ascending: false }).limit(10),
    supabase.from("goals").select("id, sport, text, status, target_date, created_at").eq("player_id", playerId).order("created_at", { ascending: false }),
    supabase.from("roster_entries").select("id, team_id, season_id, started_at, ended_at, teams(name), seasons(name)").eq("player_id", playerId).order("started_at", { ascending: false }),
    supabase.from("seasons").select("id, name").eq("org_id", membership.org_id).order("created_at", { ascending: false }),
  ]);
  const totalVideos = videos.count ?? 0;
  const pages = Math.max(1, Math.ceil(totalVideos / PAGE_SIZE));
  const activeLinks = (links.data ?? []).filter((l) => !l.revoked_at);

  return (
    <>
      <PageHeader
        title={isSelf ? "Your profile and training history" : player.display_name}
        subtitle={player.archived_at ? `Archived ${fmtDate(player.archived_at)}` : isSelfRecord ? `Personal athlete profile${player.sports?.length ? ` · ${player.sports.join(", ")}` : ""}` : "Roster entry. No login or email is required."}
        actions={<><ButtonLink href={`/app/roster/${player.id}/report`} variant="lime">{isSelf ? "My reports" : "Player report"}</ButtonLink><ButtonLink href={`/app/upload?player=${player.id}`} variant="secondary">{isSelf ? "Upload a session" : "Upload for player"}</ButtonLink></>}
      />
      {sp.created ? <div className="mb-4"><Notice tone="ok">Player added.</Notice></div> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-semibold">Training history</h2>
            {videos.data?.length ? (
              <ul className="mt-3 divide-y divide-line text-sm">
                {videos.data.map((v) => {
                  const s = v.practice_sessions as unknown as { title: string; session_date: string } | null;
                  return (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/app/videos/${v.id}`} className="font-medium hover:underline">
                        {s ? `${s.title} (${fmtDate(s.session_date)})` : fmtDate(v.created_at)} · {DRILLS[v.drill_type as DrillType]?.short}
                      </Link>
                      <span className="flex items-center gap-2 text-xs text-muted">{fmtSeconds(v.duration_s)} <VideoStatusBadge status={v.status} uploadStatus={v.upload_status} personal={membership.org_kind === "personal"} /></span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {pages > 1 ? (
              <nav aria-label="Training history pages" className="mt-3 flex items-center justify-between text-sm">
                {page > 1 ? <Link className="underline" href={`/app/roster/${player.id}?page=${page - 1}`}>Newer</Link> : <span />}
                <span className="text-muted">Page {page} of {pages} · {totalVideos} recordings</span>
                {page < pages ? <Link className="underline" href={`/app/roster/${player.id}?page=${page + 1}`}>Older</Link> : <span />}
              </nav>
            ) : null}
            {!videos.data?.length && page === 1 ? <div className="mt-3"><EmptyState title="No recordings yet" action={<ButtonLink href={`/app/upload?player=${player.id}`} variant="secondary">Upload a recording</ButtonLink>} /></div> : null}
          </Card>
          {isSelfRecord ? null : <Card>
            <h2 className="mb-4 font-semibold">Edit player</h2>
            <ActionForm action={updatePlayer} submitLabel="Save changes">
              <input type="hidden" name="id" value={player.id} />
              <PlayerFields teams={teams.data ?? []} player={player} />
            </ActionForm>
          </Card>}
        </div>
        <div className="space-y-6">
          <GoalsCard playerId={player.id} goals={goals.data ?? []} defaultSport={player.sports?.[0] ?? "other"} />
          {isSelfRecord ? null : (
            <Card>
              <h2 className="font-semibold">Teams and seasons</h2>
              <p className="mt-1 text-xs text-muted">One athlete record can be on several teams. Each team&apos;s coaches see this athlete and only the recordings uploaded to their team.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {(roster.data ?? []).map((r) => {
                  const primary = r.team_id === player.team_id && !r.season_id;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{(r.teams as unknown as { name: string } | null)?.name ?? "Team"}{r.seasons ? ` · ${(r.seasons as unknown as { name: string }).name}` : ""} {primary ? <Badge tone="dark">Primary</Badge> : null} {r.ended_at ? <Badge>Ended {fmtDate(r.ended_at)}</Badge> : null}</span>
                      {!r.ended_at && !primary ? <ConfirmButton label="End" variant="secondary" action={endRosterEntry.bind(null, r.id, player.id)} /> : null}
                    </li>
                  );
                })}
              </ul>
              {(teams.data ?? []).length > 1 || (seasons.data ?? []).length ? (
                <ActionForm action={addToRoster} submitLabel="Add to team" submitVariant="secondary" className="mt-3 space-y-2 border-t border-line pt-3">
                  <input type="hidden" name="player_id" value={player.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="label" htmlFor="rt-team">Team</label><select className="field" id="rt-team" name="team_id">{(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
                    <div><label className="label" htmlFor="rt-season">Season (optional)</label><select className="field" id="rt-season" name="season_id"><option value="">None</option>{(seasons.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                  </div>
                </ActionForm>
              ) : null}
            </Card>
          )}
          {isSelfRecord ? null : <><Card>
            <h2 className="font-semibold">Athlete account (optional)</h2>
            <p className="mt-1 text-xs text-muted">A linked athlete sees only their own published reports and recordings you explicitly share.</p>
            {activeLinks.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {activeLinks.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <Badge tone="ok">Linked {fmtDate(l.created_at)}</Badge>
                    <ConfirmButton label="Unlink" variant="danger" confirmLabel="Unlink account"
                      prompt="The athlete will immediately lose access to new playback links."
                      action={revokeAthleteLink.bind(null, l.id, player.id)} />
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4">
              <ActionForm action={inviteAthlete} submitLabel="Create invitation link" pendingLabel="Creating…" submitVariant="secondary">
                <input type="hidden" name="player_id" value={player.id} />
                <div>
                  <label className="label" htmlFor="invite-email">Athlete email</label>
                  <input className="field" id="invite-email" name="email" type="email" required />
                  <p className="hint">Single-use link, valid 7 days, only for an account signed in with this exact email.</p>
                </div>
              </ActionForm>
            </div>
            {invites.data?.length ? (
              <ul className="mt-4 space-y-1 text-xs text-muted">
                {invites.data.map((i) => (
                  <li key={i.id}>{i.email}: {i.accepted_at ? "accepted" : i.revoked_at ? "revoked" : new Date(i.expires_at) < new Date() ? "expired" : `pending until ${fmtDate(i.expires_at)}`}</li>
                ))}
              </ul>
            ) : null}
          </Card>
          <Card>
            <h2 className="font-semibold">{player.archived_at ? "Restore player" : "Archive player"}</h2>
            <p className="mt-1 mb-3 text-xs text-muted">Archiving hides the player from the roster and frees a roster slot. Recordings and reports are kept.</p>
            <ConfirmButton label={player.archived_at ? "Restore" : "Archive"} action={setArchived.bind(null, player.id, !player.archived_at)} />
          </Card></>}
        </div>
      </div>
    </>
  );
}
