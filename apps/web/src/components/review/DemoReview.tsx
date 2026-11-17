"use client";
import { useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { DEMO_ITEMS, type DemoItem } from "@/lib/demo-data";
import { OUTCOME_LABEL, type Outcome } from "@/lib/drills";
import { fmtClock } from "@/lib/format";
import { VideoPlayer, type PlayerHandle } from "./Player";
import { Timeline } from "./Timeline";

const OUTCOMES: Outcome[] = ["fair_contact", "foul", "swing_miss", "unclear"];

export function DemoReview({ initialTime }: { initialTime?: number }) {
  const player = useRef<PlayerHandle>(null);
  const [now, setNow] = useState(initialTime ?? 0);
  const [items, setItems] = useState<DemoItem[]>(DEMO_ITEMS);
  const [mark, setMark] = useState<number | null>(null);
  const active = items.find((i) => now >= i.start_s && now <= i.end_s)?.id ?? null;
  const included = items.filter((i) => i.included);
  const contacts = included.filter((i) => i.outcome === "fair_contact" || i.outcome === "foul").length;
  const assessable = contacts + included.filter((i) => i.outcome === "swing_miss").length;
  const unclear = included.filter((i) => !i.outcome || i.outcome === "unclear").length;
  const update = (id: string, p: Partial<DemoItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <Card className="!p-3">
        <VideoPlayer ref={player} videoId="demo" fps={24} playbackUrl="/demo-media/sample.mp4" onTime={setNow} initialTime={initialTime} label="Synthetic demo test pattern" />
        <div className="mt-4">
          <Timeline duration={16} current={now} activeId={active} onSeek={(t) => player.current?.seek(t)}
            items={items.map((i) => ({ id: i.id, start_s: i.start_s, end_s: i.end_s, included: i.included, origin: i.origin, label: i.outcome ? OUTCOME_LABEL[i.outcome as Outcome] : i.label }))} />
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="button" variant={mark === null ? "primary" : "lime"} onClick={() => {
            const t = player.current?.time() ?? now;
            if (mark === null) return setMark(t);
            const [s, e] = t > mark ? [mark, t] : [t, mark];
            if (e - s > 0.1) setItems((xs) => [...xs, { id: `c${Date.now()}`, start_s: s, end_s: e, event_type: "swing", label: "swing", outcome: null, origin: "coach", included: true, note: "" } as DemoItem].sort((a, b) => a.start_s - b.start_s));
            setMark(null);
          }}>{mark === null ? "Mark event start" : `Mark end (start ${fmtClock(mark)})`}</Button>
        </div>
      </Card>
      <div className="space-y-4">
        <Card>
          <h2 className="font-semibold">Sample totals (recomputed as you edit)</h2>
          <p className="mt-1 text-sm">{contacts} confirmed contacts out of {assessable} assessable swings; {unclear} additional swing{unclear === 1 ? "" : "s"} unclear.</p>
        </Card>
        <Card>
          <h2 className="font-semibold">Sample events</h2>
          <ol className="mt-2 space-y-2">
            {items.map((it, i) => (
              <li key={it.id} className={`rounded-xl border p-3 text-sm ${it.id === active ? "border-ink bg-lime/25" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">#{i + 1}</span>
                  <button type="button" className="font-mono text-xs underline" onClick={() => player.current?.seek(it.start_s)}>{fmtClock(it.start_s)}–{fmtClock(it.end_s)}</button>
                  <Badge tone={it.origin === "model" ? "ai" : "neutral"}>{it.origin === "model" ? "Sample suggestion" : "Coach-added"}</Badge>
                  <label className="ml-auto flex items-center gap-1 text-xs"><input type="checkbox" checked={it.included} onChange={(e) => update(it.id, { included: e.target.checked })} /> Count</label>
                  <button type="button" className="text-xs underline" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>Delete</button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {OUTCOMES.map((o) => (
                    <button key={o} type="button" aria-pressed={it.outcome === o} onClick={() => update(it.id, { outcome: it.outcome === o ? null : o })}
                      className={`rounded-full border px-2.5 py-1 text-xs ${it.outcome === o ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{OUTCOME_LABEL[o]}</button>
                  ))}
                </div>
                {it.note ? <p className="mt-1 text-xs text-muted">{it.note}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
