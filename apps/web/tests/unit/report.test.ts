import { describe, expect, it } from "vitest";
import { aggregateSnapshots, gymStatement, hittingStatement, pitchingStatement, type ReportSnapshot } from "@/lib/report";

const snap = (drill: string, totals: Record<string, unknown>) => ({ video: { drill_type: drill }, totals }) as unknown as ReportSnapshot;

describe("aggregateSnapshots", () => {
  it("sums only coach-approved totals and derives contacts/assessable", () => {
    const agg = aggregateSnapshots([
      snap("softball_hitting", { swings: 5, fair_contact: 2, foul: 1, swing_miss: 1, unclear: 1 }),
      snap("softball_hitting", { swings: 3, fair_contact: 1, foul: 0, swing_miss: 2, unclear: 0 }),
      snap("softball_pitching", { pitches: 4, target_hit: 2, target_missed: 1, unclear: 1 }),
      snap("gym_test", { reps_total: 7, reps_by_activity: { hinge: 6, lunge: 1 } }),
      snap("gym_test", { reps_total: 4, reps_by_activity: { hinge: 4 } }),
    ]);
    expect(agg.hitting).toEqual({ recordings: 2, swings: 8, fair_contact: 3, foul: 1, swing_miss: 3, unclear: 1, contacts: 4, assessable: 7 });
    expect(agg.pitching).toEqual({ recordings: 1, pitches: 4, target_hit: 2, target_missed: 1, unclear: 1, assessable: 3 });
    expect(agg.gym).toEqual({ recordings: 2, reps_total: 11, reps_by_activity: { hinge: 10, lunge: 1 } });
  });

  it("handles empty input and missing fields", () => {
    const agg = aggregateSnapshots([snap("softball_hitting", {})]);
    expect(agg.hitting.assessable).toBe(0);
  });
});

describe("statements", () => {
  it("never express a percentage or batting average", () => {
    const h = hittingStatement({ recordings: 1, swings: 10, fair_contact: 4, foul: 2, swing_miss: 3, unclear: 1, contacts: 6, assessable: 9 });
    expect(h).toBe("6 confirmed contacts out of 9 assessable swings; 1 additional swing unclear. Drill contact counts are not game batting averages.");
    expect(h).not.toMatch(/%/);
    expect(pitchingStatement({ recordings: 1, pitches: 1, target_hit: 1, target_missed: 0, unclear: 0, assessable: 1 }))
      .toBe("1 confirmed target hit out of 1 assessable pitch; 0 additional pitches unclear.");
    expect(gymStatement({ recordings: 2, reps_total: 11, reps_by_activity: { hinge: 10, lunge: 1 } }))
      .toBe("11 coach-confirmed reps across 2 recordings (10 hinge, 1 lunge).");
  });
});

describe("gymStatement wording by reviewer", () => {
  const t = { reps_total: 3, recordings: 1, reps_by_activity: { hinge: 3 } };
  it("never calls a self-review coach-confirmed", () => {
    expect(gymStatement(t)).toBe("3 coach-confirmed reps across 1 recording (3 hinge).");
    expect(gymStatement(t, "self")).toBe("3 self-reviewed reps across 1 recording (3 hinge).");
    expect(gymStatement(t, "mixed")).toBe("3 reviewed reps across 1 recording (3 hinge).");
  });
});
