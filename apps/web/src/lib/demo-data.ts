// Explicitly fictional sample data for the unauthenticated demo. Nothing here was produced by automated
// analysis; every record is hand-written and labelled as a sample in the UI.
import type { ReportSnapshot } from "@/lib/report";

export const DEMO_PLAYERS = [
  { id: "demo-p1", name: "Sample Player A", team: "Sample Varsity", position: "SS" },
  { id: "demo-p2", name: "Sample Player B", team: "Sample Varsity", position: "P" },
];

export type DemoItem = {
  id: string; start_s: number; end_s: number; event_type: "swing" | "pitch" | "rep"; label: string;
  outcome: string | null; origin: "model" | "coach"; included: boolean; note: string;
};

// Hand-written sample review items over the 16 s synthetic test-pattern clip.
export const DEMO_ITEMS: DemoItem[] = [
  { id: "d1", start_s: 1.2, end_s: 2.6, event_type: "swing", label: "swing", outcome: "fair_contact", origin: "model", included: true, note: "Sample suggestion text." },
  { id: "d2", start_s: 4.0, end_s: 5.3, event_type: "swing", label: "swing", outcome: "swing_miss", origin: "model", included: true, note: "Sample suggestion text." },
  { id: "d3", start_s: 7.1, end_s: 8.2, event_type: "swing", label: "swing", outcome: "unclear", origin: "model", included: true, note: "Sample: ball not visible at contact." },
  { id: "d4", start_s: 10.4, end_s: 11.9, event_type: "swing", label: "swing", outcome: "foul", origin: "coach", included: true, note: "Sample coach-added event." },
  { id: "d5", start_s: 13.0, end_s: 14.1, event_type: "swing", label: "setup", outcome: null, origin: "model", included: false, note: "Sample: excluded setup movement." },
];

export const DEMO_SNAPSHOT: ReportSnapshot = {
  schema_version: 1,
  video: { id: "demo-v1", duration_s: 16, drill_type: "softball_hitting", pitch_type: null, intended_target: null, uploaded_at: "2026-11-01T17:00:00Z" },
  player: { id: "demo-p1", name: "Sample Player A" },
  session: { title: "Sample tee session", date: "2026-11-01" },
  sample: { description: "SAMPLE DATA: one fictional recording; counts are hand-written examples.", analysed_range: null },
  totals: { swings: 4, fair_contact: 1, foul: 1, swing_miss: 1, unclear: 1, contacts: 2, assessable: 3 },
  statement: "2 confirmed contacts (1 fair, 1 foul) out of 3 assessable swings; 1 additional swing unclear.",
  items: DEMO_ITEMS.filter((i) => i.included).map((i) => ({
    start_s: i.start_s, end_s: i.end_s, event_type: i.event_type, activity_label: i.label, outcome: i.outcome, outcome_source: "coach",
    origin: i.origin, coach_modified: false, coach_note: null,
  })),
  observations: [{ t_start_s: 1.2, t_end_s: 2.6, text: "Sample coach note: finish was balanced on this swing.", origin: "coach" }],
  provenance: { run_id: null, model: null, ai_suggested_items: 0, coach_added_items: 4, coach_modified_items: 0 },
};
