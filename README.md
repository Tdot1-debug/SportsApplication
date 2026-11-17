# Smarvii Sports

A pilot SaaS for sports coaches and individual athletes. Coaches (or athletes in a personal training workspace)
upload practice footage from a phone or camera, and the app turns it into a private video library, **suggested** rep counts,
**suggested** outcome labels the coach can correct, and **draft** technique notes. Nothing reaches an athlete
until a coach approves and publishes it.

Activities: strength reps (hinge, lunge, squat), any coach-described movement, softball hitting and pitching
(all experimental, every result reviewed by a person); tennis and boxing are proposed only. See
[FEASIBILITY.md](docs/FEASIBILITY.md) for what video can and cannot measure. Team organisations have rosters,
seasons and athlete invitations; personal workspaces let an adult athlete keep their own log and invite a coach.
Uploads are manual; there is no direct glasses integration.

## What is in the repo

| Path | What it is |
|---|---|
| `apps/web` | Next.js 16 (App Router, TypeScript, Tailwind v4). Coach, athlete, demo and ops screens; API routes for playback URLs, billing and export. |
| `services/worker` | Python 3.12 worker (Docker, FFmpeg/FFprobe). Claims jobs from the Postgres queue: probe uploads, analyse excerpts through a provider adapter (Google Gemini or Anthropic, set by `ANALYSIS_PROVIDER`), purge deleted media. Includes the fixture evaluation harness. |
| `supabase/` | Migrations (schema, RLS, RPCs, storage policies), local config and a local-only seed. |
| `fixtures/` | Evaluation manifest and coach-confirmed counts. Private videos go in `fixtures/private/` (git-ignored). |
| `docs/` | [Architecture](docs/ARCHITECTURE.md), [Deployment](docs/DEPLOYMENT.md), [Testing](docs/TESTING.md), [Pilot test plan](docs/PILOT_TEST_PLAN.md), [Cost model](docs/COST_MODEL.md). |

## Run it locally

Prerequisites: Docker, Node 22 + pnpm 10, Python 3.12, FFmpeg, the Supabase CLI.

```bash
# 1. Backend (Postgres, Auth, Storage) with all migrations and the local seed
supabase start
supabase db reset

# 2. Web app
cd apps/web
cp .env.example .env.local      # paste the local URL, publishable key and secret key from `supabase status`
pnpm install
pnpm dev                        # http://localhost:3000

# 3. Worker (second terminal)
cd services/worker
python -m venv .venv && .venv/bin/pip install -e . pytest ruff
cp .env.example .env            # SUPABASE_URL, SUPABASE_SECRET_KEY, and GEMINI_API_KEY (or ANTHROPIC_API_KEY) for live analysis
# The worker reads services/worker/.env by itself (also on Windows); real environment variables win.
.venv/bin/smarvii-worker
```

Without `ANTHROPIC_API_KEY` the worker still probes uploads and purges deleted media; the app shows automated
analysis as unavailable and coaches label reps manually. That is the honest default.

### First upload

1. Open http://localhost:3000, choose **Start a program**, create an account and a program.
2. On the access step, start the 30-day evaluation (or enter the local code `LOCAL-PILOT-2026` from the seed).
3. **Roster → Add player.**
4. **Upload**: choose the player and drill template, pick an MP4/MOV (≤ 500 MiB, ≤ 5 min), and leave
   "Request automated analysis of the first 60 seconds" ticked if a live worker is running.
5. **Open review**: correct, add, split, merge or exclude events; set outcomes; add notes.
6. **Approve**, confirm the recording shows the assigned player, then **Publish**. Invite the athlete from the
   player's page to give them read-only access to their published reports.

`/demo` shows a labelled demo with seeded example data. It never presents seeded data as model output.

## Checks

```bash
cd services/worker && .venv/bin/ruff check src tests && .venv/bin/pytest -q
cd apps/web && pnpm lint && pnpm typecheck && pnpm test && pnpm build
cd apps/web && pnpm test:integration     # needs `supabase start`
cd apps/web && pnpm build && pnpm test:e2e   # real server + real worker in explicit test mode
```

See [docs/TESTING.md](docs/TESTING.md) for what each suite covers and what is mocked (only the analysis
provider, only in explicitly mocked tests).

## Real-video evaluation

```bash
cp /path/to/20261102172657258.MP4 /path/to/20261102172738437.MP4 fixtures/private/
cd services/worker && ANTHROPIC_API_KEY=... .venv/bin/smarvii-eval
```

The harness renames each fixture to a random name before analysis, runs inference without reading the expected
labels, and only then scores against `fixtures/reference-labels.json`. Reports go to `eval-output/` (git-ignored).
