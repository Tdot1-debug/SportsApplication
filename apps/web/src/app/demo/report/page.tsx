import { PlayerReport, type ReportRow } from "@/components/report/PlayerReport";
import { Notice, PageHeader } from "@/components/ui";
import { DEMO_SNAPSHOT } from "@/lib/demo-data";

export default function DemoReport() {
  const reports: ReportRow[] = [{
    id: "demo-r1", video_id: "demo-v1", status: "published", version: 1, coach_feedback: "Sample feedback: keep the same finish on every swing.",
    approved_at: "2026-11-01T18:00:00Z", published_at: "2026-11-01T18:05:00Z", snapshot: DEMO_SNAPSHOT,
  }];
  return (
    <>
      <PageHeader title="Sample player report" subtitle="What an athlete sees after a coach publishes. All values below are fictional." />
      <div className="mb-4"><Notice tone="warn">Sample data for demonstration only. These numbers were written by hand, not measured.</Notice></div>
      <PlayerReport playerName="Sample Player A" reports={reports} audience="athlete" clipHref={(_v, t) => `/demo/review${t !== undefined ? `?t=${t}` : ""}`} />
    </>
  );
}
