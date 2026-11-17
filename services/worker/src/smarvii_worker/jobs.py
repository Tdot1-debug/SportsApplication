"""Job handlers: probe, analyze, purge.

Every write back to the database goes through a fenced RPC. A worker whose lease was lost (fence
bumped by expiry, cancellation or deletion) gets 'stale' back and its results are discarded.
"""

from __future__ import annotations

import logging
import shutil
import tempfile
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from . import media
from .analysis.adapter import Adapter, AnthropicAdapter, GeminiAdapter, MockTestAdapter, SessionReviewAdapter
from .analysis.pipeline import AnalysisFailed, CallRecord, Cancelled, analyse_excerpt
from .config import Config
from .supabase_api import SupabaseClient, SupabaseError

log = logging.getLogger(__name__)

TEMPLATES = {"gym_test", "general_movement", "softball_hitting", "softball_pitching"}


def make_adapter(cfg: Config) -> Adapter:
    if cfg.analysis_provider == "mock":
        if not cfg.test_mode:
            raise RuntimeError("The mock adapter is only available with SMARVII_TEST_MODE=1")
        return MockTestAdapter()
    if cfg.analysis_provider == "session_review":
        if not cfg.test_mode or not cfg.session_review_file:
            raise RuntimeError("The session-review adapter needs SMARVII_TEST_MODE=1 and SESSION_REVIEW_FILE")
        return SessionReviewAdapter(cfg.session_review_file)
    if cfg.analysis_provider == "anthropic":
        if not cfg.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        return AnthropicAdapter(cfg.anthropic_api_key, cfg.anthropic_model, cfg.anthropic_effort, cfg.anthropic_fallbacks)
    if cfg.analysis_provider == "gemini":
        if not cfg.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        return GeminiAdapter(cfg.gemini_api_key, cfg.gemini_model)
    raise RuntimeError(f"Unknown ANALYSIS_PROVIDER {cfg.analysis_provider!r}")


class LeaseKeeper:
    """Background lease renewal. Sets `cancel` when the job is no longer ours to finish."""

    def __init__(self, sb: SupabaseClient, job_id: str, fence: int, lease_seconds: int):
        self.sb, self.job_id, self.fence, self.lease = sb, job_id, fence, lease_seconds
        self.cancel = threading.Event()
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name=f"lease-{job_id[:8]}", daemon=True)

    def _run(self) -> None:
        interval = max(5.0, self.lease / 3)
        failures = 0
        while not self._stop.wait(interval):
            try:
                ok = self.sb.rpc("heartbeat_job", {"p_job": self.job_id, "p_fence": self.fence, "p_lease_seconds": self.lease})
                failures = 0
                if not ok:
                    log.info("job %s: lease lost or job cancelled; stopping", self.job_id)
                    self.cancel.set()
                    return
            except SupabaseError as e:
                failures += 1
                log.warning("job %s: heartbeat failed (%s)", self.job_id, e)
                if failures * interval >= self.lease:
                    self.cancel.set()
                    return

    def __enter__(self) -> LeaseKeeper:
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        self._thread.join(timeout=5)


@contextmanager
def work_dir(cfg: Config, job_id: str):
    base = Path(cfg.tmp_dir)
    base.mkdir(parents=True, exist_ok=True)
    d = Path(tempfile.mkdtemp(prefix=f"job-{job_id[:8]}-", dir=base))
    try:
        yield d
    finally:
        shutil.rmtree(d, ignore_errors=True)


def _fail(sb: SupabaseClient, job: dict[str, Any], error: str, retryable: bool, user_message: str | None = None) -> str:
    try:
        return sb.rpc(
            "fail_job",
            {
                "p_job": job["id"],
                "p_fence": job["fence"],
                "p_error": error[:2000],
                "p_retryable": retryable,
                "p_user_message": user_message,
            },
        )
    except SupabaseError as e:
        log.error("job %s: could not record failure (%s); the lease will expire and the job will be retried", job["id"], e)
        return "unrecorded"


def _download(sb: SupabaseClient, job: dict[str, Any], d: Path) -> Path:
    v = job["video"]
    ext = "mov" if v.get("container_ext") == "mov" else "mp4"
    dest = d / f"source.{ext}"  # worker-generated name; the user's filename is never used on disk
    max_bytes = int((job.get("limits") or {}).get("max_upload_bytes") or 500 * 1024 * 1024)
    sb.download(v["storage_path"], dest, max_bytes)
    return dest


# --------------------------------------------------------------------------- probe
def handle_probe(sb: SupabaseClient, cfg: Config, job: dict[str, Any]) -> str:
    v = job["video"]
    with LeaseKeeper(sb, job["id"], job["fence"], cfg.lease_seconds) as lease, work_dir(cfg, job["id"]) as d:
        try:
            src = _download(sb, job, d)
            pr = media.probe(src)
            media.verify_decodes(src, pr.duration_s)
            sha = media.sha256_file(src)
            meta = pr.as_meta(sha)
            preview_path = None
            if lease.cancel.is_set():
                return "cancelled"
            if media.needs_preview(pr):
                preview = d / "preview.mp4"
                media.make_preview(src, preview, timeout=cfg.ffmpeg_timeout_s)
                preview_path = f"{job['org_id']}/{v['id']}/preview.mp4"
                if lease.cancel.is_set():
                    return "cancelled"
                sb.upload(preview_path, preview, "video/mp4")
            return sb.rpc(
                "complete_probe",
                {
                    "p_job": job["id"],
                    "p_fence": job["fence"],
                    "p_ok": True,
                    "p_reason": None,
                    "p_meta": meta,
                    "p_preview_path": preview_path,
                },
            )
        except media.MediaError as e:
            return sb.rpc(
                "complete_probe",
                {"p_job": job["id"], "p_fence": job["fence"], "p_ok": False, "p_reason": str(e), "p_meta": {}, "p_preview_path": None},
            )
        except SupabaseError as e:
            return _fail(sb, job, f"probe storage/db error: {e}", e.retryable, "Could not read the uploaded file.")


# ------------------------------------------------------------------------- analyze
def handle_analyze(sb: SupabaseClient, cfg: Config, job: dict[str, Any], adapter: Adapter | None = None) -> str:
    v = job["video"]
    payload = job.get("payload") or {}
    template = payload.get("drill_template") or v.get("drill_type")
    if template not in TEMPLATES:
        return _fail(sb, job, f"unknown drill template {template!r}", False, "This video has no supported drill type.")
    if not cfg.analysis_enabled:
        return _fail(
            sb,
            job,
            "analysis provider not configured on this worker",
            True,
            "Automated analysis is not configured. Review the video manually.",
        )
    try:
        start_s = float(payload["start_s"])
        end_s = float(payload["end_s"])
    except (KeyError, TypeError, ValueError):
        return _fail(sb, job, "invalid excerpt payload", False, "The analysis request was invalid.")
    max_excerpt = float((job.get("limits") or {}).get("max_excerpt_seconds") or 60)
    duration = float(v.get("duration_s") or 0)
    end_s = min(end_s, duration)
    if not (0 <= start_s < end_s) or end_s - start_s > max_excerpt + 0.01:
        return _fail(sb, job, f"excerpt {start_s}-{end_s} outside limits", False, "The selected excerpt is outside the allowed range.")

    adapter = adapter or make_adapter(cfg)
    if template == "general_movement":
        context = {"movement_description": v.get("intended_target")}
    else:
        context = {"pitch_type": v.get("pitch_type"), "intended_target": v.get("intended_target")}

    def record(call: CallRecord) -> None:
        try:
            sb.rpc("record_provider_call", {"p_job": job["id"], "p_fence": job["fence"], "p_call": call.as_payload()})
        except SupabaseError as e:  # cost logging must not abort an otherwise valid run
            log.warning("job %s: could not record provider call (%s)", job["id"], e)

    with LeaseKeeper(sb, job["id"], job["fence"], cfg.lease_seconds) as lease, work_dir(cfg, job["id"]) as d:
        try:
            src = _download(sb, job, d)
            sha = media.sha256_file(src)
            if v.get("sha256") and sha != v["sha256"]:
                return _fail(
                    sb, job, "stored object hash differs from probe", False, "The stored video changed after upload checks. Re-upload it."
                )
            if hasattr(adapter, "bind_video"):
                adapter.bind_video(sha)
            result = analyse_excerpt(
                video_path=src,
                work_dir=d / "frames",
                template=template,
                start_s=start_s,
                end_s=end_s,
                source_fps=float(v["fps"]) if v.get("fps") else None,
                context=context,
                cfg=cfg,
                adapter=adapter,
                cancel=lease.cancel,
                record_call=record,
            )
            if lease.cancel.is_set():
                return "cancelled"
            result["video_sha256"] = sha
            return sb.rpc("complete_analysis", {"p_job": job["id"], "p_fence": job["fence"], "p_result": result})
        except Cancelled:
            log.info("job %s: cancelled during analysis", job["id"])
            return "cancelled"
        except AnalysisFailed as e:
            return _fail(sb, job, str(e), e.retryable, e.user_message)
        except media.MediaError as e:
            return _fail(sb, job, f"media: {e}", False, str(e))
        except SupabaseError as e:
            return _fail(sb, job, f"storage/db error: {e}", e.retryable, "A temporary storage error interrupted analysis.")


# --------------------------------------------------------------------------- purge
def handle_purge(sb: SupabaseClient, cfg: Config, job: dict[str, Any]) -> str:
    prefix = (job.get("payload") or {}).get("prefix", "")
    with LeaseKeeper(sb, job["id"], job["fence"], cfg.lease_seconds):
        try:
            paths = sb.list_prefix(prefix)
            removed = sb.remove(paths)
            return sb.rpc("complete_purge", {"p_job": job["id"], "p_fence": job["fence"], "p_objects_removed": removed})
        except SupabaseError as e:
            return _fail(sb, job, f"purge error: {e}", e.retryable)


HANDLERS = {"probe": handle_probe, "analyze": handle_analyze, "purge": handle_purge}


def run_job(sb: SupabaseClient, cfg: Config, job: dict[str, Any]) -> str:
    started = time.monotonic()
    handler = HANDLERS.get(job["kind"])
    if handler is None:
        return _fail(sb, job, f"unknown job kind {job['kind']}", False)
    try:
        outcome = handler(sb, cfg, job)
    except Exception as e:  # noqa: BLE001 - last-resort guard so one bad job never kills the worker
        log.exception("job %s (%s) crashed", job["id"], job["kind"])
        outcome = _fail(
            sb, job, f"unexpected worker error: {type(e).__name__}: {e}", True, "Processing hit an unexpected error. It will be retried."
        )
    log.info(
        "job %s kind=%s attempt=%s outcome=%s in %.1fs", job["id"], job["kind"], job.get("attempt"), outcome, time.monotonic() - started
    )
    return outcome
