// Organisation, personal-workspace and account deletion against the real local stack. Storage purges run
// through the same worker RPCs the Python worker uses (claim_job -> storage remove -> complete_purge).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, claim, fails, grantPlan, newOrg, newPlayer, newUser, ok, probeAsWorker, uploadVideo, type TestUser } from "./helpers";

async function purgeAsWorker(videoId: string) {
  const job = await claim(["purge"], videoId);
  const prefix = String(job.payload.prefix);
  const listed = await admin.storage.from("videos").list(prefix.replace(/\/$/, ""));
  const paths = (listed.data ?? []).map((o) => `${prefix}${o.name}`);
  if (paths.length) await admin.storage.from("videos").remove(paths);
  await ok(admin.rpc("complete_purge", { p_job: job.id, p_fence: job.fence, p_objects_removed: paths.length }));
}

const count = async (table: string, col: string, val: string) =>
  ((await admin.from(table).select("*", { count: "exact", head: true }).eq(col, val)).count ?? 0);

describe("deleting a team organisation", () => {
  let owner: TestUser, coach: TestUser;
  let orgId: string, teamId: string, playerId: string, videoId: string, path: string;

  beforeAll(async () => {
    owner = await newUser("del-owner");
    coach = await newUser("del-coach");
    ({ orgId, teamId } = await newOrg(owner, "Delete Me FC"));
    await grantPlan(orgId);
    playerId = await newPlayer(owner.client, orgId, teamId, owner.id, "Jordan Example");
    await ok(admin.from("goals").insert({ org_id: orgId, player_id: playerId, sport: "softball", text: "Keep the hands inside", created_by: owner.id }));
    await ok(admin.from("practice_sessions").insert({ org_id: orgId, team_id: teamId, session_date: "2026-11-01", title: "Tuesday hitting", drill_type: "softball_hitting", notes: "Jordan was tired" }));
    await ok(owner.client.rpc("create_invitation", { p_org: orgId, p_email: "parent@example.test", p_role: "athlete", p_player: playerId }));
    await ok(owner.client.rpc("create_invitation", { p_org: orgId, p_email: coach.email, p_role: "coach", p_all_teams: true }));
    ({ videoId, path } = await uploadVideo(owner, teamId, playerId));
    await probeAsWorker(videoId, 10);
  });

  it("refuses a wrong confirmation and non-owners", async () => {
    await fails(owner.client.rpc("delete_organization", { p_org: orgId, p_confirm_name: "Delete Me" }), /exactly/);
    await fails(coach.client.rpc("delete_organization", { p_org: orgId, p_confirm_name: "Delete Me FC" }), /Only owners/);
  });

  it("removes names, goals, notes and invitation emails immediately, and queues the recording purge", async () => {
    await ok(owner.client.rpc("delete_organization", { p_org: orgId, p_confirm_name: "Delete Me FC" }));
    for (const t of ["players", "goals", "practice_sessions", "invitations", "athlete_links", "roster_entries", "reports"]) {
      expect(await count(t, "org_id", orgId), t).toBe(0);
    }
    const v = (await ok(admin.from("videos").select("deleted_at, player_id, original_filename").eq("id", videoId).single())) as Record<string, unknown>;
    expect(v.deleted_at).not.toBeNull();
    expect(v.player_id).toBeNull();
    expect(v.original_filename).toBeNull();
    const m = (await ok(admin.from("memberships").select("status").eq("org_id", orgId))) as { status: string }[];
    expect(m.every((x) => x.status === "revoked")).toBe(true);
    // The owner can no longer see the organisation.
    expect(await ok(owner.client.from("organizations").select("id").eq("id", orgId))).toEqual([]);
  });

  it("keeps the organisation row until storage is purged, then removes everything", async () => {
    await ok(admin.rpc("finalize_deleted_organizations"));
    expect(await count("organizations", "id", orgId)).toBe(1);
    await purgeAsWorker(videoId);
    const left = await admin.storage.from("videos").list(path.split("/").slice(0, 2).join("/"));
    expect(left.data ?? []).toEqual([]);
    await ok(admin.rpc("finalize_deleted_organizations"));
    for (const t of ["organizations"]) expect(await count(t, "id", orgId)).toBe(0);
    for (const t of ["videos", "teams", "memberships", "audit_events", "processing_jobs", "entitlements"]) {
      expect(await count(t, "org_id", orgId), t).toBe(0);
    }
    const log = (await ok(admin.from("deletion_log").select("subject_kind, org_kind").eq("subject_id", orgId))) as unknown[];
    expect(log).toEqual([{ subject_kind: "organization", org_kind: "team" }]);
  });

  it("is not readable by users", async () => {
    await fails(owner.client.from("deletion_log").select("id"), /permission denied/);
  });
});

describe("deleting an account", () => {
  it("refuses a wrong email and a sole owner of a team organisation", async () => {
    const u = await newUser("del-sole");
    await newOrg(u, "Only Owner FC");
    await fails(u.client.rpc("delete_my_account", { p_confirm_email: "someone@else.test" }), /email address exactly/);
    await fails(u.client.rpc("delete_my_account", { p_confirm_email: u.email }), /only owner of: Only Owner FC/);
  });

  it("deletes a personal workspace with the account, and the auth user can then be removed", async () => {
    const me = await newUser("del-personal");
    const orgId = (await ok(me.client.rpc("create_personal_workspace", {
      p_display_name: "Sam Example", p_sports: ["strength"], p_adult_confirmed: true, p_recording_attested: true,
      p_notice_accepted: true, p_goal: "Ten clean hinges",
    }))) as string;
    const teamId = ((await ok(me.client.from("teams").select("id").eq("org_id", orgId))) as { id: string }[])[0].id;
    const selfId = ((await ok(me.client.from("players").select("id").eq("org_id", orgId))) as { id: string }[])[0].id;
    const { videoId } = await uploadVideo(me, teamId, selfId, "gym_test");

    const res = (await ok(me.client.rpc("delete_my_account", { p_confirm_email: me.email.toUpperCase() }))) as Record<string, unknown>;
    expect(res.personal_workspaces_deleted).toBe(1);
    expect(await count("players", "org_id", orgId)).toBe(0);
    expect(await count("goals", "org_id", orgId)).toBe(0);
    const { error } = await admin.auth.admin.deleteUser(me.id);
    expect(error).toBeNull();

    await purgeAsWorker(videoId);
    await ok(admin.rpc("finalize_deleted_organizations"));
    expect(await count("organizations", "id", orgId)).toBe(0);
    expect(await count("deletion_log", "subject_id", me.id)).toBe(1);
  });

  it("lets a coach leave: the team keeps its recording, attributed to a deleted user", async () => {
    const owner = await newUser("del-team-owner");
    const coach = await newUser("del-team-coach");
    const { orgId, teamId } = await newOrg(owner, "Keeps Data FC");
    await grantPlan(orgId);
    const inv = (await ok(owner.client.rpc("create_invitation", { p_org: orgId, p_email: coach.email, p_role: "coach", p_all_teams: true }))) as { token: string }[];
    await ok(coach.client.rpc("accept_invitation", { p_token: inv[0].token }));
    const playerId = await newPlayer(owner.client, orgId, teamId, owner.id, "Riley Example");
    const { videoId } = await uploadVideo(coach, teamId, playerId);

    await ok(coach.client.rpc("delete_my_account", { p_confirm_email: coach.email }));
    const { error } = await admin.auth.admin.deleteUser(coach.id);
    expect(error).toBeNull();
    const v = (await ok(owner.client.from("videos").select("id, uploaded_by").eq("id", videoId).single())) as { uploaded_by: string | null };
    expect(v.uploaded_by).toBeNull();
    expect(await count("memberships", "user_id", coach.id)).toBe(0);
  });
});
