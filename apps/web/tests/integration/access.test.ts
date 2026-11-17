// Tenant isolation, team scoping, athlete visibility, storage policies and invitations.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, analysisResult, claim, fails, liveAnalysisWorker, grantPlan, newOrg, newPlayer, newUser, ok, probeAsWorker, SAMPLE, uploadVideo, type TestUser } from "./helpers";

let ownerA: TestUser, ownerB: TestUser, coachA1: TestUser, athlete: TestUser, outsider: TestUser;
let orgA: string, teamA1: string, teamA2: string, orgB: string;
let playerA1: string, playerA2: string, videoA1: string, pathA1: string, videoA2: string;

beforeAll(async () => {
  ownerA = await newUser("ownera");
  ownerB = await newUser("ownerb");
  coachA1 = await newUser("coach");
  athlete = await newUser("athlete");
  outsider = await newUser("outsider");
  ({ orgId: orgA, teamId: teamA1 } = await newOrg(ownerA, "Org A"));
  ({ orgId: orgB } = await newOrg(ownerB, "Org B"));
  await grantPlan(orgA, "founding_pilot"); // allows 2 teams? founding allows 1 team; second team via admin
  teamA2 = ((await ok(admin.from("teams").insert({ org_id: orgA, name: "JV", sport: "softball" }).select("id").single())) as { id: string }).id;

  // Coach invited to team A1 only.
  const inv = (await ok(ownerA.client.rpc("create_invitation", { p_org: orgA, p_email: coachA1.email, p_role: "coach", p_team_ids: [teamA1], p_all_teams: false }))) as { token: string }[];
  await ok(coachA1.client.rpc("accept_invitation", { p_token: inv[0].token }));

  playerA1 = await newPlayer(ownerA.client, orgA, teamA1, ownerA.id, "A1 Player");
  playerA2 = await newPlayer(ownerA.client, orgA, teamA2, ownerA.id, "A2 Player");
  ({ videoId: videoA1, path: pathA1 } = await uploadVideo(ownerA, teamA1, playerA1));
  ({ videoId: videoA2 } = await uploadVideo(ownerA, teamA2, playerA2));
  await probeAsWorker(videoA1);
  await probeAsWorker(videoA2);

  // Athlete linked to playerA1.
  const ainv = (await ok(ownerA.client.rpc("create_invitation", { p_org: orgA, p_email: athlete.email, p_role: "athlete", p_player: playerA1 }))) as { token: string }[];
  await ok(athlete.client.rpc("accept_invitation", { p_token: ainv[0].token }));
});

describe("tenant isolation", () => {
  it("another organisation's owner sees nothing from org A", async () => {
    for (const table of ["teams", "players", "videos", "practice_sessions", "review_items", "reports", "memberships"]) {
      const rows = (await ok(ownerB.client.from(table).select("id").eq("org_id", orgA))) as unknown[];
      expect(rows, table).toHaveLength(0);
    }
    await fails(ownerB.client.rpc("get_usage_summary", { p_org: orgA }), /Not allowed/);
    await fails(ownerB.client.rpc("request_analysis", { p_video: videoA1, p_start_s: 0, p_end_s: 5 }), /access denied/);
  });

  it("a user cannot insert a player into another organisation", async () => {
    await fails(ownerB.client.from("players").insert({ org_id: orgA, team_id: teamA1, display_name: "x", created_by: ownerB.id }));
  });

  it("anonymous clients see nothing", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
    for (const table of ["videos", "players", "reports", "organizations"]) {
      const { data, error } = await anon.from(table).select("id");
      // Either the role has no grant at all (preferred) or RLS returns no rows.
      expect(error?.code === "42501" || (data ?? []).length === 0, table).toBe(true);
    }
  });
});

describe("team scoping", () => {
  it("a coach assigned to one team cannot see another team's players or videos", async () => {
    const players = (await ok(coachA1.client.from("players").select("id").eq("org_id", orgA))) as { id: string }[];
    expect(players.map((p) => p.id)).toEqual([playerA1]);
    const videos = (await ok(coachA1.client.from("videos").select("id").eq("org_id", orgA))) as { id: string }[];
    expect(videos.map((v) => v.id)).toEqual([videoA1]);
    await fails(coachA1.client.rpc("review_upsert_item", { p_video: videoA2, p_item: null, p_start_s: 1, p_end_s: 2, p_event_type: "swing",
      p_activity_label: "swing", p_included: true, p_outcome: null, p_coach_note: null }), /access denied/);
  });

  it("a coach cannot create players on an unassigned team", async () => {
    await fails(coachA1.client.from("players").insert({ org_id: orgA, team_id: teamA2, display_name: "x", created_by: coachA1.id }));
  });

  it("a coach cannot invite other coaches", async () => {
    await fails(coachA1.client.rpc("create_invitation", { p_org: orgA, p_email: "x@example.test", p_role: "coach" }), /Only owners/);
  });
});

describe("athlete visibility", () => {
  it("sees only their own player record and nothing unpublished", async () => {
    const players = (await ok(athlete.client.from("players").select("id"))) as { id: string }[];
    expect(players.map((p) => p.id)).toEqual([playerA1]);
    expect(await ok(athlete.client.from("videos").select("id"))).toHaveLength(0);
    for (const t of ["review_items", "detected_events", "draft_observations", "analysis_runs", "analysis_raw_outputs", "review_observations", "processing_jobs", "usage_events"]) {
      expect(await ok(athlete.client.from(t).select("id")), t).toHaveLength(0);
    }
    const dl = await athlete.client.storage.from("videos").download(pathA1);
    expect(dl.error).not.toBeNull();
  });

  it("sees drafts never, published report and video after publishing, and loses access when revoked", async () => {
    await liveAnalysisWorker();
    await ok(ownerA.client.rpc("request_analysis", { p_video: videoA1, p_start_s: 0, p_end_s: 10 }));
    const job = await claim(["analyze"], videoA1);
    await ok(admin.rpc("complete_analysis", { p_job: job.id, p_fence: job.fence, p_result: analysisResult([{ start_s: 1, end_s: 2 }]) }));
    expect(await ok(athlete.client.from("review_items").select("id"))).toHaveLength(0);
    expect(await ok(athlete.client.from("detected_events").select("id"))).toHaveLength(0);

    await ok(ownerA.client.rpc("approve_review", { p_video: videoA1, p_feedback: "Nice work" }));
    expect(await ok(athlete.client.from("reports").select("id"))).toHaveLength(0); // approved but not published
    await fails(ownerA.client.rpc("publish_report", { p_video: videoA1 }), /Confirm that this recording/);
    await ok(ownerA.client.rpc("confirm_attribution", { p_video: videoA1 }));
    await ok(ownerA.client.rpc("publish_report", { p_video: videoA1 }));

    const reports = (await ok(athlete.client.from("reports").select("id, status, snapshot"))) as { status: string; snapshot: { statement: string } }[];
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe("published");
    expect(reports[0].snapshot.statement).toMatch(/assessable swings/);
    expect(await ok(athlete.client.from("videos").select("id"))).toHaveLength(1);
    expect(await ok(athlete.client.from("review_items").select("id"))).toHaveLength(0); // still no drafts
    const dl = await athlete.client.storage.from("videos").download(pathA1);
    expect(dl.error).toBeNull();

    // Another player's video stays hidden.
    expect(((await ok(athlete.client.from("videos").select("id"))) as { id: string }[]).map((v) => v.id)).not.toContain(videoA2);

    const link = (await ok(admin.from("athlete_links").select("id").eq("user_id", athlete.id).single())) as { id: string };
    await ok(ownerA.client.rpc("revoke_athlete_link", { p_link: link.id }));
    expect(await ok(athlete.client.from("reports").select("id"))).toHaveLength(0);
    expect(await ok(athlete.client.from("videos").select("id"))).toHaveLength(0);
  });
});

describe("revoked staff", () => {
  it("a removed coach immediately loses access", async () => {
    const m = (await ok(admin.from("memberships").select("id").eq("user_id", coachA1.id).eq("org_id", orgA).single())) as { id: string };
    expect(await ok(coachA1.client.from("videos").select("id").eq("org_id", orgA))).not.toHaveLength(0);
    await ok(ownerA.client.rpc("remove_member", { p_membership: m.id }));
    expect(await ok(coachA1.client.from("videos").select("id").eq("org_id", orgA))).toHaveLength(0);
    expect(await ok(coachA1.client.from("players").select("id").eq("org_id", orgA))).toHaveLength(0);
  });
});

describe("storage policies", () => {
  it("cannot read another org's object or write outside an authorised pending path", async () => {
    expect((await ownerB.client.storage.from("videos").download(pathA1)).error).not.toBeNull();
    const forged = `${orgA}/${crypto.randomUUID()}/original.mp4`;
    expect((await ownerB.client.storage.from("videos").upload(forged, SAMPLE, { contentType: "video/mp4" })).error).not.toBeNull();
    const ownForged = `${orgB}/${crypto.randomUUID()}/original.mp4`;
    expect((await ownerB.client.storage.from("videos").upload(ownForged, SAMPLE, { contentType: "video/mp4" })).error).not.toBeNull();
  });

  it("cannot overwrite an original after finalisation", async () => {
    const res = await ownerA.client.storage.from("videos").upload(pathA1, SAMPLE, { contentType: "video/mp4", upsert: true });
    expect(res.error).not.toBeNull();
  });

  it("finalising without an uploaded object fails and enqueues nothing", async () => {
    const rows = (await ok(ownerA.client.rpc("create_video_upload", { p_team: teamA1, p_drill_type: "gym_test", p_filename: "x.mov",
      p_size_bytes: 1000, p_container_ext: "mov", p_player: playerA1 }))) as { video_id: string }[];
    await fails(ownerA.client.rpc("finalize_video_upload", { p_video: rows[0].video_id }), /Upload not found/);
    expect(await ok(admin.from("processing_jobs").select("id").eq("video_id", rows[0].video_id))).toHaveLength(0);
  });

  it("rejects oversized declarations and unsupported containers", async () => {
    await fails(ownerA.client.rpc("create_video_upload", { p_team: teamA1, p_drill_type: "gym_test", p_filename: "x.mp4",
      p_size_bytes: 600 * 1024 * 1024, p_container_ext: "mp4", p_player: playerA1 }), /upload limit/);
    await fails(ownerA.client.rpc("create_video_upload", { p_team: teamA1, p_drill_type: "gym_test", p_filename: "x.avi",
      p_size_bytes: 1000, p_container_ext: "avi", p_player: playerA1 }), /MP4 and MOV/);
    await fails(ownerA.client.rpc("create_video_upload", { p_team: teamA1, p_drill_type: "gym_test", p_filename: "x.mp4",
      p_size_bytes: 1000, p_container_ext: "mp4", p_player: null }), /unassigned/);
  });
});

describe("invitations", () => {
  it("binds to the invited email, expires, is single-use and revocable", async () => {
    const target = await newUser("invitee");
    const inv = (await ok(ownerA.client.rpc("create_invitation", { p_org: orgA, p_email: target.email, p_role: "athlete", p_player: playerA2 }))) as { invitation_id: string; token: string }[];
    await fails(outsider.client.rpc("accept_invitation", { p_token: inv[0].token }), /different email/);
    await fails(target.client.rpc("accept_invitation", { p_token: "not-a-real-token" }), /not found/);

    await ok(admin.from("invitations").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", inv[0].invitation_id));
    await fails(target.client.rpc("accept_invitation", { p_token: inv[0].token }), /expired/);

    const inv2 = (await ok(ownerA.client.rpc("create_invitation", { p_org: orgA, p_email: target.email, p_role: "athlete", p_player: playerA2 }))) as { invitation_id: string; token: string }[];
    await ok(target.client.rpc("accept_invitation", { p_token: inv2[0].token }));
    await fails(target.client.rpc("accept_invitation", { p_token: inv2[0].token }), /already been used/);

    const inv3 = (await ok(ownerA.client.rpc("create_invitation", { p_org: orgA, p_email: outsider.email, p_role: "athlete", p_player: playerA2 }))) as { invitation_id: string; token: string }[];
    await ok(ownerA.client.rpc("revoke_invitation", { p_invitation: inv3[0].invitation_id }));
    await fails(outsider.client.rpc("accept_invitation", { p_token: inv3[0].token }), /revoked/);
  });

  it("tokens are stored hashed", async () => {
    const inv = (await ok(ownerA.client.rpc("create_invitation", { p_org: orgA, p_email: "hash@example.test", p_role: "athlete", p_player: playerA1 }))) as { invitation_id: string; token: string }[];
    const row = (await ok(admin.from("invitations").select("token_hash").eq("id", inv[0].invitation_id).single())) as { token_hash: string };
    expect(row.token_hash).not.toContain(inv[0].token);
    expect(row.token_hash).toHaveLength(64);
  });
});
