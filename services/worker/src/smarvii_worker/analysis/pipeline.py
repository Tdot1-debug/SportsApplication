"""Excerpt analysis: sample frames per window, call the provider, validate, repair (bounded), dedupe."""

from __future__ import annotations

import json
import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .. import registry
from ..config import Config
from ..media import extract_frames
from . import prompts
from .adapter import Adapter, Frame, ProviderError, ProviderResponse, WindowRequest
from .schema import WindowOutput, validate_window
from .windows import Candidate, dedupe, plan_windows

log = logging.getLogger(__name__)


class Cancelled(Exception):
    pass


class AnalysisFailed(Exception):
    def __init__(self, message: str, retryable: bool, user_message: str):
        super().__init__(message)
        self.retryable = retryable
        self.user_message = user_message


@dataclass
class CallRecord:
    window_index: int
    attempt: int
    window_start_s: float
    window_end_s: float
    frame_timestamps: list[float]
    response: ProviderResponse | None
    validation_status: str
    validation_errors: list[str]
    estimated_cost_usd: float | None

    def as_payload(self) -> dict[str, Any]:
        r = self.response
        return {
            "window_index": self.window_index,
            "attempt": self.attempt,
            "window_start_s": self.window_start_s,
            "window_end_s": self.window_end_s,
            "frame_timestamps": self.frame_timestamps,
            "request_meta": (r.request_meta | {"latency_ms": r.latency_ms}) if r else {},
            "response_text": r.text if r else None,
            "stop_reason": r.stop_reason if r else None,
            "usage": r.usage if r else {},
            "validation_status": self.validation_status,
            "validation_errors": self.validation_errors[:30],
            "estimated_cost_usd": self.estimated_cost_usd,
        }


def estimate_cost(cfg: Config, model: str, usage: dict[str, Any]) -> float | None:
    rates = cfg.rates(model)
    if not rates:
        return None
    inp, out = rates
    return round((usage.get("input_tokens", 0) * inp + usage.get("output_tokens", 0) * out) / 1_000_000, 6)


def analyse_excerpt(
    *,
    video_path: Path,
    work_dir: Path,
    template: str,
    start_s: float,
    end_s: float,
    source_fps: float | None,
    context: dict[str, Any],
    cfg: Config,
    adapter: Adapter,
    cancel: threading.Event,
    record_call: Callable[[CallRecord], None],
) -> dict[str, Any]:
    started = time.monotonic()
    if not registry.can_analyse(template):
        raise AnalysisFailed(
            f"template {template!r} has no automated capability in registry {registry.registry_version()}",
            retryable=False,
            user_message="Automated analysis is not available for this activity yet. Review it manually.",
        )
    sampling = cfg.sampling_for(template)
    windows, fps = plan_windows(start_s, end_s, sampling, source_fps)
    limitations: list[str] = []
    if source_fps and fps < source_fps and template not in ("gym_test", "general_movement"):
        limitations.append(
            f"Frames were sampled at about {fps:g} per second from {source_fps:g} fps video; very fast moments such as ball contact or release can fall between frames."
        )
    if template in ("gym_test", "general_movement"):
        limitations.append(
            f"Frames sampled at about {fps:g} per second. Suitable for slower movements; rep boundaries are approximate to the nearest sampled frame."
        )

    candidates: list[Candidate] = []
    observations: list[dict[str, Any]] = []
    abstentions: list[dict[str, Any]] = []
    segments: list[dict[str, Any]] = []
    totals = {"input_tokens": 0, "output_tokens": 0, "requests": 0, "cost": 0.0, "cost_known": True}
    failed_windows = 0
    model_used = adapter.model

    for w in windows:
        if cancel.is_set():
            raise Cancelled()
        frames_dir = work_dir / f"w{w.index:03d}"
        extracted = extract_frames(
            video_path, frames_dir, w.start_s, w.end_s - w.start_s, fps, sampling.long_edge_px, timeout=cfg.ffmpeg_timeout_s
        )
        frames = [Frame(p, t) for p, t in extracted if t <= w.end_s + 0.01][: sampling.max_frames_per_request]
        win_end = max(w.end_s, frames[-1].t) if frames else w.end_s
        req = WindowRequest(template, w.index, w.start_s, win_end, fps, frames, (start_s, end_s), context)
        parsed: WindowOutput | None = None
        errors: list[str] = []
        attempt = 0
        while attempt <= cfg.max_repair_attempts:
            attempt += 1
            if cancel.is_set():
                raise Cancelled()
            try:
                resp = adapter.analyse_window(req)
            except ProviderError as e:
                record_call(CallRecord(w.index, attempt, w.start_s, win_end, [f.t for f in frames], None, "error", [str(e)], None))
                raise AnalysisFailed(str(e), e.retryable, "The analysis provider was unavailable. The job will retry automatically.") from e
            model_used = resp.model or model_used
            cost = estimate_cost(cfg, model_used, resp.usage)
            totals["requests"] += 1
            totals["input_tokens"] += int(resp.usage.get("input_tokens", 0))
            totals["output_tokens"] += int(resp.usage.get("output_tokens", 0))
            if cost is None:
                totals["cost_known"] = False
            else:
                totals["cost"] += cost
            if resp.stop_reason == "refusal" or resp.text is None:
                errors = [f"provider returned no usable output (stop_reason={resp.stop_reason})"]
                record_call(CallRecord(w.index, attempt, w.start_s, win_end, [f.t for f in frames], resp, "error", errors, cost))
                break
            if resp.stop_reason == "max_tokens":
                errors = ["output truncated at max_tokens"]
            try:
                raw = json.loads(resp.text)
                parsed, errs = validate_window(raw, template, w.start_s, win_end)
                errors = errors + errs if not parsed else []
            except json.JSONDecodeError as e:
                parsed, errors = None, [f"invalid JSON: {e}"]
            record_call(
                CallRecord(
                    w.index, attempt, w.start_s, win_end, [f.t for f in frames], resp, "valid" if parsed else "invalid", errors, cost
                )
            )
            if parsed:
                break
            req = WindowRequest(
                template, w.index, w.start_s, win_end, fps, frames, (start_s, end_s), context, repair_errors=errors, previous_text=resp.text
            )
        if not parsed:
            failed_windows += 1
            abstentions.append(
                {
                    "start_s": w.start_s,
                    "end_s": win_end,
                    "reason": "ambiguous_movement",
                    "detail": "This window's model output failed validation and was discarded.",
                }
            )
            continue
        for ev in parsed.events:
            candidates.append(
                Candidate(
                    start_s=ev.start_s,
                    end_s=ev.end_s,
                    event_type=ev.event_type,
                    activity_label=ev.activity_label,
                    visibility=ev.visibility,
                    suggested_outcome=None if ev.suggested_outcome == "none" else ev.suggested_outcome,
                    abstention_reason=None if ev.abstention_reason == "none" else ev.abstention_reason,
                    evidence=ev.evidence,
                    window=w.index,
                    win_start=w.start_s,
                    win_end=win_end,
                    truncated=ev.starts_before_window or ev.ends_after_window,
                )
            )
        for o in parsed.observations:
            observations.append(o.model_dump())
        for a in parsed.abstentions:
            # Overlapping windows can report the same abstention twice; keep one.
            if any(x["reason"] == a.reason and x["start_s"] < a.end_s and a.start_s < x["end_s"] for x in abstentions):
                continue
            abstentions.append(a.model_dump())
        for s in parsed.activity_segments:
            segments.append(s.model_dump() | {"window": w.index})
        for lim in parsed.limitations:
            if lim not in limitations:
                limitations.append(lim[:300])

    if failed_windows and failed_windows / len(windows) > cfg.max_failed_window_ratio:
        raise AnalysisFailed(
            f"{failed_windows}/{len(windows)} windows produced invalid output",
            retryable=False,
            user_message="The automated analysis produced output that failed validation. No allowance was charged; review manually or retry later.",
        )

    events = dedupe(candidates, start_s, end_s)
    # Observations: keep at most one per category per ~2 s, maximum 8.
    obs_kept: list[dict[str, Any]] = []
    for o in sorted(observations, key=lambda x: x["t_start_s"]):
        if any(k["category"] == o["category"] and abs(k["t_start_s"] - o["t_start_s"]) < 2.0 for k in obs_kept):
            continue
        o["t_start_s"] = max(start_s, min(o["t_start_s"], end_s))
        o["t_end_s"] = max(o["t_start_s"], min(o["t_end_s"], end_s))
        obs_kept.append(o)
    obs_kept = obs_kept[:8]
    for a in abstentions:
        a["start_s"] = max(start_s, min(a["start_s"], end_s))
        a["end_s"] = max(a["start_s"], min(a["end_s"], end_s))

    counted = [e for e in events if e.event_type in ("rep", "swing", "pitch")]
    status = "abstained" if not counted and abstentions else "succeeded"
    if failed_windows:
        limitations.append(f"{failed_windows} of {len(windows)} windows were discarded after failing validation.")
    return {
        "status": status,
        "provider": adapter.name,
        "model": model_used,
        "prompt_version": prompts.PROMPT_VERSION,
        "analysis_version": prompts.ANALYSIS_VERSION,
        "drill_template": template,
        "range_start_s": round(start_s, 3),
        "range_end_s": round(end_s, 3),
        "extraction_settings": {
            "fps": fps,
            "window_s": windows[0].end_s - windows[0].start_s,
            "overlap_s": sampling.overlap_s,
            "windows": len(windows),
            "long_edge_px": sampling.long_edge_px,
            "max_frames_per_request": sampling.max_frames_per_request,
            "source_fps": source_fps,
            "registry": registry.run_record(template),
        },
        "validated_output": {"segments": segments},
        "events": [
            {
                "seq": i + 1,
                "event_type": e.event_type,
                "activity_label": e.activity_label,
                "start_s": e.start_s,
                "end_s": e.end_s,
                "visibility": e.visibility,
                "suggested_outcome": e.suggested_outcome,
                "evidence": e.evidence,
                "abstention_reason": e.abstention_reason,
                "source_windows": e.source_windows,
            }
            for i, e in enumerate(events)
        ],
        "observations": [
            {
                "t_start_s": o["t_start_s"],
                "t_end_s": o["t_end_s"],
                "category": o["category"],
                "observation": o["observation"],
                "evidence": o["evidence"],
                "limitations": o["limitations"],
                "review_questions": o["review_questions"][:3],
            }
            for o in obs_kept
        ],
        "abstentions": abstentions[:40],
        "limitations": limitations[:12],
        "input_tokens": totals["input_tokens"],
        "output_tokens": totals["output_tokens"],
        "provider_requests": totals["requests"],
        "processing_ms": int((time.monotonic() - started) * 1000),
        "estimated_cost_usd": round(totals["cost"], 6) if totals["cost_known"] else None,
    }
