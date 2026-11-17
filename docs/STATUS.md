# Smarvii Sports: implementation status and roadmap

Living document. Every claim below cites the check that supports it. Last verified: **2026-11-07** in the
build container (local Supabase stack in Docker, Node 22, Python 3.12). Nothing is deployed.

## 1. Verified starting point (Phase 1)

### 1a. Implemented and verified now (re-run 2026-11-07)

| Area | Evidence |
|---|---|
| Git history | 5 commits on `master` (`5cba787` latest). Bundle at `/mnt/project-files/smarvii-sports/smarvii-sports.bundle`. No GitHub repo is attached (`list_repos` returned none). |
| Database schema, RLS, RPCs | 6 migrations apply cleanly with `supabase db reset`. |
| Worker | `ruff check`, `ruff format --check` pass; `pytest` 37 passed (schema, windowing, FFmpeg media incl. corrupt/HEVC/rotated, pipeline, eval isolation). |
| Web | `eslint` clean (one unused-variable warning fixed today), `tsc --noEmit` pass, `next build` pass. |
| Web tests against real local Postgres/Auth/Storage | vitest 40 passed (4 unit, 36 integration: access/RLS, storage, invitations, queue + fencing, quota race, review, reports, billing webhook, export, general movement). |
| End-to-end | Playwright 1 passed: coach signs up → program → roster → upload → worker (mock test mode) → review → approve → confirm identity → publish → athlete invite → athlete sees report. |
| Security headers | `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy` set in `next.config.ts`. |

### 1b. Implemented but unverified

| Item | Why unverified |
|---|---|
| Worker Docker image | Re-tried today: `apt-get` inside the build is blocked by this sandbox's network policy (exit 100). CI job `worker-image` builds it but CI has never run. |
| GitHub Actions CI | No repository to run it in. |
| Deployment configs (`render.yaml`, `docs/DEPLOYMENT.md`, Vercel settings) | Never deployed: no Vercel/Supabase/Render access from this environment. |
| Anthropic adapter (structured outputs, effort, server-side fallback) | Unit-tested with fakes only. No live call has been made. |
| Gemini adapter (default since 2026-11-17) | Unit-tested, plus live runs on 2026-11-17 (free tier): the eval harness on both fixture clips, and one upload-to-review run through the production build in a browser. Rep counts matched on every run; movement labels were wrong on some reps (hinges called squats). See EVALUATION_PLAN.md. |
| Stripe test-mode checkout | Webhook signature/idempotency tested; checkout never run against Stripe. |
| Email delivery (invites, confirmation) | Only via local Mailpit. No SMTP provider configured. |

### 1c. Mocked or demonstrated (never presented as live inference)

| Item | What it is |
|---|---|
| `mock-test` provider | Placeholder events that never look at frames. Only with `SMARVII_TEST_MODE=1`. UI shows "Test-mode placeholder". Used by the E2E test. |
| `claude-session-review` provider | Events Claude marked by viewing sampled frames in a build session (2026-11-04), replayed through the pipeline. Test mode only; UI shows "Demo: analysed by Claude in the build session". **Not blind**: the coach counts were known beforehand. |
| `/demo` page | Seeded example data under a permanent demo banner. |
| Demo videos in project files | `demo-pilot/`, `demo-gym/`, `demo-real/real-footage-walkthrough.mp4` (app walkthrough on real footage), `demo-real/coach-breakdown.mp4`. |
| Coaching breakdown video (slow motion, pauses, notes, counter, summary) | **Exists only as an offline asset**: `demo-real/coach-breakdown.mp4`, built by a stand-alone script (`demo-real/source/build.py`) from hand-written notes. It is **not** a product feature: there is no in-app render, no link to reviewed findings, no rendering status. |

### 1d. Built since Phase 1 (verified 2026-11-07)

| Item | Evidence |
|---|---|
| Content-Security-Policy (per-request nonce, `strict-dynamic`, `frame-ancestors 'none'`) and HSTS | `tests/unit/csp.test.ts`; both Playwright journeys assert zero CSP console violations. |
| Personal workspaces (journey 2): private workspace with the user's own athlete profile, sports, goals, training history | `tests/integration/personal.test.ts` (9 tests); `tests/e2e/personal-flow.spec.ts`. Adults only (18+ confirmation required). |
| Self-review vs coach approval | `reports.review_kind` (`self` / `coach`); a self snapshot never says "coach-confirmed"; UI badge "Self-reviewed · not coach-approved". |
| Invited coach with grant and revoke | `revoke_coach_access`; after revoke the coach loses rows, videos, approvals and signed storage URLs (integration test) and the review page (E2E). |
| One athlete record across teams and seasons | `seasons`, `roster_entries`; staff see a player through any rostered team they can access but only that team's videos. `tests/integration/roster.test.ts` (5 tests). |
| Versioned sport capability registry | `registry/capabilities.v1.json` (version `2026-11-07.1`), copied into worker and web by `registry/sync.mjs`; drift tests in both. Each run stores `extraction_settings.registry`, exposed as `analysis_runs.registry_version` / `activity_id`; older runs show "pre-registry". Worker refuses templates whose activity is not experimental/validated. "What we analyse" page; personal dashboard lists each chosen sport's status, so tennis and boxing show "Proposed, manual review only" rather than an empty screen. |
| Sourced feasibility matrix | `docs/FEASIBILITY.md` (10 primary sources, accessed 2026-11-07). |
| Evaluation plan with thresholds written before any live run | `docs/EVALUATION_PLAN.md`, `fixtures/acceptance-thresholds.json`; harness prints pass/fail per threshold and "insufficient sample" below 20 clips (`tests/test_acceptance.py`). |

Latest full check: worker `pytest` 48 passed, `ruff` clean; web lint, typecheck, build pass; vitest 11 unit + 50 integration passed; Playwright 2 passed.

### 1e. Still missing or blocked

| Item | Status |
|---|---|
| Validation and measured cost | Smoke-tested on 2 clips only. A validation verdict needs at least 20 consented, labelled clips from 3 or more athletes. |
| Deployment to a test environment | **Blocked**: needs Supabase project + Vercel + Render access as environment secrets. |
| GitHub repo + CI | **Blocked**: needs an empty repository. |
| Staff member also an athlete in the same org | Still not allowed. Personal workspaces cover self-training. |
| Tennis and boxing analysis | Proposed only (registry). Needs consented clips and pre-written thresholds before building. |
| Validated measurements (speed, angle, distance, force) | None, by design. See `docs/FEASIBILITY.md`. |
| Failure-path browser tests (cancellation, deletion, quota exhaustion) | Covered at database level by integration tests; not yet in Playwright. |
| Error monitoring, backups/recovery runbook | Missing. Queue monitoring exists on `/app/ops`. |
| In-app coaching breakdown video from reviewed findings | Missing (offline demo asset only). |
| Minors | Out of scope until guardian/consent research is done; personal workspaces require 18+. |

## 2. Prioritised backlog

1. ~~CSP and HSTS~~ done.
2. ~~Personal workspaces, self-review labels, revocable coach access~~ done.
3. ~~Roster entries per team and season~~ done.
4. ~~Capability registry v1~~ done.
5. ~~Feasibility research~~ done.
6. ~~Evaluation plan with thresholds~~ done; live run blocked on the API key.
7. **Journey failure paths in Playwright**: cancellation, deletion, quota exhaustion, access boundaries.
8. **Operations**: error monitoring hook, backup/recovery runbook, queue alerts.
9. **In-app coaching breakdown video** rendered only from reviewed findings, with status and download.
10. Tennis, then boxing, as `experimental`, once consented clips and thresholds exist.

## 3. Phase log

| Date | Milestone | Result |
|---|---|---|
| 2026-11-03 | Pilot build | See `BUILD_REPORT.md` (historical). |
| 2026-11-04 | Real fixtures received; demo videos | Fixtures probed (25.14 s and 13.77 s, 1600×1200, 30 fps H.264); demo-only analysis. |
| 2026-11-07 | Phase 1 verification | Sections 1a–1c. |
| 2026-11-07 | CSP, personal workspaces, rosters and seasons, capability registry, feasibility matrix, evaluation plan | Section 1d. |
