// "Any movement" template end to end at the database level: upload, analysis results, review, report.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, analysisResult, claim, fails, grantPlan, liveAnalysisWorker, newPlayer, newUser, ok, probeAsWorker, SAMPLE, type TestUser } from "./helpers";

let owner: TestUser, orgId: string, teamId: string, playerId: string, videoId: string;

beforeAll(async () => {
  owner = await newUser("gym-owner");
  orgId = (await ok(owner.client.rpc("create_organization", { p_name: "Iron Peak", p_sport: "gym", p_team_name: "Morning group",
    p_recording_attested: true, p_notice_accepted: true }))) as string;
  teamId = ((await ok(owner.client.from("teams").select("id, sport").eq("org_id", orgId))) as { id: string; sport: string }[])[0].id;
  playerId = await newPlayer(owner.client, orgId, teamId, owner.id, "Alex Kim");
  await grantPlan(orgId);
  await liveAnalysisWorker();
  const rows = (await ok(owner.client.rpc("create_video_upload", { p_team: teamId, p_drill_type: "general_movement", p_filename: "swings.mp4",
    p_size_bytes: SAMPLE.length, p_container_ext: "mp4", p_player: playerId,
    p_intended_target: "Kettlebell swing; one rep = hips back, then stand tall at lockout" }))) as { video_id: string; storage_path: string }[];
  videoId = rows[0].video_id;
  const up = await owner.client.storage.from("videos").upload(rows[0].storage_path, SAMPLE, { contentType: "video/mp4" });
  if (up.error) throw up.error;
  await ok(owner.client.rpc("finalize_video_upload", { p_video: videoId }));
  await probeAsWorker(videoId, 10);
});

describe("any-movement template", () => {
  it("gym organisations create gym teams", async () => {
    const t = (await ok(owner.client.from("teams").select("sport").eq("id", teamId).single())) as { sport: string };
    expect(t.sport).toBe("gym");
  });

  it("passes the movement description to the worker and counts reps into a report", async () => {
    await ok(owner.client.rpc("request_analysis", { p_video: videoId, p_start_s: 0, p_end_s: 10 }));
    const job = await claim(["analyze"], videoId);
    expect((job.video as unknown as { drill_type: string; intended_target: string }).intended_target).toMatch(/Kettlebell swing/);
    const result = { ...analysisResult([
      { start_s: 0.5, end_s: 1.2, event_type: "setup", activity_label: "setup", suggested_outcome: null },
      { start_s: 2, end_s: 3, event_type: "rep", activity_label: "other_exercise", suggested_outcome: null },
      { start_s: 4, end_s: 5, event_type: "rep", activity_label: "other_exercise", suggested_outcome: null },
    ]), drill_template: "general_movement" };
    expect(await ok(admin.rpc("complete_analysis", { p_job: job.id, p_fence: job.fence, p_result: result }))).toBe("completed");
    const item = ((await ok(owner.client.from("review_items").select("id").eq("video_id", videoId).eq("event_type", "rep").limit(1))) as { id: string }[])[0];
    await fails(owner.client.rpc("review_upsert_item", { p_video: videoId, p_item: item.id, p_start_s: 2, p_end_s: 3, p_event_type: "rep",
      p_activity_label: "other_exercise", p_included: true, p_outcome: "fair_contact", p_coach_note: null }), /softball/);
    await ok(owner.client.rpc("approve_review", { p_video: videoId, p_feedback: null }));
    const r = (await ok(owner.client.from("reports").select("snapshot").eq("video_id", videoId).single())) as { snapshot: { totals: { reps_total: number }; statement: string } };
    expect(r.snapshot.totals.reps_total).toBe(2);
    expect(r.snapshot.statement).toBe("2 coach-confirmed reps in this recording.");
  });
});
