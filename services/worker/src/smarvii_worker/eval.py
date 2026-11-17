"""Evaluation harness for real fixture videos.

Honesty rules enforced here:
- Inference runs first, from the manifest only (file name, drill template, excerpt). The expected labels
  file is not opened until every prediction has been written to disk.
- Each fixture is copied to a temporary file with a random name before analysis, so the original file
  name never reaches the model, the prompts or the frame files.
- Nothing is mocked unless --provider mock is passed together with SMARVII_TEST_MODE=1; such a report is
  stamped MOCK and contains no accuracy claims.
- Outputs go to eval-output/ (git-ignored). Sampled frames are deleted with the temporary directory.

Usage:
  smarvii-eval --videos-dir fixtures/private [--fixture gym_mixed_25s] [--runs 1] [--out eval-output]
"""

from __future__ import annotations

import argparse
import json
import logging
import secrets
import shutil
import sys
import tempfile
import threading
import time
from collections import Counter
from dataclasses import replace
from pathlib import Path
from typing import Any

from . import media
from .analysis.pipeline import AnalysisFailed, CallRecord, analyse_excerpt
from .config import load_config
from .jobs import make_adapter

COUNTED = {"rep", "swing", "pitch"}
REPO_ROOT = Path(__file__).resolve().parents[4]


def _load_json(p: Path) -> Any:
    return json.loads(p.read_text())


def predict(fixture: dict[str, Any], video: Path, cfg, adapter, run_idx: int, raw_dir: Path) -> dict[str, Any]:
    tmp = Path(tempfile.mkdtemp(prefix="smarvii-eval-"))
    try:
        anon = tmp / f"clip-{secrets.token_hex(6)}{video.suffix.lower()}"
        shutil.copyfile(video, anon)
        pr = media.probe(anon)
        media.verify_decodes(anon, pr.duration_s)
        ex = fixture.get("excerpt") or [0, pr.duration_s]
        start_s, end_s = float(ex[0]), min(float(ex[1]), pr.duration_s)
        if end_s - start_s > 60.0:
            end_s = start_s + 60.0
        calls: list[dict[str, Any]] = []
        started = time.monotonic()
        try:
            result = analyse_excerpt(
                video_path=anon,
                work_dir=tmp / "frames",
                template=fixture["drill_template"],
                start_s=start_s,
                end_s=end_s,
                source_fps=pr.fps,
                context={},
                cfg=cfg,
                adapter=adapter,
                cancel=threading.Event(),
                record_call=lambda c: calls.append(CallRecord.as_payload(c)),
            )
            error = None
        except AnalysisFailed as e:
            result, error = None, f"{e} (retryable={e.retryable})"
        wall = time.monotonic() - started
        (raw_dir / f"{fixture['id']}.run{run_idx}.calls.json").write_text(json.dumps(calls, indent=1))
        events = (result or {}).get("events", [])
        counted = [e for e in events if e["event_type"] in COUNTED]
        return {
            "fixture": fixture["id"],
            "run": run_idx,
            "error": error,
            "probe": {
                "duration_s": round(pr.duration_s, 3),
                "fps": round(pr.fps, 3),
                "width": pr.width,
                "height": pr.height,
                "codec": pr.video_codec,
                "rotation": pr.rotation,
            },
            "excerpt": [start_s, end_s],
            "predicted_count": len(counted) if result else None,
            "predicted_by_label": dict(Counter(e["activity_label"] for e in counted)) if result else None,
            "excluded_events": [
                {k: e[k] for k in ("event_type", "activity_label", "start_s", "end_s", "evidence")}
                for e in events
                if e["event_type"] not in COUNTED
            ],
            "events": events,
            "observations": (result or {}).get("observations", []),
            "abstentions": (result or {}).get("abstentions", []),
            "limitations": (result or {}).get("limitations", []),
            "status": (result or {}).get("status", "failed"),
            "provider": adapter.name,
            "model": (result or {}).get("model", adapter.model),
            "requests": len(calls),
            "input_tokens": sum(int((c.get("usage") or {}).get("input_tokens", 0)) for c in calls),
            "output_tokens": sum(int((c.get("usage") or {}).get("output_tokens", 0)) for c in calls),
            "estimated_cost_usd": (result or {}).get("estimated_cost_usd"),
            "invalid_responses": sum(1 for c in calls if c["validation_status"] != "valid"),
            "wall_seconds": round(wall, 1),
            "extraction_settings": (result or {}).get("extraction_settings"),
        }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def score(preds: list[dict[str, Any]], labels: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for p in preds:
        lab = labels.get(p["fixture"])
        if lab is None:
            rows.append({**p, "expected_count": None, "abs_error": None, "exact": None, "within_one": None, "rel_error": None})
            continue
        exp = int(lab["expected_count"])
        got = p["predicted_count"]
        by_label_exp = lab.get("expected_by_label") or {}
        rows.append(
            {
                **p,
                "expected_count": exp,
                "expected_by_label": by_label_exp,
                "abs_error": None if got is None else abs(got - exp),
                "exact": None if got is None else got == exp,
                "within_one": None if got is None else abs(got - exp) <= 1,
                "rel_error": None if got is None or exp == 0 else abs(got - exp) / exp,
                "label_match": None
                if got is None
                else all((p["predicted_by_label"] or {}).get(k, 0) == v for k, v in by_label_exp.items()),
            }
        )
    return rows


def _rate(vals: list[Any]) -> float | None:
    vals = [v for v in vals if v is not None]
    return None if not vals else sum(1 for v in vals if v) / len(vals)


def acceptance(rows: list[dict[str, Any]], thresholds: dict[str, Any]) -> dict[str, Any]:
    """Compare scored rows with thresholds written before the run. Never edits thresholds; reports each check."""
    scored = [r for r in rows if r.get("expected_count") is not None]
    clips = {r["fixture"] for r in scored}
    failed = [r for r in scored if r["predicted_count"] is None]
    rel = [r["rel_error"] for r in scored if r.get("rel_error") is not None]
    minutes = sum(float(r["excerpt"][1]) - float(r["excerpt"][0]) for r in scored) / 60.0
    costs = [r["estimated_cost_usd"] for r in scored if r["estimated_cost_usd"] is not None]
    walls = [r["wall_seconds"] for r in scored if r.get("wall_seconds") is not None]
    observed = {
        "clips": len(clips),
        "exact_count_rate": _rate([r["exact"] for r in scored]),
        "within_one_rate": _rate([r["within_one"] for r in scored]),
        "mean_relative_error": (sum(rel) / len(rel)) if rel else None,
        "label_match_rate": _rate([r.get("label_match") for r in scored]),
        "failed_run_rate": (len(failed) / len(scored)) if scored else None,
        "cost_usd_per_analysed_minute": (sum(costs) / minutes) if costs and minutes else None,
        "wall_seconds_per_analysed_minute": (sum(walls) / minutes) if walls and minutes else None,
    }
    checks = []
    for key, limit in thresholds.items():
        if key.startswith("min_") or limit is None:
            continue
        name = key.removesuffix("_min").removesuffix("_max")
        got = observed.get(name)
        ok = None if got is None else (got >= limit if key.endswith("_min") else got <= limit)
        checks.append({"check": key, "threshold": limit, "observed": got, "passed": ok})
    enough = len(clips) >= thresholds.get("min_clips_for_validation", 0)
    all_pass = bool(checks) and all(c["passed"] for c in checks)
    verdict = "meets thresholds" if all_pass and enough else ("insufficient sample" if not enough else "does not meet thresholds")
    return {"observed": observed, "checks": checks, "sample_sufficient": enough, "verdict": verdict}


def render_markdown(rows: list[dict[str, Any]], mock: bool, settings: dict[str, Any]) -> str:
    lines = ["# Smarvii Sports fixture evaluation", ""]
    if mock:
        lines += [
            "> **MOCK RUN.** The mock test adapter does not look at frames. Counts below are placeholders and are",
            "> not model results. Do not cite them as accuracy.",
            "",
        ]
    lines += [
        f"Generated {time.strftime('%Y-%m-%d %H:%M:%S %Z')}. Settings: `{json.dumps(settings)}`",
        "",
        "| Fixture | Run | Status | Predicted | Expected | Abs error | By label (pred) | By label (expected) | Requests | Tokens in/out | Est. cost | Wall s |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in rows:
        cost = "n/a" if r["estimated_cost_usd"] is None else f"${r['estimated_cost_usd']:.4f}"
        lines.append(
            f"| {r['fixture']} | {r['run']} | {r['status']}{' (' + r['error'] + ')' if r['error'] else ''} | {r['predicted_count']} | "
            f"{r.get('expected_count')} | {r.get('abs_error')} | {json.dumps(r['predicted_by_label'])} | {json.dumps(r.get('expected_by_label'))} | "
            f"{r['requests']} | {r['input_tokens']}/{r['output_tokens']} | {cost} | {r['wall_seconds']} |"
        )
    lines.append("")
    for r in rows:
        lines += [f"## {r['fixture']} (run {r['run']})", "", "Events:", ""]
        for e in r["events"]:
            lines.append(
                f"- {e['start_s']:.2f}-{e['end_s']:.2f}s {e['event_type']}/{e['activity_label']} ({e['visibility']}): {e['evidence']}"
            )
        if r["abstentions"]:
            lines += ["", "Abstentions:"] + [
                f"- {a['start_s']:.2f}-{a['end_s']:.2f}s {a['reason']}: {a['detail']}" for a in r["abstentions"]
            ]
        if r["limitations"]:
            lines += ["", "Limitations:"] + [f"- {lim}" for lim in r["limitations"]]
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--videos-dir", default=str(REPO_ROOT / "fixtures/private"))
    ap.add_argument("--manifest", default=str(REPO_ROOT / "fixtures/manifest.json"))
    ap.add_argument("--labels", default=str(REPO_ROOT / "fixtures/reference-labels.json"))
    ap.add_argument("--thresholds", default=str(REPO_ROOT / "fixtures/acceptance-thresholds.json"))
    ap.add_argument("--activity", default="strength.reps", help="registry activity whose thresholds apply")
    ap.add_argument("--out", default=str(REPO_ROOT / "eval-output"))
    ap.add_argument("--fixture", action="append", help="fixture id(s) to run; default all present")
    ap.add_argument("--runs", type=int, default=1)
    ap.add_argument("--provider", choices=["anthropic", "gemini", "mock"], default=None)
    ap.add_argument("--model", default=None)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)

    cfg = load_config(require_supabase=False)
    if args.provider:
        cfg = replace(cfg, analysis_provider=args.provider)
    if args.model:
        cfg = replace(cfg, gemini_model=args.model) if cfg.analysis_provider == "gemini" else replace(cfg, anthropic_model=args.model)
    mock = cfg.analysis_provider == "mock"
    if not cfg.analysis_enabled:
        print(
            "Analysis is not enabled: set ANTHROPIC_API_KEY or GEMINI_API_KEY with --provider gemini (or --provider mock with SMARVII_TEST_MODE=1).",
            file=sys.stderr,
        )
        return 2
    adapter = make_adapter(cfg)

    manifest = _load_json(Path(args.manifest))
    fixtures = [f for f in manifest["fixtures"] if not args.fixture or f["id"] in args.fixture]
    vids = Path(args.videos_dir)
    out = Path(args.out) / time.strftime("%Y%m%d-%H%M%S")
    (out / "raw").mkdir(parents=True, exist_ok=True)

    preds: list[dict[str, Any]] = []
    for f in fixtures:
        video = vids / f["filename"]
        if not video.is_file():
            print(f"SKIP {f['id']}: {video} not found", file=sys.stderr)
            continue
        for run in range(1, args.runs + 1):
            logging.info("analysing %s run %d", f["id"], run)
            preds.append(predict(f, video, cfg, adapter, run, out / "raw"))
    (out / "predictions.json").write_text(json.dumps(preds, indent=1))
    if not preds:
        print("No fixture videos found; nothing evaluated.", file=sys.stderr)
        return 1

    # Labels are read only now, after all predictions are on disk.
    labels = _load_json(Path(args.labels))["fixtures"]
    rows = score(preds, labels)
    settings = {
        "provider": adapter.name,
        "model": adapter.model,
        "effort": cfg.anthropic_effort,
        "gym": cfg.gym.__dict__,
        "softball": cfg.softball.__dict__,
    }
    thresholds = _load_json(Path(args.thresholds))["activities"].get(args.activity, {})
    gate = acceptance(rows, thresholds)
    if mock:
        gate["verdict"] = "mock run: not an evaluation"
    (out / "report.json").write_text(json.dumps({"mock": mock, "settings": settings, "rows": rows, "acceptance": gate}, indent=1))
    md = render_markdown(rows, mock, settings)
    md += (
        "\n## Acceptance (thresholds written before the run)\n\n"
        + f"Verdict: **{gate['verdict']}** ({gate['observed']['clips']} clips).\n\n"
    )
    md += "| Check | Threshold | Observed | Passed |\n|---|---|---|---|\n" + "\n".join(
        f"| {c['check']} | {c['threshold']} | {c['observed']} | {c['passed']} |" for c in gate["checks"]
    )
    (out / "report.md").write_text(md + "\n")
    for r in rows:
        print(
            f"{r['fixture']} run {r['run']}: predicted={r['predicted_count']} expected={r.get('expected_count')} "
            f"by_label={r['predicted_by_label']} status={r['status']} cost={r['estimated_cost_usd']}"
        )
    print(f"Report: {out / 'report.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
