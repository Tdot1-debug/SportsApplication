# Architecture

## Components

```
Browser ──HTTPS──> Next.js on Vercel ──(user JWT, RLS)──> Supabase Postgres / Auth / Storage
   │                    │  server actions + route handlers            ▲          ▲
   │                    └─ Stripe webhook (secret key, server only)    │          │
   └── tus resumable upload, user JWT ──> Supabase Storage ───────────┘          │
                                                                                  │ service key, fenced RPCs
                                   Python worker (Docker on Render) ──────────────┘
                                     FFprobe/FFmpeg · provider adapter ──> Anthropic Messages API
```

* **Supabase** is the only system of record: Auth (email/password, confirmation and reset), Postgres (all data,
  the job queue, entitlements, usage), private Storage bucket `videos`.
* **Web app** (`apps/web`) uses the signed-in user's session for every read and write, so Row Level Security is
  the access boundary. The secret key is used server-side only for the Stripe webhook; it is never imported
  into client components (`src/lib/supabase/admin.ts` is `server-only`).
* **Worker** (`services/worker`) holds the secret key and the provider key. It claims jobs, processes media in a
  temporary directory, and writes results through `SECURITY DEFINER` RPCs that only `service_role` may call.

## Data model (high level)

`organizations` → `teams` → `players`; `memberships` (owner / coach / athlete) with `team_assignments` for
coaches; `athlete_links` connect an athlete login to a roster player. `practice_sessions` group `videos`.

* **Login identity vs sporting record.** `auth.users` is the login; `players` is the sporting record. They are only
  connected explicitly (`athlete_links` after an accepted invitation, or `players.self_user_id` in a personal
  workspace). Nothing is merged by name or email.
* **Teams and seasons.** `players.team_id` is the primary team. `roster_entries` (player, team, optional
  `seasons` row, `ended_at`) put the same record on several teams or seasons without duplicating it. Staff see a
  player through any rostered team they can access (`private.can_access_player`), but only that team's videos.
* **Personal workspaces.** An organisation with `kind = 'personal'`: one owner, one team ("My training"), one player
  whose `self_user_id` is the owner. Triggers block extra players, extra teams, athlete invitations, and archiving or
  moving the self record. Coaches join by invitation (all teams) and the owner can revoke them
  (`revoke_coach_access`). `goals` belong to a player.
* **Who approved.** `reports.review_kind` is `self` when the approver is the athlete of that record, otherwise
  `coach`. A self-review snapshot never says "coach-confirmed".
* **Capability registry.** `registry/capabilities.v1.json` is the single source for activities, metrics, status,
  capture requirements, limits and cost budgets. `node registry/sync.mjs` copies it into the worker
  (`smarvii_worker/capabilities.v1.json`) and web app (`src/lib/capabilities.v1.json`). The worker writes
  `{version, activity_id, activity_status}` into each run's `extraction_settings.registry`;
  `analysis_runs.registry_version` and `activity_id` are generated from it. Runs from before the registry show
  "pre-registry" and are never relabelled.

Analysis keeps model output and coach decisions apart:

| Table | Written by | Mutable? | Purpose |
|---|---|---|---|
| `analysis_runs` | worker | no | One per completed job: provider, model, prompt/analysis/registry version, sampling settings, tokens, cost estimate, limitations, abstentions. |
| `analysis_raw_outputs` | worker | no (trigger) | Every provider response per window and attempt, with validation status. Internal only. |
| `detected_events`, `draft_observations` | worker | no (trigger) | Validated, deduplicated model suggestions. |
| `review_items`, `review_observations` | coach (RPCs) | yes | The coach's working draft for the current *generation*. Model-originated rows keep a link to their source event. |
| `coach_revisions` | RPCs | append-only | Before/after of every coach edit. |
| `reports` | RPCs | status only | Versioned, frozen snapshots of coach-approved totals. At most one `approved` and one `published` per video. |

Re-analysis creates a new generation of review items. The published report is untouched until the coach approves
and publishes again.

## Access model

All tables have RLS enabled and forced. Helper functions live in a non-exposed `private` schema
(`SECURITY DEFINER`, `search_path = ''`): `is_org_owner`, `is_org_staff`, `can_access_team`, `is_my_player`,
`can_view_video`, `can_view_storage_object`, `can_upload_storage_object`.

* **Owners** see and manage the whole organisation, invite coaches, manage billing, export and delete.
* **Coaches** see only teams they are assigned to (or all teams if granted). They upload, review, approve and
  publish for those teams and can invite athletes for those teams' players.
* **Athletes** see only their linked player's *published* reports and videos that are shared with them or have a
  published report. Drafts, raw model output, jobs and usage are never visible to athletes.
* Writes that need business rules go through RPCs that re-derive authority from `auth.uid()`. Direct table writes
  are limited by column grants.
* **Storage**: uploads are allowed only to the exact path created by `create_video_upload`, only by its uploader,
  and only while the video is `pending_upload`. Reads require `can_view_video`. Playback uses 10-minute signed
  URLs minted per request after an access check (`/api/videos/[id]/playback`).
* Invitations are random 256-bit tokens stored as SHA-256 hashes, single-use, expiring (7 days), revocable, and
  bound to the invited email, which must be confirmed.

## Upload and processing pipeline

1. `create_video_upload` validates team/player/session access, container (MP4/MOV), declared size
   (≤ 500 MiB) and retained-minutes allowance, then returns a server-chosen path `{org}/{video}/original.{ext}`.
   Filenames are stored as metadata only.
2. The browser uploads with tus (6 MB chunks, resumable).
3. `finalize_video_upload` confirms the object exists with a real size and enqueues a `probe` job.
4. **Probe** (worker): FFprobe checks the actual container, codec, duration (≤ 5 min), dimensions, rotation and
   frame rate; a decode check at both ends catches truncated files; SHA-256 is recorded. Non-H.264 or unusual
   pixel formats get a browser-safe H.264 preview. Failures are shown to the coach as a clear rejection reason.
5. **Analysis** is only started by an explicit coach action (upload checkbox or the excerpt panel), for an
   excerpt of at most 60 s. `request_analysis` locks the organisation row, checks the plan allowance including
   in-flight reservations, requires a live analysis-capable worker, and reserves the seconds.
6. **Analyze** (worker): re-hashes the file, splits the excerpt into overlapping windows, extracts frames with
   accurate seeking and FFmpeg-reported timestamps, sends each window as a chronological, timestamped image
   sequence, validates the JSON strictly, allows one repair attempt, deduplicates across window overlaps, and
   completes the job. Settlement of the reservation and the billable usage event happen exactly once.
7. **Purge**: deleting a video (or the retention sweep) cancels jobs with a fence bump, retracts reports and
   enqueues a purge that removes every object under the video's prefix and derived rows.

### Queue semantics

* `claim_job` uses `FOR UPDATE SKIP LOCKED`, increments a **fence** token and sets a lease.
* The worker renews the lease every third of its length; `heartbeat_job` returns `false` once the fence is stale,
  the job was cancelled or the video was deleted, and the worker stops.
* Every completion RPC checks the fence; a stale worker gets `stale` and its results are discarded.
* Expired leases are re-queued with exponential backoff (30 s · 2^(n-1)); after `job_max_attempts` (3) the job
  fails, the reservation is released and the coach sees the message.
* Provider-call records are accepted even from a stale worker, because the provider cost was really incurred.

## Analysis adapter and validation

`analysis/adapter.py` defines the provider interface (`WindowRequest → ProviderResponse`). `AnthropicAdapter`
uses the Messages API with structured outputs (`output_config.format` JSON schema) and adaptive effort, with
server-side model fallback enabled by default. Another vision service or a dedicated pose/tracking model can be
added as another adapter without schema changes.

Prompts (`analysis/prompts.py`, versioned) tell the model to use absolute timestamps from frame labels, abstain
when something cannot be seen, never produce numeric measurements, never identify people, and treat
coach-entered text as data. Validation (`analysis/schema.py`) rejects extra fields, out-of-window times,
outcomes not allowed for the drill template, duplicate events and any speed/angle/distance/percentage claim.
There are no confidence percentages anywhere; visibility (clear/partial/poor) describes how well the movement
could be seen.

Template specifics:

* **Gym test**: segments activity over time (a clip can contain a lunge then hinges); setup movements such as
  picking up the weight are reported as `setup` and excluded from counts.
* **Hitting**: swing candidates; contact is suggested only with visible ball evidence; otherwise `unclear`.
* **Underhand pitching**: delivery candidates; target hit/miss only when both the target and the ball's arrival
  are visible; the coach-entered pitch type is context only.

## Billing and entitlements

Plans (`plans` table): `manual` (no automated analysis), `evaluation` (30 days, owner-activated once),
`founding_pilot` (via pilot code; $99/month proposed), `standard` ($149/month proposed). Exactly one active
entitlement per organisation. Stripe (test mode only, behind `NEXT_PUBLIC_BILLING_ENABLED`) maps prices to plans
server-side; webhooks are signature-verified and de-duplicated by event id; lapsed subscriptions fall back to
manual review and never delete recordings. Allowance numbers are provisional and flagged as such in the UI.

## Security notes

* Security headers (nosniff, frame denial, referrer and permissions policy) in `next.config.ts`; `proxy.ts` refreshes sessions. A Content-Security-Policy is not set yet (follow-up).
* Rate limits on organisation creation, invitations, invitation acceptance, uploads and pilot-code attempts.
* FFmpeg runs as argument lists with CPU/memory/time limits on worker-generated file names only.
* The worker refuses storage paths that do not match `{uuid}/{uuid}/…`.
* No facial recognition; player attribution is a coach confirmation step required before publishing.
