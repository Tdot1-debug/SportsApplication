"""Worker entry point: claim loop, worker heartbeat, retention sweep and a tiny health endpoint."""

from __future__ import annotations

import json
import logging
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from . import __version__
from .config import Config, load_config
from .jobs import run_job
from .supabase_api import SupabaseClient, SupabaseError

log = logging.getLogger("smarvii_worker")


class State:
    def __init__(self) -> None:
        self.last_loop = time.time()
        self.last_db_ok: float | None = None
        self.jobs_done = 0
        self.stopping = threading.Event()


def start_health_server(port: int, state: State, cfg: Config) -> None:
    class H(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            healthy = time.time() - state.last_loop < max(120, cfg.lease_seconds * 3)
            body = json.dumps(
                {
                    "ok": healthy,
                    "version": __version__,
                    "analysis_enabled": cfg.analysis_enabled,
                    "provider": cfg.analysis_provider if cfg.analysis_enabled else None,
                    "jobs_done": state.jobs_done,
                    "db_ok_age_s": None if state.last_db_ok is None else round(time.time() - state.last_db_ok),
                }
            ).encode()
            self.send_response(200 if healthy else 503)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: object) -> None:
            pass

    srv = ThreadingHTTPServer(("0.0.0.0", port), H)  # noqa: S104 - container health check
    threading.Thread(target=srv.serve_forever, name="health", daemon=True).start()
    log.info("health endpoint on :%d", port)


def capabilities(cfg: Config) -> dict:
    return {
        "analysis": cfg.analysis_enabled,
        "provider": {"mock": "mock-test", "session_review": "claude-session-review"}.get(cfg.analysis_provider, cfg.analysis_provider),
        "model": {"anthropic": cfg.anthropic_model, "gemini": cfg.gemini_model, "session_review": "manual-frame-review"}.get(
            cfg.analysis_provider, "mock-test-no-vision"
        ),
        "test_mode": cfg.test_mode,
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # request URLs are fine, but keep logs quiet
    cfg = load_config()
    if cfg.analysis_provider in ("mock", "session_review") and not cfg.test_mode:
        raise SystemExit(
            f"ANALYSIS_PROVIDER={cfg.analysis_provider} requires SMARVII_TEST_MODE=1 (never use the mock adapter in production)"
        )
    sb = SupabaseClient(cfg.supabase_url, cfg.supabase_secret_key)
    state = State()
    if cfg.health_port:
        start_health_server(cfg.health_port, state, cfg)

    def stop(*_: object) -> None:
        log.info("shutdown requested; finishing current job")
        state.stopping.set()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    kinds = ["purge", "probe"] + (["analyze"] if cfg.analysis_enabled else [])
    log.info("worker %s v%s starting; kinds=%s analysis=%s", cfg.worker_id, __version__, kinds, capabilities(cfg))
    last_beat = 0.0
    last_retention = 0.0
    last_finalize = 0.0
    while not state.stopping.is_set():
        state.last_loop = time.time()
        try:
            if time.time() - last_beat > 30:
                sb.rpc("worker_heartbeat", {"p_worker": cfg.worker_id, "p_version": __version__, "p_capabilities": capabilities(cfg)})
                last_beat = time.time()
            if time.time() - last_retention > 3600:
                n = sb.rpc("enqueue_retention_purges", {})
                if n:
                    log.info("retention sweep queued %s deletions", n)
                last_retention = time.time()
            if time.time() - last_finalize > 300:
                # Deleted organisations are removed once every recording's storage is purged.
                n = sb.rpc("finalize_deleted_organizations", {})
                if n:
                    log.info("removed %s deleted organisations", n)
                last_finalize = time.time()
            job = sb.rpc("claim_job", {"p_worker": cfg.worker_id, "p_kinds": kinds, "p_lease_seconds": cfg.lease_seconds})
            state.last_db_ok = time.time()
        except SupabaseError as e:
            log.warning("database unavailable: %s", e)
            state.stopping.wait(min(30, cfg.poll_seconds * 4))
            continue
        if not job:
            state.stopping.wait(cfg.poll_seconds)
            continue
        run_job(sb, cfg, job)
        state.jobs_done += 1
    sb.close()
    log.info("worker stopped")


if __name__ == "__main__":
    main()
