// Deterministic aggregation of coach-approved report snapshots. Pure functions: unit tested.

export type SnapshotItem = {
  start_s: number;
  end_s: number;
  event_type: string;
  activity_label: string;
  outcome: string | null;
  outcome_source: string | null;
  origin: "model" | "coach";
  coach_modified: boolean;
  coach_note: string | null;
};

export type ReportSnapshot = {
  schema_version: number;
  video: { id: string; duration_s: number; drill_type: string; pitch_type: string | null; intended_target: string | null; uploaded_at: string };
  player: { id: string; name: string | null };
  session: { title: string; date: string } | null;
  sample: { description: string; analysed_range: [number, number] | null };
  totals: Record<string, unknown>;
  statement: string;
  items: SnapshotItem[];
  observations: { t_start_s: number; t_end_s: number; text: string; origin: string }[];
  provenance: {
    run_id: string | null;
    model: string | null;
    ai_suggested_items: number;
    coach_added_items: number;
    coach_modified_items: number;
  };
};

export type HittingTotals = { recordings: number; swings: number; fair_contact: number; foul: number; swing_miss: number; unclear: number; contacts: number; assessable: number };
export type PitchingTotals = { recordings: number; pitches: number; target_hit: number; target_missed: number; unclear: number; assessable: number };
export type GymTotals = { recordings: number; reps_total: number; reps_by_activity: Record<string, number> };

export type PlayerAggregate = { hitting: HittingTotals; pitching: PitchingTotals; gym: GymTotals };

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export function aggregateSnapshots(snapshots: ReportSnapshot[]): PlayerAggregate {
  const agg: PlayerAggregate = {
    hitting: { recordings: 0, swings: 0, fair_contact: 0, foul: 0, swing_miss: 0, unclear: 0, contacts: 0, assessable: 0 },
    pitching: { recordings: 0, pitches: 0, target_hit: 0, target_missed: 0, unclear: 0, assessable: 0 },
    gym: { recordings: 0, reps_total: 0, reps_by_activity: {} },
  };
  for (const s of snapshots) {
    const t = s.totals ?? {};
    if (s.video.drill_type === "softball_hitting") {
      agg.hitting.recordings++;
      for (const k of ["swings", "fair_contact", "foul", "swing_miss", "unclear"] as const) agg.hitting[k] += n(t[k]);
    } else if (s.video.drill_type === "softball_pitching") {
      agg.pitching.recordings++;
      for (const k of ["pitches", "target_hit", "target_missed", "unclear"] as const) agg.pitching[k] += n(t[k]);
    } else {
      agg.gym.recordings++;
      agg.gym.reps_total += n(t.reps_total);
      const by = (t.reps_by_activity ?? {}) as Record<string, unknown>;
      for (const [label, c] of Object.entries(by)) agg.gym.reps_by_activity[label] = (agg.gym.reps_by_activity[label] ?? 0) + n(c);
    }
  }
  agg.hitting.contacts = agg.hitting.fair_contact + agg.hitting.foul;
  agg.hitting.assessable = agg.hitting.contacts + agg.hitting.swing_miss;
  agg.pitching.assessable = agg.pitching.target_hit + agg.pitching.target_missed;
  return agg;
}

export const plural = (count: number, one: string, many = one + "s") => `${count} ${count === 1 ? one : many}`;

export function hittingStatement(t: HittingTotals): string {
  return `${plural(t.contacts, "confirmed contact")} out of ${plural(t.assessable, "assessable swing")}; ${plural(t.unclear, "additional swing")} unclear. Drill contact counts are not game batting averages.`;
}

export function pitchingStatement(t: PitchingTotals): string {
  return `${plural(t.target_hit, "confirmed target hit")} out of ${plural(t.assessable, "assessable pitch", "assessable pitches")}; ${plural(t.unclear, "additional pitch", "additional pitches")} unclear.`;
}

export function gymStatement(t: GymTotals, confirmedBy: "coach" | "self" | "mixed" = "coach"): string {
  const parts = Object.entries(t.reps_by_activity)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${v} ${k}`);
  const word = confirmedBy === "coach" ? "coach-confirmed rep" : confirmedBy === "self" ? "self-reviewed rep" : "reviewed rep";
  return `${plural(t.reps_total, word)} across ${plural(t.recordings, "recording")}${parts.length ? ` (${parts.join(", ")})` : ""}.`;
}
