import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader, Stat } from "@/components/ui";
import { VideoStatusBadge } from "@/components/video/StatusBadge";
import { requireStaffContext } from "@/lib/auth";
import { STATUS_LABEL, activitiesForSports } from "@/lib/capabilities";
import { DRILLS, type DrillType } from "@/lib/drills";
import { daysAgoIso, fmtDate, fmtDateTime, fmtMinutes } from "@/lib/format";

export const metadata = { title: "Dashboard" };

type Usage = {
  plan_name: string; analysis_seconds_limit: number; analysis_seconds_settled: number; analysis_seconds_reserved: number;
  analysis_warning: boolean; analysis_blocked: boolean; retained_seconds: number; retained_seconds_limit: number;
  players: number; max_players: number; ends_at: string | null; provisional: boolean;
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string; denied?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireStaffContext();
  const org = membership.org_id;
  const since = daysAgoIso(30);

  const [usageRes, sessionsRes, attentionRes, reviewRes, reportsRes, countsRes, workerRes] = await Promise.all([
    supabase.rpc("get_usage_summary", { p_org: org }),
    supabase.from("practice_sessions").select("id, title, session_date, drill_type, teams!practice_sessions_team_id_fkey(name)").eq("org_id", org).order("session_date", { ascending: false }).limit(5),
    supabase.from("videos").select("id, original_filename, status, upload_status, status_detail, rejection_reason, created_at, players(display_name)")
      .eq("org_id", org).or("status.in.(failed,queued,processing),upload_status.in.(rejected,pending_upload,uploaded,probing)")
      .order("updated_at", { ascending: false }).limit(8),
    supabase.from("videos").select("id, original_filename, drill_type, created_at, players(display_name)").eq("org_id", org)
      .eq("status", "ready_for_review").order("updated_at", { ascending: false }).limit(8),
    supabase.from("reports").select("id, status, approved_at, published_at, video_id, players(display_name), snapshot").eq("org_id", org)
      .in("status", ["approved", "published"]).gte("approved_at", since).order("approved_at", { ascending: false }).limit(8),
    supabase.from("videos").select("id", { count: "exact", head: true }).eq("org_id", org),
    supabase.from("processing_jobs").select("id", { count: "exact", head: true }).eq("org_id", org).eq("status", "failed").gte("created_at", since),
  ]);

  if (usageRes.error) throw new Error(usageRes.error.message);
  const u = usageRes.data as unknown as Usage;
  const used = Number(u.analysis_seconds_settled) + Number(u.analysis_seconds_reserved);
  const personal = membership.org_kind === "personal";
  const mySports = personal
    ? (((await supabase.from("players").select("sports").eq("org_id", org).not("self_user_id", "is", null).maybeSingle()).data?.sports as string[] | undefined) ?? [])
    : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Everything below is calculated from ${membership.org_name}'s stored data.`}
        actions={<><ButtonLink href="/app/upload" variant="lime">Upload video</ButtonLink><ButtonLink href="/app/sessions/new" variant="secondary">New session</ButtonLink></>}
      />
      {sp.welcome ? <div className="mb-4"><Notice tone="ok" title="Your program is ready">Add players to your roster, then upload your first recording. The upload guide explains how to film so the review works well.</Notice></div> : null}
      {sp.denied ? <div className="mb-4"><Notice tone="warn">That page is limited to organisation owners.</Notice></div> : null}
      {u.analysis_warning && !u.analysis_blocked ? <div className="mb-4"><Notice tone="warn" title="Analysis allowance at 80% or more">You have used {fmtMinutes(used)} of {fmtMinutes(u.analysis_seconds_limit)} this month.</Notice></div> : null}
      {u.analysis_blocked && u.analysis_seconds_limit > 0 ? <div className="mb-4"><Notice tone="danger" title="Analysis allowance reached">New automated analysis is paused until next month or a plan change. Manual review still works.</Notice></div> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Analysis this month" value={fmtMinutes(used)} detail={u.analysis_seconds_limit > 0 ? `of ${fmtMinutes(u.analysis_seconds_limit)} (${u.plan_name})` : `${u.plan_name}: no automated analysis`} />
        <Stat label="Stored footage" value={fmtMinutes(u.retained_seconds)} detail={`of ${fmtMinutes(u.retained_seconds_limit)} allowance`} />
        <Stat label="Players" value={u.players} detail={`limit ${u.max_players}`} />
        <Stat label="Recordings" value={countsRes.count ?? 0} detail={`${workerRes.count ?? 0} failed jobs in 30 days`} />
      </div>

      {personal ? (
        <Card className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">For your sports</h2>
            <Link href="/app/capabilities" className="text-sm underline">What we analyse</Link>
          </div>
          <ul className="mt-2 grid gap-1 text-sm">
            {activitiesForSports(mySports).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{a.label}</span>
                <Badge tone={a.status === "experimental" ? "ai" : "neutral"}>{STATUS_LABEL[a.status]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Pending reviews</h2>
          <p className="text-xs text-muted">Recordings with suggestions waiting for a coach.</p>
          <ul className="mt-3 divide-y divide-line">
            {(reviewRes.data ?? []).map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/app/videos/${v.id}`} className="font-medium underline-offset-2 hover:underline">
                  {(v.players as unknown as { display_name: string } | null)?.display_name ?? "Unassigned"} · {DRILLS[v.drill_type as DrillType]?.short}
                </Link>
                <span className="text-xs text-muted">{fmtDate(v.created_at)}</span>
              </li>
            ))}
          </ul>
          {!reviewRes.data?.length ? <p className="mt-3 text-sm text-muted">Nothing waiting for review.</p> : null}
        </Card>

        <Card>
          <h2 className="font-semibold">Needs attention</h2>
          <p className="text-xs text-muted">Uploads in progress, running analysis and failures.</p>
          <ul className="mt-3 divide-y divide-line">
            {(attentionRes.data ?? []).map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/app/videos/${v.id}`} className="min-w-0 truncate font-medium hover:underline">
                  {(v.players as unknown as { display_name: string } | null)?.display_name ?? "Unassigned"} · {v.original_filename ?? "recording"}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  <VideoStatusBadge status={v.status} uploadStatus={v.upload_status} personal={membership.org_kind === "personal"} />
                </span>
              </li>
            ))}
          </ul>
          {!attentionRes.data?.length ? <p className="mt-3 text-sm text-muted">No jobs need attention.</p> : null}
        </Card>

        <Card>
          <h2 className="font-semibold">Approved activity (30 days)</h2>
          <ul className="mt-3 divide-y divide-line">
            {(reportsRes.data ?? []).map((r) => (
              <li key={r.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/app/videos/${r.video_id}`} className="font-medium hover:underline">{(r.players as unknown as { display_name: string } | null)?.display_name}</Link>
                  <Badge tone={r.status === "published" ? "ok" : "neutral"}>{r.status === "published" ? "Published" : "Approved, not published"}</Badge>
                </div>
                <p className="text-xs text-muted">{(r.snapshot as { statement?: string })?.statement} · {fmtDateTime(r.published_at ?? r.approved_at)}</p>
              </li>
            ))}
          </ul>
          {!reportsRes.data?.length ? <p className="mt-3 text-sm text-muted">No approved reports yet.</p> : null}
        </Card>

        <Card>
          <h2 className="font-semibold">Recent sessions</h2>
          <ul className="mt-3 divide-y divide-line">
            {(sessionsRes.data ?? []).map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/app/sessions/${s.id}`} className="font-medium hover:underline">{s.title}</Link>
                <span className="text-xs text-muted">{fmtDate(s.session_date)} · {(s.teams as unknown as { name: string })?.name}</span>
              </li>
            ))}
          </ul>
          {!sessionsRes.data?.length ? <EmptyState title="No sessions yet" action={<ButtonLink href="/app/sessions/new" variant="secondary">Create a session</ButtonLink>} /> : null}
        </Card>
      </div>
    </>
  );
}
