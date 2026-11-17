// Personal training workspaces against the real local stack: creation rules, privacy, self-review labelling,
// revocable coach access and goals. Nothing is mocked except the worker's analysis result (marked mock-test).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, analysisResult, claim, fails, grantPlan, liveAnalysisWorker, newOrg, newUser, ok, probeAsWorker, uploadVideo, type TestUser } from "./helpers";

let me: TestUser, coach: TestUser, stranger: TestUser;
let orgId: string, teamId: string, selfId: string;

const create = (u: TestUser, over: Record<string, unknown> = {}) =>
  u.client.rpc("create_personal_workspace", {
    p_display_name: "Sam Rivera", p_sports: ["strength", "tennis"], p_adult_confirmed: true,
    p_recording_attested: true, p_notice_accepted: true, p_goal: "Hinge with a neutral neck", ...over,
  });

beforeAll(async () => {
  me = await newUser("personal");
  coach = await newUser("personal-coach");
  stranger = await newUser("personal-stranger");
  orgId = (await ok(create(me))) as string;
  teamId = ((await ok(me.client.from("teams").select("id").eq("org_id", orgId))) as { id: string }[])[0].id;
  selfId = ((await ok(me.client.from("players").select("id").eq("org_id", orgId))) as { id: string }[])[0].id;
});

describe("personal workspace creation", () => {
  it("creates a personal org with one training log and the user's own athlete profile", async () => {
    const org = (await ok(me.client.from("organizations").select("kind, sport").eq("id", orgId).single())) as { kind: string };
    expect(org.kind).toBe("personal");
    const players = (await ok(me.client.from("players").select("display_name, self_user_id, sports").eq("org_id", orgId))) as
      { display_name: string; self_user_id: string; sports: string[] }[];
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ display_name: "Sam Rivera", self_user_id: me.id, sports: ["strength", "tennis"] });
    const goals = (await ok(me.client.from("goals").select("text, sport").eq("player_id", selfId))) as { text: string; sport: string }[];
    expect(goals).toEqual([{ text: "Hinge with a neutral neck", sport: "strength" }]);
  });

  it("requires adult confirmation, a sport, and allows only one personal workspace per user", async () => {
    const u = await newUser("personal-minor");
    await fails(create(u, { p_adult_confirmed: false }), /adults/);
    await fails(create(u, { p_sports: [] }), /at least one sport/);
    await fails(create(u, { p_sports: ["quidditch"] }), /Unknown sport/);
    await fails(create(me), /already have a personal workspace/);
  });

  it("holds only the owner's record: no extra players, teams, athlete invites, or self_user_id spoofing", async () => {
    await fails(me.client.from("players").insert({ org_id: orgId, team_id: teamId, display_name: "Someone else", created_by: me.id }), /only your own athlete profile/);
    await fails(me.client.rpc("create_team", { p_org: orgId, p_name: "Second", p_sport: "gym" }), /single training log|Team limit/);
    // The guard holds even for a privileged insert (e.g. a plan with a higher team limit).
    await fails(admin.from("teams").insert({ org_id: orgId, name: "Second", sport: "gym" }), /single training log/);
    await fails(me.client.rpc("create_invitation", { p_org: orgId, p_email: stranger.email, p_role: "athlete", p_player: selfId }), /cannot invite athletes/);
    // self_user_id is not insertable or updatable by users, even in a team org they own.
    const team = await newOrg(stranger, "Stranger FC");
    await fails(stranger.client.from("players").insert({ org_id: team.orgId, team_id: team.teamId, display_name: "x", created_by: stranger.id, self_user_id: stranger.id } as never));
    await fails(me.client.from("players").update({ archived_at: new Date().toISOString() }).eq("id", selfId), /cannot be archived/);
  });

  it("keeps personal records private from other users", async () => {
    expect(await ok(stranger.client.from("players").select("id").eq("org_id", orgId))).toEqual([]);
    expect(await ok(stranger.client.from("goals").select("id").eq("org_id", orgId))).toEqual([]);
    expect(await ok(stranger.client.from("organizations").select("id").eq("id", orgId))).toEqual([]);
  });
});

describe("self-review vs coach approval, and revocable coach access", () => {
  let videoId: string;
  beforeAll(async () => {
    await grantPlan(orgId);
    await liveAnalysisWorker();
    ({ videoId } = await uploadVideo(me, teamId, selfId, "gym_test"));
    await probeAsWorker(videoId, 10);
    await ok(me.client.rpc("request_analysis", { p_video: videoId, p_start_s: 0, p_end_s: 10 }));
    const job = await claim(["analyze"], videoId);
    const result = { ...analysisResult([{ start_s: 2, end_s: 3, event_type: "rep", activity_label: "hinge", suggested_outcome: null }]), drill_template: "gym_test",
      extraction_settings: { fps: 4, registry: { version: "2026-11-07.1", activity_id: "strength.reps", activity_status: "experimental" } } };
    await ok(admin.rpc("complete_analysis", { p_job: job.id, p_fence: job.fence, p_result: result }));
  });

  it("records the capability registry version and activity on the run", async () => {
    const run = (await ok(me.client.from("analysis_runs").select("registry_version, activity_id").eq("video_id", videoId).single())) as { registry_version: string; activity_id: string };
    expect(run).toEqual({ registry_version: "2026-11-07.1", activity_id: "strength.reps" });
  });

  it("labels the athlete's own approval as a self-review", async () => {
    await ok(me.client.rpc("approve_review", { p_video: videoId, p_feedback: "Felt good" }));
    await ok(me.client.rpc("confirm_attribution", { p_video: videoId }));
    await ok(me.client.rpc("publish_report", { p_video: videoId }));
    const r = (await ok(me.client.from("reports").select("review_kind, status, snapshot").eq("video_id", videoId).eq("status", "published").single())) as { review_kind: string; snapshot: { statement: string; review_kind: string } };
    expect(r.review_kind).toBe("self");
    expect(r.snapshot.review_kind).toBe("self");
    expect(r.snapshot.statement).toBe("1 self-reviewed rep in this recording.");
  });

  it("an invited coach sees the workspace, and their approval is labelled coach", async () => {
    const inv = (await ok(me.client.rpc("create_invitation", { p_org: orgId, p_email: coach.email, p_role: "coach" }))) as { token: string }[];
    await ok(coach.client.rpc("accept_invitation", { p_token: inv[0].token }));
    expect(((await ok(coach.client.from("players").select("id").eq("org_id", orgId))) as unknown[]).length).toBe(1);
    await ok(coach.client.rpc("approve_review", { p_video: videoId, p_feedback: "Keep eyes ahead" }));
    const r = (await ok(coach.client.from("reports").select("review_kind").eq("video_id", videoId).eq("status", "approved").single())) as { review_kind: string };
    expect(r.review_kind).toBe("coach");
    // Coaches cannot revoke other coaches or manage the owner's access.
    const m = (await ok(admin.from("memberships").select("id").eq("org_id", orgId).eq("user_id", coach.id).single())) as { id: string };
    await fails(coach.client.rpc("revoke_coach_access", { p_membership: m.id }), /Only the owner/);
  });

  it("revoking the coach removes their access immediately", async () => {
    const m = (await ok(admin.from("memberships").select("id").eq("org_id", orgId).eq("user_id", coach.id).single())) as { id: string };
    await ok(me.client.rpc("revoke_coach_access", { p_membership: m.id }));
    expect(await ok(coach.client.from("players").select("id").eq("org_id", orgId))).toEqual([]);
    expect(await ok(coach.client.from("videos").select("id").eq("id", videoId))).toEqual([]);
    await fails(coach.client.rpc("approve_review", { p_video: videoId, p_feedback: "x" }));
    const { data } = await coach.client.storage.from("videos").createSignedUrl(`${orgId}/${videoId}/source.mp4`, 60);
    expect(data?.signedUrl ?? null).toBeNull();
  });

  it("the owner can add and update goals; strangers cannot", async () => {
    const id = (await ok(me.client.rpc("upsert_goal", { p_goal: null, p_player: selfId, p_sport: "tennis", p_text: "Consistent toss height" }))) as string;
    await ok(me.client.rpc("upsert_goal", { p_goal: id, p_player: selfId, p_sport: "tennis", p_text: "Consistent toss height", p_status: "achieved" }));
    await fails(stranger.client.rpc("upsert_goal", { p_goal: null, p_player: selfId, p_sport: "tennis", p_text: "hijack" }), /Not allowed/);
  });
});
