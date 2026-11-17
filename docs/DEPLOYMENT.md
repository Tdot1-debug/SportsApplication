# Deployment

One supported path: **Supabase** (database, auth, storage) + **Vercel** (web) + **Render** (worker, Docker).
Nothing in this repository has been deployed yet; every step below needs an account owner to run it.

## 1. Supabase project

1. Create a project (choose a region near the program). Note the project ref.
2. Apply migrations from your machine: `supabase link --project-ref <ref>` then `supabase db push`.
   Do **not** run `supabase/seed.sql` in production (it contains a local test pilot code).
3. Auth settings (Dashboard → Authentication):
   * Site URL: your production web URL. Redirect URLs: `https://<web>/auth/callback`, `https://<web>/auth/confirm`.
   * Enable email confirmations. Configure custom SMTP before inviting real users (the built-in sender is rate-limited).
   * Minimum password length 8 or more.
4. Storage: the migration creates the private `videos` bucket (500 MiB limit, MP4/MOV only). Confirm the
   project-level upload size limit is at least 500 MiB (Storage settings; plan-dependent).
5. Keys (Settings → API): the **publishable** key goes to the web app; the **secret** key goes only to the
   worker and the web server environment (never to `NEXT_PUBLIC_*`).
6. Pilot codes: create them with SQL in the dashboard, storing only the hash, e.g.
   `insert into pilot_codes (code_hash, plan_code, max_redemptions, note) values (encode(extensions.digest(upper('YOUR-CODE'), 'sha256'), 'hex'), 'founding_pilot', 1, 'Program X');`
7. Platform operators (for `/app/ops`): `insert into platform_operators (user_id) values ('<auth user id>');`

## 2. Web app on Vercel

1. Import the repository, set **Root Directory** to `apps/web` (framework: Next.js, package manager pnpm).
2. Environment variables (Production and Preview):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
| `NEXT_PUBLIC_APP_URL` | `https://<your domain>` |
| `SUPABASE_SECRET_KEY` | secret key (server only) |
| `NEXT_PUBLIC_BILLING_ENABLED` | `false` until Stripe test mode is configured |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_FOUNDING` | test-mode values (optional) |

3. Deploy, then check `https://<web>/api/health`.

## 3. Worker on Render

1. New → Blueprint, pick the repository; `render.yaml` defines a Docker **background worker** rooted at
   `services/worker`.
2. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and (for live analysis) `GEMINI_API_KEY` in the dashboard.
   `render.yaml` sets `ANALYSIS_PROVIDER=gemini` and `GEMINI_MODEL=gemini-3.5-flash`. To use Anthropic instead,
   set `ANALYSIS_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. On Google's free tier, Google may use submitted
   frames to improve its products and human reviewers may read them; switch the key's project to paid billing
   before real athletes upload, or make sure every athlete has agreed to that.
   Leave `SMARVII_TEST_MODE=0`. `ANALYSIS_PROVIDER=mock` is refused unless test mode is on.
3. One instance is enough for a pilot; jobs are leased, so more instances are safe.
4. The worker reports a heartbeat every 30 s with its capabilities. The app only offers automated analysis while
   a worker with `analysis=true` has been seen in the last 15 minutes.

## 4. Stripe (test mode, optional)

1. In test mode create two recurring prices (Standard $149/month, Founding pilot $99/month). Put their IDs in
   `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_FOUNDING`.
2. Add a webhook endpoint `https://<web>/api/billing/webhook` for `checkout.session.completed`,
   `customer.subscription.created|updated|deleted` and `invoice.payment_failed`; copy the signing secret.
3. Set `NEXT_PUBLIC_BILLING_ENABLED=true`. Live keys are refused unless `STRIPE_ALLOW_LIVE=true` is set
   deliberately; do not set it during the pilot.

## 5. Smoke test after deploy

Sign up → create program → evaluation → add player → upload a short clip → wait for "Ready" → analyse 0–15 s →
review → approve → confirm attribution → publish → invite an athlete with a second email → athlete sees only the
published report. Follow [PILOT_TEST_PLAN.md](PILOT_TEST_PLAN.md) for the full pilot checklist.

## Operations

* **Backups**: Supabase daily backups are plan-dependent; enable Point-in-Time Recovery for the pilot if the
  budget allows. Storage objects are not covered by database backups. Test a restore before onboarding athletes.
* **Retention**: each organisation has `retention_days` (default 365). The worker runs
  `enqueue_retention_purges()` hourly; it soft-deletes expired videos and abandoned uploads (> 2 days pending)
  and the purge job removes their files and derived rows. Analysis usage records are kept for billing history.
* **Deletion**: deleting an organisation removes athletes, goals, sessions, invitations and reports at once;
  the worker calls `finalize_deleted_organizations()` every 5 minutes and removes the organisation itself once
  its recordings are purged, leaving only an id-and-date row in `deletion_log`. Users delete their own account at
  `/account` (this needs `SUPABASE_SECRET_KEY` on the web server).
* **Deletion**: coaches delete individual recordings (immediate soft delete, purge within minutes). Owners can
  export the organisation (`/api/export`, JSON) and delete it (`delete_organization`, typed-name confirmation),
  which soft-deletes all videos for purge.
* **Monitoring**: `/app/ops` (platform operators) shows queue depth, failures, worker heartbeats and provider
  cost estimates. The worker exposes `GET /` health on `PORT`/`HEALTH_PORT`.
* **Secrets**: rotate the Supabase secret key and Anthropic key from their dashboards; update Vercel and Render.
