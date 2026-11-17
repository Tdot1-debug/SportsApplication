-- Worker queue RPCs (service_role only) and private storage bucket + policies.

create or replace function private.expire_leases() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select * from public.processing_jobs where status = 'running' and lease_expires_at < now() for update skip locked loop
    n := n + 1;
    if r.attempts >= r.max_attempts then
      update public.processing_jobs set status = 'failed', fence = fence + 1, finished_at = now(), lease_owner = null,
        last_error = 'Worker lease expired on final attempt',
        error_history = error_history || jsonb_build_object('at', now(), 'error', 'lease expired', 'attempt', r.attempts)
      where id = r.id;
      perform private.on_job_final_failure(r.id, 'Processing stopped unexpectedly. You can retry.');
    else
      update public.processing_jobs set status = 'queued', fence = fence + 1, lease_owner = null, lease_expires_at = null,
        run_after = now() + make_interval(secs => 30 * power(2, greatest(r.attempts - 1, 0))),
        last_error = 'Worker lease expired; retrying',
        error_history = error_history || jsonb_build_object('at', now(), 'error', 'lease expired', 'attempt', r.attempts)
      where id = r.id;
    end if;
  end loop;
  return n;
end $$;

create or replace function private.on_job_final_failure(p_job uuid, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  select * into j from public.processing_jobs where id = p_job;
  if j.kind = 'analyze' then
    perform private.release_reservation(j.id);
    update public.videos set status = 'failed', status_detail = p_message where id = j.video_id and deleted_at is null;
  elsif j.kind = 'probe' then
    update public.videos set upload_status = 'rejected', rejection_reason = p_message where id = j.video_id and deleted_at is null;
  end if;
end $$;

create or replace function public.worker_heartbeat(p_worker text, p_version text, p_capabilities jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.worker_heartbeats (worker_id, version, capabilities, last_seen_at)
  values (p_worker, p_version, coalesce(p_capabilities, '{}'::jsonb), now())
  on conflict (worker_id) do update set version = excluded.version, capabilities = excluded.capabilities, last_seen_at = now();
$$;

-- Atomically claim one job. Returns null when nothing is runnable.
create or replace function public.claim_job(p_worker text, p_kinds text[], p_lease_seconds int default 120) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs; v public.videos;
begin
  perform private.expire_leases();
  select * into j from public.processing_jobs
    where status = 'queued' and run_after <= now() and kind = any(p_kinds)
    order by run_after, created_at
    for update skip locked limit 1;
  if j.id is null then return null; end if;
  if j.video_id is not null then select * into v from public.videos where id = j.video_id; end if;
  if j.kind in ('probe','analyze') and (v.id is null or v.deleted_at is not null) then
    update public.processing_jobs set status = 'cancelled', finished_at = now(), last_error = 'Video deleted' where id = j.id;
    perform private.release_reservation(j.id);
    return null;
  end if;
  update public.processing_jobs set status = 'running', attempts = attempts + 1, fence = fence + 1,
    lease_owner = p_worker, lease_expires_at = now() + make_interval(secs => p_lease_seconds), heartbeat_at = now(),
    started_at = coalesce(started_at, now())
  where id = j.id returning * into j;
  if j.kind = 'probe' then
    update public.videos set upload_status = 'probing' where id = j.video_id and upload_status = 'uploaded';
  elsif j.kind = 'analyze' then
    update public.videos set status = 'processing', status_detail = null where id = j.video_id;
  end if;
  return jsonb_build_object(
    'id', j.id, 'kind', j.kind, 'fence', j.fence, 'attempt', j.attempts, 'max_attempts', j.max_attempts,
    'request_kind', j.request_kind, 'payload', j.payload, 'org_id', j.org_id,
    'video', case when v.id is null then null else jsonb_build_object(
       'id', v.id, 'storage_path', v.storage_path, 'container_ext', v.container_ext, 'duration_s', v.duration_s,
       'fps', v.fps, 'width', v.width, 'height', v.height, 'rotation', v.rotation, 'sha256', v.sha256,
       'drill_type', v.drill_type, 'pitch_type', v.pitch_type, 'intended_target', v.intended_target,
       'declared_size_bytes', v.declared_size_bytes, 'size_bytes', v.size_bytes) end,
    'limits', jsonb_build_object('max_upload_bytes', private.cfg_num('max_upload_bytes'),
       'max_duration_seconds', private.cfg_num('max_duration_seconds'),
       'max_excerpt_seconds', private.cfg_num('max_excerpt_seconds'))
  );
end $$;

-- Returns false when the worker must stop (stale fence, cancelled, video deleted).
create or replace function public.heartbeat_job(p_job uuid, p_fence bigint, p_lease_seconds int default 120) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.processing_jobs j set lease_expires_at = now() + make_interval(secs => p_lease_seconds), heartbeat_at = now()
  where j.id = p_job and j.fence = p_fence and j.status = 'running'
    and (j.kind = 'purge' or exists (select 1 from public.videos v where v.id = j.video_id and v.deleted_at is null));
  get diagnostics n = row_count;
  return n = 1;
end $$;

create or replace function private.lock_live_job(p_job uuid, p_fence bigint) returns public.processing_jobs
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  select * into j from public.processing_jobs where id = p_job for update;
  if j.id is null or j.fence <> p_fence or j.status <> 'running' then return null; end if;
  if j.kind in ('probe','analyze') and exists (select 1 from public.videos where id = j.video_id and deleted_at is not null) then
    return null;
  end if;
  return j;
end $$;

create or replace function public.fail_job(p_job uuid, p_fence bigint, p_error text, p_retryable boolean, p_user_message text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  j := private.lock_live_job(p_job, p_fence);
  if j.id is null then return 'stale'; end if;
  if p_retryable and j.attempts < j.max_attempts then
    update public.processing_jobs set status = 'queued', lease_owner = null, lease_expires_at = null,
      run_after = now() + make_interval(secs => 30 * power(2, j.attempts - 1)), last_error = left(p_error, 2000),
      error_history = error_history || jsonb_build_object('at', now(), 'error', left(p_error, 500), 'attempt', j.attempts)
    where id = j.id;
    if j.kind = 'analyze' then
      update public.videos set status = 'queued', status_detail = 'Retrying after a temporary error' where id = j.video_id;
    end if;
    return 'retry_scheduled';
  end if;
  update public.processing_jobs set status = 'failed', finished_at = now(), lease_owner = null, last_error = left(p_error, 2000),
    error_history = error_history || jsonb_build_object('at', now(), 'error', left(p_error, 500), 'attempt', j.attempts)
  where id = j.id;
  perform private.on_job_final_failure(j.id, coalesce(p_user_message, 'Processing failed. You can retry or review manually.'));
  return 'failed';
end $$;

create or replace function public.complete_probe(p_job uuid, p_fence bigint, p_ok boolean, p_reason text, p_meta jsonb, p_preview_path text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs; v public.videos; v_dur numeric;
begin
  j := private.lock_live_job(p_job, p_fence);
  if j.id is null or j.kind <> 'probe' then return 'stale'; end if;
  select * into v from public.videos where id = j.video_id for update;
  v_dur := nullif(p_meta->>'duration_s', '')::numeric;
  if p_ok and (v_dur is null or v_dur <= 0) then p_ok := false; p_reason := 'Could not read the video duration'; end if;
  if p_ok and v_dur > private.cfg_num('max_duration_seconds') + 0.5 then
    p_ok := false; p_reason := format('Video is %s s long; the limit is %s s.', round(v_dur, 1), private.cfg_num('max_duration_seconds'));
  end if;
  if p_ok and p_preview_path is not null and p_preview_path not like (v.org_id::text || '/' || v.id::text || '/%') then
    raise exception 'Preview path outside the video prefix';
  end if;
  update public.videos set
    upload_status = case when p_ok then 'ready' else 'rejected' end,
    rejection_reason = case when p_ok then null else left(p_reason, 500) end,
    duration_s = v_dur,
    width = nullif(p_meta->>'width', '')::int, height = nullif(p_meta->>'height', '')::int,
    display_width = nullif(p_meta->>'display_width', '')::int, display_height = nullif(p_meta->>'display_height', '')::int,
    fps = nullif(p_meta->>'fps', '')::numeric, rotation = nullif(p_meta->>'rotation', '')::int,
    video_codec = p_meta->>'video_codec', has_audio = (p_meta->>'has_audio')::boolean,
    sha256 = p_meta->>'sha256', size_bytes = coalesce(nullif(p_meta->>'size_bytes', '')::bigint, size_bytes),
    probe = p_meta->'raw', preview_path = p_preview_path
  where id = v.id;
  update public.processing_jobs set status = 'succeeded', finished_at = now(), lease_owner = null where id = j.id;
  return case when p_ok then 'ready' else 'rejected' end;
end $$;

-- Raw provider output (immutable) and internal provider cost. Accepted even from a stale worker
-- because the provider cost was really incurred; it never changes customer-facing results.
create or replace function public.record_provider_call(p_job uuid, p_fence bigint, p_call jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  select * into j from public.processing_jobs where id = p_job;
  if j.id is null then return; end if;
  insert into public.analysis_raw_outputs (org_id, job_id, video_id, window_index, attempt, window_start_s, window_end_s,
     frame_timestamps, request_meta, response_text, stop_reason, usage, validation_status, validation_errors)
  values (j.org_id, j.id, j.video_id, (p_call->>'window_index')::int,
     (p_fence * 100 + coalesce((p_call->>'attempt')::int, 1))::int,
     (p_call->>'window_start_s')::numeric, (p_call->>'window_end_s')::numeric,
     coalesce(p_call->'frame_timestamps', '[]'), coalesce(p_call->'request_meta', '{}'), p_call->>'response_text',
     p_call->>'stop_reason', coalesce(p_call->'usage', '{}'), p_call->>'validation_status',
     coalesce(p_call->'validation_errors', '[]'))
  on conflict (job_id, window_index, attempt) do nothing;
  insert into public.usage_events (org_id, job_id, kind, customer_billable, quantity, input_tokens, output_tokens,
     cache_read_tokens, model, estimated_cost_usd, idempotency_key, details)
  values (j.org_id, j.id, 'provider_request', false, 1, (p_call->'usage'->>'input_tokens')::bigint,
     (p_call->'usage'->>'output_tokens')::bigint, (p_call->'usage'->>'cache_read_input_tokens')::bigint,
     p_call->'request_meta'->>'model', (p_call->>'estimated_cost_usd')::numeric,
     'provider:' || j.id::text || ':' || p_fence::text || ':' || (p_call->>'window_index') || ':' || coalesce(p_call->>'attempt', '1'),
     jsonb_build_object('window_index', p_call->'window_index', 'fence', p_fence))
  on conflict (idempotency_key) do nothing;
end $$;

create or replace function public.complete_analysis(p_job uuid, p_fence bigint, p_result jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs; v public.videos; v_run uuid; v_gen int; e jsonb; o jsonb; v_event uuid;
        v_start numeric; v_end numeric; v_len numeric; v_status text;
begin
  j := private.lock_live_job(p_job, p_fence);
  if j.id is null or j.kind <> 'analyze' then return 'stale'; end if;
  if exists (select 1 from public.analysis_runs where job_id = j.id) then return 'duplicate'; end if;
  select * into v from public.videos where id = j.video_id for update;
  v_start := (p_result->>'range_start_s')::numeric;
  v_end := (p_result->>'range_end_s')::numeric;
  if v_start is null or v_end is null or v_start < 0 or v_end <= v_start or v_end > v.duration_s + 0.05 then
    raise exception 'Analysis range invalid';
  end if;
  v_status := coalesce(p_result->>'status', 'succeeded');
  v_gen := v.current_generation + 1;

  insert into public.analysis_runs (org_id, video_id, job_id, generation, status, provider, model, prompt_version,
     analysis_version, drill_template, video_sha256, range_start_s, range_end_s, extraction_settings, validated_output,
     abstentions, limitations, input_tokens, output_tokens, provider_requests, processing_ms, estimated_cost_usd)
  values (v.org_id, v.id, j.id, v_gen, v_status, p_result->>'provider', p_result->>'model', p_result->>'prompt_version',
     p_result->>'analysis_version', p_result->>'drill_template', p_result->>'video_sha256', v_start, v_end,
     coalesce(p_result->'extraction_settings', '{}'), p_result->'validated_output',
     coalesce(p_result->'abstentions', '[]'), coalesce(p_result->'limitations', '[]'),
     coalesce((p_result->>'input_tokens')::bigint, 0), coalesce((p_result->>'output_tokens')::bigint, 0),
     coalesce((p_result->>'provider_requests')::int, 0), (p_result->>'processing_ms')::bigint,
     (p_result->>'estimated_cost_usd')::numeric)
  returning id into v_run;

  for e in select * from jsonb_array_elements(coalesce(p_result->'events', '[]')) loop
    if (e->>'start_s')::numeric < v_start - 0.05 or (e->>'end_s')::numeric > v_end + 0.05
       or (e->>'end_s')::numeric <= (e->>'start_s')::numeric then
      raise exception 'Event outside analysed range';
    end if;
    if e->>'suggested_outcome' is not null then
      perform private.validate_outcome(v.drill_type, e->>'suggested_outcome');
    end if;
    insert into public.detected_events (org_id, video_id, run_id, seq, event_type, activity_label, start_s, end_s, visibility,
       suggested_outcome, evidence, abstention_reason, source_windows)
    values (v.org_id, v.id, v_run, (e->>'seq')::int, e->>'event_type', coalesce(e->>'activity_label', 'unknown'),
       (e->>'start_s')::numeric, (e->>'end_s')::numeric, e->>'visibility', e->>'suggested_outcome', e->>'evidence',
       e->>'abstention_reason',
       coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(e->'source_windows', '[]')) x), '{}'))
    returning id into v_event;
    insert into public.review_items (org_id, video_id, generation, origin_event_id, origin, event_type, activity_label,
       start_s, end_s, included, outcome, outcome_source)
    values (v.org_id, v.id, v_gen, v_event, 'model', e->>'event_type', coalesce(e->>'activity_label', 'unknown'),
       (e->>'start_s')::numeric, (e->>'end_s')::numeric,
       (e->>'event_type') not in ('setup','transition','other'),
       e->>'suggested_outcome', case when e->>'suggested_outcome' is not null then 'model_suggestion' end);
  end loop;

  for o in select * from jsonb_array_elements(coalesce(p_result->'observations', '[]')) loop
    insert into public.draft_observations (org_id, video_id, run_id, t_start_s, t_end_s, category, observation, evidence,
       limitations, review_questions)
    values (v.org_id, v.id, v_run, (o->>'t_start_s')::numeric, (o->>'t_end_s')::numeric, o->>'category', o->>'observation',
       o->>'evidence', coalesce(o->>'limitations', ''), coalesce(o->'review_questions', '[]'))
    returning id into v_event;
    insert into public.review_observations (org_id, video_id, generation, origin_observation_id, origin, t_start_s, t_end_s,
       text, evidence, included)
    values (v.org_id, v.id, v_gen, v_event, 'model', (o->>'t_start_s')::numeric, (o->>'t_end_s')::numeric,
       o->>'observation', o->>'evidence', false);
  end loop;

  update public.videos set current_generation = v_gen, status = 'ready_for_review',
    status_detail = case when v_status = 'abstained' then 'Model abstained on part or all of the excerpt' else null end
  where id = v.id;

  -- Idempotent settlement: only a 'reserved' reservation is settled, exactly once.
  v_len := v_end - v_start;
  update public.usage_reservations set status = 'settled', seconds_settled = v_len, resolved_at = now()
    where job_id = j.id and status = 'reserved';
  insert into public.usage_events (org_id, job_id, run_id, kind, customer_billable, quantity, idempotency_key, details)
    values (v.org_id, j.id, v_run, 'analysis_seconds', true, v_len, 'settle:' || j.id::text,
            jsonb_build_object('video_id', v.id, 'request_kind', j.request_kind))
    on conflict (idempotency_key) do nothing;
  update public.processing_jobs set status = 'succeeded', finished_at = now(), lease_owner = null where id = j.id;
  insert into public.audit_events (org_id, actor, action, target_type, target_id, details)
    values (v.org_id, null, 'analysis.completed', 'video', v.id::text, jsonb_build_object('run_id', v_run, 'generation', v_gen));
  return 'completed';
end $$;

create or replace function public.complete_purge(p_job uuid, p_fence bigint, p_objects_removed int) returns text
language plpgsql security definer set search_path = '' as $$
declare j public.processing_jobs;
begin
  j := private.lock_live_job(p_job, p_fence);
  if j.id is null or j.kind <> 'purge' then return 'stale'; end if;
  delete from public.analysis_raw_outputs where video_id = j.video_id;
  delete from public.review_items where video_id = j.video_id;
  delete from public.review_observations where video_id = j.video_id;
  delete from public.reports where video_id = j.video_id;
  delete from public.comparisons where video_a = j.video_id or video_b = j.video_id;
  delete from public.analysis_runs where video_id = j.video_id;
  update public.videos set purged_at = now(), probe = null, original_filename = null, sha256 = null
    where id = j.video_id and deleted_at is not null;
  insert into public.usage_events (org_id, job_id, kind, quantity, idempotency_key, details)
    values (j.org_id, j.id, 'storage_purge', coalesce(p_objects_removed, 0), 'purge:' || j.id::text,
            jsonb_build_object('video_id', j.video_id))
    on conflict (idempotency_key) do nothing;
  update public.processing_jobs set status = 'succeeded', finished_at = now(), lease_owner = null where id = j.id;
  return 'purged';
end $$;

-- Retention: soft-delete videos older than each organisation's retention window.
create or replace function public.enqueue_retention_purges() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select v.id from public.videos v join public.organizations o on o.id = v.org_id
           where v.deleted_at is null and v.created_at < now() - make_interval(days => o.retention_days)
           limit 200 loop
    perform private.soft_delete_video(r.id, 'Retention period elapsed');
    n := n + 1;
  end loop;
  -- Abandoned uploads (never finalised within 2 days) are cleaned up too.
  for r in select id from public.videos where deleted_at is null and upload_status = 'pending_upload'
           and created_at < now() - interval '2 days' limit 200 loop
    perform private.soft_delete_video(r.id, 'Upload never completed');
    n := n + 1;
  end loop;
  update public.entitlements set status = 'expired' where status = 'active' and ends_at is not null and ends_at <= now();
  return n;
end $$;

revoke all on function public.worker_heartbeat, public.claim_job, public.heartbeat_job, public.fail_job, public.complete_probe,
  public.record_provider_call, public.complete_analysis, public.complete_purge, public.enqueue_retention_purges
from public, anon, authenticated;
grant execute on function public.worker_heartbeat, public.claim_job, public.heartbeat_job, public.fail_job, public.complete_probe,
  public.record_provider_call, public.complete_analysis, public.complete_purge, public.enqueue_retention_purges
to service_role;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, path-scoped upload, read via access check
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 524288000, array['video/mp4','video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "videos: upload to own pending path" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and private.can_upload_storage_object(name));

create policy "videos: read with video access" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and (private.can_view_storage_object(name) or private.can_upload_storage_object(name)));

-- Resumable uploads may update the in-progress object; only while the video is still pending.
create policy "videos: resume own pending upload" on storage.objects for update to authenticated
  using (bucket_id = 'videos' and private.can_upload_storage_object(name))
  with check (bucket_id = 'videos' and private.can_upload_storage_object(name));
