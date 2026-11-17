import { notFound } from "next/navigation";
import { Card, PageHeader, Stat } from "@/components/ui";
import { requireStaffContext } from "@/lib/auth";
import { fmtDateTime, secondsSince } from "@/lib/format";

export const metadata = { title: "Operations" };

type Ops = {
  generated_at: string; queue: Record<string, number> | null; stuck_jobs: number; organizations: number;
  failed_jobs: { job_id: string; org: string; kind: string; attempts: number; error: string | null; finished_at: string }[];
  workers: { worker_id: string; version: string; capabilities: Record<string, unknown>; last_seen_at: string }[];
  usage_month: { provider_requests: number; input_tokens: number; output_tokens: number; estimated_provider_cost_usd: number; billable_analysis_seconds: number };
  runs_month: { count: number; avg_processing_ms: number | null; estimated_cost_usd: number };
};

export default async function OpsPage() {
  const { supabase } = await requireStaffContext();
  const { data, error } = await supabase.rpc("ops_overview");
  if (error) notFound();
  const o = data as unknown as Ops;
  return (
    <>
      <PageHeader title="Operations" subtitle="Platform operator view. Metadata only: no recordings, filenames or player names are shown here." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Analysis runs (month)" value={o.runs_month.count} detail={o.runs_month.avg_processing_ms ? `avg ${(o.runs_month.avg_processing_ms / 1000).toFixed(1)} s` : "—"} />
        <Stat label="Provider requests (month)" value={o.usage_month.provider_requests} detail={`${Number(o.usage_month.input_tokens).toLocaleString()} in / ${Number(o.usage_month.output_tokens).toLocaleString()} out tokens`} />
        <Stat label="Estimated provider cost" value={"$" + Number(o.usage_month.estimated_provider_cost_usd).toFixed(2)} detail="Estimate from configured token rates; excludes hosting" />
        <Stat label="Billable analysis" value={`${(Number(o.usage_month.billable_analysis_seconds) / 60).toFixed(1)} min`} detail={`${o.organizations} organisations`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Workers</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {o.workers.map((w) => {
              const age = secondsSince(w.last_seen_at);
              return (
                <li key={w.worker_id}>
                  {w.worker_id} · v{w.version} · {age < 120 ? "healthy" : `last seen ${fmtDateTime(w.last_seen_at)}`} · analysis {String(w.capabilities.analysis)}
                  {w.capabilities.model ? ` (${String(w.capabilities.model)})` : ""}
                </li>
              );
            })}
            {!o.workers.length ? <li className="text-muted">No worker has reported in.</li> : null}
          </ul>
          <h3 className="mt-4 text-sm font-semibold">Queue (30 days)</h3>
          <ul className="mt-1 grid grid-cols-2 gap-1 text-xs">{Object.entries(o.queue ?? {}).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>
          <p className="mt-2 text-xs">Expired leases awaiting reclaim: {o.stuck_jobs}</p>
        </Card>
        <Card>
          <h2 className="font-semibold">Failed jobs (14 days)</h2>
          <ul className="mt-2 divide-y divide-line text-xs">
            {o.failed_jobs.map((f) => (
              <li key={f.job_id} className="py-1.5">
                <span className="font-medium">{f.kind}</span> · {f.org} · {f.attempts} attempts · {fmtDateTime(f.finished_at)}
                <span className="block text-muted">{f.error}</span>
              </li>
            ))}
            {!o.failed_jobs.length ? <li className="text-muted">None.</li> : null}
          </ul>
        </Card>
      </div>
    </>
  );
}
