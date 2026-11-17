// Integration helpers: real local Supabase (auth, PostgREST, storage). Nothing is mocked.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const PUB = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";
if (!PUB || !SECRET) throw new Error("Integration tests need NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY (local stack)");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const admin: SupabaseClient = createClient(URL, SECRET, opts);
export const SAMPLE = readFileSync(path.resolve(__dirname, "../../public/demo-media/sample.mp4"));

export type TestUser = { id: string; email: string; client: SupabaseClient };

export async function newUser(label: string, confirmed = true): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: confirmed });
  if (error) throw error;
  const client = createClient(URL, PUB, opts);
  if (confirmed) {
    const { error: e2 } = await client.auth.signInWithPassword({ email, password });
    if (e2) throw e2;
  }
  return { id: data.user!.id, email, client };
}

export async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`Unexpected error: ${JSON.stringify(error)}`);
  return data;
}

export async function fails(p: PromiseLike<{ error: unknown }>, match?: RegExp): Promise<string> {
  const { error } = await p;
  if (!error) throw new Error("Expected an error but the call succeeded");
  const msg = (error as { message?: string }).message ?? String(error);
  if (match && !match.test(msg)) throw new Error(`Error "${msg}" did not match ${match}`);
  return msg;
}

export async function newOrg(owner: TestUser, name = "Test Softball") {
  const orgId = await ok(owner.client.rpc("create_organization", {
    p_name: name, p_sport: "softball", p_team_name: "Varsity", p_recording_attested: true, p_notice_accepted: true,
  })) as string;
  const teams = await ok(owner.client.from("teams").select("id").eq("org_id", orgId));
  return { orgId, teamId: (teams as { id: string }[])[0].id };
}

export async function newPlayer(c: SupabaseClient, orgId: string, teamId: string, userId: string, name = "Player One") {
  const row = await ok(c.from("players").insert({ org_id: orgId, team_id: teamId, display_name: name, created_by: userId }).select("id").single());
  return (row as { id: string }).id;
}

/** Upload a real file through the user's own client and finalise it. */
export async function uploadVideo(u: TestUser, teamId: string, playerId: string | null, drill = "softball_hitting") {
  const rows = await ok(u.client.rpc("create_video_upload", {
    p_team: teamId, p_drill_type: drill, p_filename: "clip.mp4", p_size_bytes: SAMPLE.length, p_container_ext: "mp4",
    p_player: playerId, p_unassigned: playerId === null,
  })) as { video_id: string; storage_path: string }[];
  const { video_id, storage_path } = rows[0];
  const up = await u.client.storage.from("videos").upload(storage_path, SAMPLE, { contentType: "video/mp4" });
  if (up.error) throw up.error;
  await ok(u.client.rpc("finalize_video_upload", { p_video: video_id }));
  return { videoId: video_id, path: storage_path };
}

/** Simulate a completed probe through the worker RPCs (service role), as the real worker would. */
export async function probeAsWorker(videoId: string, durationS = 10) {
  const job = await claim(["probe"], videoId);
  const res = await ok(admin.rpc("complete_probe", {
    p_job: job.id, p_fence: job.fence, p_ok: true, p_reason: null,
    p_meta: { duration_s: durationS, width: 640, height: 480, display_width: 640, display_height: 480, fps: 30, rotation: 0,
              video_codec: "h264", has_audio: false, sha256: "a".repeat(64), size_bytes: SAMPLE.length, raw: {} },
    p_preview_path: null,
  }));
  return res;
}

export type ClaimedJob = { id: string; kind: string; fence: number; attempt: number; video: { id: string } | null; payload: Record<string, unknown> };

/**
 * Claim the queued job for `videoId`. Other runnable jobs of the same kinds (left by other tests) are parked
 * an hour into the future first so the claim is deterministic. Uses the real claim_job RPC.
 */
export async function claim(kinds: string[], videoId?: string, worker = "test-worker"): Promise<ClaimedJob> {
  if (videoId) {
    await admin.from("processing_jobs").update({ run_after: new Date(Date.now() + 3600_000).toISOString() })
      .eq("status", "queued").in("kind", kinds).neq("video_id", videoId);
    await admin.from("processing_jobs").update({ run_after: new Date().toISOString() })
      .eq("status", "queued").in("kind", kinds).eq("video_id", videoId);
  }
  const job = (await ok(admin.rpc("claim_job", { p_worker: worker, p_kinds: kinds, p_lease_seconds: 120 }))) as ClaimedJob | null;
  if (!job) throw new Error(`No ${kinds.join("/")} job available${videoId ? ` for ${videoId}` : ""}`);
  if (videoId && job.video?.id !== videoId && !(job.kind === "purge" && String(job.payload?.prefix ?? "").includes(videoId))) {
    throw new Error(`Claimed unexpected job ${job.id}`);
  }
  return job;
}

export async function liveAnalysisWorker() {
  await ok(admin.rpc("worker_heartbeat", { p_worker: "integration-tests", p_version: "test", p_capabilities: { analysis: true, provider: "mock-test" } }));
}

export async function grantPlan(orgId: string, plan: "evaluation" | "founding_pilot" | "standard" = "founding_pilot") {
  await ok(admin.from("entitlements").update({ status: "superseded" }).eq("org_id", orgId).eq("status", "active"));
  await ok(admin.from("entitlements").insert({ org_id: orgId, plan_code: plan, source: "manual", note: "integration test" }));
}

export async function completeAnalysisAsWorker(videoId: string, events: Record<string, unknown>[], range: [number, number] = [0, 10]) {
  const job = await claim(["analyze"], videoId);
  return { job, outcome: await ok(admin.rpc("complete_analysis", { p_job: job.id, p_fence: job.fence, p_result: analysisResult(events, range) })) };
}

export function analysisResult(events: Record<string, unknown>[], range: [number, number] = [0, 10]) {
  return {
    status: "succeeded", provider: "mock-test", model: "mock-test-no-vision", prompt_version: "test", analysis_version: "test",
    drill_template: "softball_hitting", video_sha256: "a".repeat(64), range_start_s: range[0], range_end_s: range[1],
    extraction_settings: {}, validated_output: {}, abstentions: [], limitations: [], input_tokens: 0, output_tokens: 0,
    provider_requests: 1, processing_ms: 1, estimated_cost_usd: 0,
    events: events.map((e, i) => ({ seq: i + 1, event_type: "swing", activity_label: "swing", visibility: "clear",
      suggested_outcome: "unclear", evidence: "MOCK TEST OUTPUT", abstention_reason: null, source_windows: [0], ...e })),
    observations: [],
  };
}
