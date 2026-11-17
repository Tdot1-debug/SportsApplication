import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { PlayerReport, type ReportRow } from "@/components/report/PlayerReport";
import { requireStaffContext } from "@/lib/auth";

export const metadata = { title: "Player report" };

export default async function StaffPlayerReport({ params, searchParams }: { params: Promise<{ playerId: string }>; searchParams: Promise<{ include?: string }> }) {
  const { playerId } = await params;
  const sp = await searchParams;
  const { supabase } = await requireStaffContext();
  const { data: player } = await supabase.from("players").select("id, display_name").eq("id", playerId).maybeSingle();
  if (!player) notFound();
  const statuses = sp.include === "approved" ? ["approved", "published"] : ["published"];
  const { data: reports, error } = await supabase.from("reports")
    .select("id, video_id, status, version, coach_feedback, approved_at, published_at, snapshot, review_kind")
    .eq("player_id", playerId).in("status", statuses).order("approved_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (
    <>
      <PageHeader
        title={`Report: ${player.display_name}`}
        subtitle={sp.include === "approved" ? "Showing published and approved-but-unpublished results (staff only)." : "Showing exactly what the athlete can see: published results only."}
        actions={<Link className="text-sm underline" href={sp.include === "approved" ? "?" : "?include=approved"}>{sp.include === "approved" ? "Show athlete view" : "Include unpublished approvals"}</Link>}
      />
      <PlayerReport playerName={player.display_name} reports={(reports ?? []) as unknown as ReportRow[]} audience="staff"
        clipHref={(v, t) => `/app/videos/${v}${t !== undefined ? `?t=${t}` : ""}`} />
    </>
  );
}
