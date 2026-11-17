import Link from "next/link";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { VideoStatusBadge } from "@/components/video/StatusBadge";
import { requireStaffContext } from "@/lib/auth";
import { DRILLS, VIDEO_STATUS_LABEL, type DrillType } from "@/lib/drills";
import { fmtDate, fmtSeconds } from "@/lib/format";
import { listStaff } from "@/lib/staff";

export const metadata = { title: "Video library" };

type SP = { q?: string; team?: string; player?: string; drill?: string; status?: string; from?: string; to?: string; uploader?: string; page?: string };

export default async function Library({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const { supabase, membership, user } = await requireStaffContext();
  const [teams, players, staff] = await Promise.all([
    supabase.from("teams").select("id, name").eq("org_id", membership.org_id).order("name"),
    supabase.from("players").select("id, display_name").eq("org_id", membership.org_id).order("display_name"),
    listStaff(supabase, membership.org_id, user.id),
  ]);

  let q = supabase.from("videos")
    .select("id, original_filename, drill_type, status, upload_status, duration_s, created_at, source_device_label, uploaded_by, players(display_name), teams!videos_team_id_fkey(name), practice_sessions(title)", { count: "exact" })
    .eq("org_id", membership.org_id);
  if (sp.team) q = q.eq("team_id", sp.team);
  if (sp.player === "unassigned") q = q.is("player_id", null);
  else if (sp.player) q = q.eq("player_id", sp.player);
  if (sp.drill) q = q.eq("drill_type", sp.drill);
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.uploader) q = q.eq("uploaded_by", sp.uploader);
  if (sp.from) q = q.gte("created_at", sp.from);
  if (sp.to) q = q.lte("created_at", sp.to + "T23:59:59");
  if (sp.q) q = q.ilike("original_filename", `%${sp.q.replace(/[%_]/g, "")}%`);
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(page * 25, page * 25 + 24);
  if (error) throw new Error(error.message);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const qs = (patch: Partial<SP>) => "?" + new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader title="Video library" subtitle="Private to your organisation. Playback uses short-lived signed links." actions={<ButtonLink href="/app/upload" variant="lime">Upload</ButtonLink>} />
      <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter recordings">
        <input className="field" name="q" defaultValue={sp.q} placeholder="Search filename" aria-label="Search filename" />
        <select className="field" name="team" defaultValue={sp.team ?? ""} aria-label="Team"><option value="">All teams</option>{teams.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select className="field" name="player" defaultValue={sp.player ?? ""} aria-label="Player"><option value="">All players</option><option value="unassigned">Unassigned</option>{players.data?.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
        <select className="field" name="drill" defaultValue={sp.drill ?? ""} aria-label="Drill"><option value="">All drills</option>{(Object.keys(DRILLS) as DrillType[]).map((d) => <option key={d} value={d}>{DRILLS[d].label}</option>)}</select>
        <select className="field" name="status" defaultValue={sp.status ?? ""} aria-label="Review status"><option value="">Any status</option>{Object.entries(VIDEO_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className="field" name="uploader" defaultValue={sp.uploader ?? ""} aria-label="Uploader"><option value="">Any uploader</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <label className="flex items-center gap-2 text-sm"><span className="shrink-0 text-muted">From</span><input className="field" type="date" name="from" defaultValue={sp.from} /></label>
        <label className="flex items-center gap-2 text-sm"><span className="shrink-0 text-muted">To</span><input className="field" type="date" name="to" defaultValue={sp.to} /></label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white" type="submit">Apply filters</button>
          <Link className="rounded-lg px-4 py-2 text-sm underline" href="/app/library">Reset</Link>
        </div>
      </form>
      {data?.length ? (
        <>
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line bg-paper text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-2">Player</th><th className="px-4 py-2">Drill</th><th className="px-4 py-2">Session</th><th className="px-4 py-2">Length</th><th className="px-4 py-2">Uploaded</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((v) => (
                  <tr key={v.id} className="hover:bg-paper">
                    <td className="px-4 py-2">
                      <Link href={`/app/videos/${v.id}`} className="font-medium underline-offset-2 hover:underline">{(v.players as unknown as { display_name: string } | null)?.display_name ?? "Unassigned"}</Link>
                      <span className="block max-w-56 truncate text-xs text-muted">{v.original_filename}</span>
                    </td>
                    <td className="px-4 py-2">{DRILLS[v.drill_type as DrillType]?.short}<span className="block text-xs text-muted">{(v.teams as unknown as { name: string })?.name}</span></td>
                    <td className="px-4 py-2 text-muted">{(v.practice_sessions as unknown as { title: string } | null)?.title ?? "—"}</td>
                    <td className="px-4 py-2 tabular-nums">{fmtSeconds(v.duration_s)}</td>
                    <td className="px-4 py-2">{fmtDate(v.created_at)}<span className="block text-xs text-muted">{(v.uploaded_by && staffName.get(v.uploaded_by)) || "Former staff"}{v.source_device_label ? ` · ${v.source_device_label}` : ""}</span></td>
                    <td className="px-4 py-2"><VideoStatusBadge status={v.status} uploadStatus={v.upload_status} personal={membership.org_kind === "personal"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Pagination">
            <span className="text-muted">{count} recordings</span>
            <span className="flex gap-3">
              {page > 0 ? <Link className="underline" href={qs({ page: String(page - 1) })}>Previous</Link> : null}
              {(count ?? 0) > (page + 1) * 25 ? <Link className="underline" href={qs({ page: String(page + 1) })}>Next</Link> : null}
            </span>
          </nav>
        </>
      ) : (
        <EmptyState title={Object.keys(sp).length ? "No recordings match these filters" : "No recordings yet"} action={<ButtonLink href="/app/upload">Upload your first video</ButtonLink>} />
      )}
    </>
  );
}
