"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import * as tus from "tus-js-client";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { DRILLS, type DrillType } from "@/lib/drills";
import { errorMessage, fmtBytes } from "@/lib/format";
import { publicEnv } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase/client";

type Team = { id: string; name: string };
type Player = { id: string; display_name: string; team_id: string; team_ids?: string[] };
type Session = { id: string; title: string; team_id: string; drill_type: string; intended_target: string | null };

type FileState = {
  key: string; file: File; status: "queued" | "creating" | "uploading" | "finalizing" | "processing" | "ready" | "rejected" | "error";
  progress: number; message?: string; videoId?: string; durationHint?: number;
};

const MAX_BYTES = 500 * 1024 * 1024;
const MAX_SECONDS = 300;
const RESUME_KEY = "smarvii-upload-resume";

function fileKey(f: File) { return `${f.name}:${f.size}:${f.lastModified}`; }
function readResume(): Record<string, { videoId: string; path: string }> {
  try { return JSON.parse(localStorage.getItem(RESUME_KEY) ?? "{}"); } catch { return {}; }
}
function writeResume(map: Record<string, { videoId: string; path: string }>) {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify(map)); } catch { /* storage unavailable */ }
}

function probeDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(v.duration) ? v.duration : undefined); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(undefined); };
    v.src = url;
  });
}

export function Uploader({ teams, players, sessions, defaults, analysisAvailable, defaultDrill = "softball_hitting" }: {
  teams: Team[]; players: Player[]; sessions: Session[];
  defaults: { team?: string; player?: string; session?: string }; analysisAvailable: boolean; defaultDrill?: DrillType;
}) {
  const initialTeam = defaults.team ?? sessions.find((s) => s.id === defaults.session)?.team_id ?? players.find((p) => p.id === defaults.player)?.team_id ?? teams[0]?.id;
  const [team, setTeam] = useState(initialTeam ?? "");
  const [player, setPlayer] = useState(defaults.player ?? "");
  const [unassigned, setUnassigned] = useState(false);
  const [session, setSession] = useState(defaults.session ?? "");
  const sessionRow = sessions.find((s) => s.id === session);
  const [drill, setDrill] = useState<DrillType>((sessionRow?.drill_type as DrillType) ?? defaultDrill);
  const [pitchType, setPitchType] = useState("");
  const [target, setTarget] = useState(sessionRow?.intended_target ?? "");
  const [device, setDevice] = useState("Smarvii glasses 1");
  const [attest, setAttest] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(analysisAvailable);
  const [files, setFiles] = useState<FileState[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploads = useRef<Record<string, tus.Upload>>({});

  const teamPlayers = useMemo(() => players.filter((p) => p.team_id === team || p.team_ids?.includes(team)), [players, team]);
  const teamSessions = useMemo(() => sessions.filter((s) => s.team_id === team), [sessions, team]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (files.some((f) => f.status === "uploading")) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [files]);

  function patch(key: string, p: Partial<FileState>) {
    setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...p } : f)));
  }

  async function onPick(list: FileList | null) {
    if (!list) return;
    const picked: FileState[] = [];
    for (const file of Array.from(list)) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const st: FileState = { key: fileKey(file), file, status: "queued", progress: 0 };
      if (ext !== "mp4" && ext !== "mov") { st.status = "rejected"; st.message = "Only .mp4 and .mov files are accepted."; }
      else if (file.size > MAX_BYTES) { st.status = "rejected"; st.message = `File is ${fmtBytes(file.size)}; the limit is 500 MiB.`; }
      else {
        st.durationHint = await probeDuration(file);
        if (st.durationHint && st.durationHint > MAX_SECONDS + 0.5) { st.status = "rejected"; st.message = `About ${Math.round(st.durationHint)} s long; the limit is 5 minutes. Trim it in your phone's editor first.`; }
      }
      picked.push(st);
    }
    setFiles((fs) => [...fs.filter((f) => !picked.some((p) => p.key === f.key)), ...picked]);
  }

  async function uploadOne(f: FileState) {
    const supabase = getBrowserClient();
    const ext = f.file.name.split(".").pop()!.toLowerCase();
    const resume = readResume();
    let videoId: string | undefined = resume[f.key]?.videoId;
    let path: string | undefined = resume[f.key]?.path;
    if (videoId) {
      const { data } = await supabase.from("videos").select("id, upload_status").eq("id", videoId).maybeSingle();
      if (!data || data.upload_status !== "pending_upload") { videoId = undefined; path = undefined; }
    }
    if (!videoId) {
      patch(f.key, { status: "creating", message: undefined });
      const { data, error } = await supabase.rpc("create_video_upload", {
        p_team: team, p_drill_type: drill, p_filename: f.file.name, p_size_bytes: f.file.size, p_container_ext: ext,
        p_player: unassigned ? undefined : player || undefined, p_session: session || undefined, p_device_label: device,
        p_pitch_type: drill === "softball_pitching" ? pitchType : undefined, p_intended_target: target || undefined,
        p_unassigned: unassigned,
      });
      if (error) throw new Error(error.message);
      const row = (data as { video_id: string; storage_path: string }[])[0];
      videoId = row.video_id; path = row.storage_path;
      writeResume({ ...readResume(), [f.key]: { videoId, path } });
    }
    patch(f.key, { status: "uploading", videoId });

    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again to continue the upload.");

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(f.file, {
        endpoint: `${publicEnv.supabaseUrl}/storage/v1/upload/resumable`,
        retryDelays: [0, 2000, 5000, 10000, 20000],
        headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: { bucketName: "videos", objectName: path!, contentType: ext === "mov" ? "video/quicktime" : "video/mp4", cacheControl: "3600" },
        onError: (err) => reject(err),
        onProgress: (sent, total) => patch(f.key, { progress: total ? sent / total : 0 }),
        onSuccess: () => resolve(),
      });
      uploads.current[f.key] = upload;
      upload.findPreviousUploads().then((prev) => {
        if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
        upload.start();
      });
    });

    patch(f.key, { status: "finalizing", progress: 1 });
    const fin = await supabase.rpc("finalize_video_upload", { p_video: videoId });
    if (fin.error) throw new Error(fin.error.message);
    const map = readResume(); delete map[f.key]; writeResume(map);
    if (attest && !unassigned && player) await supabase.rpc("confirm_attribution", { p_video: videoId });
    patch(f.key, { status: "processing", message: "Checking the file on the server…" });
    void watchProcessing(f.key, videoId!);
  }

  async function watchProcessing(key: string, videoId: string) {
    const supabase = getBrowserClient();
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, i < 10 ? 2000 : 5000));
      const { data } = await supabase.from("videos").select("upload_status, rejection_reason, duration_s").eq("id", videoId).maybeSingle();
      if (!data) return;
      if (data.upload_status === "rejected") return patch(key, { status: "rejected", message: data.rejection_reason ?? "The file could not be processed." });
      if (data.upload_status === "ready") {
        if (autoAnalyze && DRILLS[drill].analysable) {
          const end = Math.min(Number(data.duration_s), 60);
          const { error } = await supabase.rpc("request_analysis", { p_video: videoId, p_start_s: 0, p_end_s: end });
          return patch(key, { status: "ready", message: error ? `Uploaded. Analysis not started: ${error.message}` : `Uploaded. Analysis queued for 0–${end.toFixed(1)} s.` });
        }
        return patch(key, { status: "ready", message: "Uploaded and ready for review." });
      }
    }
    patch(key, { message: "Still processing. You can leave this page; check the library later." });
  }

  async function startAll() {
    setFormError(null);
    if (!team) return setFormError("Choose a team.");
    if (!unassigned && !player) return setFormError("Choose a player, or tick “Unassigned footage”.");
    const queue = files.filter((f) => f.status === "queued" || f.status === "error");
    if (!queue.length) return setFormError("Choose at least one valid video file.");
    setBusy(true);
    for (const f of queue) {
      try { await uploadOne(f); } catch (e) { patch(f.key, { status: "error", message: errorMessage(e) }); }
    }
    setBusy(false);
  }

  if (!teams.length) return <Notice tone="warn" title="No team access">Ask the organisation owner to assign you to a team before uploading.</Notice>;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card>
        <h2 className="mb-4 font-semibold">1. Describe the footage</h2>
        <div className="grid gap-4">
          <div>
            <label className="label" htmlFor="u-team">Team</label>
            <select id="u-team" className="field" value={team} onChange={(e) => { setTeam(e.target.value); setPlayer(""); setSession(""); }}>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-player">Player</label>
            <select id="u-player" className="field" value={player} disabled={unassigned} onChange={(e) => setPlayer(e.target.value)}>
              <option value="">Choose a player…</option>
              {teamPlayers.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={unassigned} onChange={(e) => { setUnassigned(e.target.checked); if (e.target.checked) setPlayer(""); }} />
              Unassigned footage (assign a player later, before publishing)
            </label>
          </div>
          <div>
            <label className="label" htmlFor="u-session">Session (optional)</label>
            <select id="u-session" className="field" value={session} onChange={(e) => {
              setSession(e.target.value);
              const s = sessions.find((x) => x.id === e.target.value);
              if (s && s.drill_type in DRILLS) setDrill(s.drill_type as DrillType);
              if (s?.intended_target) setTarget(s.intended_target);
            }}>
              <option value="">No session</option>
              {teamSessions.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="u-drill">Drill type</label>
            <select id="u-drill" className="field" value={drill} onChange={(e) => setDrill(e.target.value as DrillType)}>
              {(Object.keys(DRILLS) as DrillType[]).map((d) => <option key={d} value={d}>{DRILLS[d].label}</option>)}
            </select>
          </div>
          {drill === "softball_pitching" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="u-pitch">Pitch type (coach-entered)</label>
                <input id="u-pitch" className="field" value={pitchType} onChange={(e) => setPitchType(e.target.value)} maxLength={60} placeholder="e.g. drop ball" />
              </div>
              <div>
                <label className="label" htmlFor="u-target">Intended target</label>
                <input id="u-target" className="field" value={target} onChange={(e) => setTarget(e.target.value)} maxLength={200} placeholder="e.g. glove low inside" />
              </div>
            </div>
          ) : null}
          {drill === "general_movement" ? (
            <div>
              <label className="label" htmlFor="u-movement">Movement and what counts as one rep</label>
              <input id="u-movement" className="field" value={target} onChange={(e) => setTarget(e.target.value)} maxLength={200} placeholder="e.g. kettlebell swing; one rep = hips back, then stand tall at lockout" />
              <p className="hint">Used as the description for automated counting. Be specific about where a rep starts and ends.</p>
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="u-device">Source device label</label>
            <input id="u-device" className="field" value={device} onChange={(e) => setDevice(e.target.value)} maxLength={80} />
            <p className="hint">A label for your records (for example which pair of glasses). Not a device connection.</p>
          </div>
          {!unassigned && player ? (
            <label className="flex gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
              <span>I confirm these recordings show {teamPlayers.find((p) => p.id === player)?.display_name}. (Required before a report can be published; you can confirm later in review.)</span>
            </label>
          ) : null}
          <label className="flex gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={autoAnalyze && analysisAvailable} disabled={!analysisAvailable || !DRILLS[drill].analysable} onChange={(e) => setAutoAnalyze(e.target.checked)} />
            <span>
              Request automated analysis of the first 60 seconds when processing finishes.
              {!analysisAvailable ? <span className="block text-xs text-muted">Automated analysis is unavailable on this plan or server. Manual review still works.</span> : <span className="block text-xs text-muted">Uses your monthly analysis allowance. You can choose a different excerpt in review instead.</span>}
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">2. Choose videos</h2>
        <label htmlFor="u-files" className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper px-4 py-8 text-center hover:border-ink">
          <span className="font-semibold">Choose from your phone or computer</span>
          <span className="mt-1 text-xs text-muted">MP4 or MOV · up to 500 MiB and 5 minutes each</span>
          <input id="u-files" type="file" accept="video/mp4,video/quicktime,.mp4,.mov" multiple className="sr-only" onChange={(e) => onPick(e.target.files)} />
        </label>
        {formError ? <div className="mt-3"><Notice tone="danger">{formError}</Notice></div> : null}
        <ul className="mt-4 space-y-3" aria-live="polite">
          {files.map((f) => (
            <li key={f.key} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium" title={f.file.name}>{f.file.name}</span>
                <Badge tone={f.status === "ready" ? "ok" : f.status === "rejected" || f.status === "error" ? "danger" : "neutral"}>
                  {{ queued: "Ready to upload", creating: "Preparing", uploading: `${Math.round(f.progress * 100)}%`, finalizing: "Verifying", processing: "Processing", ready: "Done", rejected: "Rejected", error: "Failed" }[f.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted">{fmtBytes(f.file.size)}{f.durationHint ? ` · ~${f.durationHint.toFixed(1)} s` : ""}</p>
              {f.status === "uploading" || f.status === "finalizing" ? (
                <div className="mt-2 h-2 overflow-hidden rounded bg-paper" role="progressbar" aria-valuenow={Math.round(f.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Upload progress for ${f.file.name}`}>
                  <div className="h-full bg-ink transition-all" style={{ width: `${f.progress * 100}%` }} />
                </div>
              ) : null}
              {f.message ? <p className={`mt-1 text-xs ${f.status === "rejected" || f.status === "error" ? "text-danger" : "text-muted"}`}>{f.message}</p> : null}
              <div className="mt-2 flex gap-3 text-xs">
                {f.status === "uploading" ? <button type="button" className="underline" onClick={() => { uploads.current[f.key]?.abort(); patch(f.key, { status: "error", message: "Paused. Choose Upload again to resume." }); }}>Pause</button> : null}
                {f.videoId && (f.status === "ready" || f.status === "processing") ? <Link className="underline" href={`/app/videos/${f.videoId}`}>Open review</Link> : null}
                {f.status === "queued" || f.status === "rejected" || f.status === "error" ? <button type="button" className="underline" onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}>Remove</button> : null}
              </div>
            </li>
          ))}
        </ul>
        <Button className="mt-4 w-full" variant="lime" onClick={startAll} disabled={busy || !files.some((f) => f.status === "queued" || f.status === "error")}>
          {busy ? "Uploading…" : "Upload"}
        </Button>
        <p className="mt-2 text-xs text-muted">Uploads resume automatically after a dropped connection. If the page closes, choose the same file again to resume.</p>
      </Card>
    </div>
  );
}
