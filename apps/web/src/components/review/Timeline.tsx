"use client";
import { useState } from "react";
import { fmtClock } from "@/lib/format";

export type TimelineItem = { id: string; start_s: number; end_s: number; included: boolean; origin: string; label: string };

/** Zoomable timeline. Each segment is a button: keyboard and pointer users can seek to it. */
export function Timeline({ duration, items, current, activeId, range, onSeek }: {
  duration: number; items: TimelineItem[]; current: number; activeId: string | null; range?: [number, number] | null; onSeek: (t: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const d = Math.max(duration, 0.1);
  const pct = (t: number) => `${(Math.min(Math.max(t, 0), d) / d) * 100}%`;
  const ticks = Math.min(Math.ceil(d / (zoom >= 4 ? 1 : zoom >= 2 ? 2 : 5)), 400);
  const tickStep = d / ticks;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">Timeline</span>
        <label className="flex items-center gap-2">
          Zoom
          <input type="range" min={1} max={8} step={1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Timeline zoom" />
          <span className="w-6 tabular-nums">{zoom}×</span>
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-white pb-1">
        <div className="relative h-16 min-w-full" style={{ width: `${zoom * 100}%` }}>
          <button
            type="button"
            className="absolute inset-0 h-full w-full cursor-crosshair"
            aria-label="Seek on timeline"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              onSeek(((e.clientX - r.left) / r.width) * d);
            }}
          />
          {range ? <div className="pointer-events-none absolute inset-y-0 bg-violet-100/60" style={{ left: pct(range[0]), width: `calc(${pct(range[1])} - ${pct(range[0])})` }} title="Analysed excerpt" /> : null}
          {Array.from({ length: ticks + 1 }).map((_, i) => (
            <span key={i} className="pointer-events-none absolute bottom-0 h-2 border-l border-line" style={{ left: pct(i * tickStep) }}>
              {i % Math.max(1, Math.round(ticks / (6 * zoom))) === 0 ? <span className="absolute -top-3.5 left-0.5 text-[10px] text-muted">{fmtClock(i * tickStep).replace(/\.\d+$/, "")}</span> : null}
            </span>
          ))}
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onSeek(it.start_s)}
              className={`absolute top-3 h-7 rounded border text-[10px] font-semibold ${it.id === activeId ? "z-10 border-ink bg-lime text-ink ring-2 ring-ink" : it.included ? (it.origin === "model" ? "border-violet-400 bg-violet-200 text-violet-950" : "border-ink/40 bg-ink/15 text-ink") : "border-dashed border-muted bg-white text-muted"}`}
              style={{ left: pct(it.start_s), width: `max(6px, calc(${pct(it.end_s)} - ${pct(it.start_s)}))` }}
              title={`${it.label} ${fmtClock(it.start_s)}–${fmtClock(it.end_s)}${it.included ? "" : " (excluded)"}`}
              aria-label={`${it.label} from ${fmtClock(it.start_s)} to ${fmtClock(it.end_s)}${it.included ? "" : ", excluded"}`}
            >
              <span className="block truncate px-0.5">{it.label}</span>
            </button>
          ))}
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-danger" style={{ left: pct(current) }} aria-hidden />
        </div>
      </div>
      <p className="flex flex-wrap gap-3 text-[11px] text-muted">
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-violet-200 align-middle" />AI suggestion</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-ink/15 align-middle" />Coach-added</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded border border-dashed border-muted align-middle" />Excluded</span>
        <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded bg-violet-100 align-middle" />Analysed excerpt</span>
      </p>
    </div>
  );
}
