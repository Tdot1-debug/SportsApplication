import { ActionForm } from "@/components/FormStateForm";
import { ComparePlayers } from "@/components/review/ComparePlayers";
import { Card, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireStaffContext } from "@/lib/auth";
import { DRILLS, type DrillType } from "@/lib/drills";
import { fmtDate } from "@/lib/format";
import { saveComparison } from "./actions";

export const metadata = { title: "Compare" };

export default async function Compare({ searchParams }: { searchParams: Promise<{ player?: string; a?: string; b?: string }> }) {
  const sp = await searchParams;
  const { supabase, membership } = await requireStaffContext();
  const { data: players } = await supabase.from("players").select("id, display_name").eq("org_id", membership.org_id).is("archived_at", null).order("display_name");
  const { data: videos } = sp.player
    ? await supabase.from("videos").select("id, drill_type, created_at, fps, source_device_label, duration_s, practice_sessions(title, session_date)")
        .eq("player_id", sp.player).eq("upload_status", "ready").order("created_at", { ascending: false })
    : { data: [] as never[] };
  const label = (v: NonNullable<typeof videos>[number]) => {
    const s = v.practice_sessions as unknown as { title: string; session_date: string } | null;
    return `${DRILLS[v.drill_type as DrillType]?.short} · ${s ? `${s.title} (${fmtDate(s.session_date)})` : fmtDate(v.created_at)}${v.source_device_label ? ` · ${v.source_device_label}` : ""}`;
  };
  const va = videos?.find((v) => v.id === sp.a);
  const vb = videos?.find((v) => v.id === sp.b);
  const pair = va && vb ? (va.id < vb.id ? [va.id, vb.id] : [vb.id, va.id]) : null;
  const { data: comp } = pair ? await supabase.from("comparisons").select("notes").eq("video_a", pair[0]).eq("video_b", pair[1]).maybeSingle() : { data: null };

  return (
    <>
      <PageHeader title="Side-by-side comparison" subtitle="Two recordings of the same player, each with its own playback controls." />
      <form className="mb-4 grid gap-2 rounded-2xl border border-line bg-white p-4 sm:grid-cols-4" aria-label="Choose recordings">
        <select className="field" name="player" defaultValue={sp.player ?? ""} aria-label="Player">
          <option value="">Choose player…</option>
          {players?.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <select className="field" name="a" defaultValue={sp.a ?? ""} aria-label="Recording A" disabled={!sp.player}>
          <option value="">Recording A…</option>
          {videos?.map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
        </select>
        <select className="field" name="b" defaultValue={sp.b ?? ""} aria-label="Recording B" disabled={!sp.player}>
          <option value="">Recording B…</option>
          {videos?.filter((v) => !va || v.drill_type === va.drill_type).map((v) => <option key={v.id} value={v.id}>{label(v)}</option>)}
        </select>
        <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white" type="submit">{sp.player ? "Compare" : "Load recordings"}</button>
      </form>
      <div className="mb-4">
        <Notice tone="info">
          Comparisons are for coach viewing only. Recordings may differ in camera angle, distance, head movement and lighting; nothing here is a measured biomechanical comparison.
        </Notice>
      </div>
      {va && vb ? (
        <>
          {va.drill_type !== vb.drill_type ? <div className="mb-4"><Notice tone="warn">These recordings use different drill templates, so their context does not match.</Notice></div> : null}
          {va.id === vb.id ? <div className="mb-4"><Notice tone="warn">Choose two different recordings.</Notice></div> : (
            <>
              <ComparePlayers a={{ id: va.id, fps: va.fps, label: label(va) }} b={{ id: vb.id, fps: vb.fps, label: label(vb) }} />
              <Card className="mt-4">
                <h2 className="mb-2 font-semibold">Shared coach notes</h2>
                <ActionForm action={saveComparison} submitLabel="Save notes">
                  <input type="hidden" name="a" value={va.id} /><input type="hidden" name="b" value={vb.id} />
                  <textarea className="field" name="notes" rows={4} defaultValue={comp?.notes ?? ""} maxLength={8000} aria-label="Comparison notes" />
                </ActionForm>
              </Card>
            </>
          )}
        </>
      ) : sp.player && (videos?.length ?? 0) < 2 ? (
        <EmptyState title="Not enough recordings">This player needs at least two processed recordings to compare.</EmptyState>
      ) : null}
    </>
  );
}
