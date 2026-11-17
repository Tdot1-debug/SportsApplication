import { notFound } from "next/navigation";
import { ReviewWorkspace, type ReviewData } from "@/components/review/ReviewWorkspace";
import { requireStaffContext } from "@/lib/auth";

export const metadata = { title: "Review" };

export default async function VideoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, membership, user } = await requireStaffContext();
  const { data: video } = await supabase.from("videos").select("*, teams!videos_team_id_fkey(name)").eq("id", id).maybeSingle();
  if (!video || video.org_id !== membership.org_id) notFound();

  const [items, observations, runs, jobs, reports, players, sessions, available, cfg] = await Promise.all([
    supabase.from("review_items").select("*").eq("video_id", id).eq("generation", video.current_generation).order("start_s"),
    supabase.from("review_observations").select("*").eq("video_id", id).eq("generation", video.current_generation).order("t_start_s"),
    supabase.from("analysis_runs").select("id, generation, status, provider, model, prompt_version, analysis_version, registry_version, activity_id, range_start_s, range_end_s, extraction_settings, abstentions, limitations, input_tokens, output_tokens, provider_requests, processing_ms, estimated_cost_usd, created_at")
      .eq("video_id", id).order("created_at", { ascending: false }).limit(5),
    supabase.from("processing_jobs").select("id, kind, status, attempts, max_attempts, last_error, created_at, finished_at, request_kind").eq("video_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("reports").select("id, version, status, approved_at, published_at, coach_feedback, snapshot, review_kind").eq("video_id", id).order("version", { ascending: false }),
    supabase.from("players").select("id, display_name, self_user_id").eq("team_id", video.team_id).is("archived_at", null).order("display_name"),
    supabase.from("practice_sessions").select("id, title").eq("team_id", video.team_id).order("session_date", { ascending: false }).limit(50),
    supabase.rpc("analysis_available"),
    supabase.from("app_config").select("key, value").in("key", ["max_excerpt_seconds"]),
  ]);

  const currentRun = (runs.data ?? []).find((r) => r.generation === video.current_generation) ?? null;
  const [events, drafts] = currentRun
    ? await Promise.all([
        supabase.from("detected_events").select("id, visibility, evidence, abstention_reason, suggested_outcome, source_windows").eq("run_id", currentRun.id),
        supabase.from("draft_observations").select("id, category, evidence, limitations, review_questions").eq("run_id", currentRun.id),
      ])
    : [{ data: [] }, { data: [] }];

  const data: ReviewData = {
    video: video as unknown as ReviewData["video"],
    teamName: (video.teams as unknown as { name: string })?.name ?? "",
    items: (items.data ?? []) as ReviewData["items"],
    observations: (observations.data ?? []) as ReviewData["observations"],
    runs: (runs.data ?? []) as unknown as ReviewData["runs"],
    currentRunId: currentRun?.id ?? null,
    events: (events.data ?? []) as unknown as ReviewData["events"],
    drafts: (drafts.data ?? []) as unknown as ReviewData["drafts"],
    jobs: (jobs.data ?? []) as ReviewData["jobs"],
    reports: (reports.data ?? []) as unknown as ReviewData["reports"],
    players: (players.data ?? []).map(({ id, display_name }) => ({ id, display_name })),
    selfReview: Boolean(video.player_id && (players.data ?? []).some((p) => p.id === video.player_id && p.self_user_id === user.id)),
    personal: membership.org_kind === "personal",
    sessions: sessions.data ?? [],
    analysisAvailable: Boolean(available.data),
    maxExcerpt: Number(cfg.data?.find((c) => c.key === "max_excerpt_seconds")?.value ?? 60),
    initialTime: sp.t ? Number(sp.t) : undefined,
  };
  return <ReviewWorkspace data={data} />;
}
