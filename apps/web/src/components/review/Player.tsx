"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button, Notice, Spinner } from "@/components/ui";
import { fmtClock } from "@/lib/format";

export type PlayerHandle = { seek: (t: number) => void; time: () => number; pause: () => void };

/**
 * Private video player. Fetches a short-lived signed URL from the server (which re-checks access),
 * refreshes it before expiry while preserving the playback position, and exposes speed and frame stepping.
 */
export const VideoPlayer = forwardRef<PlayerHandle, {
  videoId: string; fps: number | null; onTime?: (t: number) => void; initialTime?: number; playbackUrl?: string; label?: string;
}>(function VideoPlayer({ videoId, fps, onTime, initialTime, playbackUrl, label = "Practice recording" }, ref) {
  const el = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(playbackUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  const [t, setT] = useState(0);
  const pendingSeek = useRef<number | undefined>(initialTime);
  const frame = 1 / (fps && fps > 0 ? fps : 30);

  const load = useCallback(async () => {
    if (playbackUrl) return;
    try {
      const r = await fetch(`/api/videos/${videoId}/playback`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Playback unavailable");
      if (el.current && el.current.currentTime > 0) pendingSeek.current = el.current.currentTime;
      setSrc(j.url);
      setError(null);
      return Number(j.expires_in) || 600;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Playback unavailable");
    }
  }, [videoId, playbackUrl]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const loop = async () => {
      const ttl = await load();
      if (alive && ttl) timer = setTimeout(loop, Math.max(30, ttl - 60) * 1000);
    };
    void loop();
    return () => { alive = false; clearTimeout(timer); };
  }, [load]);

  useImperativeHandle(ref, () => ({
    seek: (time: number) => { if (el.current) { el.current.currentTime = Math.max(0, time); setT(time); onTime?.(time); } },
    time: () => el.current?.currentTime ?? 0,
    pause: () => el.current?.pause(),
  }));

  const step = (d: number) => {
    const v = el.current; if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + d));
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black">
        {error ? <div className="p-6"><Notice tone="danger" title="Video unavailable">{error}</Notice></div> : null}
        {!src && !error ? <div className="flex aspect-video items-center justify-center"><span className="text-white/70"><Spinner label="Loading video…" /></span></div> : null}
        {src ? (
          <video
            ref={el}
            src={src}
            controls
            playsInline
            preload="metadata"
            aria-label={label}
            className="max-h-[60vh] w-full bg-black"
            onLoadedMetadata={() => {
              if (el.current) { el.current.playbackRate = rate; if (pendingSeek.current !== undefined) { el.current.currentTime = pendingSeek.current; pendingSeek.current = undefined; } }
            }}
            onTimeUpdate={() => { const now = el.current?.currentTime ?? 0; setT(now); onTime?.(now); }}
            onSeeked={() => { const now = el.current?.currentTime ?? 0; setT(now); onTime?.(now); }}
            onError={() => { if (!error) void load(); }}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" role="toolbar" aria-label="Playback controls">
        <span className="rounded bg-ink px-2 py-1 font-mono text-xs text-white tabular-nums" aria-live="off">{fmtClock(t)}</span>
        <Button type="button" variant="secondary" className="!px-2 !py-1" onClick={() => step(-1)} aria-label="Back one second">−1s</Button>
        <Button type="button" variant="secondary" className="!px-2 !py-1" onClick={() => step(-frame)} aria-label="Previous frame">◀ frame</Button>
        <Button type="button" variant="secondary" className="!px-2 !py-1" onClick={() => step(frame)} aria-label="Next frame">frame ▶</Button>
        <Button type="button" variant="secondary" className="!px-2 !py-1" onClick={() => step(1)} aria-label="Forward one second">+1s</Button>
        <label className="ml-auto flex items-center gap-1 text-xs">
          Speed
          <select className="rounded border border-line bg-white px-1 py-1" value={rate} onChange={(e) => { const r = Number(e.target.value); setRate(r); if (el.current) el.current.playbackRate = r; }}>
            {[0.25, 0.5, 0.75, 1, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">Frame stepping uses the recorded frame rate ({fps ? `${Number(fps).toFixed(0)} fps` : "assumed 30 fps"}); browsers may land on the nearest decodable frame.</p>
    </div>
  );
});
