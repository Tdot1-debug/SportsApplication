"""Gemini adapter request/response mapping, against a local fake transport (no network, no key)."""

import json
from pathlib import Path

import httpx
import pytest

from smarvii_worker.analysis.adapter import Frame, GeminiAdapter, ProviderError, WindowRequest


def _req(tmp_path: Path, **kw) -> WindowRequest:
    img = tmp_path / "f.jpg"
    img.write_bytes(b"\xff\xd8\xff\xd9")
    return WindowRequest(
        template="gym_test",
        index=0,
        start_s=0.0,
        end_s=12.0,
        fps=4.0,
        frames=[Frame(img, 0.0), Frame(img, 0.25)],
        excerpt=(0.0, 12.0),
        context={},
        **kw,
    )


def _adapter(handler) -> tuple[GeminiAdapter, list[httpx.Request]]:
    seen: list[httpx.Request] = []

    def h(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    client = httpx.Client(transport=httpx.MockTransport(h), headers={"x-goog-api-key": "test-key"})
    return GeminiAdapter("test-key", "gemini-3.5-flash", client=client), seen


def _ok(text: str, finish: str = "STOP") -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "candidates": [{"content": {"parts": [{"text": "hidden", "thought": True}, {"text": text}]}, "finishReason": finish}],
            "usageMetadata": {"promptTokenCount": 1000, "candidatesTokenCount": 50, "thoughtsTokenCount": 25},
            "modelVersion": "gemini-3.5-flash-001",
            "responseId": "r1",
        },
    )


def test_request_shape_and_usage(tmp_path):
    a, seen = _adapter(lambda r: _ok('{"events": []}'))
    resp = a.analyse_window(_req(tmp_path))
    body = json.loads(seen[0].content)
    assert seen[0].url.path.endswith("/models/gemini-3.5-flash:generateContent")
    assert "key" not in str(seen[0].url)  # key only in the header
    parts = body["contents"][0]["parts"]
    assert sum("inlineData" in p for p in parts) == 2
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    assert body["generationConfig"]["responseJsonSchema"]["type"] == "object"
    assert resp.text == '{"events": []}'  # thought parts excluded
    assert resp.stop_reason == "end_turn"
    assert resp.usage["input_tokens"] == 1000 and resp.usage["output_tokens"] == 75
    assert resp.model == "gemini-3.5-flash-001"


def test_repair_appends_model_turn(tmp_path):
    a, seen = _adapter(lambda r: _ok("{}"))
    a.analyse_window(_req(tmp_path, repair_errors=["bad"], previous_text="{x"))
    roles = [c["role"] for c in json.loads(seen[0].content)["contents"]]
    assert roles == ["user", "model", "user"]


@pytest.mark.parametrize("finish,expected", [("MAX_TOKENS", "max_tokens"), ("SAFETY", "refusal")])
def test_finish_reasons(tmp_path, finish, expected):
    a, _ = _adapter(lambda r: _ok("{}", finish))
    resp = a.analyse_window(_req(tmp_path))
    assert resp.stop_reason == expected
    if expected == "refusal":
        assert resp.text is None


@pytest.mark.parametrize("status,retryable", [(429, True), (503, True), (400, False)])
def test_errors(tmp_path, status, retryable):
    a, _ = _adapter(lambda r: httpx.Response(status, json={"error": {"status": "X", "message": "nope"}}))
    with pytest.raises(ProviderError) as e:
        a.analyse_window(_req(tmp_path))
    assert e.value.retryable is retryable
    assert "test-key" not in str(e.value)
