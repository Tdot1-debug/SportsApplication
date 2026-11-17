// One athlete record on several teams/seasons in one organisation, with team-scoped staff access.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, fails, grantPlan, newOrg, newPlayer, newUser, ok, uploadVideo, type TestUser } from "./helpers";

let owner: TestUser, coachB: TestUser, outsider: TestUser;
let orgId: string, teamA: string, teamB: string, playerId: string, otherOrg: string, otherTeam: string;

beforeAll(async () => {
  owner = await newUser("roster-owner");
  coachB = await newUser("roster-coachb");
  outsider = await newUser("roster-outsider");
  ({ orgId, teamId: teamA } = await newOrg(owner, "Two Teams Club"));
  // Every pilot plan allows one team, so the second team is created directly (as an operator would for a club).
  teamB = ((await ok(admin.from("teams").insert({ org_id: orgId, name: "U18", sport: "softball" }).select("id").single())) as { id: string }).id;
  await grantPlan(orgId); // founding pilot: 2 coaches
  playerId = await newPlayer(owner.client, orgId, teamA, owner.id, "Riley Two-Team");
  const inv = (await ok(owner.client.rpc("create_invitation", { p_org: orgId, p_email: coachB.email, p_role: "coach", p_team_ids: [teamB], p_all_teams: false }))) as { token: string }[];
  await ok(coachB.client.rpc("accept_invitation", { p_token: inv[0].token }));
  ({ orgId: otherOrg, teamId: otherTeam } = await newOrg(outsider, "Other Club"));
});

describe("roster entries and seasons", () => {
  it("backfills the primary team as a roster entry", async () => {
    const rows = (await ok(owner.client.from("roster_entries").select("team_id, ended_at").eq("player_id", playerId))) as { team_id: string }[];
    expect(rows.map((r) => r.team_id)).toEqual([teamA]);
  });

  it("a coach of another team cannot see the athlete until they are rostered there", async () => {
    expect(await ok(coachB.client.from("players").select("id").eq("id", playerId))).toEqual([]);
    const season = (await ok(owner.client.rpc("create_season", { p_org: orgId, p_name: "Spring 2027" }))) as string;
    await ok(owner.client.rpc("add_to_roster", { p_player: playerId, p_team: teamB, p_season: season }));
    expect(((await ok(coachB.client.from("players").select("id").eq("id", playerId))) as unknown[]).length).toBe(1);
    await fails(owner.client.rpc("add_to_roster", { p_player: playerId, p_team: teamB, p_season: season }), /Already on that team/);
  });

  it("uploads for the second team are visible to its coach, primary-team footage is not", async () => {
    const { videoId: bVideo } = await uploadVideo(coachB, teamB, playerId, "softball_hitting");
    const { videoId: aVideo } = await uploadVideo(owner, teamA, playerId, "softball_hitting");
    expect(((await ok(coachB.client.from("videos").select("id").eq("id", bVideo))) as unknown[]).length).toBe(1);
    expect(await ok(coachB.client.from("videos").select("id").eq("id", aVideo))).toEqual([]);
    // Both recordings belong to the same sporting record.
    const all = (await ok(owner.client.from("videos").select("id").eq("player_id", playerId))) as unknown[];
    expect(all.length).toBe(2);
  });

  it("cannot add across organisations or end the primary team", async () => {
    await fails(owner.client.rpc("add_to_roster", { p_player: playerId, p_team: otherTeam }), /do not have access/);
    await fails(outsider.client.rpc("add_to_roster", { p_player: playerId, p_team: otherTeam }), /Player not found/);
    const primary = (await ok(owner.client.from("roster_entries").select("id").eq("player_id", playerId).eq("team_id", teamA).single())) as { id: string };
    await fails(owner.client.rpc("end_roster_entry", { p_entry: primary.id }), /primary team/);
    await fails(coachB.client.rpc("create_season", { p_org: orgId, p_name: "x" }), /Only organisation owners/);
    expect(otherOrg).not.toBe(orgId);
  });

  it("ending the entry removes the second team's coach's access to the athlete", async () => {
    const e = (await ok(owner.client.from("roster_entries").select("id").eq("player_id", playerId).eq("team_id", teamB).is("ended_at", null).single())) as { id: string };
    await ok(owner.client.rpc("end_roster_entry", { p_entry: e.id }));
    expect(await ok(coachB.client.from("players").select("id").eq("id", playerId))).toEqual([]);
    await expect(uploadVideo(coachB, teamB, playerId, "softball_hitting")).rejects.toThrow(/not on this team/);
  });
});
