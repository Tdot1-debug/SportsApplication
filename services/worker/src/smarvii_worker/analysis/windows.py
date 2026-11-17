"""Window planning and cross-window deduplication. Pure functions (unit tested)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from ..config import SamplingConfig


@dataclass(frozen=True)
class Window:
    index: int
    start_s: float
    end_s: float


def plan_windows(start_s: float, end_s: float, sampling: SamplingConfig, source_fps: float | None = None) -> tuple[list[Window], float]:
    """Overlapping windows covering [start_s, end_s]. Window length is capped so frames per request
    stay within `max_frames_per_request`. Returns (windows, effective sampling fps)."""
    if end_s <= start_s:
        raise ValueError("empty range")
    fps = sampling.fps
    if source_fps and source_fps > 0:
        fps = min(fps, source_fps)
    window = min(sampling.window_s, sampling.max_frames_per_request / fps)
    overlap = min(sampling.overlap_s, window / 2)
    step = window - overlap
    total = end_s - start_s
    if total <= window:
        return [Window(0, round(start_s, 3), round(end_s, 3))], fps
    n = math.ceil((total - overlap) / step)
    wins = []
    for i in range(n):
        s = start_s + i * step
        e = min(s + window, end_s)
        if i == n - 1:
            s = max(start_s, end_s - window)
            e = end_s
        wins.append(Window(i, round(s, 3), round(e, 3)))
    return wins, fps


@dataclass
class Candidate:
    start_s: float
    end_s: float
    event_type: str
    activity_label: str
    visibility: str
    suggested_outcome: str | None
    abstention_reason: str | None
    evidence: str
    window: int
    win_start: float
    win_end: float
    truncated: bool
    source_windows: list[int] = field(default_factory=list)

    @property
    def centrality(self) -> float:
        """Distance of the event from its window's edges; higher means more surrounding context was visible."""
        return min(self.start_s - self.win_start, self.win_end - self.end_s)


def _iou(a: Candidate, b: Candidate) -> float:
    inter = max(0.0, min(a.end_s, b.end_s) - max(a.start_s, b.start_s))
    union = max(a.end_s, b.end_s) - min(a.start_s, b.start_s)
    return inter / union if union > 0 else 0.0


def _same_event(a: Candidate, b: Candidate) -> bool:
    compatible = a.event_type == b.event_type or {a.event_type, b.event_type} <= {"setup", "transition", "other"}
    if not compatible:
        return False
    if _iou(a, b) >= 0.4:
        return True
    # A truncated copy at a window edge overlapping most of a complete copy is the same event.
    inter = max(0.0, min(a.end_s, b.end_s) - max(a.start_s, b.start_s))
    shorter = min(a.end_s - a.start_s, b.end_s - b.start_s)
    return (a.truncated or b.truncated) and shorter > 0 and inter / shorter >= 0.6


def _better(a: Candidate, b: Candidate) -> Candidate:
    """Prefer complete over truncated observations, then the one with more context around it."""
    if a.truncated != b.truncated:
        return b if a.truncated else a
    return a if a.centrality >= b.centrality else b


def dedupe(cands: list[Candidate], range_start: float, range_end: float) -> list[Candidate]:
    """Merge duplicates produced by overlapping windows; clip to the analysed range; sort by time."""
    clipped: list[Candidate] = []
    for c in cands:
        s, e = max(c.start_s, range_start), min(c.end_s, range_end)
        if e - s < 0.05:
            continue
        c.start_s, c.end_s = round(s, 3), round(e, 3)
        c.source_windows = sorted(set(c.source_windows or [c.window]))
        clipped.append(c)
    clipped.sort(key=lambda c: (c.start_s, c.end_s))
    kept: list[Candidate] = []
    for c in clipped:
        merged = False
        for i, k in enumerate(kept):
            if _same_event(k, c):
                best = _better(k, c)
                best.source_windows = sorted(set(k.source_windows) | set(c.source_windows))
                kept[i] = best
                merged = True
                break
        if not merged:
            kept.append(c)
    kept.sort(key=lambda c: (c.start_s, c.end_s))
    return kept
