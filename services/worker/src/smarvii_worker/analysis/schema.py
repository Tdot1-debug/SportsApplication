"""Strict output schema for one analysis window, plus semantic validation.

The JSON schema is sent as the structured-output format; the Pydantic models re-validate every
response anyway, and `validate_window` applies checks a schema cannot express (time ranges,
template-specific outcomes, banned numeric measurements).
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

EventType = Literal["rep", "swing", "pitch", "setup", "transition", "other"]
Visibility = Literal["clear", "partial", "poor"]
Outcome = Literal["swing_miss", "foul", "fair_contact", "unclear", "target_hit", "target_missed", "none"]
Abstain = Literal[
    "occlusion",
    "blur",
    "cropped_body",
    "missing_ball",
    "missing_target",
    "ambiguous_movement",
    "insufficient_temporal_resolution",
    "none",
]
ActivityLabel = Literal["hinge", "lunge", "squat", "other_exercise", "swing", "pitch", "setup", "walking", "idle", "unknown"]
ObsCategory = Literal["stance", "stride", "balance", "finish", "setup", "hinge", "lunge", "posture", "other"]

TEMPLATE_OUTCOMES: dict[str, set[str]] = {
    "softball_hitting": {"swing_miss", "foul", "fair_contact", "unclear", "none"},
    "softball_pitching": {"target_hit", "target_missed", "unclear", "none"},
    "gym_test": {"none"},
    "general_movement": {"none"},
}
TEMPLATE_EVENT_TYPES: dict[str, set[str]] = {
    "softball_hitting": {"swing", "setup", "transition", "other"},
    "softball_pitching": {"pitch", "setup", "transition", "other"},
    "gym_test": {"rep", "setup", "transition", "other"},
    "general_movement": {"rep", "setup", "transition", "other"},
}


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Segment(_Strict):
    start_s: float
    end_s: float
    label: ActivityLabel
    note: str = Field(max_length=300)


class Event(_Strict):
    start_s: float
    end_s: float
    event_type: EventType
    activity_label: ActivityLabel
    visibility: Visibility
    suggested_outcome: Outcome
    abstention_reason: Abstain
    starts_before_window: bool
    ends_after_window: bool
    evidence: str = Field(min_length=3, max_length=400)


class Observation(_Strict):
    t_start_s: float
    t_end_s: float
    category: ObsCategory
    observation: str = Field(min_length=3, max_length=400)
    evidence: str = Field(min_length=3, max_length=400)
    limitations: str = Field(max_length=300)
    review_questions: list[str] = Field(max_length=3)


class Abstention(_Strict):
    start_s: float
    end_s: float
    reason: Abstain
    detail: str = Field(max_length=300)


class WindowOutput(_Strict):
    activity_segments: list[Segment] = Field(max_length=20)
    events: list[Event] = Field(max_length=40)
    observations: list[Observation] = Field(max_length=6)
    abstentions: list[Abstention] = Field(max_length=20)
    limitations: list[str] = Field(max_length=8)


def _obj(props: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": required or list(props), "additionalProperties": False}


def _enum(values) -> dict:
    return {"type": "string", "enum": sorted(values) if not isinstance(values, list) else values}


NUM = {"type": "number"}
STR = {"type": "string"}


def json_schema() -> dict:
    """JSON schema for structured outputs (kept to the commonly supported subset: no numeric bounds)."""
    from typing import get_args

    return _obj(
        {
            "activity_segments": {
                "type": "array",
                "items": _obj({"start_s": NUM, "end_s": NUM, "label": _enum(list(get_args(ActivityLabel))), "note": STR}),
            },
            "events": {
                "type": "array",
                "items": _obj(
                    {
                        "start_s": NUM,
                        "end_s": NUM,
                        "event_type": _enum(list(get_args(EventType))),
                        "activity_label": _enum(list(get_args(ActivityLabel))),
                        "visibility": _enum(list(get_args(Visibility))),
                        "suggested_outcome": _enum(list(get_args(Outcome))),
                        "abstention_reason": _enum(list(get_args(Abstain))),
                        "starts_before_window": {"type": "boolean"},
                        "ends_after_window": {"type": "boolean"},
                        "evidence": STR,
                    }
                ),
            },
            "observations": {
                "type": "array",
                "items": _obj(
                    {
                        "t_start_s": NUM,
                        "t_end_s": NUM,
                        "category": _enum(list(get_args(ObsCategory))),
                        "observation": STR,
                        "evidence": STR,
                        "limitations": STR,
                        "review_questions": {"type": "array", "items": STR},
                    }
                ),
            },
            "abstentions": {
                "type": "array",
                "items": _obj({"start_s": NUM, "end_s": NUM, "reason": _enum(list(get_args(Abstain))), "detail": STR}),
            },
            "limitations": {"type": "array", "items": STR},
        }
    )


# Numeric measurement claims the product must never present (speeds, angles, spin, distances, scores).
_BANNED = [
    re.compile(r"\b\d+(\.\d+)?\s*(mph|km/?h|kph|m/s|ft/s|rpm|rps)\b", re.I),
    re.compile(r"\b\d+(\.\d+)?\s*(°|degrees?|deg)\b", re.I),
    re.compile(r"\b\d+(\.\d+)?\s*(cm|mm|inches|inch|feet|ft|meters?|metres?)\b", re.I),
    re.compile(r"\b\d+(\.\d+)?\s*%", re.I),
    re.compile(r"\b(exit velocity|pitch speed|spin rate|launch angle|injury risk|talent score)\b", re.I),
]


def banned_claims(text: str) -> list[str]:
    return [m.group(0) for rx in _BANNED for m in rx.finditer(text or "")]


def validate_window(raw: dict, template: str, win_start: float, win_end: float, tol: float = 0.35) -> tuple[WindowOutput | None, list[str]]:
    """Return (parsed, errors). Times are absolute source seconds and must fall inside the window."""
    errors: list[str] = []
    try:
        out = WindowOutput.model_validate(raw)
    except ValidationError as e:
        return None, [f"schema: {err['loc']}: {err['msg']}" for err in e.errors()[:20]]

    def in_window(a: float, b: float, what: str, strict_order: bool = True) -> None:
        if strict_order and not a < b:
            errors.append(f"{what}: start {a} must be before end {b}")
        if not strict_order and a > b:
            errors.append(f"{what}: start {a} after end {b}")
        if a < win_start - tol or b > win_end + tol:
            errors.append(f"{what}: {a}-{b} outside window {win_start}-{win_end}")

    allowed_outcomes = TEMPLATE_OUTCOMES[template]
    allowed_types = TEMPLATE_EVENT_TYPES[template]
    seen: set[tuple[float, float, str]] = set()
    for i, ev in enumerate(out.events):
        in_window(ev.start_s, ev.end_s, f"events[{i}]")
        if ev.suggested_outcome not in allowed_outcomes:
            errors.append(f"events[{i}]: outcome {ev.suggested_outcome} not allowed for {template}")
        if ev.event_type not in allowed_types:
            errors.append(f"events[{i}]: event_type {ev.event_type} not allowed for {template}")
        key = (round(ev.start_s, 1), round(ev.end_s, 1), ev.event_type)
        if key in seen:
            errors.append(f"events[{i}]: duplicate event")
        seen.add(key)
        for claim in banned_claims(ev.evidence):
            errors.append(f"events[{i}]: unsupported numeric measurement '{claim}'")
    for i, s in enumerate(out.activity_segments):
        in_window(s.start_s, s.end_s, f"activity_segments[{i}]")
    for i, o in enumerate(out.observations):
        in_window(o.t_start_s, o.t_end_s, f"observations[{i}]", strict_order=False)
        for field in (o.observation, o.evidence, o.limitations, *o.review_questions):
            for claim in banned_claims(field):
                errors.append(f"observations[{i}]: unsupported numeric measurement '{claim}'")
    for i, a in enumerate(out.abstentions):
        in_window(a.start_s, a.end_s, f"abstentions[{i}]", strict_order=False)
        if a.reason == "none":
            errors.append(f"abstentions[{i}]: reason must not be 'none'")
    return (out if not errors else None), errors
