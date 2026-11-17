// Coach review edits, provenance, report approval/publishing versioning and reanalysis generations.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, analysisResult, claim, fails, grantPlan, liveAnalysisWorker, newOrg, newPlayer, newUser, ok, probeAsWorker, uploadVideo, type TestUser } from "./helpers";

let owner: TestUser;
let orgId: string, teamId: string, playerId: string, videoId: string;
type Item = { id: string; start_s: number; end_s: number; origin: string; outcome: string | null; outcome_source: string | null; included: boolean; generation: number };
const items = async () => (await ok(owner.client.from("review_items").select("*").eq("video_id", videoId).order("start_s"))) as Item[];

async function analyse(events: Record<string, unknown>[]) {
  const jobId = (await ok(owner.client.rpc("request_analysis", { p_video: videoId, p_start_s: 0, p_end_s: 10 }))) as string;
  const job = await claim(["analyze"], videoId);
  expect(await ok(admin.rpc("complete_analysis", { p_job: jobId, p_fence: job.fence, p_result: analysisResult(events) }))).toBe("completed");
}

beforeAll(async () => {
  owner = await newUser("review-owner");
  ({ orgId, teamId } = await newOrg(owner, "Review Org"));
  playerId = await newPlayer(owner.client, orgId, teamId, owner.id);
  await grantPlan(orgId);
  await liveAnalysisWorker();
  ({ videoId } = await uploadVideo(owner, teamId, playerId, "softball_hitting"));
  await probeAsWorker(videoId, 10);
});

describe("review workspace", () => {
  it("model suggestions arrive as draft items with provenance; setup events are excluded by default", async () => {
    await analyse([
      { start_s: 1, end_s: 2, suggested_outcome: "fair_contact" },
      { start_s: 3, end_s: 4, suggested_outcome: "unclear" },
      { start_s: 5, end_s: 6, event_type: "setup", activity_label: "setup", suggested_outcome: null },
    ]);
    const it0 = await items();
    expect(it0).toHaveLength(3);
    expect(it0.every((i) => i.origin === "model" && i.generation === 1)).toBe(true);
    expect(it0[0].outcome_source).toBe("model_suggestion");
    expect(it0[2].included).toBe(false);
  });

  it("coach edits, adds, splits, merges and deletes; invalid outcomes are rejected", async () => {
    const [a, b] = await items();
    await ok(owner.client.rpc("review_upsert_item", { p_video: videoId, p_item: b.id, p_start_s: 3, p_end_s: 4, p_event_type: "swing",
      p_activity_label: "swing", p_included: true, p_outcome: "swing_miss", p_coach_note: "Clear miss" }));
    await fails(owner.client.rpc("review_upsert_item", { p_video: videoId, p_item: b.id, p_start_s: 3, p_end_s: 4, p_event_type: "swing",
      p_activity_label: "swing", p_included: true, p_outcome: "target_hit", p_coach_note: null }));
    await fails(owner.client.rpc("review_upsert_item", { p_video: videoId, p_item: null, p_start_s: 9, p_end_s: 12, p_event_type: "swing",
      p_activity_label: "swing", p_included: true, p_outcome: null, p_coach_note: null }), /within the video/);
    const added = (await ok(owner.client.rpc("review_upsert_item", { p_video: videoId, p_item: null, p_start_s: 7, p_end_s: 9, p_event_type: "swing",
      p_activity_label: "swing", p_included: true, p_outcome: "foul", p_coach_note: null }))) as string;
    const second = (await ok(owner.client.rpc("review_split_item", { p_item: added, p_at_s: 8 }))) as string;
    const merged = (await ok(owner.client.rpc("review_merge_items", { p_a: added, p_b: second }))) as string;
    // Splitting leaves the new half without an outcome, so the merge conservatively clears it; the coach re-confirms.
    expect((await items()).find((i) => i.id === merged)!.outcome).toBeNull();
    await ok(owner.client.rpc("review_upsert_item", { p_video: videoId, p_item: merged, p_start_s: 7, p_end_s: 9, p_event_type: "swing",
      p_activity_label: "swing", p_included: true, p_outcome: "foul", p_coach_note: null }));
    const after = await items();
    const edited = after.find((i) => i.id === b.id)!;
    expect(edited.outcome).toBe("swing_miss");
    expect(edited.outcome_source).toBe("coach");
    expect(after.filter((i) => i.origin === "coach")).toHaveLength(1);
    expect(after.find((i) => i.id === a.id)!.outcome_source).toBe("model_suggestion");
    const revisions = (await ok(owner.client.from("coach_revisions").select("action").eq("video_id", videoId))) as { action: string }[];
    expect(revisions.length).toBeGreaterThanOrEqual(4);
    // Raw model events are immutable.
    const ev = (await ok(admin.from("detected_events").select("id").eq("video_id", videoId).limit(1).single())) as { id: string };
    expect((await admin.from("detected_events").update({ evidence: "tampered" }).eq("id", ev.id)).error).not.toBeNull();
  });
});

describe("reports", () => {
  it("approval snapshots coach-confirmed totals and versioning keeps one approved and one published", async () => {
    await fails(owner.client.rpc("publish_report", { p_video: videoId }), /Approve the review/);
    await ok(owner.client.rpc("approve_review", { p_video: videoId, p_feedback: "v1" }));
    await ok(owner.client.rpc("approve_review", { p_video: videoId, p_feedback: "v2" }));
    let reports = (await ok(owner.client.from("reports").select("version, status, snapshot").eq("video_id", videoId).order("version"))) as { version: number; status: string; snapshot: { totals: Record<string, number>; statement: string; provenance: Record<string, number> } }[];
    expect(reports.map((r) => [r.version, r.status])).toEqual([[1, "superseded"], [2, "approved"]]);
    const snap = reports[1].snapshot;
    // fair_contact (model, untouched) + swing_miss (coach) + foul (coach-added) = 3 swings, 2 contacts, 3 assessable.
    expect(snap.totals).toMatchObject({ swings: 3, fair_contact: 1, foul: 1, swing_miss: 1, unclear: 0, contacts: 2, assessable: 3 });
    expect(snap.statement).toBe("2 confirmed contacts (1 fair, 1 foul) out of 3 assessable swings; 0 additional swings unclear.");
    expect(snap.provenance.coach_added_items).toBe(1);

    await ok(owner.client.rpc("confirm_attribution", { p_video: videoId }));
    await ok(owner.client.rpc("publish_report", { p_video: videoId }));
    reports = (await ok(owner.client.from("reports").select("version, status, snapshot").eq("video_id", videoId).order("version"))) as typeof reports;
    expect(reports.map((r) => r.status)).toEqual(["superseded", "published"]);
  });

  it("reanalysis creates a new draft generation and leaves the published report intact", async () => {
    await analyse([{ start_s: 2, end_s: 3, suggested_outcome: "unclear" }]);
    const video = (await ok(owner.client.from("videos").select("current_generation, status").eq("id", videoId).single())) as { current_generation: number; status: string };
    expect(video.current_generation).toBe(2);
    const gen2 = (await items()).filter((i) => i.generation === 2);
    expect(gen2).toHaveLength(1);
    const published = (await ok(owner.client.from("reports").select("version, generation").eq("video_id", videoId).eq("status", "published"))) as { version: number; generation: number }[];
    expect(published).toEqual([{ version: 2, generation: 1 }]);

    await ok(owner.client.rpc("approve_review", { p_video: videoId, p_feedback: "after reanalysis" }));
    await ok(owner.client.rpc("publish_report", { p_video: videoId }));
    const all = (await ok(owner.client.from("reports").select("version, status").eq("video_id", videoId).order("version"))) as { version: number; status: string }[];
    expect(all.filter((r) => r.status === "published")).toEqual([{ version: 3, status: "published" }]);
  });

  it("retracting hides the report again", async () => {
    await ok(owner.client.rpc("retract_report", { p_video: videoId }));
    expect(await ok(owner.client.from("reports").select("id").eq("video_id", videoId).eq("status", "published"))).toHaveLength(0);
  });
});

describe("export", () => {
  it("owners can export model suggestions and coach edits for pilot measurement", async () => {
    const data = (await ok(owner.client.rpc("export_organization", { p_org: orgId }))) as Record<string, unknown[]>;
    expect(data.detected_events.length).toBeGreaterThan(0);
    expect(data.coach_revisions.length).toBeGreaterThan(0);
    expect(data.reports.length).toBeGreaterThan(0);
    expect(data.roster_entries.length).toBeGreaterThan(0);
    expect(Array.isArray(data.seasons) && Array.isArray(data.goals)).toBe(true);
  });
});
