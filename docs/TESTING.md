# Testing

| Suite | Command | Needs | What it covers |
|---|---|---|---|
| Worker unit | `cd services/worker && .venv/bin/pytest -q` | FFmpeg | Output schema strictness (extra fields, nulls, template outcomes, out-of-window times, duplicates, banned numeric claims); window planning and frame caps; cross-window deduplication; FFprobe on synthetic H.264, HEVC, rotated MOV, audio-only, text-as-MP4 and truncated files; preview transcoding; frame timestamps; the excerpt pipeline (repair once, refusal, provider errors, cancellation, dedupe, abstention); evaluation isolation (renamed fixtures, labels read only after inference). |
| Worker lint | `.venv/bin/ruff check src tests && .venv/bin/ruff format --check src tests` | | |
| Web unit | `cd apps/web && pnpm test` | | Report aggregation and statements (no percentages); safe redirects. |
| Web static | `pnpm lint && pnpm typecheck && pnpm build` | | |
| Integration | `pnpm test:integration` | `supabase start` | Against real local Postgres/Auth/Storage: tenant isolation, team-scoped coaches, athlete visibility (drafts never, published only, revocation), removed staff, anonymous access, storage path policies and overwrite protection, finalisation without an object, upload validation, invitation email binding / expiry / single use / revocation / hashing, worker RPCs not callable by users, manual plan blocks analysis, 60 s excerpt limit, one active job per video, worker-availability gate, lease expiry + fencing (stale complete/fail/heartbeat), out-of-range results rejected, retry backoff then final failure with reservation release, cancellation, deletion during processing + purge, concurrent quota race, exactly-once settlement, review edits/split/merge/outcome validation, immutable model output, report versioning, reanalysis generations, retraction, Stripe entitlement mapping and webhook event de-duplication. |
| End-to-end | `pnpm build && pnpm test:e2e` | `supabase start`, worker venv, Chromium | Real Next.js server + real worker process in explicit test mode: sign up → create program → evaluation → add player → upload (tus) → probe → analysis → review → approve → attribution → publish → invite athlete → athlete signs up, accepts, sees only the published report and cannot open the coach review. Saves desktop and mobile screenshots to `apps/web/e2e-artifacts/screenshots/`. |
| Real-video evaluation | `cd services/worker && .venv/bin/smarvii-eval` | `ANTHROPIC_API_KEY`, private fixtures | Live provider on the coach-confirmed fixtures; see below. |

Set `PW_CHROMIUM_PATH` to use a preinstalled Chromium instead of `playwright install`.

## What is mocked, and where

* The **analysis provider** is replaced only in:
  * `services/worker/tests/test_pipeline.py` and `test_eval_isolation.py` (scripted fake adapters, clearly named);
  * the end-to-end run, where the worker runs with `SMARVII_TEST_MODE=1 ANALYSIS_PROVIDER=mock`. Those runs are
    stored with provider `mock-test`, model `mock-test-no-vision`, evidence text "MOCK TEST OUTPUT", and the review
    screen shows a "Test-mode placeholder" warning. The worker refuses the mock adapter outside test mode.
* Integration tests call the worker RPCs directly with a service-role client to play the worker's role; the
  database logic under test is real.
* Nothing else is mocked: Postgres, Auth, Storage, FFmpeg and the browser are real.

## Real-video evaluation protocol

1. Copy the coach-supplied recordings into `fixtures/private/` (git-ignored).
2. `fixtures/manifest.json` lists inference inputs only (file, drill template, excerpt).
   `fixtures/reference-labels.json` holds coach-confirmed counts and is opened only after every prediction is
   written to `eval-output/<timestamp>/predictions.json`.
3. Each fixture is copied to a random file name before probing and analysis; the coach-entered context is empty.
4. `report.md` lists predicted vs expected counts, per-label counts, every event with its evidence, abstentions,
   limitations, requests, tokens, estimated cost and wall time. Use `--runs 3` to see run-to-run variation.
5. Never tune prompts against a single fixture and then report that fixture as a result; add new held-out clips.

Expected (coach-confirmed): `20261102172657258.MP4` 7 movements (1 lunge + 6 hinge);
`20261102172738437.MP4` 4 hinge reps, excluding the opening weight pickup.
