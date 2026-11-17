"use client";
import { VideoPlayer } from "./Player";

export function ComparePlayers({ a, b }: { a: { id: string; fps: number | null; label: string }; b: { id: string; fps: number | null; label: string } }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[a, b].map((v, i) => (
        <section key={v.id + i} aria-label={`Recording ${i + 1}`} className="rounded-2xl border border-line bg-white p-3">
          <p className="mb-2 text-sm font-semibold">{i === 0 ? "A" : "B"}: {v.label}</p>
          <VideoPlayer videoId={v.id} fps={v.fps} label={`Recording ${i === 0 ? "A" : "B"}: ${v.label}`} />
        </section>
      ))}
    </div>
  );
}
