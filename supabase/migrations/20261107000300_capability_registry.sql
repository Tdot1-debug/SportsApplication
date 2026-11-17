-- Record which capability-registry version and activity produced each analysis run.
-- The worker writes extraction_settings.registry = {version, activity_id, activity_status}. Runs made before the
-- registry existed keep NULL here and are shown as "pre-registry"; they are never relabelled under a later version.
alter table public.analysis_runs
  add column registry_version text generated always as (extraction_settings->'registry'->>'version') stored,
  add column activity_id text generated always as (extraction_settings->'registry'->>'activity_id') stored;
create index analysis_runs_registry_idx on public.analysis_runs(registry_version, activity_id);
