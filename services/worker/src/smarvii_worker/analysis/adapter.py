"""Analysis provider adapters. The product data model depends only on `WindowRequest` -> `ProviderResponse`,
so another vision service or a specialised tracking model can be added without schema changes."""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from . import prompts
from .schema import json_schema


@dataclass
class Frame:
    path: Path
    t: float  # absolute source seconds


@dataclass
class WindowRequest:
    template: str
    index: int
    start_s: float
    end_s: float
    fps: float
    frames: list[Frame]
    excerpt: tuple[float, float]
    context: dict[str, Any]
    repair_errors: list[str] | None = None
    previous_text: str | None = None


@dataclass
class ProviderResponse:
    text: str | None
    stop_reason: str | None
    usage: dict[str, Any] = field(default_factory=dict)
    model: str = ""
    request_meta: dict[str, Any] = field(default_factory=dict)
    latency_ms: int = 0


class ProviderError(Exception):
    def __init__(self, message: str, retryable: bool):
        super().__init__(message)
        self.retryable = retryable


class Adapter(Protocol):
    name: str
    model: str

    def analyse_window(self, req: WindowRequest) -> ProviderResponse: ...


def build_content(req: WindowRequest) -> list[dict[str, Any]]:
    """Chronological, explicitly timestamped image sequence followed by the task instruction."""
    content: list[dict[str, Any]] = [
        {
            "type": "text",
            "text": prompts.window_header(
                req.template, req.index, req.start_s, req.end_s, len(req.frames), req.fps, req.excerpt, req.context
            ),
        }
    ]
    for i, f in enumerate(req.frames, 1):
        content.append({"type": "text", "text": f"Frame {i} at t={f.t:.3f}s"})
        content.append(
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": base64.standard_b64encode(f.path.read_bytes()).decode("ascii"),
                },
            }
        )
    content.append({"type": "text", "text": prompts.FINAL_INSTRUCTION})
    return content


class AnthropicAdapter:
    name = "anthropic"

    def __init__(self, api_key: str, model: str, effort: str = "medium", fallbacks: bool = True, timeout_s: float = 300.0):
        import anthropic

        self._anthropic = anthropic
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout_s, max_retries=2)
        self.model = model
        self.effort = effort
        self.fallbacks = fallbacks

    def analyse_window(self, req: WindowRequest) -> ProviderResponse:
        a = self._anthropic
        messages: list[dict[str, Any]] = [{"role": "user", "content": build_content(req)}]
        if req.repair_errors and req.previous_text is not None:
            messages.append({"role": "assistant", "content": req.previous_text})
            messages.append({"role": "user", "content": prompts.repair_prompt(req.repair_errors)})
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": 16000,
            "system": prompts.system_prompt(req.template),
            "messages": messages,
            "output_config": {"effort": self.effort, "format": {"type": "json_schema", "schema": json_schema()}},
        }
        started = time.monotonic()
        try:
            if self.fallbacks:
                resp = self.client.beta.messages.create(betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs)
            else:
                resp = self.client.messages.create(**kwargs)
        except a.RateLimitError as e:
            raise ProviderError(f"rate limited: {e}", retryable=True) from e
        except a.APIConnectionError as e:
            raise ProviderError(f"connection error: {e}", retryable=True) from e
        except a.InternalServerError as e:
            raise ProviderError(f"provider error: {e}", retryable=True) from e
        except a.APIStatusError as e:
            raise ProviderError(
                f"request rejected ({e.status_code}): {str(e)[:300]}", retryable=e.status_code in (408, 409, 429, 529)
            ) from e
        latency = int((time.monotonic() - started) * 1000)
        text = None
        if resp.stop_reason not in ("refusal",):
            text = next((b.text for b in resp.content if getattr(b, "type", "") == "text"), None)
        u = resp.usage
        usage = {
            "input_tokens": getattr(u, "input_tokens", 0) or 0,
            "output_tokens": getattr(u, "output_tokens", 0) or 0,
            "cache_read_input_tokens": getattr(u, "cache_read_input_tokens", 0) or 0,
            "cache_creation_input_tokens": getattr(u, "cache_creation_input_tokens", 0) or 0,
        }
        return ProviderResponse(
            text=text,
            stop_reason=resp.stop_reason,
            usage=usage,
            model=resp.model,
            latency_ms=latency,
            request_meta={
                "model": resp.model,
                "requested_model": self.model,
                "effort": self.effort,
                "frames": len(req.frames),
                "repair": bool(req.repair_errors),
                "message_id": resp.id,
            },
        )


def _gemini_parts(req: WindowRequest) -> list[dict[str, Any]]:
    """The same chronological, timestamped frame sequence as `build_content`, in Gemini's part format."""
    parts: list[dict[str, Any]] = []
    for block in build_content(req):
        if block["type"] == "text":
            parts.append({"text": block["text"]})
        else:
            src = block["source"]
            parts.append({"inlineData": {"mimeType": src["media_type"], "data": src["data"]}})
    return parts


# Gemini finish reasons mapped onto the stop reasons the pipeline already understands.
_GEMINI_STOP = {
    "STOP": "end_turn",
    "MAX_TOKENS": "max_tokens",
    "SAFETY": "refusal",
    "RECITATION": "refusal",
    "BLOCKLIST": "refusal",
    "PROHIBITED_CONTENT": "refusal",
    "SPII": "refusal",
    "IMAGE_SAFETY": "refusal",
}


class GeminiAdapter:
    """Google Gemini over the REST generateContent endpoint, with JSON-schema constrained output.

    Sends exactly the frames and prompts the Anthropic adapter sends, so evaluation runs are comparable.
    The API key travels only in the x-goog-api-key header and is never logged or stored with a run.
    """

    name = "gemini"
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(self, api_key: str, model: str, timeout_s: float = 300.0, client: Any = None):
        import httpx

        self._httpx = httpx
        self.model = model
        self._client = client or httpx.Client(timeout=timeout_s, headers={"x-goog-api-key": api_key})

    def analyse_window(self, req: WindowRequest) -> ProviderResponse:
        httpx = self._httpx
        contents: list[dict[str, Any]] = [{"role": "user", "parts": _gemini_parts(req)}]
        if req.repair_errors and req.previous_text is not None:
            contents.append({"role": "model", "parts": [{"text": req.previous_text}]})
            contents.append({"role": "user", "parts": [{"text": prompts.repair_prompt(req.repair_errors)}]})
        body = {
            "systemInstruction": {"parts": [{"text": prompts.system_prompt(req.template)}]},
            "contents": contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": json_schema(),
                "maxOutputTokens": 16000,
            },
        }
        started = time.monotonic()
        try:
            r = self._client.post(f"{self.BASE_URL}/models/{self.model}:generateContent", json=body)
        except httpx.TimeoutException as e:
            raise ProviderError(f"timeout: {type(e).__name__}", retryable=True) from e
        except httpx.HTTPError as e:
            raise ProviderError(f"connection error: {type(e).__name__}", retryable=True) from e
        latency = int((time.monotonic() - started) * 1000)
        if r.status_code != 200:
            try:
                err = r.json().get("error", {})
                detail = f"{err.get('status', '')}: {str(err.get('message', ''))[:300]}"
            except ValueError:
                detail = r.text[:300]
            raise ProviderError(f"request rejected ({r.status_code}) {detail}", retryable=r.status_code in (408, 429, 500, 502, 503, 504))
        data = r.json()
        cand = (data.get("candidates") or [{}])[0]
        finish = cand.get("finishReason")
        if data.get("promptFeedback", {}).get("blockReason"):
            stop = "refusal"
        else:
            stop = _GEMINI_STOP.get(finish or "", finish.lower() if finish else None)
        text = None
        if stop != "refusal":
            texts = [p["text"] for p in (cand.get("content") or {}).get("parts", []) if "text" in p and not p.get("thought")]
            text = "".join(texts) or None
        um = data.get("usageMetadata", {})
        usage = {
            "input_tokens": um.get("promptTokenCount", 0) or 0,
            # Thinking tokens are billed as output.
            "output_tokens": (um.get("candidatesTokenCount", 0) or 0) + (um.get("thoughtsTokenCount", 0) or 0),
            "cache_read_input_tokens": um.get("cachedContentTokenCount", 0) or 0,
            "cache_creation_input_tokens": 0,
        }
        served = data.get("modelVersion") or self.model
        return ProviderResponse(
            text=text,
            stop_reason=stop,
            usage=usage,
            model=served,
            latency_ms=latency,
            request_meta={
                "model": served,
                "requested_model": self.model,
                "frames": len(req.frames),
                "repair": bool(req.repair_errors),
                "finish_reason": finish,
                "response_id": data.get("responseId"),
            },
        )


class MockTestAdapter:
    """Deterministic adapter for explicitly mocked tests only (SMARVII_TEST_MODE=1, ANALYSIS_PROVIDER=mock).

    It does not look at the frames; it emits one clearly labelled placeholder event per window so the
    pipeline, queue and review UI can be exercised end-to-end. Runs are recorded with provider 'mock-test'.
    """

    name = "mock-test"
    model = "mock-test-no-vision"

    def analyse_window(self, req: WindowRequest) -> ProviderResponse:
        mid = (req.start_s + req.end_s) / 2
        etype = {"gym_test": "rep", "general_movement": "rep", "softball_hitting": "swing", "softball_pitching": "pitch"}[req.template]
        out = {
            "activity_segments": [],
            "events": [
                {
                    "start_s": round(mid - 0.5, 3),
                    "end_s": round(mid + 0.5, 3),
                    "event_type": etype,
                    "activity_label": {"rep": "unknown", "swing": "swing", "pitch": "pitch"}[etype],
                    "visibility": "partial",
                    "suggested_outcome": "unclear" if etype != "rep" else "none",
                    "abstention_reason": "none",
                    "starts_before_window": False,
                    "ends_after_window": False,
                    "evidence": "MOCK TEST OUTPUT - not derived from the video frames.",
                }
            ],
            "observations": [],
            "abstentions": [],
            "limitations": ["Mock test adapter: no real analysis performed."],
        }
        return ProviderResponse(
            text=json.dumps(out),
            stop_reason="end_turn",
            usage={"input_tokens": 0, "output_tokens": 0},
            model=self.model,
            request_meta={"model": self.model, "frames": len(req.frames)},
        )


class SessionReviewAdapter:
    """Replays an analysis written by hand in a Claude build session (test mode only).

    Used to demo the review workflow on real footage before an API key is configured. The file maps a
    video's sha256 to events Claude marked by viewing sampled frames. Runs are recorded with provider
    'claude-session-review' and the review screen labels them as not being a live API result.
    """

    name = "claude-session-review"
    model = "manual-frame-review"

    def __init__(self, path: str):
        self._data: dict[str, Any] = json.loads(Path(path).read_text())
        self._video: dict[str, Any] | None = None

    def bind_video(self, sha256: str) -> None:
        self._video = self._data.get(sha256)

    def analyse_window(self, req: WindowRequest) -> ProviderResponse:
        v = self._video or {"events": [], "observations": [], "abstentions": [], "limitations": []}

        def inside(a: float, b: float) -> bool:
            return a >= req.start_s and b <= req.end_s

        events = [
            {
                **{k: e[k] for k in ("start_s", "end_s", "event_type", "activity_label", "visibility", "evidence")},
                "suggested_outcome": "none",
                "abstention_reason": "none",
                "starts_before_window": False,
                "ends_after_window": False,
            }
            for e in v["events"]
            if inside(e["start_s"], e["end_s"])
        ]
        out = {
            "activity_segments": [],
            "events": events,
            "observations": [o for o in v["observations"] if inside(o["t_start_s"], o["t_end_s"])],
            "abstentions": [a for a in v["abstentions"] if inside(a["start_s"], a["end_s"])],
            "limitations": (v["limitations"] if self._video else ["No session review exists for this video."])
            + ["Analysed by Claude in the build session from sampled frames; not a live API run."],
        }
        return ProviderResponse(
            text=json.dumps(out),
            stop_reason="end_turn",
            usage={"input_tokens": 0, "output_tokens": 0},
            model=self.model,
            request_meta={"model": self.model, "frames": len(req.frames)},
        )
