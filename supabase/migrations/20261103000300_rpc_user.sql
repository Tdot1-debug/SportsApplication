-- User-facing RPCs. Every function re-derives authority from auth.uid(); no client-supplied
-- organisation or team id is trusted without a membership check.

create or replace function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  return v;
end $$;

create or replace function private.audit(p_org uuid, p_action text, p_type text, p_target text, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (org_id, actor, action, target_type, target_id, details)
  values (p_org, auth.uid(), p_action, p_type, p_target, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function private.period_start() returns date
language sql stable set search_path = '' as $$
  select (date_trunc('month', now() at time zone 'utc'))::date
$$;

-- Effective limits: active, unexpired entitlement; otherwise the 'manual' plan.
create or replace function private.effective_limits(p_org uuid)
returns table (plan_code text, plan_name text, source text, max_teams int, max_coaches int, max_players int,
               analysis_minutes_per_month int, retained_video_minutes int, ends_at timestamptz, provisional boolean)
language sql stable security definer set search_path = '' as $$
  with ent as (
    select e.* from public.entitlements e
    where e.org_id = p_org and e.status = 'active' and e.starts_at <= now()
      and (e.ends_at is null or e.ends_at > now())
    limit 1
  ), chosen as (
    select p.code, p.name, coalesce((select source from ent), 'default') as source,
      coalesce((select e.max_teams from ent e), p.max_teams) as max_teams,
      coalesce((select e.max_coaches from ent e), p.max_coaches) as max_coaches,
      coalesce((select e.max_players from ent e), p.max_players) as max_players,
      coalesce((select e.analysis_minutes_per_month from ent e), p.analysis_minutes_per_month) as amin,
      coalesce((select e.retained_video_minutes from ent e), p.retained_video_minutes) as rmin,
      (select e.ends_at from ent e) as ends_at, p.provisional
    from public.plans p
    where p.code = coalesce((select plan_code from ent), 'manual')
  )
  select code, name, source, max_teams, max_coaches, max_players, amin, rmin, ends_at, provisional from chosen
$$;

create trigger players_guard before insert or update on public.players
  for each row execute function private.players_guard();

create or replace function private.analysis_seconds_used(p_org uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when status = 'settled' then seconds_settled
                           when status = 'reserved' then seconds_reserved else 0 end), 0)
  from public.usage_reservations
  where org_id = p_org and period_start = private.period_start()
$$;

create or replace function private.retained_seconds(p_org uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(coalesce(duration_s, 0)), 0) from public.videos
  where org_id = p_org and deleted_at is null and upload_status in ('uploaded','probing','ready')
$$;

create or replace function private.hit_rate_limit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
        v_hits int;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return v_hits <= p_max;
end $$;

-- ---------------------------------------------------------------------------
-- Organisations, teams, membership
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text, p_sport text, p_team_name text, p_recording_attested boolean, p_notice_accepted boolean,
  p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_org uuid; v_team uuid; v_member uuid;
begin
  if not coalesce(p_recording_attested, false) or not coalesce(p_notice_accepted, false) then
    raise exception 'Recording permission attestation and data-use notice acceptance are required';
  end if;
  if not private.hit_rate_limit('create_org:' || v_user::text, 5, 86400) then
    raise exception 'Too many organisations created today. Try again tomorrow.';
  end if;
  insert into public.organizations (name, sport, created_by) values (trim(p_name), p_sport, v_user) returning id into v_org;
  insert into public.memberships (org_id, user_id, role, all_teams, display_name)
    values (v_org, v_user, 'owner', true, nullif(trim(p_display_name), '')) returning id into v_member;
  insert into public.teams (org_id, name, sport) values (v_org, trim(p_team_name), case when p_sport = 'multi' then 'softball' else p_sport end)
    returning id into v_team;
  insert into public.org_attestations (org_id, kind, text_version, accepted_by) values
    (v_org, 'recording_permission', '2026-11-v1', v_user),
    (v_org, 'data_use_notice', '2026-11-v1', v_user);
  insert into public.entitlements (org_id, plan_code, source, granted_by, note)
    values (v_org, 'manual', 'default', v_user, 'Default manual-review access');
  perform private.audit(v_org, 'organization.created', 'organization', v_org::text, jsonb_build_object('team_id', v_team));
  return v_org;
end $$;

create or replace function public.create_team(p_org uuid, p_name text, p_sport text default 'softball')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_limit int; v_count int;
begin
  perform private.require_user();
  if not private.is_org_owner(p_org) then raise exception 'Only organisation owners can create teams'; end if;
  select max_teams into v_limit from private.effective_limits(p_org);
  select count(*) into v_count from public.teams where org_id = p_org and archived_at is null;
  if v_count >= v_limit then raise exception 'Team limit reached for this plan (% teams).', v_limit; end if;
  insert into public.teams (org_id, name, sport) values (p_org, trim(p_name), p_sport) returning id into v_id;
  perform private.audit(p_org, 'team.created', 'team', v_id::text);
  return v_id;
end $$;

create or replace function private.staff_count(p_org uuid) returns int
language sql stable security definer set search_path = '' as $$
  select (select count(*) from public.memberships where org_id = p_org and status = 'active' and role in ('owner','coach'))::int
       + (select count(*) from public.invitations where org_id = p_org and role = 'coach'
            and accepted_at is null and revoked_at is null and expires_at > now())::int
$$;

create or replace function public.create_invitation(
  p_org uuid, p_email text, p_role text, p_team_ids uuid[] default '{}', p_all_teams boolean default false,
  p_player uuid default null)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_token text; v_id uuid; v_exp timestamptz; v_limit int; v_team uuid;
        v_player_team uuid;
begin
  if p_role not in ('coach','athlete') then raise exception 'Invalid role'; end if;
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'A valid email address is required'; end if;
  if not private.hit_rate_limit('invite:' || v_user::text, 50, 86400) then raise exception 'Invitation rate limit reached'; end if;

  if p_role = 'coach' then
    if not private.is_org_owner(p_org) then raise exception 'Only owners can invite coaches'; end if;
    select max_coaches into v_limit from private.effective_limits(p_org);
    if private.staff_count(p_org) >= v_limit then
      raise exception 'Coach limit reached for this plan (% coaches including the owner).', v_limit;
    end if;
    foreach v_team in array coalesce(p_team_ids, '{}') loop
      if not exists (select 1 from public.teams where id = v_team and org_id = p_org) then
        raise exception 'Team does not belong to this organisation';
      end if;
    end loop;
  else
    if p_player is null then raise exception 'Athlete invitations must name a roster player'; end if;
    select team_id into v_player_team from public.players where id = p_player and org_id = p_org and archived_at is null;
    if v_player_team is null or not private.can_access_team(v_player_team) then
      raise exception 'You cannot invite an athlete for this player';
    end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + make_interval(days => private.cfg_num('invitation_days')::int);
  insert into public.invitations (org_id, email, role, all_teams, team_ids, player_id, token_hash, invited_by, expires_at)
  values (p_org, lower(trim(p_email)), p_role, coalesce(p_all_teams, false) and p_role = 'coach',
          case when p_role = 'coach' then coalesce(p_team_ids, '{}') else '{}' end,
          case when p_role = 'athlete' then p_player end,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user, v_exp)
  returning id into v_id;
  perform private.audit(p_org, 'invitation.created', 'invitation', v_id::text, jsonb_build_object('role', p_role));
  return query select v_id, v_token, v_exp;
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations;
begin
  perform private.require_user();
  select * into v_inv from public.invitations where id = p_invitation;
  if v_inv.id is null then raise exception 'Invitation not found'; end if;
  if not (private.is_org_owner(v_inv.org_id) or (v_inv.role = 'athlete' and v_inv.invited_by = auth.uid())) then
    raise exception 'Not allowed';
  end if;
  update public.invitations set revoked_at = now() where id = p_invitation and accepted_at is null;
  perform private.audit(v_inv.org_id, 'invitation.revoked', 'invitation', p_invitation::text);
end $$;

-- Minimal preview so the invite page can explain what is being accepted. Requires sign-in.
create or replace function public.get_invitation_preview(p_token text)
returns table (organization_name text, role text, email_matches boolean, state text)
language plpgsql stable security definer set search_path = '' as $$
declare v_inv public.invitations; v_email text;
begin
  perform private.require_user();
  select * into v_inv from public.invitations where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_inv.id is null then return query select null::text, null::text, false, 'invalid'; return; end if;
  select email into v_email from auth.users where id = auth.uid();
  return query select o.name, v_inv.role, lower(v_email) = lower(v_inv.email::text),
    case when v_inv.revoked_at is not null then 'revoked'
         when v_inv.accepted_at is not null then 'used'
         when v_inv.expires_at <= now() then 'expired' else 'valid' end
  from public.organizations o where o.id = v_inv.org_id;
end $$;

create or replace function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_inv public.invitations; v_email text; v_confirmed timestamptz;
        v_member uuid; v_existing public.memberships; v_team uuid; v_limit int;
begin
  if not private.hit_rate_limit('accept_invite:' || v_user::text, 20, 3600) then raise exception 'Too many attempts'; end if;
  select * into v_inv from public.invitations
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if v_inv.id is null then raise exception 'Invitation not found'; end if;
  if v_inv.revoked_at is not null then raise exception 'This invitation was revoked'; end if;
  if v_inv.accepted_at is not null then raise exception 'This invitation has already been used'; end if;
  if v_inv.expires_at <= now() then raise exception 'This invitation has expired'; end if;
  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = v_user;
  if v_confirmed is null then raise exception 'Confirm your email address before accepting invitations'; end if;
  if lower(v_email) <> lower(v_inv.email::text) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  select * into v_existing from public.memberships where org_id = v_inv.org_id and user_id = v_user;
  if v_inv.role = 'coach' then
    if v_existing.id is not null and v_existing.status = 'active' and v_existing.role in ('owner','coach') then
      raise exception 'You are already staff in this organisation';
    end if;
    select max_coaches into v_limit from private.effective_limits(v_inv.org_id);
    -- staff_count includes this pending invitation; it is consumed below.
    if private.staff_count(v_inv.org_id) > v_limit then raise exception 'Coach limit reached for this plan'; end if;
    if v_existing.id is not null then
      update public.memberships set role = 'coach', status = 'active', revoked_at = null, all_teams = v_inv.all_teams
        where id = v_existing.id returning id into v_member;
      delete from public.team_assignments where membership_id = v_member;
    else
      insert into public.memberships (org_id, user_id, role, all_teams) values (v_inv.org_id, v_user, 'coach', v_inv.all_teams)
        returning id into v_member;
    end if;
    foreach v_team in array v_inv.team_ids loop
      insert into public.team_assignments (membership_id, team_id, org_id)
      select v_member, t.id, t.org_id from public.teams t where t.id = v_team and t.org_id = v_inv.org_id
      on conflict do nothing;
    end loop;
  else
    if v_existing.id is not null and v_existing.status = 'active' and v_existing.role in ('owner','coach') then
      raise exception 'Staff accounts cannot also be linked as athletes in the same organisation';
    end if;
    if v_existing.id is null then
      insert into public.memberships (org_id, user_id, role) values (v_inv.org_id, v_user, 'athlete') returning id into v_member;
    else
      update public.memberships set role = 'athlete', status = 'active', revoked_at = null where id = v_existing.id returning id into v_member;
    end if;
    insert into public.athlete_links (org_id, player_id, user_id) values (v_inv.org_id, v_inv.player_id, v_user)
    on conflict (player_id, user_id) do update set revoked_at = null;
  end if;

  update public.invitations set accepted_at = now(), accepted_by = v_user where id = v_inv.id;
  perform private.audit(v_inv.org_id, 'invitation.accepted', 'invitation', v_inv.id::text, jsonb_build_object('role', v_inv.role));
  return v_inv.org_id;
end $$;

create or replace function public.set_member_teams(p_membership uuid, p_all_teams boolean, p_team_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships; v_team uuid;
begin
  perform private.require_user();
  select * into v_m from public.memberships where id = p_membership;
  if v_m.id is null or not private.is_org_owner(v_m.org_id) then raise exception 'Not allowed'; end if;
  if v_m.role <> 'coach' then raise exception 'Team limits apply to coaches only'; end if;
  update public.memberships set all_teams = coalesce(p_all_teams, false) where id = p_membership;
  delete from public.team_assignments where membership_id = p_membership;
  foreach v_team in array coalesce(p_team_ids, '{}') loop
    insert into public.team_assignments (membership_id, team_id, org_id)
    select p_membership, t.id, t.org_id from public.teams t where t.id = v_team and t.org_id = v_m.org_id;
  end loop;
  perform private.audit(v_m.org_id, 'membership.teams_changed', 'membership', p_membership::text,
    jsonb_build_object('all_teams', p_all_teams, 'team_ids', p_team_ids));
end $$;

create or replace function public.remove_member(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.memberships;
begin
  perform private.require_user();
  select * into v_m from public.memberships where id = p_membership;
  if v_m.id is null or not private.is_org_owner(v_m.org_id) then raise exception 'Not allowed'; end if;
  if v_m.role = 'owner' and (select count(*) from public.memberships where org_id = v_m.org_id and role = 'owner' and status = 'active') <= 1 then
    raise exception 'An organisation must keep at least one owner';
  end if;
  update public.memberships set status = 'revoked', revoked_at = now() where id = p_membership;
  delete from public.team_assignments where membership_id = p_membership;
  update public.athlete_links set revoked_at = now() where org_id = v_m.org_id and user_id = v_m.user_id and revoked_at is null;
  perform private.audit(v_m.org_id, 'membership.revoked', 'membership', p_membership::text);
end $$;

create or replace function public.revoke_athlete_link(p_link uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_l public.athlete_links; v_team uuid;
begin
  perform private.require_user();
  select * into v_l from public.athlete_links where id = p_link;
  select team_id into v_team from public.players where id = v_l.player_id;
  if v_l.id is null or not private.can_access_team(v_team) then raise exception 'Not allowed'; end if;
  update public.athlete_links set revoked_at = now() where id = p_link;
  perform private.audit(v_l.org_id, 'athlete_link.revoked', 'athlete_link', p_link::text);
end $$;

create or replace function public.activate_evaluation(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_days int;
begin
  perform private.require_user();
  if not private.is_org_owner(p_org) then raise exception 'Only owners can activate an evaluation'; end if;
  if exists (select 1 from public.entitlements where org_id = p_org and source = 'evaluation') then
    raise exception 'This organisation has already used its evaluation';
  end if;
  if exists (select 1 from public.entitlements where org_id = p_org and status = 'active' and plan_code not in ('manual')) then
    raise exception 'A paid or pilot plan is already active';
  end if;
  select duration_days into v_days from public.plans where code = 'evaluation';
  update public.entitlements set status = 'superseded' where org_id = p_org and status = 'active';
  insert into public.entitlements (org_id, plan_code, source, ends_at, granted_by, note)
  values (p_org, 'evaluation', 'evaluation', now() + make_interval(days => v_days), auth.uid(), 'Owner-activated evaluation');
  perform private.audit(p_org, 'entitlement.evaluation_activated', 'organization', p_org::text);
end $$;

create or replace function public.redeem_pilot_code(p_org uuid, p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_pc public.pilot_codes;
begin
  perform private.require_user();
  if not private.is_org_owner(p_org) then raise exception 'Only owners can redeem pilot codes'; end if;
  if not private.hit_rate_limit('pilot_code:' || auth.uid()::text, 10, 3600) then raise exception 'Too many attempts. Try again later.'; end if;
  select * into v_pc from public.pilot_codes where code_hash = encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex') for update;
  if v_pc.code_hash is null or (v_pc.expires_at is not null and v_pc.expires_at <= now()) or v_pc.redemptions >= v_pc.max_redemptions then
    raise exception 'That pilot code is not valid';
  end if;
  update public.pilot_codes set redemptions = redemptions + 1 where code_hash = v_pc.code_hash;
  update public.entitlements set status = 'superseded' where org_id = p_org and status = 'active';
  insert into public.entitlements (org_id, plan_code, source, granted_by, note)
  values (p_org, v_pc.plan_code, 'pilot_code', auth.uid(), 'Pilot code redemption');
  perform private.audit(p_org, 'entitlement.pilot_code_redeemed', 'organization', p_org::text, jsonb_build_object('plan', v_pc.plan_code));
  return v_pc.plan_code;
end $$;

create or replace function public.get_usage_summary(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_l record; v_used numeric; v_reserved numeric; v_settled numeric; v_ret numeric; v_ratio numeric;
begin
  perform private.require_user();
  if not private.is_org_staff(p_org) then raise exception 'Not allowed'; end if;
  select * into v_l from private.effective_limits(p_org);
  select coalesce(sum(seconds_settled) filter (where status = 'settled'), 0),
         coalesce(sum(seconds_reserved) filter (where status = 'reserved'), 0)
    into v_settled, v_reserved
  from public.usage_reservations where org_id = p_org and period_start = private.period_start();
  v_used := v_settled + v_reserved;
  v_ret := private.retained_seconds(p_org);
  v_ratio := case when v_l.analysis_minutes_per_month > 0 then v_used / (v_l.analysis_minutes_per_month * 60.0) else null end;
  return jsonb_build_object(
    'plan_code', v_l.plan_code, 'plan_name', v_l.plan_name, 'source', v_l.source, 'ends_at', v_l.ends_at,
    'provisional', v_l.provisional,
    'period_start', private.period_start(),
    'analysis_seconds_limit', v_l.analysis_minutes_per_month * 60,
    'analysis_seconds_settled', v_settled, 'analysis_seconds_reserved', v_reserved,
    'analysis_ratio', v_ratio,
    'analysis_warning', coalesce(v_ratio >= private.cfg_num('usage_warning_ratio'), false),
    'analysis_blocked', v_l.analysis_minutes_per_month = 0 or coalesce(v_ratio >= 1, false),
    'retained_seconds', v_ret, 'retained_seconds_limit', v_l.retained_video_minutes * 60,
    'teams', (select count(*) from public.teams where org_id = p_org and archived_at is null), 'max_teams', v_l.max_teams,
    'staff', private.staff_count(p_org), 'max_coaches', v_l.max_coaches,
    'players', (select count(*) from public.players where org_id = p_org and archived_at is null), 'max_players', v_l.max_players
  );
end $$;

-- ---------------------------------------------------------------------------
-- Videos: upload, finalise, analysis requests, deletion
-- ---------------------------------------------------------------------------
create or replace function public.create_video_upload(
  p_team uuid, p_drill_type text, p_filename text, p_size_bytes bigint, p_container_ext text,
  p_player uuid default null, p_session uuid default null, p_device_label text default null,
  p_pitch_type text default null, p_intended_target text default null, p_unassigned boolean default false)
returns table (video_id uuid, storage_path text)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_org uuid; v_id uuid := gen_random_uuid(); v_path text; v_l record;
begin
  select org_id into v_org from public.teams where id = p_team and archived_at is null;
  if v_org is null or not private.can_access_team(p_team) then raise exception 'You do not have access to this team'; end if;
  if p_player is null and not coalesce(p_unassigned, false) then
    raise exception 'Choose a player or explicitly mark the footage as unassigned';
  end if;
  if p_player is not null and not exists (select 1 from public.players where id = p_player and team_id = p_team and archived_at is null) then
    raise exception 'Player is not on this team';
  end if;
  if p_session is not null and not exists (select 1 from public.practice_sessions where id = p_session and team_id = p_team) then
    raise exception 'Session is not on this team';
  end if;
  if lower(p_container_ext) not in ('mp4','mov') then raise exception 'Only MP4 and MOV files are accepted'; end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > private.cfg_num('max_upload_bytes') then
    raise exception 'File is larger than the % MiB upload limit', (private.cfg_num('max_upload_bytes') / 1048576)::int;
  end if;
  if not private.hit_rate_limit('upload:' || v_user::text, 200, 86400) then raise exception 'Upload rate limit reached'; end if;
  select * into v_l from private.effective_limits(v_org);
  if private.retained_seconds(v_org) >= v_l.retained_video_minutes * 60 then
    raise exception 'Video storage allowance reached (% retained minutes). Delete footage or change plan.', v_l.retained_video_minutes;
  end if;
  v_path := v_org::text || '/' || v_id::text || '/original.' || lower(p_container_ext);
  insert into public.videos (id, org_id, team_id, session_id, player_id, drill_type, pitch_type, intended_target,
     source_device_label, original_filename, storage_path, container_ext, declared_size_bytes, uploaded_by)
  values (v_id, v_org, p_team, p_session, p_player, p_drill_type, nullif(trim(p_pitch_type), ''), nullif(trim(p_intended_target), ''),
     nullif(trim(p_device_label), ''), left(p_filename, 255), v_path, lower(p_container_ext), p_size_bytes, v_user);
  perform private.audit(v_org, 'video.upload_started', 'video', v_id::text);
  return query select v_id, v_path;
end $$;

-- Called after the resumable upload finishes. Verifies the object exists at the authorised path.
create or replace function public.finalize_video_upload(p_video uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_obj record; v_size bigint; v_job uuid;
begin
  perform private.require_user();
  select * into v from public.videos where id = p_video for update;
  if v.id is null or v.deleted_at is not null or not private.can_access_team(v.team_id) then raise exception 'Video not found'; end if;
  if v.uploaded_by <> auth.uid() then raise exception 'Only the uploader can finalise this upload'; end if;
  if v.upload_status <> 'pending_upload' then
    return jsonb_build_object('video_id', v.id, 'upload_status', v.upload_status, 'already_finalized', true);
  end if;
  select o.name, o.metadata into v_obj from storage.objects o where o.bucket_id = 'videos' and o.name = v.storage_path;
  if v_obj.name is null then raise exception 'Upload not found in storage. Retry the upload.'; end if;
  v_size := nullif(v_obj.metadata->>'size', '')::bigint;
  if v_size is null or v_size <= 0 then raise exception 'Uploaded object is empty'; end if;
  if v_size > private.cfg_num('max_upload_bytes') then raise exception 'Uploaded object exceeds the size limit'; end if;
  update public.videos set upload_status = 'uploaded', size_bytes = v_size, status = 'uploaded' where id = v.id;
  insert into public.processing_jobs (org_id, video_id, kind, request_kind, max_attempts, requested_by)
    values (v.org_id, v.id, 'probe', 'system', private.cfg_num('job_max_attempts')::int, auth.uid()) returning id into v_job;
  insert into public.usage_events (org_id, job_id, kind, quantity, idempotency_key, details)
    values (v.org_id, v_job, 'storage_upload', v_size, 'upload:' || v.id::text, jsonb_build_object('video_id', v.id));
  perform private.audit(v.org_id, 'video.upload_finalized', 'video', v.id::text, jsonb_build_object('size', v_size));
  return jsonb_build_object('video_id', v.id, 'upload_status', 'uploaded', 'probe_job_id', v_job);
end $$;

create or replace function private.require_video_staff(p_video uuid) returns public.videos
language plpgsql security definer set search_path = '' as $$
declare v public.videos;
begin
  perform private.require_user();
  select * into v from public.videos where id = p_video;
  if v.id is null or v.deleted_at is not null or not private.can_access_team(v.team_id) then
    raise exception 'Video not found or access denied';
  end if;
  return v;
end $$;

create or replace function public.request_analysis(p_video uuid, p_start_s numeric, p_end_s numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_l record; v_used numeric; v_len numeric; v_job uuid; v_kind text; v_max numeric;
begin
  v := private.require_video_staff(p_video);
  if v.upload_status <> 'ready' then raise exception 'Video is not ready for analysis yet'; end if;
  if v.drill_type = 'other' then raise exception 'Choose a supported drill template before requesting analysis'; end if;
  if not exists (select 1 from public.worker_heartbeats where (capabilities->>'analysis')::boolean
                 and last_seen_at > now() - interval '15 minutes') then
    raise exception 'Automated analysis is unavailable: no analysis worker is configured. Manual review still works.';
  end if;
  v_max := private.cfg_num('max_excerpt_seconds');
  if p_start_s is null or p_end_s is null or p_start_s < 0 or p_end_s <= p_start_s or p_end_s > v.duration_s + 0.05 then
    raise exception 'Excerpt must lie within the video (0 to % s)', v.duration_s;
  end if;
  v_len := least(p_end_s, v.duration_s) - p_start_s;
  if v_len > v_max + 0.001 then raise exception 'Excerpts are limited to % seconds per analysis', v_max; end if;

  -- Serialise allowance checks per organisation.
  perform 1 from public.organizations where id = v.org_id for update;
  select * into v_l from private.effective_limits(v.org_id);
  v_used := private.analysis_seconds_used(v.org_id);
  if v_l.analysis_minutes_per_month = 0 then raise exception 'Your plan does not include automated analysis'; end if;
  if v_used + v_len > v_l.analysis_minutes_per_month * 60 then
    raise exception 'Monthly analysis allowance reached (% of % minutes used). Ask an owner to change plan.',
      round(v_used / 60.0, 1), v_l.analysis_minutes_per_month;
  end if;

  v_kind := case when exists (select 1 from public.analysis_runs where video_id = v.id) then 'reanalysis' else 'initial' end;
  begin
    insert into public.processing_jobs (org_id, video_id, kind, request_kind, payload, max_attempts, requested_by)
    values (v.org_id, v.id, 'analyze', v_kind,
            jsonb_build_object('start_s', p_start_s, 'end_s', least(p_end_s, v.duration_s), 'drill_template', v.drill_type),
            private.cfg_num('job_max_attempts')::int, auth.uid())
    returning id into v_job;
  exception when unique_violation then
    raise exception 'An analysis is already queued or running for this video';
  end;
  insert into public.usage_reservations (org_id, job_id, video_id, period_start, seconds_reserved)
    values (v.org_id, v_job, v.id, private.period_start(), v_len);
  update public.videos set status = 'queued', status_detail = null where id = v.id;
  perform private.audit(v.org_id, 'analysis.requested', 'video', v.id::text,
    jsonb_build_object('job_id', v_job, 'start_s', p_start_s, 'end_s', p_end_s, 'kind', v_kind));
  return v_job;
end $$;

create or replace function private.release_reservation(p_job uuid) returns void
language sql security definer set search_path = '' as $$
  update public.usage_reservations set status = 'released', resolved_at = now()
  where job_id = p_job and status = 'reserved';
$$;

create or replace function private.video_status_after_job(p_video uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.reports where video_id = p_video and status = 'published') then 'published'
    when exists (select 1 from public.reports where video_id = p_video and status = 'approved') then 'approved'
    when (select current_generation from public.videos where id = p_video) > 0 then 'ready_for_review'
    else 'uploaded' end
$$;

create or replace function public.cancel_analysis(p_video uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_job uuid;
begin
  v := private.require_video_staff(p_video);
  for v_job in
    update public.processing_jobs set status = 'cancelled', fence = fence + 1, finished_at = now(), lease_owner = null,
      last_error = 'Cancelled by coach'
    where video_id = v.id and kind = 'analyze' and status in ('queued','running') returning id
  loop
    perform private.release_reservation(v_job);
  end loop;
  update public.videos set status = private.video_status_after_job(v.id), status_detail = 'Last analysis cancelled' where id = v.id;
  perform private.audit(v.org_id, 'analysis.cancelled', 'video', v.id::text);
end $$;

create or replace function private.soft_delete_video(p_video uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_job uuid;
begin
  select * into v from public.videos where id = p_video for update;
  if v.id is null or v.deleted_at is not null then return; end if;
  update public.videos set deleted_at = now(), deleted_by = auth.uid(), shared_with_athlete = false,
    status_detail = p_reason where id = v.id;
  for v_job in
    update public.processing_jobs set status = 'cancelled', fence = fence + 1, finished_at = now(), lease_owner = null,
      last_error = 'Video deleted'
    where video_id = v.id and kind in ('probe','analyze') and status in ('queued','running') returning id
  loop
    perform private.release_reservation(v_job);
  end loop;
  update public.reports set status = 'retracted' where video_id = v.id and status in ('approved','published');
  insert into public.processing_jobs (org_id, video_id, kind, request_kind, payload, max_attempts)
  values (v.org_id, v.id, 'purge', 'system',
          jsonb_build_object('prefix', v.org_id::text || '/' || v.id::text || '/'), 10);
  perform private.audit(v.org_id, 'video.deleted', 'video', v.id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.delete_video(p_video uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.videos;
begin
  v := private.require_video_staff(p_video);
  perform private.soft_delete_video(v.id, 'Deleted by coach');
end $$;

create or replace function public.update_video_details(
  p_video uuid, p_player uuid, p_session uuid, p_drill_type text, p_pitch_type text, p_intended_target text,
  p_device_label text, p_shared_with_athlete boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos;
begin
  v := private.require_video_staff(p_video);
  if p_player is not null and not exists (select 1 from public.players where id = p_player and team_id = v.team_id) then
    raise exception 'Player is not on this team';
  end if;
  if p_session is not null and not exists (select 1 from public.practice_sessions where id = p_session and team_id = v.team_id) then
    raise exception 'Session is not on this team';
  end if;
  if p_shared_with_athlete and p_player is null then raise exception 'Assign a player before sharing'; end if;
  update public.videos set
    player_id = p_player, session_id = p_session, drill_type = p_drill_type,
    pitch_type = nullif(trim(p_pitch_type), ''), intended_target = nullif(trim(p_intended_target), ''),
    source_device_label = nullif(trim(p_device_label), ''),
    shared_with_athlete = coalesce(p_shared_with_athlete, false) and p_player is not null and attribution_confirmed_at is not null
                          and p_player is not distinct from v.player_id,
    attribution_confirmed_at = case when p_player is distinct from v.player_id then null else attribution_confirmed_at end,
    attribution_confirmed_by = case when p_player is distinct from v.player_id then null else attribution_confirmed_by end
  where id = v.id;
  if p_player is distinct from v.player_id then
    update public.reports set status = 'retracted' where video_id = v.id and status in ('approved','published');
  end if;
  perform private.audit(v.org_id, 'video.updated', 'video', v.id::text,
    jsonb_build_object('player_changed', p_player is distinct from v.player_id));
end $$;

create or replace function public.confirm_attribution(p_video uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.videos;
begin
  v := private.require_video_staff(p_video);
  if v.player_id is null then raise exception 'Assign a player before confirming attribution'; end if;
  update public.videos set attribution_confirmed_at = now(), attribution_confirmed_by = auth.uid() where id = v.id;
  perform private.audit(v.org_id, 'video.attribution_confirmed', 'video', v.id::text, jsonb_build_object('player_id', v.player_id));
end $$;

-- ---------------------------------------------------------------------------
-- Review workspace
-- ---------------------------------------------------------------------------
create or replace function private.review_touch(v public.videos) returns void
language sql security definer set search_path = '' as $$
  update public.videos set status = case when status in ('approved','published','uploaded','failed','cancelled') then 'ready_for_review' else status end
  where id = v.id and status not in ('queued','processing');
$$;

create or replace function private.validate_outcome(p_drill text, p_outcome text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_outcome is null then return; end if;
  if p_drill = 'softball_hitting' and p_outcome not in ('swing_miss','foul','fair_contact','unclear') then
    raise exception 'Invalid hitting outcome %', p_outcome; end if;
  if p_drill = 'softball_pitching' and p_outcome not in ('target_hit','target_missed','unclear') then
    raise exception 'Invalid pitching outcome %', p_outcome; end if;
  if p_drill not in ('softball_hitting','softball_pitching') then
    raise exception 'Outcomes apply to softball hitting and pitching only'; end if;
end $$;

create or replace function public.review_upsert_item(
  p_video uuid, p_item uuid, p_start_s numeric, p_end_s numeric, p_event_type text, p_activity_label text,
  p_included boolean, p_outcome text, p_coach_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_old public.review_items; v_id uuid;
begin
  v := private.require_video_staff(p_video);
  if v.upload_status <> 'ready' then raise exception 'Video is not ready for review'; end if;
  if p_start_s < 0 or p_end_s <= p_start_s or p_end_s > v.duration_s + 0.05 then
    raise exception 'Event boundaries must lie within the video and start before they end';
  end if;
  perform private.validate_outcome(v.drill_type, p_outcome);
  if p_item is null then
    insert into public.review_items (org_id, video_id, generation, origin, event_type, activity_label, start_s, end_s,
      included, outcome, outcome_source, coach_note, updated_by)
    values (v.org_id, v.id, v.current_generation, 'coach', p_event_type, coalesce(nullif(trim(p_activity_label), ''), 'unknown'),
      p_start_s, p_end_s, coalesce(p_included, true), p_outcome, case when p_outcome is not null then 'coach' end,
      nullif(trim(p_coach_note), ''), auth.uid())
    returning id into v_id;
    insert into public.coach_revisions (org_id, video_id, item_id, action, after, actor)
      values (v.org_id, v.id, v_id, 'item.create', (select to_jsonb(r) from public.review_items r where r.id = v_id), auth.uid());
  else
    select * into v_old from public.review_items where id = p_item and video_id = v.id and generation = v.current_generation for update;
    if v_old.id is null then raise exception 'Review item not found in the current draft'; end if;
    update public.review_items set start_s = p_start_s, end_s = p_end_s, event_type = p_event_type,
      activity_label = coalesce(nullif(trim(p_activity_label), ''), 'unknown'), included = coalesce(p_included, true),
      outcome = p_outcome,
      outcome_source = case when p_outcome is null then null
                            when p_outcome is not distinct from v_old.outcome then v_old.outcome_source else 'coach' end,
      coach_note = nullif(trim(p_coach_note), ''), updated_by = auth.uid(), updated_at = now()
    where id = p_item returning id into v_id;
    insert into public.coach_revisions (org_id, video_id, item_id, action, before, after, actor)
      values (v.org_id, v.id, v_id, 'item.update', to_jsonb(v_old), (select to_jsonb(r) from public.review_items r where r.id = v_id), auth.uid());
  end if;
  perform private.review_touch(v);
  return v_id;
end $$;

create or replace function public.review_delete_item(p_item uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_old public.review_items; v public.videos;
begin
  select * into v_old from public.review_items where id = p_item;
  if v_old.id is null then raise exception 'Review item not found'; end if;
  v := private.require_video_staff(v_old.video_id);
  if v_old.generation <> v.current_generation then raise exception 'Only current draft items can be deleted'; end if;
  delete from public.review_items where id = p_item;
  insert into public.coach_revisions (org_id, video_id, item_id, action, before, actor)
    values (v.org_id, v.id, p_item, 'item.delete', to_jsonb(v_old), auth.uid());
  perform private.review_touch(v);
end $$;

create or replace function public.review_merge_items(p_a uuid, p_b uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.review_items; b public.review_items; v public.videos;
begin
  select * into a from public.review_items where id = p_a for update;
  select * into b from public.review_items where id = p_b for update;
  if a.id is null or b.id is null or a.video_id <> b.video_id or a.id = b.id then raise exception 'Choose two items from the same video'; end if;
  v := private.require_video_staff(a.video_id);
  if a.generation <> v.current_generation or b.generation <> v.current_generation then raise exception 'Only current draft items can be merged'; end if;
  update public.review_items set start_s = least(a.start_s, b.start_s), end_s = greatest(a.end_s, b.end_s),
    included = a.included or b.included,
    outcome = case when a.outcome is not distinct from b.outcome then a.outcome else null end,
    outcome_source = case when a.outcome is not distinct from b.outcome then a.outcome_source else null end,
    coach_note = nullif(concat_ws(' / ', a.coach_note, b.coach_note), ''),
    origin = case when a.origin = 'model' and b.origin = 'model' then 'model' else 'coach' end,
    updated_by = auth.uid(), updated_at = now()
  where id = a.id;
  delete from public.review_items where id = b.id;
  insert into public.coach_revisions (org_id, video_id, item_id, action, before, after, actor)
    values (v.org_id, v.id, a.id, 'item.merge', jsonb_build_array(to_jsonb(a), to_jsonb(b)),
            (select to_jsonb(r) from public.review_items r where r.id = a.id), auth.uid());
  perform private.review_touch(v);
  return a.id;
end $$;

create or replace function public.review_split_item(p_item uuid, p_at_s numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare a public.review_items; v public.videos; v_new uuid;
begin
  select * into a from public.review_items where id = p_item for update;
  if a.id is null then raise exception 'Review item not found'; end if;
  v := private.require_video_staff(a.video_id);
  if a.generation <> v.current_generation then raise exception 'Only current draft items can be split'; end if;
  if p_at_s <= a.start_s + 0.05 or p_at_s >= a.end_s - 0.05 then raise exception 'Split point must be inside the event'; end if;
  update public.review_items set end_s = p_at_s, updated_by = auth.uid(), updated_at = now() where id = a.id;
  insert into public.review_items (org_id, video_id, generation, origin_event_id, origin, event_type, activity_label,
     start_s, end_s, included, outcome, outcome_source, updated_by)
  values (a.org_id, a.video_id, a.generation, null, 'coach', a.event_type, a.activity_label, p_at_s, a.end_s, a.included,
     null, null, auth.uid()) returning id into v_new;
  insert into public.coach_revisions (org_id, video_id, item_id, action, before, after, actor)
    values (v.org_id, v.id, a.id, 'item.split', to_jsonb(a), jsonb_build_object('split_at', p_at_s, 'new_item', v_new), auth.uid());
  perform private.review_touch(v);
  return v_new;
end $$;

create or replace function public.review_upsert_observation(
  p_video uuid, p_observation uuid, p_t_start_s numeric, p_t_end_s numeric, p_text text, p_included boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_old public.review_observations; v_id uuid;
begin
  v := private.require_video_staff(p_video);
  if p_t_start_s < 0 or p_t_end_s < p_t_start_s or p_t_end_s > v.duration_s + 0.05 then raise exception 'Invalid time range'; end if;
  if p_observation is null then
    insert into public.review_observations (org_id, video_id, generation, origin, t_start_s, t_end_s, text, included, updated_by)
    values (v.org_id, v.id, v.current_generation, 'coach', p_t_start_s, p_t_end_s, trim(p_text), coalesce(p_included, true), auth.uid())
    returning id into v_id;
    insert into public.coach_revisions (org_id, video_id, item_id, action, after, actor)
      values (v.org_id, v.id, v_id, 'observation.create', jsonb_build_object('text', p_text), auth.uid());
  else
    select * into v_old from public.review_observations where id = p_observation and video_id = v.id and generation = v.current_generation;
    if v_old.id is null then raise exception 'Observation not found in current draft'; end if;
    update public.review_observations set t_start_s = p_t_start_s, t_end_s = p_t_end_s, text = trim(p_text),
      included = coalesce(p_included, false), updated_by = auth.uid(), updated_at = now()
    where id = p_observation returning id into v_id;
    insert into public.coach_revisions (org_id, video_id, item_id, action, before, after, actor)
      values (v.org_id, v.id, v_id, 'observation.update', to_jsonb(v_old),
              jsonb_build_object('text', p_text, 'included', p_included), auth.uid());
  end if;
  perform private.review_touch(v);
  return v_id;
end $$;

create or replace function public.review_delete_observation(p_observation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.review_observations; v public.videos;
begin
  select * into o from public.review_observations where id = p_observation;
  if o.id is null then raise exception 'Observation not found'; end if;
  v := private.require_video_staff(o.video_id);
  delete from public.review_observations where id = o.id;
  insert into public.coach_revisions (org_id, video_id, item_id, action, before, actor)
    values (v.org_id, v.id, o.id, 'observation.delete', to_jsonb(o), auth.uid());
  perform private.review_touch(v);
end $$;

-- Deterministic report snapshot from the current coach-reviewed draft.
create or replace function private.plural(p_n bigint, p_one text, p_many text) returns text
language sql immutable set search_path = '' as $$
  select p_n::text || ' ' || case when p_n = 1 then p_one else p_many end
$$;

create or replace function private.compute_snapshot(p_video uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.videos; v_run public.analysis_runs; v_items jsonb; v_obs jsonb; v_totals jsonb; v_stmt text;
        n_fair int; n_foul int; n_miss int; n_unclear int; n_hit int; n_missed int; n_swings int; n_pitches int;
        v_session record; v_player text;
begin
  select * into v from public.videos where id = p_video;
  select * into v_run from public.analysis_runs where video_id = v.id and generation = v.current_generation
    order by created_at desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object(
      'start_s', i.start_s, 'end_s', i.end_s, 'event_type', i.event_type, 'activity_label', i.activity_label,
      'outcome', i.outcome, 'outcome_source', i.outcome_source, 'origin', i.origin,
      'coach_modified', i.origin = 'model' and i.updated_by is not null, 'coach_note', i.coach_note)
      order by i.start_s), '[]'::jsonb)
    into v_items
  from public.review_items i where i.video_id = v.id and i.generation = v.current_generation and i.included;
  select coalesce(jsonb_agg(jsonb_build_object('t_start_s', o.t_start_s, 't_end_s', o.t_end_s, 'text', o.text,
      'origin', o.origin) order by o.t_start_s), '[]'::jsonb)
    into v_obs
  from public.review_observations o where o.video_id = v.id and o.generation = v.current_generation and o.included;

  if v.drill_type = 'softball_hitting' then
    select count(*) filter (where event_type = 'swing'),
           count(*) filter (where event_type = 'swing' and outcome = 'fair_contact'),
           count(*) filter (where event_type = 'swing' and outcome = 'foul'),
           count(*) filter (where event_type = 'swing' and outcome = 'swing_miss'),
           count(*) filter (where event_type = 'swing' and (outcome is null or outcome = 'unclear'))
      into n_swings, n_fair, n_foul, n_miss, n_unclear
    from public.review_items where video_id = v.id and generation = v.current_generation and included;
    v_totals := jsonb_build_object('swings', n_swings, 'fair_contact', n_fair, 'foul', n_foul, 'swing_miss', n_miss,
      'unclear', n_unclear, 'contacts', n_fair + n_foul, 'assessable', n_fair + n_foul + n_miss);
    v_stmt := format('%s (%s fair, %s foul) out of %s; %s unclear.',
      private.plural(n_fair + n_foul, 'confirmed contact', 'confirmed contacts'), n_fair, n_foul,
      private.plural(n_fair + n_foul + n_miss, 'assessable swing', 'assessable swings'),
      private.plural(n_unclear, 'additional swing', 'additional swings'));
  elsif v.drill_type = 'softball_pitching' then
    select count(*) filter (where event_type = 'pitch'),
           count(*) filter (where event_type = 'pitch' and outcome = 'target_hit'),
           count(*) filter (where event_type = 'pitch' and outcome = 'target_missed'),
           count(*) filter (where event_type = 'pitch' and (outcome is null or outcome = 'unclear'))
      into n_pitches, n_hit, n_missed, n_unclear
    from public.review_items where video_id = v.id and generation = v.current_generation and included;
    v_totals := jsonb_build_object('pitches', n_pitches, 'target_hit', n_hit, 'target_missed', n_missed,
      'unclear', n_unclear, 'assessable', n_hit + n_missed);
    v_stmt := format('%s out of %s; %s unclear.',
      private.plural(n_hit, 'confirmed target hit', 'confirmed target hits'),
      private.plural(n_hit + n_missed, 'assessable pitch', 'assessable pitches'),
      private.plural(n_unclear, 'additional pitch', 'additional pitches'));
  else
    select jsonb_build_object('reps_total', coalesce(sum(c), 0),
             'reps_by_activity', coalesce(jsonb_object_agg(activity_label, c), '{}'::jsonb))
      into v_totals
    from (select activity_label, count(*) as c from public.review_items
          where video_id = v.id and generation = v.current_generation and included and event_type = 'rep'
          group by activity_label) q;
    v_stmt := format('%s in this recording.',
      private.plural(coalesce((v_totals->>'reps_total')::int, 0), 'coach-confirmed rep', 'coach-confirmed reps'));
  end if;

  select s.title, s.session_date into v_session from public.practice_sessions s where s.id = v.session_id;
  select display_name into v_player from public.players where id = v.player_id;

  return jsonb_build_object(
    'schema_version', 1,
    'video', jsonb_build_object('id', v.id, 'duration_s', v.duration_s, 'drill_type', v.drill_type,
       'pitch_type', v.pitch_type, 'intended_target', v.intended_target, 'recorded_label', v.source_device_label,
       'uploaded_at', v.created_at),
    'player', jsonb_build_object('id', v.player_id, 'name', v_player),
    'session', case when v_session.title is null then null else jsonb_build_object('title', v_session.title, 'date', v_session.session_date) end,
    'sample', jsonb_build_object(
       'description', case when v_run.id is null
          then format('Coach-labelled events in one recording (%s s).', round(v.duration_s, 1))
          else format('One recording; automated suggestions covered %s–%s s of %s s; all counts below were confirmed or edited by a coach.',
                      round(v_run.range_start_s, 1), round(v_run.range_end_s, 1), round(v.duration_s, 1)) end,
       'analysed_range', case when v_run.id is null then null else jsonb_build_array(v_run.range_start_s, v_run.range_end_s) end),
    'totals', v_totals,
    'statement', v_stmt,
    'items', v_items,
    'observations', v_obs,
    'provenance', jsonb_build_object(
       'run_id', v_run.id, 'model', v_run.model, 'prompt_version', v_run.prompt_version,
       'analysis_version', v_run.analysis_version,
       'ai_suggested_items', (select count(*) from public.review_items where video_id = v.id and generation = v.current_generation and origin = 'model'),
       'coach_added_items', (select count(*) from public.review_items where video_id = v.id and generation = v.current_generation and origin = 'coach'),
       'coach_modified_items', (select count(*) from public.review_items where video_id = v.id and generation = v.current_generation and origin = 'model' and updated_by is not null))
  );
end $$;

create or replace function public.approve_review(p_video uuid, p_feedback text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_id uuid; v_version int; v_run uuid;
begin
  v := private.require_video_staff(p_video);
  if v.upload_status <> 'ready' then raise exception 'Video is not ready'; end if;
  if v.status in ('queued','processing') then raise exception 'Wait for the running analysis to finish or cancel it first'; end if;
  if v.player_id is null then raise exception 'Assign a player before approving a report'; end if;
  select coalesce(max(version), 0) + 1 into v_version from public.reports where video_id = v.id;
  select id into v_run from public.analysis_runs where video_id = v.id and generation = v.current_generation order by created_at desc limit 1;
  update public.reports set status = 'superseded' where video_id = v.id and status = 'approved';
  insert into public.reports (org_id, team_id, player_id, video_id, version, generation, run_id, status, snapshot,
     coach_feedback, approved_by)
  values (v.org_id, v.team_id, v.player_id, v.id, v_version, v.current_generation, v_run, 'approved',
     private.compute_snapshot(v.id), nullif(trim(p_feedback), ''), auth.uid())
  returning id into v_id;
  update public.videos set status = 'approved' where id = v.id;
  perform private.audit(v.org_id, 'report.approved', 'report', v_id::text, jsonb_build_object('video_id', v.id, 'version', v_version));
  return v_id;
end $$;

create or replace function public.publish_report(p_video uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.videos; r public.reports;
begin
  v := private.require_video_staff(p_video);
  select * into r from public.reports where video_id = v.id and status = 'approved' for update;
  if r.id is null then raise exception 'Approve the review before publishing'; end if;
  if v.player_id is null or v.player_id <> r.player_id then raise exception 'Player assignment changed; approve again'; end if;
  if v.attribution_confirmed_at is null then
    raise exception 'Confirm that this recording shows the assigned player before publishing';
  end if;
  update public.reports set status = 'superseded' where video_id = v.id and status = 'published';
  update public.reports set status = 'published', published_at = now(), published_by = auth.uid() where id = r.id;
  update public.videos set status = 'published' where id = v.id;
  perform private.audit(v.org_id, 'report.published', 'report', r.id::text, jsonb_build_object('video_id', v.id));
  return r.id;
end $$;

create or replace function public.retract_report(p_video uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.videos;
begin
  v := private.require_video_staff(p_video);
  update public.reports set status = 'retracted' where video_id = v.id and status in ('approved','published');
  update public.videos set status = private.video_status_after_job(v.id) where id = v.id;
  perform private.audit(v.org_id, 'report.retracted', 'video', v.id::text);
end $$;

-- ---------------------------------------------------------------------------
-- Organisation export, deletion and operator overview
-- ---------------------------------------------------------------------------
create or replace function public.export_organization(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not private.is_org_owner(p_org) then raise exception 'Only owners can export organisation data'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'note', 'Metadata export. Original recordings are downloaded individually from the library via signed links.',
    'organization', (select to_jsonb(o) from public.organizations o where o.id = p_org),
    'teams', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.teams t where t.org_id = p_org),
    'members', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'status', m.status,
                  'email', u.email, 'created_at', m.created_at)), '[]')
                from public.memberships m join auth.users u on u.id = m.user_id where m.org_id = p_org),
    'players', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.players p where p.org_id = p_org),
    'sessions', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.practice_sessions s where s.org_id = p_org),
    'videos', (select coalesce(jsonb_agg(to_jsonb(v) - 'probe'), '[]') from public.videos v where v.org_id = p_org and v.deleted_at is null),
    'review_items', (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from public.review_items i where i.org_id = p_org),
    'detected_events', (select coalesce(jsonb_agg(to_jsonb(d)), '[]') from public.detected_events d where d.org_id = p_org),
    'coach_revisions', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.coach_revisions c where c.org_id = p_org),
    'reports', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.reports r where r.org_id = p_org),
    'analysis_runs', (select coalesce(jsonb_agg(to_jsonb(a) - 'validated_output'), '[]') from public.analysis_runs a where a.org_id = p_org),
    'usage', (select coalesce(jsonb_agg(to_jsonb(u)), '[]') from public.usage_reservations u where u.org_id = p_org),
    'audit_events', (select coalesce(jsonb_agg(to_jsonb(a)), '[]') from public.audit_events a where a.org_id = p_org)
  );
end $$;

create or replace function public.delete_organization(p_org uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_vid uuid;
begin
  perform private.require_user();
  if not private.is_org_owner(p_org) then raise exception 'Only owners can delete an organisation'; end if;
  select name into v_name from public.organizations where id = p_org;
  if v_name is distinct from p_confirm_name then raise exception 'Type the organisation name exactly to confirm'; end if;
  for v_vid in select id from public.videos where org_id = p_org and deleted_at is null loop
    perform private.soft_delete_video(v_vid, 'Organisation deleted');
  end loop;
  perform private.audit(p_org, 'organization.deleted', 'organization', p_org::text);
  update public.memberships set status = 'revoked', revoked_at = now() where org_id = p_org;
  update public.invitations set revoked_at = now() where org_id = p_org and accepted_at is null;
  update public.organizations set deleted_at = now() where id = p_org;
end $$;

create or replace function public.ops_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not private.is_platform_operator() then raise exception 'Operator access required'; end if;
  -- Metadata only: no storage paths, filenames, player names or media links.
  return jsonb_build_object(
    'generated_at', now(),
    'queue', (select jsonb_object_agg(k, c) from (select kind || ':' || status as k, count(*) as c
              from public.processing_jobs where created_at > now() - interval '30 days' group by 1) q),
    'failed_jobs', (select coalesce(jsonb_agg(x order by x->>'finished_at' desc), '[]') from (
        select jsonb_build_object('job_id', j.id, 'org', o.name, 'kind', j.kind, 'attempts', j.attempts,
               'error', left(j.last_error, 500), 'finished_at', j.finished_at) as x
        from public.processing_jobs j join public.organizations o on o.id = j.org_id
        where j.status = 'failed' and j.finished_at > now() - interval '14 days'
        order by j.finished_at desc limit 50) f),
    'stuck_jobs', (select count(*) from public.processing_jobs where status = 'running' and lease_expires_at < now()),
    'workers', (select coalesce(jsonb_agg(jsonb_build_object('worker_id', worker_id, 'version', version,
                 'capabilities', capabilities, 'last_seen_at', last_seen_at)), '[]') from public.worker_heartbeats),
    'usage_month', (select jsonb_build_object(
         'provider_requests', count(*) filter (where kind = 'provider_request'),
         'input_tokens', coalesce(sum(input_tokens), 0), 'output_tokens', coalesce(sum(output_tokens), 0),
         'estimated_provider_cost_usd', coalesce(sum(estimated_cost_usd) filter (where kind = 'provider_request'), 0),
         'billable_analysis_seconds', coalesce(sum(quantity) filter (where kind = 'analysis_seconds' and customer_billable), 0))
       from public.usage_events where created_at >= private.period_start()),
    'runs_month', (select jsonb_build_object('count', count(*), 'avg_processing_ms', avg(processing_ms)::bigint,
         'estimated_cost_usd', coalesce(sum(estimated_cost_usd), 0))
       from public.analysis_runs where created_at >= private.period_start()),
    'organizations', (select count(*) from public.organizations where deleted_at is null)
  );
end $$;

-- Grants: user RPCs callable by signed-in users only.
revoke all on function public.create_organization, public.create_team, public.create_invitation, public.revoke_invitation,
  public.get_invitation_preview, public.accept_invitation, public.set_member_teams, public.remove_member,
  public.revoke_athlete_link, public.activate_evaluation, public.redeem_pilot_code, public.get_usage_summary,
  public.create_video_upload, public.finalize_video_upload, public.request_analysis, public.cancel_analysis,
  public.delete_video, public.update_video_details, public.confirm_attribution, public.review_upsert_item,
  public.review_delete_item, public.review_merge_items, public.review_split_item, public.review_upsert_observation,
  public.review_delete_observation, public.approve_review, public.publish_report, public.retract_report,
  public.export_organization, public.delete_organization, public.ops_overview
from public, anon;
grant execute on function public.create_organization, public.create_team, public.create_invitation, public.revoke_invitation,
  public.get_invitation_preview, public.accept_invitation, public.set_member_teams, public.remove_member,
  public.revoke_athlete_link, public.activate_evaluation, public.redeem_pilot_code, public.get_usage_summary,
  public.create_video_upload, public.finalize_video_upload, public.request_analysis, public.cancel_analysis,
  public.delete_video, public.update_video_details, public.confirm_attribution, public.review_upsert_item,
  public.review_delete_item, public.review_merge_items, public.review_split_item, public.review_upsert_observation,
  public.review_delete_observation, public.approve_review, public.publish_report, public.retract_report,
  public.export_organization, public.delete_organization, public.ops_overview
to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on function private.effective_limits(uuid), private.analysis_seconds_used(uuid), private.retained_seconds(uuid),
  private.require_user(), private.period_start(), private.staff_count(uuid) to authenticated;
