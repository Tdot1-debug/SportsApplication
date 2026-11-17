# Evaluation plan

Written 2026-11-07, **before any live provider run**. The thresholds are also committed as data in
`fixtures/acceptance-thresholds.json`, and the evaluation harness (`smarvii-eval`) scores every run against that
file. The git history of that file is the record that the thresholds came first.

## What "validated" means here

An activity moves from `experimental` to `validated` in the capability registry only when one evaluation run:

1. used at least **20 held-out clips** from at least **3 different athletes**, none of which were used while writing
   or tuning prompts;
2. had reference labels written by a person before the run, kept in fixture files only, never sent to the model,
   never inferred from filenames, and opened by the harness only after all predictions were saved;
3. met every threshold below at the same time.

Two clips (what exists today) can show the pipeline works end to end. They can never validate anything; the harness
reports "insufficient sample" however good the numbers look (`services/worker/tests/test_acceptance.py`).

## Thresholds: strength reps and any described movement

| Check | Threshold | Why this level |
|---|---|---|
| Exact count rate | ≥ 70% of clips | A coach should rarely need to fix a count. |
| Within one rep | ≥ 90% of clips | RepNet missed by more than one on about 30% of harder YouTube clips [repnet-2020]; short, side-on, single-person gym clips should do much better, or the feature is not worth offering. |
| Mean relative count error | ≤ 0.15 | Roughly one rep wrong in a set of seven. |
| Movement-label match (strength only) | ≥ 80% of clips | Counts per movement must be right for mixed clips. |
| Failed runs | ≤ 5% | Includes provider errors and output that failed validation. |
| Cost | ≤ $2.00 per analysed minute | Registry cost budget; see `docs/COST_MODEL.md`. |
| Wall time | ≤ 180 s per analysed minute | A review should be ready within a few minutes of upload. |
| Unsupported numeric claims in shown output | 0 | The output schema rejects them; a window that keeps producing them is discarded and counts towards failed output. |

Not yet measurable with the current labels: **event timing** (the fixtures hold counts, not per-rep timestamps) and
**abstention behaviour** (there are no deliberately uncountable clips yet). Before the 20-clip run, add per-rep
start/end labels (target: ≥ 80% of matched reps within 1.0 s at both ends) and at least 3 clips with a wrong or missing
movement description (target: the run abstains and reports no count on all of them).

Run-to-run stability: run each clip 3 times (`--runs 3`). Target: the count varies by at most one across runs on
≥ 90% of clips. The report shows every run so this can be read off directly.

## Softball, tennis and boxing

Softball hitting and pitching: the same count thresholds, plus outcome agreement ≥ 80% on swings or pitches where
the reference label is not "unclear". Tennis and boxing are `proposed`; their thresholds will be written in this
file before any clip of theirs is analysed, following the same rule.

## How to run it

```bash
cd services/worker
ANTHROPIC_API_KEY=… .venv/bin/smarvii-eval --runs 3 --activity strength.reps
# or Google Gemini
GEMINI_API_KEY=… .venv/bin/smarvii-eval --provider gemini --model gemini-3.5-flash --runs 3 --activity strength.reps
```

The report (`eval-output/<timestamp>/report.md`) lists every event with its evidence, then an **Acceptance** table
with each threshold, the observed value and pass/fail, and one verdict: *meets thresholds*, *does not meet
thresholds*, *insufficient sample*, or *mock run: not an evaluation*.

## Changing a threshold

Allowed, but only by adding a dated entry below that says what changed and why, and the earlier result must still be
reported against the original threshold.

| Date | Change | Reason |
|---|---|---|
| 2026-11-07 | Initial thresholds | Written before any live run. |

## Status

No validation run has been possible: only 2 labelled clips exist, so every verdict is "insufficient sample".

Smoke runs (2 clips, 1 run each, 2026-11-17, Gemini API free tier, same frames and prompts as the Anthropic adapter):

| Requested model | Served model | Counts (expected 7 and 4) | Labels right | Cost estimate (paid list price) | Wall time per analysed minute |
|---|---|---|---|---|---|
| gemini-3.5-flash | gemini-3.6-flash | 7 and 4 | 1 of 2 clips (2 hinges called squats) | about $0.52 for 39 s, if billed at 3.5 Flash prices; 3.6 Flash price not checked | 162 s |
| gemini-3.1-flash-lite | gemini-3.1-flash-lite | 6 and 6 | 0 of 2 | $0.07 | 112 s |

Two clips show the pipeline works with this provider; they say nothing about accuracy in general. The Anthropic
provider has still not been run live.
