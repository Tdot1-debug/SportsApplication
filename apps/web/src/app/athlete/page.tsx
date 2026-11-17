import Link from "next/link";
import { PlayerReport, type ReportRow } from "@/components/report/PlayerReport";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { listMemberships } from "@/lib/auth";
import { DRILLS, type DrillType } from "@/lib/drills";
import { fmtDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My reports" };

export default async function AthleteHome() {
  const { user, memberships } = await listMemberships();
  const supabase = await createClient();
  const { data: links } = await supabase.from("athlete_links").select("player_id, players(id, display_name, org_id)").eq("user_id", user.id).is("revoked_at", null);
  const staffOrgs = memberships.filter((m) => m.role !== "athlete");
  const players = (links ?? []).map((l) => l.players as unknown as { id: string; display_name: string; org_id: string }).filter(Boolean);

  if (!players.length) {
    return (
      <>
        <PageHeader title="My reports" />
        <EmptyState title="No linked player profile">
          Ask your coach for an invitation link. {staffOrgs.length ? <Link className="underline" href="/app/dashboard">Go to your coaching workspace</Link> : null}
        </EmptyState>
      </>
    );
  }

  const sections = await Promise.all(players.map(async (p) => {
    const [reports, shared] = await Promise.all([
      supabase.from("reports").select("id, video_id, status, version, coach_feedback, approved_at, published_at, snapshot, review_kind").eq("player_id", p.id).eq("status", "published").order("published_at", { ascending: false }),
      supabase.from("videos").select("id, drill_type, created_at").eq("player_id", p.id).eq("shared_with_athlete", true).order("created_at", { ascending: false }),
    ]);
    return { p, reports: (reports.data ?? []) as unknown as ReportRow[], shared: shared.data ?? [] };
  }));

  return (
    <>
      <PageHeader title="My reports" subtitle="Only coach-approved, published results appear here." />
      {staffOrgs.length ? <p className="mb-4 text-sm"><Link className="underline" href="/app/dashboard">Switch to coaching workspace</Link></p> : null}
      <div className="space-y-10">
        {sections.map(({ p, reports, shared }) => (
          <section key={p.id} aria-label={p.display_name} className="space-y-4">
            <PlayerReport playerName={p.display_name} reports={reports} audience="athlete" clipHref={(v, t) => `/athlete/videos/${v}${t !== undefined ? `?t=${t}` : ""}`} />
            {shared.length ? (
              <Card>
                <h2 className="font-semibold">Recordings shared with you</h2>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {shared.map((v) => <li key={v.id} className="py-2"><Link className="underline" href={`/athlete/videos/${v.id}`}>{DRILLS[v.drill_type as DrillType]?.label} · {fmtDate(v.created_at)}</Link></li>)}
                </ul>
              </Card>
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}
