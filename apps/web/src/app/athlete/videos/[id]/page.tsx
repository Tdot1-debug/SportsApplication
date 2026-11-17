import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoPlayer } from "@/components/review/Player";
import { Badge, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { DRILLS, OUTCOME_LABEL, type DrillType, type Outcome } from "@/lib/drills";
import { fmtClock } from "@/lib/format";
import type { ReportSnapshot } from "@/lib/report";

export const metadata = { title: "Recording" };

export default async function AthleteVideo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireUser(`/athlete/videos/${id}`);
  // RLS returns the row only if this athlete is linked to the player AND the video is shared or has a published report.
  const { data: video } = await supabase.from("videos").select("id, drill_type, fps, created_at").eq("id", id).maybeSingle();
  if (!video) notFound();
  const { data: report } = await supabase.from("reports").select("snapshot, coach_feedback, version").eq("video_id", id).eq("status", "published").maybeSingle();
  const snap = report?.snapshot as unknown as ReportSnapshot | undefined;
  return (
    <>
      <p className="mb-2 text-sm"><Link className="underline" href="/athlete">Back to my reports</Link></p>
      <PageHeader title={DRILLS[video.drill_type as DrillType]?.label ?? "Recording"} subtitle={snap?.statement} />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="!p-3"><VideoPlayer key={sp.t ?? "start"} videoId={video.id} fps={video.fps ? Number(video.fps) : null} initialTime={sp.t ? Number(sp.t) : undefined} /></Card>
        {snap ? (
          <Card>
            <h2 className="font-semibold">Coach-confirmed events</h2>
            <p className="text-xs text-muted">{snap.sample.description}</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {snap.items.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                  <Link className="font-mono text-xs underline" href={`?t=${it.start_s}`}>{fmtClock(it.start_s)}</Link>
                  <span className="flex-1">{it.activity_label !== "unknown" ? it.activity_label : it.event_type}</span>
                  {it.outcome ? <Badge>{OUTCOME_LABEL[it.outcome as Outcome]}</Badge> : null}
                </li>
              ))}
            </ul>
            {report?.coach_feedback ? <p className="mt-3 whitespace-pre-wrap border-l-4 border-lime pl-3 text-sm">{report.coach_feedback}</p> : null}
          </Card>
        ) : <Card><p className="text-sm text-muted">Your coach shared this recording without a published report.</p></Card>}
      </div>
    </>
  );
}
