// Queue leases, fencing, retries, cancellation, deletion during processing, quotas and accounting.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, analysisResult, claim, fails, grantPlan, liveAnalysisWorker, newOrg, newPlayer, newUser, ok, probeAsWorker, uploadVideo, type TestUser } from "./helpers";

let owner: TestUser;
let orgId: string, teamId: string, playerId: string;

async function readyVideo(duration = 20) {
  const { videoId } = await uploadVideo(owner, teamId, playerId);
  await probeAsWorker(videoId, duration);
  return videoId;
}
const jobOf = async (id: string) => (await ok(admin.from("processing_jobs").select("*").eq("id", id).single())) as Record<string, unknown>;
const reservationOf = async (job: string) => (await ok(admin.from("usage_reservations").select("*").eq("job_id", job).single())) as Record<string, unknown>;

beforeAll(async () => {
  owner = await newUser("queue-owner");
  ({ orgId, teamId } = await newOrg(owner, "Queue Org"));
  playerId = await newPlayer(owner.client, orgId, teamId, owner.id);
  await grantPlan(orgId, "founding_pilot");
  await liveAnalysisWorker();
});

describe("worker RPCs", () => {
  it("are not callable by signed-in users", async () => {
    await fails(owner.client.rpc("claim_job", { p_worker: "x", p_kinds: ["analyze"], p_lease_seconds: 60 }));
    await fails(owner.client.rpc("complete_analysis", { p_job: crypto.randomUUID(), p_fence: 1, p_result: {} }));
    await fails(owner.client.rpc("worker_heartbeat", { p_worker: "x", p_version: "x", p_capabilities: { analysis: true } }));
  });
});

describe("analysis requests", () => {
  it("manual plans cannot request automated analysis", async () => {
    const other = await newUser("manual-owner");
    const o = await newOrg(other, "Manual Org");
    const p = await newPlayer(other.client, o.orgId, o.teamId, other.id);
    const { videoId } = await uploadVideo(other, o.teamId, p);
    await probeAsWorker(videoId);
    await fails(other.client.rpc("request_analysis", { p_video: videoId, p_start_s: 0, p_end_s: 5 }), /does not include automated analysis/);
  });

  it("enforces the 60 s excerpt limit and one active job per video", async () => {
    const v = await readyVideo(120);
    await fails(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 90 }), /60/);
    await ok(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 30 }));
    await fails(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 30, p_end_s: 60 }), /already queued or running/);
    await ok(owner.client.rpc("cancel_analysis", { p_video: v }));
  });

  it("requires a live analysis-capable worker", async () => {
    await admin.from("worker_heartbeats").update({ last_seen_at: new Date(Date.now() - 3600_000).toISOString() }).neq("worker_id", "");
    const v = await readyVideo();
    await fails(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 5 }), /no analysis worker/);
    await liveAnalysisWorker();
  });
});

describe("leases and fencing", () => {
  it("a stale worker cannot complete after its lease expired and the job was reclaimed", async () => {
    const v = await readyVideo();
    const jobId = (await ok(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 10 }))) as string;
    const first = await claim(["analyze"], v, "worker-1");
    expect(first.id).toBe(jobId);

    await admin.from("processing_jobs").update({ lease_expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", jobId);
    await ok(admin.rpc("claim_job", { p_worker: "noop", p_kinds: ["none"], p_lease_seconds: 60 })); // runs expiry
    expect((await jobOf(jobId)).status).toBe("queued");
    await admin.from("processing_jobs").update({ run_after: new Date().toISOString() }).eq("id", jobId);
    const second = await claim(["analyze"], v, "worker-2");
    expect(second.fence).toBeGreaterThan(first.fence);
    expect(second.attempt).toBe(2);

    expect(await ok(admin.rpc("heartbeat_job", { p_job: jobId, p_fence: first.fence, p_lease_seconds: 60 }))).toBe(false);
    expect(await ok(admin.rpc("complete_analysis", { p_job: jobId, p_fence: first.fence, p_result: analysisResult([{ start_s: 1, end_s: 2 }]) }))).toBe("stale");
    expect(await ok(admin.rpc("fail_job", { p_job: jobId, p_fence: first.fence, p_error: "x", p_retryable: true }))).toBe("stale");
    expect(await ok(admin.rpc("heartbeat_job", { p_job: jobId, p_fence: second.fence, p_lease_seconds: 60 }))).toBe(true);
    expect(await ok(admin.rpc("complete_analysis", { p_job: jobId, p_fence: second.fence, p_result: analysisResult([{ start_s: 1, end_s: 2 }, { start_s: 4, end_s: 5 }]) }))).toBe("completed");
    // Replays are harmless.
    expect(await ok(admin.rpc("complete_analysis", { p_job: jobId, p_fence: second.fence, p_result: analysisResult([]) }))).toBe("stale");

    const runs = (await ok(admin.from("analysis_runs").select("id").eq("video_id", v))) as unknown[];
    expect(runs).toHaveLength(1);
    const items = (await ok(admin.from("review_items").select("id").eq("video_id", v))) as unknown[];
    expect(items).toHaveLength(2);
    expect((await reservationOf(jobId)).status).toBe("settled");
    const billed = (await ok(admin.from("usage_events").select("quantity").eq("job_id", jobId).eq("kind", "analysis_seconds"))) as { quantity: number }[];
    expect(billed).toHaveLength(1);
    expect(Number(billed[0].quantity)).toBe(10);
  });

  it("rejects results that fall outside the analysed range", async () => {
    const v = await readyVideo();
    const jobId = (await ok(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 5 }))) as string;
    const job = await claim(["analyze"], v);
    await fails(admin.rpc("complete_analysis", { p_job: jobId, p_fence: job.fence, p_result: analysisResult([{ start_s: 7, end_s: 8 }], [0, 5]) }), /outside analysed range/);
    await fails(admin.rpc("complete_analysis", { p_job: jobId, p_fence: job.fence, p_result: analysisResult([{ start_s: 1, end_s: 2, suggested_outcome: "target_hit" }], [0, 5]) }));
    expect(await ok(admin.from("analysis_runs").select("id").eq("video_id", v))).toHaveLength(0);
  });
});

describe("retries and failure", () => {
  it("retries with backoff, then fails and releases the reservation", async () => {
    const v = await readyVideo();
    const jobId = (await ok(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 10 }))) as string;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await claim(["analyze"], v);
      expect(job.attempt).toBe(attempt);
      const outcome = await ok(admin.rpc("fail_job", { p_job: jobId, p_fence: job.fence, p_error: "provider 529", p_retryable: true, p_user_message: "Provider busy" }));
      if (attempt < 3) {
        expect(outcome).toBe("retry_scheduled");
        const row = await jobOf(jobId);
        expect(new Date(row.run_after as string).getTime()).toBeGreaterThan(Date.now() + 20_000);
        await admin.from("processing_jobs").update({ run_after: new Date().toISOString() }).eq("id", jobId);
      } else {
        expect(outcome).toBe("failed");
      }
    }
    expect((await reservationOf(jobId)).status).toBe("released");
    const video = (await ok(admin.from("videos").select("status, status_detail").eq("id", v).single())) as { status: string; status_detail: string };
    expect(video.status).toBe("failed");
    expect(video.status_detail).toBe("Provider busy");
    expect(await ok(admin.from("usage_events").select("id").eq("job_id", jobId).eq("kind", "analysis_seconds"))).toHaveLength(0);
  });

  it("non-retryable failures fail immediately", async () => {
    const v = await readyVideo();
    const jobId = (await ok(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 10 }))) as string;
    const job = await claim(["analyze"], v);
    expect(await ok(admin.rpc("fail_job", { p_job: jobId, p_fence: job.fence, p_error: "invalid output", p_retryable: false }))).toBe("failed");
  });
});

describe("cancellation and deletion", () => {
  it("cancelling releases the reservation and fences out the worker", async () => {
    const v = await readyVideo();
    const jobId = (await ok(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 10 }))) as string;
    const job = await claim(["analyze"], v);
    await ok(owner.client.rpc("cancel_analysis", { p_video: v }));
    expect(await ok(admin.rpc("heartbeat_job", { p_job: jobId, p_fence: job.fence, p_lease_seconds: 60 }))).toBe(false);
    expect(await ok(admin.rpc("complete_analysis", { p_job: jobId, p_fence: job.fence, p_result: analysisResult([]) }))).toBe("stale");
    expect((await reservationOf(jobId)).status).toBe("released");
  });

  it("deleting a video during processing stops the job, retracts reports and enqueues a purge", async () => {
    const v = await readyVideo();
    const jobId = (await ok(owner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 10 }))) as string;
    const job = await claim(["analyze"], v);
    await ok(owner.client.rpc("delete_video", { p_video: v }));
    expect(await ok(admin.rpc("heartbeat_job", { p_job: jobId, p_fence: job.fence, p_lease_seconds: 60 }))).toBe(false);
    expect(await ok(admin.rpc("complete_analysis", { p_job: jobId, p_fence: job.fence, p_result: analysisResult([{ start_s: 1, end_s: 2 }]) }))).toBe("stale");
    expect((await reservationOf(jobId)).status).toBe("released");
    expect(await ok(owner.client.from("videos").select("id").eq("id", v))).toHaveLength(0);

    const purge = await claim(["purge"], v);
    expect(purge.kind).toBe("purge");
    expect(await ok(admin.rpc("complete_purge", { p_job: purge.id, p_fence: purge.fence, p_objects_removed: 1 }))).toBe("purged");
    const row = (await ok(admin.from("videos").select("purged_at, original_filename, sha256").eq("id", v).single())) as Record<string, unknown>;
    expect(row.purged_at).not.toBeNull();
    expect(row.original_filename).toBeNull();
  });
});

describe("quota", () => {
  it("concurrent requests cannot exceed the monthly allowance", async () => {
    await admin.from("plans").upsert({ code: "test_tiny", name: "Test tiny", description: "integration test", max_teams: 1, max_coaches: 1,
      max_players: 30, analysis_minutes_per_month: 1, retained_video_minutes: 600, self_serve: false });
    const tinyOwner = await newUser("tiny");
    const o = await newOrg(tinyOwner, "Tiny Org");
    const p = await newPlayer(tinyOwner.client, o.orgId, o.teamId, tinyOwner.id);
    await admin.from("entitlements").update({ status: "superseded" }).eq("org_id", o.orgId).eq("status", "active");
    await ok(admin.from("entitlements").insert({ org_id: o.orgId, plan_code: "test_tiny", source: "manual", note: "test" }));
    const vids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { videoId } = await uploadVideo(tinyOwner, o.teamId, p);
      await probeAsWorker(videoId, 60);
      vids.push(videoId);
    }
    const results = await Promise.all(vids.map((v) => tinyOwner.client.rpc("request_analysis", { p_video: v, p_start_s: 0, p_end_s: 40 })));
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.filter((r) => r.error && /allowance reached/.test(r.error.message))).toHaveLength(2);
    const usage = (await ok(tinyOwner.client.rpc("get_usage_summary", { p_org: o.orgId }))) as Record<string, number>;
    expect(Number(usage.analysis_seconds_reserved)).toBe(40);
  });
});
