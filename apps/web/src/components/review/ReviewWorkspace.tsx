"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { VideoStatusBadge } from "@/components/video/StatusBadge";
import { DRILLS, EVENT_LABEL, OUTCOME_LABEL, type DrillType, type EventType, type Outcome } from "@/lib/drills";
import { fmtBytes, fmtClock, fmtDateTime, fmtSeconds } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/client";
import { VideoPlayer, type PlayerHandle } from "./Player";
import { Timeline } from "./Timeline";

type Item = {
  id: string; origin: "model" | "coach"; origin_event_id: string | null; event_type: EventType; activity_label: string;
  start_s: number; end_s: number; included: boolean; outcome: Outcome | null; outcome_source: string | null; coach_note: string | null; updated_by: string | null;
};
type Obs = { id: string; origin: "model" | "coach"; origin_observation_id: string | null; t_start_s: number; t_end_s: number; text: string; evidence: string | null; included: boolean };
type Run = {
  id: string; generation: number; status: string; provider: string; model: string; prompt_version: string; analysis_version: string; registry_version?: string | null; activity_id?: string | null;
  range_start_s: number; range_end_s: number; extraction_settings: Record<string, unknown>; abstentions: { start_s?: number; end_s?: number; reason: string; detail?: string }[];
  limitations: string[]; input_tokens: number; output_tokens: number; provider_requests: number; processing_ms: number | null; estimated_cost_usd: number | null; created_at: string;
};
type Report = { id: string; version: number; status: string; approved_at: string; published_at: string | null; coach_feedback: string | null; snapshot: { statement: string }; review_kind?: "coach" | "self" };

export type ReviewData = {
  video: {
    id: string; org_id: string; team_id: string; player_id: string | null; session_id: string | null; drill_type: DrillType; pitch_type: string | null;
    intended_target: string | null; source_device_label: string | null; original_filename: string | null; duration_s: number | null; fps: number | null;
    width: number | null; height: number | null; display_width: number | null; display_height: number | null; rotation: number | null; has_audio: boolean | null;
    size_bytes: number | null; status: string; status_detail: string | null; upload_status: string; rejection_reason: string | null; current_generation: number;
    attribution_confirmed_at: string | null; shared_with_athlete: boolean; preview_path: string | null; created_at: string;
  };
  teamName: string; items: Item[]; observations: Obs[]; runs: Run[]; currentRunId: string | null;
  events: { id: string; visibility: string; evidence: string; abstention_reason: string | null; suggested_outcome: string | null; source_windows: number[] }[];
  drafts: { id: string; category: string; evidence: string; limitations: string; review_questions: string[] }[];
  jobs: { id: string; kind: string; status: string; attempts: number; max_attempts: number; last_error: string | null; created_at: string; finished_at: string | null; request_kind: string }[];
  reports: Report[]; players: { id: string; display_name: string }[]; sessions: { id: string; title: string }[];
  analysisAvailable: boolean; maxExcerpt: number; initialTime?: number;
  /** The viewer is the athlete in this recording (personal workspace): approval is a self-review. */
  selfReview?: boolean; personal?: boolean;
};

const ABSTAIN_LABEL: Record<string, string> = {
  occlusion: "Occlusion", blur: "Blur", cropped_body: "Body cropped", missing_ball: "Ball not visible", missing_target: "Target not visible",
  ambiguous_movement: "Ambiguous movement", insufficient_temporal_resolution: "Too fast for sampled frames",
};

export function ReviewWorkspace({ data }: { data: ReviewData }) {
  const { video } = data;
  const router = useRouter();
  const player = useRef<PlayerHandle>(null);
  const [now, setNow] = useState(data.initialTime ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [markStart, setMarkStart] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const drill = DRILLS[video.drill_type];
  const duration = Number(video.duration_s ?? 0);
  const busy = video.status === "queued" || video.status === "processing";
  const ready = video.upload_status === "ready";

  const items = useMemo(() => [...data.items].sort((a, b) => Number(a.start_s) - Number(b.start_s)), [data.items]);
  const eventById = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data.events]);
  const draftById = useMemo(() => new Map(data.drafts.map((d) => [d.id, d])), [data.drafts]);
  const active = items.find((i) => now >= Number(i.start_s) && now <= Number(i.end_s))?.id ?? null;
  const currentRun = data.runs.find((r) => r.id === data.currentRunId) ?? null;
  const approved = data.reports.find((r) => r.status === "approved");
  const published = data.reports.find((r) => r.status === "published");

  // Poll while work is in progress so status changes appear without a manual refresh.
  useEffect(() => {
    if (!(busy || video.upload_status === "uploaded" || video.upload_status === "probing")) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [busy, video.upload_status, router]);

  const call = useCallback(async (fn: string, args: Record<string, unknown>, ok?: string) => {
    setError(null); setNotice(null);
    const { error } = await getBrowserClient().rpc(fn as never, args as never);
    if (error) { setError(error.message); return false; }
    if (ok) setNotice(ok);
    startTransition(() => router.refresh());
    return true;
  }, [router]);

  const seek = (t: number) => player.current?.seek(t);
  const playhead = () => Number((player.current?.time() ?? now).toFixed(3));

  // Keyboard shortcuts for review: J/K jump between events, M marks start/end.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "j" || e.key === "k") {
        const t = playhead();
        const target = e.key === "k" ? items.find((i) => Number(i.start_s) > t + 0.05) : [...items].reverse().find((i) => Number(i.start_s) < t - 0.05);
        if (target) seek(Number(target.start_s));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function saveItem(it: Item, patch: Partial<Item>) {
    const n = { ...it, ...patch };
    return call("review_upsert_item", {
      p_video: video.id, p_item: it.id, p_start_s: Number(n.start_s), p_end_s: Number(n.end_s), p_event_type: n.event_type,
      p_activity_label: n.activity_label, p_included: n.included, p_outcome: n.outcome, p_coach_note: n.coach_note,
    });
  }

  async function addFromMarks() {
    if (markStart === null) { setMarkStart(playhead()); return; }
    const end = playhead();
    const [s, e] = end > markStart ? [markStart, end] : [end, markStart];
    if (e - s < 0.1) { setError("Mark an end point at least 0.1 s after the start."); return; }
    setMarkStart(null);
    await call("review_upsert_item", {
      p_video: video.id, p_item: null, p_start_s: s, p_end_s: e, p_event_type: drill.eventType, p_activity_label: video.drill_type === "gym_test" ? "unknown" : drill.short.toLowerCase(),
      p_included: true, p_outcome: null, p_coach_note: null,
    }, "Event added.");
  }

  if (!ready) {
    return (
      <div className="space-y-4">
        <Header data={data} />
        {video.upload_status === "rejected" ? (
          <Notice tone="danger" title="This file could not be used">{video.rejection_reason ?? "The file failed validation."} Delete it and upload a supported MP4 or MOV.</Notice>
        ) : video.upload_status === "pending_upload" ? (
          <Notice tone="warn" title="Upload not finished">Return to the upload page and choose the same file to resume, or delete this entry.</Notice>
        ) : (
          <Notice title="Checking the file">The server is verifying the video format, duration and orientation. This usually takes a few seconds.</Notice>
        )}
        <DangerZone videoId={video.id} call={call} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Header data={data} />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {notice ? <Notice tone="ok">{notice}</Notice> : null}
      {video.status === "failed" ? <Notice tone="danger" title="Last analysis failed">{video.status_detail ?? "Processing failed."} You can request it again or label events manually. Unused allowance was released.</Notice> : null}
      {busy ? <Notice tone="warn" title={video.status === "queued" ? "Analysis queued" : "Analysis in progress"}>{video.status_detail ?? "Suggestions will appear here when processing finishes. You can leave this page."}</Notice> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="!p-3 sm:!p-4">
            <VideoPlayer ref={player} videoId={video.id} fps={video.fps ? Number(video.fps) : null} onTime={setNow} initialTime={data.initialTime} />
            <div className="mt-4">
              <Timeline
                duration={duration}
                current={now}
                activeId={active}
                range={currentRun ? [Number(currentRun.range_start_s), Number(currentRun.range_end_s)] : null}
                onSeek={seek}
                items={items.map((i) => ({ id: i.id, start_s: Number(i.start_s), end_s: Number(i.end_s), included: i.included, origin: i.origin, label: i.outcome ? OUTCOME_LABEL[i.outcome] : i.activity_label !== "unknown" ? i.activity_label : EVENT_LABEL[i.event_type] }))}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" variant={markStart === null ? "primary" : "lime"} onClick={addFromMarks} disabled={pending || busy}>
                {markStart === null ? "Mark event start at playhead" : `Mark end (start ${fmtClock(markStart)})`}
              </Button>
              {markStart !== null ? <Button type="button" variant="ghost" onClick={() => setMarkStart(null)}>Cancel mark</Button> : null}
              {selected.length === 2 ? (
                <Button type="button" variant="secondary" disabled={pending} onClick={async () => { if (await call("review_merge_items", { p_a: selected[0], p_b: selected[1] }, "Events merged.")) setSelected([]); }}>
                  Merge selected events
                </Button>
              ) : <span className="text-xs text-muted">Tip: select two events to merge them. Keys J/K jump between events.</span>}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Events ({items.filter((i) => i.included).length} included of {items.length})</h2>
              <p className="text-xs text-muted">Click a time to seek. Excluded events are kept for reference but not counted.</p>
            </div>
            {items.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No events yet. {data.analysisAvailable ? "Request analysis on the right, or mark events manually." : "Mark events manually with the button under the video."}</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {items.map((it, idx) => (
                  <EventRow
                    key={it.id + (it.updated_by ?? "") + String(it.start_s) + String(it.end_s)}
                    index={idx + 1}
                    item={it}
                    active={it.id === active}
                    selected={selected.includes(it.id)}
                    onSelect={(on) => setSelected((s) => (on ? [...s.filter((x) => x !== it.id), it.id].slice(-2) : s.filter((x) => x !== it.id)))}
                    drill={video.drill_type}
                    evidence={it.origin_event_id ? eventById.get(it.origin_event_id) : undefined}
                    disabled={pending || busy}
                    seek={seek}
                    playhead={playhead}
                    save={(p) => saveItem(it, p)}
                    remove={() => call("review_delete_item", { p_item: it.id }, "Event deleted.")}
                    split={() => call("review_split_item", { p_item: it.id, p_at_s: playhead() }, "Event split at playhead.")}
                  />
                ))}
              </ol>
            )}
          </Card>

          <ObservationsPanel data={data} draftById={draftById} call={call} seek={seek} playhead={playhead} disabled={pending || busy} />
        </div>

        <div className="space-y-4">
          <PublishPanel data={data} approved={approved} published={published} call={call} disabled={pending || busy} />
          <AnalysisPanel data={data} currentRun={currentRun} call={call} disabled={pending} playhead={playhead} />
          <DetailsPanel data={data} call={call} disabled={pending} />
          <DangerZone videoId={video.id} call={call} />
        </div>
      </div>
    </div>
  );
}

function Header({ data }: { data: ReviewData }) {
  const v = data.video;
  const player = data.players.find((p) => p.id === v.player_id);
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs text-muted"><Link className="underline" href="/app/library">Library</Link> / {data.teamName}</p>
        <h1 className="text-2xl font-bold tracking-tight">{player?.display_name ?? "Unassigned footage"} · {DRILLS[v.drill_type].label}</h1>
        <p className="text-xs text-muted">
          {v.original_filename} · {fmtSeconds(v.duration_s)} · {v.display_width ?? v.width}×{v.display_height ?? v.height}
          {v.fps ? ` · ${Number(v.fps).toFixed(0)} fps` : ""} · {fmtBytes(v.size_bytes)}{v.has_audio === false ? " · no audio" : ""}
          {v.source_device_label ? ` · ${v.source_device_label}` : ""} · uploaded {fmtDateTime(v.created_at)}
        </p>
      </div>
      <VideoStatusBadge status={v.status} uploadStatus={v.upload_status} personal={data.personal} />
    </header>
  );
}

function EventRow({ index, item, active, selected, onSelect, drill, evidence, disabled, seek, playhead, save, remove, split }: {
  index: number; item: Item; active: boolean; selected: boolean; onSelect: (on: boolean) => void; drill: DrillType;
  evidence?: ReviewData["events"][number]; disabled: boolean; seek: (t: number) => void; playhead: () => number;
  save: (p: Partial<Item>) => Promise<boolean>; remove: () => void; split: () => void;
}) {
  const [start, setStart] = useState(String(Number(item.start_s).toFixed(2)));
  const [end, setEnd] = useState(String(Number(item.end_s).toFixed(2)));
  const [label, setLabel] = useState(item.activity_label);
  const [note, setNote] = useState(item.coach_note ?? "");
  const [open, setOpen] = useState(false);
  const outcomes = DRILLS[drill].outcomes;
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [active]);

  return (
    <li ref={ref} className={`rounded-xl border p-3 text-sm ${active ? "border-ink bg-lime/25" : "border-line"} ${item.included ? "" : "opacity-70"}`} aria-current={active ? "true" : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select event ${index} for merge`} />
        <span className="w-6 text-xs font-semibold text-muted">#{index}</span>
        <button type="button" className="font-mono text-xs underline" onClick={() => seek(Number(item.start_s))}>
          {fmtClock(Number(item.start_s))}–{fmtClock(Number(item.end_s))}
        </button>
        <span className="font-medium">{item.activity_label !== "unknown" ? item.activity_label : EVENT_LABEL[item.event_type]}</span>
        {item.origin === "model" ? <Badge tone="ai">{item.updated_by ? "AI suggestion · edited" : "AI suggestion"}</Badge> : <Badge>Coach-added</Badge>}
        {evidence ? <Badge tone={evidence.visibility === "clear" ? "neutral" : "warn"}>Visibility: {evidence.visibility}</Badge> : null}
        {item.outcome_source === "model_suggestion" && item.outcome ? <Badge tone="ai">Suggested outcome</Badge> : null}
        <span className="ml-auto flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={item.included} disabled={disabled} onChange={(e) => save({ included: e.target.checked })} />
            Count
          </label>
          <button type="button" className="text-xs underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Close" : "Edit"}</button>
        </span>
      </div>
      {outcomes.length ? (
        <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={`Outcome for event ${index}`}>
          {outcomes.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={item.outcome === o} disabled={disabled}
              onClick={() => save({ outcome: item.outcome === o ? null : o })}
              className={`rounded-full border px-2.5 py-1 text-xs ${item.outcome === o ? (item.outcome_source === "coach" ? "border-ink bg-ink text-white" : "border-violet-500 bg-violet-100 text-violet-950") : "border-line bg-white hover:border-ink"}`}>
              {OUTCOME_LABEL[o]}
            </button>
          ))}
          {item.outcome && item.outcome_source === "model_suggestion" ? (
            <button type="button" className="rounded-full border border-ink px-2.5 py-1 text-xs" disabled={disabled} onClick={() => save({ outcome: item.outcome })}>Confirm suggestion</button>
          ) : null}
        </div>
      ) : null}
      {evidence ? (
        <p className="mt-2 text-xs text-muted">
          <span className="font-semibold">Model evidence:</span> {evidence.evidence}
          {evidence.abstention_reason ? <> · <span className="text-warn">Abstained on outcome: {ABSTAIN_LABEL[evidence.abstention_reason] ?? evidence.abstention_reason}</span></> : null}
        </p>
      ) : null}
      {open ? (
        <div className="mt-3 grid gap-2 rounded-lg bg-paper p-3 sm:grid-cols-2">
          <label className="text-xs">Start (s)
            <div className="flex gap-1"><input className="field" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
              <Button type="button" variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setStart(playhead().toFixed(2))}>Playhead</Button></div>
          </label>
          <label className="text-xs">End (s)
            <div className="flex gap-1"><input className="field" inputMode="decimal" value={end} onChange={(e) => setEnd(e.target.value)} />
              <Button type="button" variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setEnd(playhead().toFixed(2))}>Playhead</Button></div>
          </label>
          <label className="text-xs">Activity label
            <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} list="activity-labels" />
            <datalist id="activity-labels"><option value="hinge" /><option value="lunge" /><option value="swing" /><option value="pitch" /><option value="unknown" /></datalist>
          </label>
          <label className="text-xs">Type
            <select className="field" value={item.event_type} disabled={disabled} onChange={(e) => save({ event_type: e.target.value as EventType })}>
              {(Object.keys(EVENT_LABEL) as EventType[]).map((t) => <option key={t} value={t}>{EVENT_LABEL[t]}</option>)}
            </select>
          </label>
          <label className="text-xs sm:col-span-2">Coach note
            <input className="field" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" disabled={disabled} onClick={() => save({ start_s: Number(start), end_s: Number(end), activity_label: label, coach_note: note || null })}>Save boundaries</Button>
            <Button type="button" variant="secondary" disabled={disabled} onClick={split}>Split at playhead</Button>
            <Button type="button" variant="danger" disabled={disabled} onClick={remove}>Delete event</Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

type Call = (fn: string, args: Record<string, unknown>, ok?: string) => Promise<boolean>;

function ObservationsPanel({ data, draftById, call, seek, playhead, disabled }: {
  data: ReviewData; draftById: Map<string, ReviewData["drafts"][number]>; call: Call; seek: (t: number) => void; playhead: () => number; disabled: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <Card>
      <h2 className="font-semibold">Technique notes</h2>
      <p className="text-xs text-muted">AI drafts are hidden from reports until you include them. Notes describe visible evidence only; no measured angles or speeds.</p>
      <ul className="mt-3 space-y-2">
        {data.observations.map((o) => {
          const d = o.origin_observation_id ? draftById.get(o.origin_observation_id) : undefined;
          return (
            <ObservationRow key={o.id + o.text + String(o.included)} o={o} draft={d} call={call} seek={seek} videoId={data.video.id} disabled={disabled} />
          );
        })}
      </ul>
      {!data.observations.length ? <p className="mt-2 text-sm text-muted">No notes yet.</p> : null}
      <form className="mt-3 flex gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const t = playhead();
        if (text.trim() && await call("review_upsert_observation", { p_video: data.video.id, p_observation: null, p_t_start_s: t, p_t_end_s: t, p_text: text, p_included: true }, "Note added.")) setText("");
      }}>
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a coach note at the playhead" aria-label="New coach note" maxLength={2000} />
        <Button type="submit" variant="secondary" disabled={disabled || !text.trim()}>Add</Button>
      </form>
    </Card>
  );
}

function ObservationRow({ o, draft, call, seek, videoId, disabled }: { o: Obs; draft?: ReviewData["drafts"][number]; call: Call; seek: (t: number) => void; videoId: string; disabled: boolean }) {
  const [text, setText] = useState(o.text);
  const save = (included: boolean) => call("review_upsert_observation", { p_video: videoId, p_observation: o.id, p_t_start_s: Number(o.t_start_s), p_t_end_s: Number(o.t_end_s), p_text: text, p_included: included });
  return (
    <li className={`rounded-xl border p-3 text-sm ${o.included ? "border-ink" : "border-line"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="font-mono text-xs underline" onClick={() => seek(Number(o.t_start_s))}>{fmtClock(Number(o.t_start_s))}</button>
        {o.origin === "model" ? <Badge tone="ai">AI draft{draft ? ` · ${draft.category}` : ""}</Badge> : <Badge>Coach note</Badge>}
        <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={o.included} disabled={disabled} onChange={(e) => save(e.target.checked)} /> Include in report</label>
      </div>
      <textarea className="field mt-2" rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Note text" maxLength={2000} />
      {draft ? (
        <div className="mt-2 space-y-1 text-xs text-muted">
          <p><span className="font-semibold">Visible evidence:</span> {draft.evidence}</p>
          {draft.limitations ? <p><span className="font-semibold">Limitations:</span> {draft.limitations}</p> : null}
          {draft.review_questions?.length ? <p><span className="font-semibold">Questions for the coach:</span> {draft.review_questions.join(" · ")}</p> : null}
        </div>
      ) : null}
      <div className="mt-2 flex gap-2">
        {text !== o.text ? <Button type="button" variant="secondary" className="!py-1 text-xs" disabled={disabled} onClick={() => save(o.included)}>Save text</Button> : null}
        <Button type="button" variant="ghost" className="!py-1 text-xs" disabled={disabled} onClick={() => call("review_delete_observation", { p_observation: o.id })}>Delete</Button>
      </div>
    </li>
  );
}

function AnalysisPanel({ data, currentRun, call, disabled, playhead }: { data: ReviewData; currentRun: Run | null; call: Call; disabled: boolean; playhead: () => number }) {
  const v = data.video;
  const duration = Number(v.duration_s ?? 0);
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState(String(Math.min(duration, data.maxExcerpt).toFixed(1)));
  const busy = v.status === "queued" || v.status === "processing";
  const len = Number(end) - Number(start);
  const analysable = DRILLS[v.drill_type].analysable;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Automated analysis</h2>
        <Badge tone="ai">Experimental</Badge>
      </div>
      {!analysable ? <p className="mt-2 text-sm text-muted">Choose a supported drill template (gym test, hitting or pitching) to enable analysis.</p> : !data.analysisAvailable ? (
        <p className="mt-2 text-sm text-muted">Automated analysis is unavailable on this server right now (no configured analysis worker). Manual labelling and publishing still work.</p>
      ) : busy ? (
        <div className="mt-2 space-y-2 text-sm">
          <p>{v.status === "queued" ? "Waiting for a worker…" : "Analysing sampled frames…"}</p>
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => call("cancel_analysis", { p_video: v.id }, "Analysis cancelled; reserved allowance released.")}>Cancel analysis</Button>
        </div>
      ) : (
        <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); void call("request_analysis", { p_video: v.id, p_start_s: Number(start), p_end_s: Number(end) }, "Analysis requested."); }}>
          <p className="text-xs text-muted">Choose an excerpt of up to {data.maxExcerpt} s. The whole recording stays watchable. {currentRun ? "Re-running creates a new draft and uses allowance again; the published report is kept until you publish a new one." : ""}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Start (s)<div className="flex gap-1"><input className="field" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} /><button type="button" className="text-xs underline" onClick={() => setStart(playhead().toFixed(1))}>now</button></div></label>
            <label className="text-xs">End (s)<div className="flex gap-1"><input className="field" inputMode="decimal" value={end} onChange={(e) => setEnd(e.target.value)} /><button type="button" className="text-xs underline" onClick={() => setEnd(playhead().toFixed(1))}>now</button></div></label>
          </div>
          {len > data.maxExcerpt ? <p className="text-xs text-danger">Excerpt is {len.toFixed(1)} s; the limit is {data.maxExcerpt} s.</p> : null}
          <Button type="submit" disabled={disabled || !(len > 0 && len <= data.maxExcerpt)}>{currentRun ? "Re-analyse excerpt" : "Analyse excerpt"} ({Math.max(0, len).toFixed(1)} s)</Button>
        </form>
      )}
      {currentRun ? (
        <div className="mt-4 space-y-2 border-t border-line pt-3 text-xs">
          <p className="font-semibold">Current draft provenance</p>
          {currentRun.provider === "mock-test" ? (
            <Notice tone="warn" title="Test-mode placeholder">This draft came from the worker&apos;s mock test adapter. It did not look at the video and is not a model result.</Notice>
          ) : null}
          {currentRun.provider === "claude-session-review" ? (
            <Notice tone="warn" title="Demo: analysed by Claude in the build session">Claude marked these events by viewing sampled frames of this clip in a build session, and the worker replayed them through the normal pipeline. It is not a live API run, and no provider cost applies.</Notice>
          ) : null}
          <p className="text-muted">Excerpt {fmtClock(Number(currentRun.range_start_s))}–{fmtClock(Number(currentRun.range_end_s))} · {currentRun.provider} / {currentRun.model} · prompt {currentRun.prompt_version} · capability registry {currentRun.registry_version ? `${currentRun.registry_version} (${currentRun.activity_id ?? "unmapped"})` : "pre-registry"} · {String((currentRun.extraction_settings as { fps?: number }).fps ?? "?")} sampled fps · {currentRun.provider_requests} requests · {currentRun.input_tokens.toLocaleString()} in / {currentRun.output_tokens.toLocaleString()} out tokens{currentRun.estimated_cost_usd !== null ? ` · est. provider cost $${Number(currentRun.estimated_cost_usd).toFixed(3)}` : ""}</p>
          {currentRun.limitations?.length ? <div><p className="font-semibold">Limitations</p><ul className="list-disc pl-4 text-muted">{currentRun.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></div> : null}
          {currentRun.abstentions?.length ? (
            <div><p className="font-semibold">Abstentions</p><ul className="list-disc pl-4 text-muted">{currentRun.abstentions.map((a, i) => <li key={i}>{ABSTAIN_LABEL[a.reason] ?? a.reason}{a.start_s !== undefined ? ` (${fmtClock(Number(a.start_s))}–${fmtClock(Number(a.end_s ?? a.start_s))})` : ""}{a.detail ? `: ${a.detail}` : ""}</li>)}</ul></div>
          ) : null}
        </div>
      ) : null}
      {data.jobs.length ? (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted">Job history</summary>
          <ul className="mt-1 space-y-1">
            {data.jobs.map((j) => <li key={j.id}>{j.kind} ({j.request_kind}) · {j.status} · attempt {j.attempts}/{j.max_attempts} · {fmtDateTime(j.created_at)}{j.last_error && j.status !== "succeeded" ? ` · ${j.last_error}` : ""}</li>)}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function DetailsPanel({ data, call, disabled }: { data: ReviewData; call: Call; disabled: boolean }) {
  const v = data.video;
  const [playerId, setPlayerId] = useState(v.player_id ?? "");
  const [sessionId, setSessionId] = useState(v.session_id ?? "");
  const [drill, setDrill] = useState<DrillType>(v.drill_type);
  const [pitch, setPitch] = useState(v.pitch_type ?? "");
  const [target, setTarget] = useState(v.intended_target ?? "");
  const [device, setDevice] = useState(v.source_device_label ?? "");
  const [shared, setShared] = useState(v.shared_with_athlete);
  const player = data.players.find((p) => p.id === v.player_id);
  return (
    <Card>
      <h2 className="font-semibold">Recording details</h2>
      <form className="mt-3 space-y-3 text-sm" onSubmit={(e) => {
        e.preventDefault();
        void call("update_video_details", { p_video: v.id, p_player: playerId || null, p_session: sessionId || null, p_drill_type: drill, p_pitch_type: pitch, p_intended_target: target, p_device_label: device, p_shared_with_athlete: shared }, "Details saved.");
      }}>
        <label className="block text-xs">Player
          <select className="field" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            <option value="">Unassigned</option>
            {data.players.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
        </label>
        {playerId !== (v.player_id ?? "") ? <p className="text-xs text-warn">Changing the player clears attribution confirmation and retracts any report for this recording.</p> : null}
        <label className="block text-xs">Session
          <select className="field" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            <option value="">No session</option>
            {data.sessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </label>
        <label className="block text-xs">Drill template
          <select className="field" value={drill} onChange={(e) => setDrill(e.target.value as DrillType)}>
            {(Object.keys(DRILLS) as DrillType[]).map((d) => <option key={d} value={d}>{DRILLS[d].label}</option>)}
          </select>
        </label>
        {drill === "softball_pitching" ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Pitch type<input className="field" value={pitch} onChange={(e) => setPitch(e.target.value)} maxLength={60} /></label>
            <label className="text-xs">Intended target<input className="field" value={target} onChange={(e) => setTarget(e.target.value)} maxLength={200} /></label>
          </div>
        ) : null}
        {drill === "general_movement" ? (
          <label className="block text-xs">Movement and what counts as one rep<input className="field" value={target} onChange={(e) => setTarget(e.target.value)} maxLength={200} /></label>
        ) : null}
        <label className="block text-xs">Source device label<input className="field" value={device} onChange={(e) => setDevice(e.target.value)} maxLength={80} /></label>
        <label className="flex items-start gap-2 text-xs">
          <input type="checkbox" className="mt-0.5" checked={shared} onChange={(e) => setShared(e.target.checked)} disabled={!v.player_id || !v.attribution_confirmed_at} />
          <span>Share this full recording with the athlete{!v.attribution_confirmed_at ? " (confirm attribution first)" : ""}. Published report clips are visible to the athlete either way.</span>
        </label>
        <Button type="submit" variant="secondary" disabled={disabled}>Save details</Button>
      </form>
      <div className="mt-4 border-t border-line pt-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Attribution</p>
        {v.player_id ? (
          v.attribution_confirmed_at ? <p className="mt-1">Confirmed: this recording shows {player?.display_name}. <span className="text-xs text-muted">({fmtDateTime(v.attribution_confirmed_at)})</span></p> : (
            <div className="mt-1 space-y-2">
              <p>Players are never identified automatically. Confirm that this recording shows <strong>{player?.display_name}</strong> before publishing.</p>
              <Button type="button" variant="secondary" disabled={disabled} onClick={() => call("confirm_attribution", { p_video: v.id }, "Attribution confirmed.")}>Confirm it shows {player?.display_name}</Button>
            </div>
          )
        ) : <p className="mt-1 text-muted">Assign a player to publish a report.</p>}
      </div>
    </Card>
  );
}

function KindBadge({ kind }: { kind?: "coach" | "self" }) {
  if (!kind) return null;
  return kind === "self" ? <Badge tone="warn">Self-reviewed · not coach-approved</Badge> : <Badge tone="dark">Coach-approved</Badge>;
}

function PublishPanel({ data, approved, published, call, disabled }: { data: ReviewData; approved?: Report; published?: Report; call: Call; disabled: boolean }) {
  const v = data.video;
  const self = Boolean(data.selfReview);
  const [feedback, setFeedback] = useState(approved?.coach_feedback ?? published?.coach_feedback ?? "");
  const included = data.items.filter((i) => i.included);
  const unconfirmed = included.filter((i) => i.outcome_source === "model_suggestion").length;
  return (
    <Card className="border-ink">
      <h2 className="font-semibold">{self ? "Save your self-review" : "Approve and publish"}</h2>
      <p className="mt-1 text-xs text-muted">{self
        ? "Saving freezes a snapshot of the events you reviewed into your training history. It is labelled self-reviewed: it is not a coach's approval."
        : "Approval freezes a snapshot of the current coach-reviewed events. Publishing makes that snapshot visible to the linked athlete."}</p>
      {self ? <div className="mt-2"><Notice tone="warn" title="Self-review">Reports you approve yourself show as “Self-reviewed”. Invite a coach from Coach access if you want coach-approved feedback.</Notice></div> : null}
      {published ? <p className="mt-2 text-sm"><Badge tone="ok">{self ? "Saved" : "Published"} v{published.version}</Badge> <KindBadge kind={published.review_kind} /> <span className="text-xs text-muted">{published.snapshot.statement}</span></p> : null}
      {approved ? <p className="mt-2 text-sm"><Badge>Approved v{approved.version}, not yet {self ? "saved" : "published"}</Badge> <KindBadge kind={approved.review_kind} /> <span className="text-xs text-muted">{approved.snapshot.statement}</span></p> : null}
      {unconfirmed > 0 && DRILLS[v.drill_type].outcomes.length ? <p className="mt-2 text-xs text-warn">{unconfirmed} included event{unconfirmed === 1 ? " has an" : "s have"} AI-suggested outcome{unconfirmed === 1 ? "" : "s"} you have not confirmed. Approving counts them as you see them now.</p> : null}
      <label className="mt-3 block text-xs">{self ? "Your notes on this session" : data.personal ? "Coach feedback for the athlete" : "Coach feedback for the athlete"}
        <textarea className="field" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={8000} />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={disabled || !v.player_id} onClick={() => call("approve_review", { p_video: v.id, p_feedback: feedback }, self ? "Self-review approved. Save it when ready." : "Approved. Publish when ready.")}>
          {approved || published ? "Approve current draft as new version" : self ? "Approve as self-review" : "Approve"}
        </Button>
        {approved ? (
          <Button type="button" variant="lime" disabled={disabled || !v.attribution_confirmed_at} onClick={() => call("publish_report", { p_video: v.id }, self ? "Saved to your training history." : "Published to the athlete.")}>{self ? "Save" : "Publish"} v{approved.version}</Button>
        ) : null}
        {approved || published ? <Button type="button" variant="ghost" disabled={disabled} onClick={() => call("retract_report", { p_video: v.id }, "Report retracted.")}>Retract</Button> : null}
      </div>
      {!v.player_id ? <p className="mt-2 text-xs text-muted">Assign a player first.</p> : !v.attribution_confirmed_at && approved ? <p className="mt-2 text-xs text-muted">Confirm attribution (below) to enable publishing.</p> : null}
      {v.player_id ? <p className="mt-3 text-xs"><Link className="underline" href={`/app/roster/${v.player_id}/report`}>View player report</Link> · <Link className="underline" href={`/app/compare?player=${v.player_id}&a=${v.id}`}>Compare with another recording</Link></p> : null}
    </Card>
  );
}

function DangerZone({ videoId, call }: { videoId: string; call: Call }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  return (
    <Card>
      <h2 className="font-semibold">Delete recording</h2>
      <p className="mt-1 text-xs text-muted">Stops any processing, retracts reports and permanently removes the original and derived files. This cannot be undone.</p>
      {armed ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="danger" onClick={async () => { if (await call("delete_video", { p_video: videoId })) router.push("/app/library"); }}>Delete permanently</Button>
          <Button type="button" variant="ghost" onClick={() => setArmed(false)}>Cancel</Button>
        </div>
      ) : <Button type="button" variant="secondary" className="mt-3" onClick={() => setArmed(true)}>Delete…</Button>}
    </Card>
  );
}
