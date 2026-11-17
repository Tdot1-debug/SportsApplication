-- Smarvii Sports core schema
-- Tenancy: organizations -> teams -> players/sessions/videos.
-- Every tenant-owned row carries org_id; team-restricted rows also carry team_id.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Server-side configuration (editable by operators via SQL / dashboard)
-- ---------------------------------------------------------------------------
create table public.app_config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value, description) values
  ('max_upload_bytes', '524288000', 'Maximum original upload size in bytes (500 MiB)'),
  ('max_duration_seconds', '300', 'Maximum original video duration in seconds (5 minutes)'),
  ('max_excerpt_seconds', '60', 'Maximum analysed excerpt length per analysis request'),
  ('signed_url_seconds', '600', 'Lifetime of signed playback URLs'),
  ('invitation_days', '7', 'Invitation validity in days'),
  ('job_max_attempts', '3', 'Automatic attempts per job before final failure'),
  ('usage_warning_ratio', '0.8', 'Fraction of allowance at which coaches are warned');

create table public.plans (
  code text primary key,
  name text not null,
  description text not null default '',
  max_teams int not null check (max_teams >= 0),
  max_coaches int not null check (max_coaches >= 0),
  max_players int not null check (max_players >= 0),
  analysis_minutes_per_month int not null check (analysis_minutes_per_month >= 0),
  retained_video_minutes int not null check (retained_video_minutes >= 0),
  price_usd_month numeric(10,2),
  duration_days int,
  stripe_lookup_key text,
  self_serve boolean not null default false,
  provisional boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.plans (code, name, description, max_teams, max_coaches, max_players,
  analysis_minutes_per_month, retained_video_minutes, price_usd_month, duration_days, stripe_lookup_key, self_serve) values
  ('manual', 'Manual review', 'No AI analysis. Upload, manual rep labelling and reports only.', 1, 1, 30, 0, 60, null, null, null, false),
  ('evaluation', '30-day evaluation', 'Owner-activated, time-limited evaluation.', 1, 2, 15, 30, 120, 0, 30, null, false),
  ('founding_pilot', 'Founding pilot', 'Provisional founding pilot allowance.', 1, 2, 30, 120, 600, 99, null, 'founding_pilot_monthly', false),
  ('standard', 'Standard', 'Provisional standard allowance.', 1, 2, 30, 120, 600, 149, null, 'standard_monthly', true);

-- ---------------------------------------------------------------------------
-- Organisations, teams, membership
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  sport text not null default 'softball' check (sport in ('softball','gym','multi')),
  display_name text,
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$'),
  retention_days int not null default 365 check (retention_days between 30 and 3650),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  sport text not null default 'softball' check (sport in ('softball','gym','multi')),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (org_id, id)
);
create index teams_org_idx on public.teams(org_id);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','coach','athlete')),
  all_teams boolean not null default false,
  status text not null default 'active' check (status in ('active','revoked')),
  display_name text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (org_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id) where status = 'active';

create table public.team_assignments (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (membership_id, team_id)
);
create index team_assignments_team_idx on public.team_assignments(team_id);

create table public.org_attestations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('recording_permission','data_use_notice')),
  text_version text not null,
  accepted_by uuid not null references auth.users(id),
  accepted_at timestamptz not null default now()
);
create index org_attestations_org_idx on public.org_attestations(org_id);

create table public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Players and athlete accounts
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 1 and 120),
  jersey_number text check (jersey_number is null or char_length(jersey_number) <= 8),
  position text check (position is null or char_length(position) <= 60),
  bats_throws text check (bats_throws is null or char_length(bats_throws) <= 20),
  notes text check (notes is null or char_length(notes) <= 4000),
  consent_status text not null default 'not_recorded' check (consent_status in ('not_recorded','on_file','not_required','withdrawn')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (org_id, team_id) references public.teams(org_id, id)
);
create index players_team_idx on public.players(team_id);
create index players_org_idx on public.players(org_id);

create table public.athlete_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (player_id, user_id)
);
create index athlete_links_user_idx on public.athlete_links(user_id) where revoked_at is null;

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email extensions.citext not null,
  role text not null check (role in ('coach','athlete')),
  all_teams boolean not null default false,
  team_ids uuid[] not null default '{}',
  player_id uuid references public.players(id) on delete cascade,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  check (role <> 'athlete' or player_id is not null)
);
create index invitations_org_idx on public.invitations(org_id);

-- ---------------------------------------------------------------------------
-- Practice sessions and videos
-- ---------------------------------------------------------------------------
create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  session_date date not null,
  title text not null check (char_length(title) between 1 and 160),
  coach_user_id uuid references auth.users(id),
  drill_type text not null check (drill_type in ('gym_test','softball_hitting','softball_pitching','other')),
  intended_target text check (intended_target is null or char_length(intended_target) <= 200),
  notes text check (notes is null or char_length(notes) <= 8000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (org_id, team_id) references public.teams(org_id, id)
);
create index practice_sessions_team_date_idx on public.practice_sessions(team_id, session_date desc);

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  session_id uuid references public.practice_sessions(id) on delete set null,
  player_id uuid references public.players(id) on delete set null,
  drill_type text not null check (drill_type in ('gym_test','softball_hitting','softball_pitching','other')),
  pitch_type text check (pitch_type is null or char_length(pitch_type) <= 60),
  intended_target text check (intended_target is null or char_length(intended_target) <= 200),
  source_device_label text check (source_device_label is null or char_length(source_device_label) <= 80),
  original_filename text check (original_filename is null or char_length(original_filename) <= 255),
  storage_path text not null unique,
  preview_path text,
  container_ext text not null check (container_ext in ('mp4','mov')),
  declared_size_bytes bigint not null check (declared_size_bytes > 0),
  size_bytes bigint,
  sha256 text,
  duration_s numeric(10,3),
  width int,
  height int,
  display_width int,
  display_height int,
  fps numeric(8,3),
  rotation int,
  video_codec text,
  has_audio boolean,
  probe jsonb,
  upload_status text not null default 'pending_upload'
    check (upload_status in ('pending_upload','uploaded','probing','ready','rejected')),
  rejection_reason text,
  status text not null default 'uploaded'
    check (status in ('uploaded','queued','processing','ready_for_review','approved','published','failed','cancelled')),
  status_detail text,
  current_generation int not null default 0,
  attribution_confirmed_by uuid references auth.users(id),
  attribution_confirmed_at timestamptz,
  shared_with_athlete boolean not null default false,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  purged_at timestamptz,
  foreign key (org_id, team_id) references public.teams(org_id, id)
);
create index videos_team_created_idx on public.videos(team_id, created_at desc) where deleted_at is null;
create index videos_player_idx on public.videos(player_id) where deleted_at is null;
create index videos_session_idx on public.videos(session_id);
create index videos_org_status_idx on public.videos(org_id, status) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Usage, entitlement and billing
-- ---------------------------------------------------------------------------
create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.plans(code),
  source text not null check (source in ('default','manual','evaluation','pilot_code','stripe')),
  status text not null default 'active' check (status in ('active','superseded','expired','cancelled')),
  max_teams int,
  max_coaches int,
  max_players int,
  analysis_minutes_per_month int,
  retained_video_minutes int,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  granted_by uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
create unique index entitlements_one_active on public.entitlements(org_id) where status = 'active';
create unique index entitlements_one_evaluation on public.entitlements(org_id) where source = 'evaluation';

create table public.subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text,
  plan_code text references public.plans(code),
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text
);

create table public.pilot_codes (
  code_hash text primary key,
  plan_code text not null references public.plans(code),
  max_redemptions int not null default 1,
  redemptions int not null default 0,
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Jobs, analysis provenance and review
-- ---------------------------------------------------------------------------
create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_id uuid references public.videos(id) on delete cascade,
  kind text not null check (kind in ('probe','analyze','purge')),
  request_kind text not null default 'system' check (request_kind in ('system','initial','reanalysis')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  fence bigint not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  last_error text,
  error_history jsonb not null default '[]'::jsonb,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index processing_jobs_claim_idx on public.processing_jobs(run_after) where status = 'queued';
create index processing_jobs_lease_idx on public.processing_jobs(lease_expires_at) where status = 'running';
create index processing_jobs_video_idx on public.processing_jobs(video_id);
create unique index processing_jobs_one_active_analysis on public.processing_jobs(video_id)
  where kind = 'analyze' and status in ('queued','running');

create table public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null unique references public.processing_jobs(id) on delete cascade,
  video_id uuid references public.videos(id) on delete set null,
  period_start date not null,
  seconds_reserved numeric(10,3) not null check (seconds_reserved > 0),
  seconds_settled numeric(10,3),
  status text not null default 'reserved' check (status in ('reserved','settled','released')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index usage_reservations_org_period_idx on public.usage_reservations(org_id, period_start);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.processing_jobs(id) on delete set null,
  run_id uuid,
  kind text not null check (kind in ('analysis_seconds','provider_request','storage_upload','storage_purge')),
  customer_billable boolean not null default false,
  quantity numeric(14,3) not null default 0,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  model text,
  estimated_cost_usd numeric(12,6),
  idempotency_key text not null unique,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index usage_events_org_created_idx on public.usage_events(org_id, created_at desc);

create table public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  job_id uuid not null unique references public.processing_jobs(id) on delete cascade,
  generation int not null,
  status text not null check (status in ('succeeded','failed','abstained')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  analysis_version text not null,
  drill_template text not null,
  video_sha256 text,
  range_start_s numeric(10,3) not null,
  range_end_s numeric(10,3) not null,
  extraction_settings jsonb not null,
  validated_output jsonb,
  abstentions jsonb not null default '[]'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  provider_requests int not null default 0,
  processing_ms bigint,
  estimated_cost_usd numeric(12,6),
  error text,
  created_at timestamptz not null default now(),
  check (range_end_s > range_start_s)
);
create index analysis_runs_video_idx on public.analysis_runs(video_id, created_at desc);

-- Immutable raw provider responses per window (one row per provider request attempt)
create table public.analysis_raw_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.processing_jobs(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  window_index int not null,
  attempt int not null default 1,
  window_start_s numeric(10,3) not null,
  window_end_s numeric(10,3) not null,
  frame_timestamps jsonb not null,
  request_meta jsonb not null default '{}'::jsonb,
  response_text text,
  stop_reason text,
  usage jsonb not null default '{}'::jsonb,
  validation_status text not null check (validation_status in ('valid','invalid','error')),
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, window_index, attempt)
);

create table public.detected_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  run_id uuid not null references public.analysis_runs(id) on delete cascade,
  seq int not null,
  event_type text not null check (event_type in ('rep','swing','pitch','setup','transition','other')),
  activity_label text not null,
  start_s numeric(10,3) not null,
  end_s numeric(10,3) not null,
  visibility text not null check (visibility in ('clear','partial','poor')),
  suggested_outcome text check (suggested_outcome in ('swing_miss','foul','fair_contact','unclear','target_hit','target_missed')),
  evidence text not null,
  abstention_reason text check (abstention_reason in ('occlusion','blur','cropped_body','missing_ball','missing_target','ambiguous_movement','insufficient_temporal_resolution')),
  source_windows int[] not null default '{}',
  created_at timestamptz not null default now(),
  check (end_s > start_s),
  unique (run_id, seq)
);
create index detected_events_video_idx on public.detected_events(video_id);

create table public.draft_observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  run_id uuid not null references public.analysis_runs(id) on delete cascade,
  t_start_s numeric(10,3) not null,
  t_end_s numeric(10,3) not null,
  category text not null check (category in ('stance','stride','balance','finish','setup','hinge','lunge','posture','other')),
  observation text not null,
  evidence text not null,
  limitations text not null default '',
  review_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (t_end_s >= t_start_s)
);
create index draft_observations_video_idx on public.draft_observations(video_id);

-- Coach working set (editable). One "generation" per analysis seeding; manual items use the current generation.
create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  generation int not null,
  origin_event_id uuid references public.detected_events(id) on delete set null,
  origin text not null check (origin in ('model','coach')),
  event_type text not null check (event_type in ('rep','swing','pitch','setup','transition','other')),
  activity_label text not null default 'unknown',
  start_s numeric(10,3) not null,
  end_s numeric(10,3) not null,
  included boolean not null default true,
  outcome text check (outcome in ('swing_miss','foul','fair_contact','unclear','target_hit','target_missed')),
  outcome_source text check (outcome_source in ('model_suggestion','coach')),
  coach_note text check (coach_note is null or char_length(coach_note) <= 2000),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_s > start_s)
);
create index review_items_video_gen_idx on public.review_items(video_id, generation, start_s);

create table public.review_observations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  generation int not null,
  origin_observation_id uuid references public.draft_observations(id) on delete set null,
  origin text not null check (origin in ('model','coach')),
  t_start_s numeric(10,3) not null,
  t_end_s numeric(10,3) not null,
  text text not null check (char_length(text) between 1 and 2000),
  evidence text,
  included boolean not null default false,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index review_observations_video_gen_idx on public.review_observations(video_id, generation);

create table public.coach_revisions (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  item_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  actor uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index coach_revisions_video_idx on public.coach_revisions(video_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  player_id uuid not null references public.players(id) on delete cascade,
  video_id uuid not null references public.videos(id) on delete cascade,
  version int not null,
  generation int not null,
  run_id uuid references public.analysis_runs(id) on delete set null,
  status text not null check (status in ('approved','published','superseded','retracted')),
  snapshot jsonb not null,
  coach_feedback text check (coach_feedback is null or char_length(coach_feedback) <= 8000),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (video_id, version)
);
create index reports_player_idx on public.reports(player_id, status);
create unique index reports_one_pending_per_video on public.reports(video_id) where status = 'approved';
create unique index reports_one_published_per_video on public.reports(video_id) where status = 'published';

create table public.comparisons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  video_a uuid not null references public.videos(id) on delete cascade,
  video_b uuid not null references public.videos(id) on delete cascade,
  notes text check (notes is null or char_length(notes) <= 8000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_a, video_b)
);

create table public.audit_events (
  id bigserial primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  actor uuid,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events(org_id, created_at desc);

create table public.worker_heartbeats (
  worker_id text primary key,
  version text,
  capabilities jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now()
);
