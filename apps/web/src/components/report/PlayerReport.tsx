import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { DRILLS, OUTCOME_LABEL, type DrillType, type Outcome } from "@/lib/drills";
import { fmtClock, fmtDate } from "@/lib/format";
import { aggregateSnapshots, gymStatement, hittingStatement, pitchingStatement, plural, type ReportSnapshot } from "@/lib/report";

export type ReportRow = {
  id: string; video_id: string; status: string; version: number; coach_feedback: string | null;
  approved_at: string; published_at: string | null; snapshot: ReportSnapshot; review_kind?: "coach" | "self";
};

export function PlayerReport({ playerName, reports, clipHref, audience }: {
  playerName: string; reports: ReportRow[]; clipHref: (videoId: string, t?: number) => string; audience: "staff" | "athlete";
}) {
  if (!reports.length) {
    return (
      <EmptyState title="No published results yet">
        {audience === "athlete" ? "Your coach has not published any reports yet." : "Approve and publish a reviewed recording to build this report."}
      </EmptyState>
    );
  }
  const agg = aggregateSnapshots(reports.map((r) => r.snapshot));
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">{playerName}: {reports.every((r) => r.review_kind === "self") ? "self-reviewed totals" : reports.some((r) => r.review_kind === "self") ? "reviewed totals (coach-approved and self-reviewed)" : "coach-confirmed totals"}</h2>
        <p className="mt-1 text-sm text-muted">
          Sample: {reports.length} {audience === "staff" ? "approved or published" : "published"} recording{reports.length === 1 ? "" : "s"}.
          Totals count only events kept in the final review{reports.some((r) => r.review_kind === "self") ? "; self-reviewed sessions are labelled and are not coach-approved" : " by a coach"}. They describe these practice recordings, not game performance.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {agg.hitting.recordings > 0 ? (
            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Hitting ({plural(agg.hitting.recordings, "recording")})</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{agg.hitting.contacts} / {agg.hitting.assessable}</p>
              <p className="text-sm">{hittingStatement(agg.hitting)}</p>
              <p className="mt-1 text-xs text-muted">{agg.hitting.fair_contact} fair · {agg.hitting.foul} foul · {agg.hitting.swing_miss} miss · {agg.hitting.unclear} unclear</p>
            </div>
          ) : null}
          {agg.pitching.recordings > 0 ? (
            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Pitching ({plural(agg.pitching.recordings, "recording")})</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{agg.pitching.target_hit} / {agg.pitching.assessable}</p>
              <p className="text-sm">{pitchingStatement(agg.pitching)}</p>
            </div>
          ) : null}
          {agg.gym.recordings > 0 ? (
            <div className="rounded-xl border border-line p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Gym and movement ({plural(agg.gym.recordings, "recording")})</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{plural(agg.gym.reps_total, "rep")}</p>
              <p className="text-sm">{gymStatement(agg.gym, reports.every((r) => r.review_kind === "self") ? "self" : reports.some((r) => r.review_kind === "self") ? "mixed" : "coach")}</p>
            </div>
          ) : null}
        </div>
      </Card>

      <section aria-label="Session history" className="space-y-4">
        <h2 className="text-lg font-semibold">Session history</h2>
        {reports.map((r) => {
          const s = r.snapshot;
          const drill = DRILLS[s.video.drill_type as DrillType];
          return (
            <Card key={r.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{s.session?.title ?? drill?.label ?? "Recording"}</p>
                  <p className="text-xs text-muted">
                    {s.session?.date ? fmtDate(s.session.date) : fmtDate(s.video.uploaded_at)} · {drill?.label}
                    {s.video.pitch_type ? ` · ${s.video.pitch_type}` : ""}{s.video.intended_target ? ` · ${s.video.drill_type === "general_movement" ? "movement" : "target"}: ${s.video.intended_target}` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  {audience === "staff" ? <Badge tone={r.status === "published" ? "ok" : "neutral"}>{r.status === "published" ? "Published" : "Approved only"}</Badge> : null}
                  {r.review_kind === "self" ? <Badge tone="warn">Self-reviewed · not coach-approved</Badge> : <Badge tone="dark">Coach-approved</Badge>}
                  <Badge>v{r.version}</Badge>
                </div>
              </div>
              <p className="mt-3 font-medium">{s.statement}</p>
              <p className="mt-1 text-xs text-muted">{s.sample.description}</p>
              {r.coach_feedback ? (
                <blockquote className="mt-3 border-l-4 border-lime bg-paper px-3 py-2 text-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{r.review_kind === "self" ? "Your notes" : "Coach feedback"}</p>
                  <p className="whitespace-pre-wrap">{r.coach_feedback}</p>
                </blockquote>
              ) : null}
              {s.observations.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{r.review_kind === "self" ? "Self-reviewed technique notes" : "Coach-approved technique notes"}</p>
                  <ul className="mt-1 space-y-1 text-sm">
                    {s.observations.map((o, i) => (
                      <li key={i}>
                        <Link className="font-mono text-xs underline" href={clipHref(s.video.id, o.t_start_s)}>{fmtClock(o.t_start_s)}</Link> {o.text}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-muted">Events ({s.items.length}) and clips</summary>
                <ul className="mt-2 divide-y divide-line">
                  {s.items.map((it, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <Link className="font-mono text-xs underline" href={clipHref(s.video.id, it.start_s)}>
                        {fmtClock(it.start_s)}–{fmtClock(it.end_s)}
                      </Link>
                      <span className="flex-1">{it.activity_label !== "unknown" ? it.activity_label : it.event_type}</span>
                      {it.outcome ? <Badge tone={it.outcome === "unclear" ? "warn" : "neutral"}>{OUTCOME_LABEL[it.outcome as Outcome]}</Badge> : null}
                      <Badge tone={it.origin === "model" && !it.coach_modified ? "ai" : "neutral"}>
                        {it.origin === "coach" ? "Coach added" : it.coach_modified ? "AI suggestion, coach edited" : "AI suggestion, coach kept"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </details>
              {s.provenance.run_id ? (
                <p className="mt-3 text-xs text-muted">
                  Automated draft: {plural(s.provenance.ai_suggested_items, "suggested event")} ({s.provenance.coach_modified_items} edited by the coach), {s.provenance.coach_added_items} added by the coach. {r.review_kind === "self" ? "Final counts were self-reviewed, not confirmed by a coach." : "Final counts are coach-confirmed."}
                </p>
              ) : <p className="mt-3 text-xs text-muted">Labelled manually by the coach; no automated analysis was used.</p>}
            </Card>
          );
        })}
      </section>
    </div>
  );
}
