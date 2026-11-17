"""Worker configuration from environment variables. Secrets are never logged."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass, field


def _int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def _float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


# Published per-million-token prices used only for internal cost *estimates*. Override with env vars.
DEFAULT_RATES_USD_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5": (2.0, 10.0),
    # Gemini paid-tier list prices (ai.google.dev/gemini-api/docs/pricing, read 2026-11-17). The free tier costs
    # nothing but Google may use the content to improve its products; see docs/PROVIDERS.md.
    "gemini-3.5-flash": (1.50, 9.00),
    "gemini-3.1-flash-lite": (0.25, 1.50),
    "gemini-3-flash-preview": (0.50, 3.00),
}


@dataclass(frozen=True)
class SamplingConfig:
    fps: float
    window_s: float
    overlap_s: float
    max_frames_per_request: int
    long_edge_px: int


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_secret_key: str = field(repr=False)
    worker_id: str
    anthropic_api_key: str | None = field(repr=False, default=None)
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: str = "medium"
    anthropic_fallbacks: bool = True
    gemini_api_key: str | None = field(repr=False, default=None)
    gemini_model: str = "gemini-3.5-flash"
    analysis_provider: str = "anthropic"
    test_mode: bool = False
    session_review_file: str | None = None
    lease_seconds: int = 120
    poll_seconds: float = 3.0
    tmp_dir: str = "/tmp/smarvii-worker"
    ffmpeg_timeout_s: int = 600
    ffmpeg_cpu_seconds: int = 900
    ffmpeg_memory_bytes: int = 3 * 1024**3
    max_repair_attempts: int = 1
    max_failed_window_ratio: float = 0.34
    health_port: int | None = None
    input_usd_per_mtok: float | None = None
    output_usd_per_mtok: float | None = None
    gym: SamplingConfig = SamplingConfig(fps=4.0, window_s=12.0, overlap_s=3.0, max_frames_per_request=48, long_edge_px=768)
    softball: SamplingConfig = SamplingConfig(fps=10.0, window_s=4.8, overlap_s=1.2, max_frames_per_request=48, long_edge_px=768)

    @property
    def analysis_enabled(self) -> bool:
        if self.analysis_provider in ("mock", "session_review"):
            return self.test_mode
        if self.analysis_provider == "gemini":
            return bool(self.gemini_api_key)
        return self.analysis_provider == "anthropic" and bool(self.anthropic_api_key)

    def rates(self, model: str) -> tuple[float, float] | None:
        if self.input_usd_per_mtok is not None and self.output_usd_per_mtok is not None:
            return (self.input_usd_per_mtok, self.output_usd_per_mtok)
        return DEFAULT_RATES_USD_PER_MTOK.get(model)

    def sampling_for(self, template: str) -> SamplingConfig:
        # Gym and coach-described movements use the slower gym sampling; softball needs a higher frame rate.
        return self.gym if template in ("gym_test", "general_movement") else self.softball


def load_dotenv(path: str = ".env") -> None:
    """Read KEY=VALUE lines from a local .env file (development convenience; works on Windows too).

    Variables already set in the environment win, so hosted deployments are unaffected."""
    try:
        lines = open(path, encoding="utf-8").read().splitlines()  # noqa: SIM115
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def load_config(require_supabase: bool = True) -> Config:
    load_dotenv()
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SECRET_KEY", "")
    if require_supabase and (not url or not key):
        raise SystemExit("SUPABASE_URL and SUPABASE_SECRET_KEY must be set for the worker")
    port = os.environ.get("PORT") or os.environ.get("HEALTH_PORT")
    return Config(
        supabase_url=url,
        supabase_secret_key=key,
        worker_id=os.environ.get("WORKER_ID") or f"{socket.gethostname()}-{os.getpid()}",
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY") or None,
        anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-opus-5-5"),
        anthropic_effort=os.environ.get("ANTHROPIC_EFFORT", "medium"),
        anthropic_fallbacks=_bool("ANTHROPIC_FALLBACKS", True),
        gemini_api_key=os.environ.get("GEMINI_API_KEY") or None,
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-3.5-flash"),
        analysis_provider=os.environ.get("ANALYSIS_PROVIDER", "anthropic"),
        test_mode=_bool("SMARVII_TEST_MODE"),
        session_review_file=os.environ.get("SESSION_REVIEW_FILE") or None,
        lease_seconds=_int("JOB_LEASE_SECONDS", 120),
        poll_seconds=_float("POLL_SECONDS", 3.0),
        tmp_dir=os.environ.get("WORKER_TMP_DIR", "/tmp/smarvii-worker"),
        ffmpeg_timeout_s=_int("FFMPEG_TIMEOUT_SECONDS", 600),
        health_port=int(port) if port else None,
        input_usd_per_mtok=float(os.environ["PROVIDER_INPUT_USD_PER_MTOK"]) if os.environ.get("PROVIDER_INPUT_USD_PER_MTOK") else None,
        output_usd_per_mtok=float(os.environ["PROVIDER_OUTPUT_USD_PER_MTOK"]) if os.environ.get("PROVIDER_OUTPUT_USD_PER_MTOK") else None,
        gym=SamplingConfig(
            fps=_float("GYM_SAMPLE_FPS", 4.0),
            window_s=_float("GYM_WINDOW_SECONDS", 12.0),
            overlap_s=_float("GYM_OVERLAP_SECONDS", 3.0),
            max_frames_per_request=_int("MAX_FRAMES_PER_REQUEST", 48),
            long_edge_px=_int("FRAME_LONG_EDGE_PX", 768),
        ),
        softball=SamplingConfig(
            fps=_float("SOFTBALL_SAMPLE_FPS", 10.0),
            window_s=_float("SOFTBALL_WINDOW_SECONDS", 4.8),
            overlap_s=_float("SOFTBALL_OVERLAP_SECONDS", 1.2),
            max_frames_per_request=_int("MAX_FRAMES_PER_REQUEST", 48),
            long_edge_px=_int("FRAME_LONG_EDGE_PX", 768),
        ),
    )
