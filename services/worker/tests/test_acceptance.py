import json
from pathlib import Path

from smarvii_worker.eval import acceptance, score

ROOT = Path(__file__).resolve().parents[3]
THRESHOLDS = json.loads((ROOT / "fixtures/acceptance-thresholds.json").read_text())["activities"]["strength.reps"]


def pred(fixture, count, cost=0.5, wall=30.0, length=30.0, by_label=None):
    return {
        "fixture": fixture,
        "run": 1,
        "predicted_count": count,
        "predicted_by_label": by_label or {"hinge": count or 0},
        "excerpt": [0.0, length],
        "estimated_cost_usd": cost,
        "wall_seconds": wall,
    }


def test_two_clips_can_never_validate_even_when_perfect():
    labels = {"a": {"expected_count": 4, "expected_by_label": {"hinge": 4}}, "b": {"expected_count": 6, "expected_by_label": {"hinge": 6}}}
    gate = acceptance(score([pred("a", 4), pred("b", 6)], labels), THRESHOLDS)
    assert all(c["passed"] for c in gate["checks"])
    assert gate["verdict"] == "insufficient sample"


def test_threshold_misses_are_reported_not_hidden():
    labels = {f"c{i}": {"expected_count": 5, "expected_by_label": {"hinge": 5}} for i in range(20)}
    preds = [pred(f"c{i}", 5 if i < 10 else 7) for i in range(20)]  # half exact, half off by two
    gate = acceptance(score(preds, labels), THRESHOLDS)
    assert gate["sample_sufficient"]
    assert gate["verdict"] == "does not meet thresholds"
    failing = {c["check"] for c in gate["checks"] if c["passed"] is False}
    assert {"exact_count_rate_min", "within_one_rate_min", "mean_relative_error_max"} <= failing


def test_failed_runs_count_against_the_gate():
    labels = {f"c{i}": {"expected_count": 3, "expected_by_label": {"hinge": 3}} for i in range(20)}
    preds = [pred(f"c{i}", 3 if i else None, cost=None if not i else 0.5) for i in range(20)]
    gate = acceptance(score(preds, labels), THRESHOLDS)
    assert gate["observed"]["failed_run_rate"] == 0.05
    assert gate["verdict"] == "meets thresholds"
