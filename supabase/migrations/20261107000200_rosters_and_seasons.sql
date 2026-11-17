-- One sporting record on several teams and seasons inside an organisation.
--
-- players.team_id stays as the athlete's primary team (existing reports, videos and links keep working).
-- roster_entries adds further team (and optional season) memberships for the same record, so an athlete who
-- plays for two teams in one club is one person with one history, not two unrelated rows. Records are never
-- merged across organisations, and never matched by name or email.

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  unique (org_id, name)
);
alter table public.seasons enable row level security;
create policy seasons_select on public.seasons for select to authenticated using (private.is_org_member(org_id));
revoke insert, update, delete on public.seasons from authenticated;
grant select on public.seasons to authenticated;

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  season_id uuid references public.seasons(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references auth.users(id)
);
create unique index roster_entries_active_uq on public.roster_entries(player_id, team_id, coalesce(season_id, '00000000-0000-0000-0000-000000000000'::uuid)) where ended_at is null;
create index roster_entries_team_idx on public.roster_entries(team_id) where ended_at is null;
alter table public.roster_entries enable row level security;
revoke insert, update, delete on public.roster_entries from authenticated;
grant select on public.roster_entries to authenticated;

-- Backfill: every existing player is on their primary team.
insert into public.roster_entries (org_id, player_id, team_id, created_by)
select org_id, id, team_id, created_by from public.players;

create or replace function private.player_on_team(p_player uuid, p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players where id = p_player and team_id = p_team)
      or exists (select 1 from public.roster_entries where player_id = p_player and team_id = p_team and ended_at is null)
$$;

-- Staff see a player when they can access the primary team or any team the player is currently rostered on.
create or replace function private.can_access_player(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.players p where p.id = p_player and private.can_access_team(p.team_id))
      or exists (select 1 from public.roster_entries r where r.player_id = p_player and r.ended_at is null and private.can_access_team(r.team_id))
$$;

create policy roster_entries_select on public.roster_entries for select to authenticated
  using (private.can_access_team(team_id) or private.is_my_player(player_id));

drop policy players_select on public.players;
create policy players_select on public.players for select to authenticated
  -- can_access_team(team_id) reads the row itself, so INSERT ... RETURNING sees the new row (the helper's
  -- snapshot would not); can_access_player adds the other rostered teams.
  using (private.can_access_team(team_id) or private.can_access_player(id) or private.is_my_player(id));

-- Keep the primary team in the roster.
create or replace function private.players_roster_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.team_id <> old.team_id then
    insert into public.roster_entries (org_id, player_id, team_id, created_by)
    select new.org_id, new.id, new.team_id, auth.uid()
    where not exists (select 1 from public.roster_entries where player_id = new.id and team_id = new.team_id and season_id is null and ended_at is null);
  end if;
  return new;
end $$;
create trigger players_roster_sync after insert or update of team_id on public.players
  for each row execute function private.players_roster_sync();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_season(p_org uuid, p_name text, p_starts_on date default null, p_ends_on date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform private.require_user();
  if not private.is_org_owner(p_org) then raise exception 'Only organisation owners can create seasons'; end if;
  if private.is_personal_org(p_org) then raise exception 'Seasons are for team workspaces'; end if;
  insert into public.seasons (org_id, name, starts_on, ends_on) values (p_org, trim(p_name), p_starts_on, p_ends_on) returning id into v_id;
  perform private.audit(p_org, 'season.created', 'season', v_id::text);
  return v_id;
end $$;

create or replace function public.add_to_roster(p_player uuid, p_team uuid, p_season uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.players; v_id uuid;
begin
  perform private.require_user();
  select * into p from public.players where id = p_player and archived_at is null;
  if p.id is null or not private.can_access_player(p.id) then raise exception 'Player not found'; end if;
  if not exists (select 1 from public.teams where id = p_team and org_id = p.org_id and archived_at is null) or not private.can_access_team(p_team) then
    raise exception 'You do not have access to that team';
  end if;
  if p_season is not null and not exists (select 1 from public.seasons where id = p_season and org_id = p.org_id) then
    raise exception 'Season not found';
  end if;
  insert into public.roster_entries (org_id, player_id, team_id, season_id, created_by)
    values (p.org_id, p.id, p_team, p_season, auth.uid()) returning id into v_id;
  perform private.audit(p.org_id, 'roster.added', 'player', p.id::text, jsonb_build_object('team_id', p_team, 'season_id', p_season));
  return v_id;
exception when unique_violation then
  raise exception 'Already on that team for that season';
end $$;

create or replace function public.end_roster_entry(p_entry uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.roster_entries; p public.players;
begin
  perform private.require_user();
  select * into r from public.roster_entries where id = p_entry and ended_at is null;
  if r.id is null or not private.can_access_team(r.team_id) then raise exception 'Roster entry not found'; end if;
  select * into p from public.players where id = r.player_id;
  if p.team_id = r.team_id and r.season_id is null then
    raise exception 'This is the athlete''s primary team. Change the primary team first.';
  end if;
  update public.roster_entries set ended_at = now() where id = r.id;
  perform private.audit(r.org_id, 'roster.ended', 'player', r.player_id::text, jsonb_build_object('team_id', r.team_id));
end $$;

revoke all on function public.create_season, public.add_to_roster, public.end_roster_entry from public, anon;
grant execute on function public.create_season, public.add_to_roster, public.end_roster_entry to authenticated;

-- Uploads and reassignment accept any team the player is rostered on.
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
  if p_player is not null and not exists (select 1 from public.players where id = p_player and archived_at is null and private.player_on_team(id, p_team)) then
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

create or replace function public.update_video_details(
  p_video uuid, p_player uuid, p_session uuid, p_drill_type text, p_pitch_type text, p_intended_target text,
  p_device_label text, p_shared_with_athlete boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.videos;
begin
  v := private.require_video_staff(p_video);
  if p_player is not null and not exists (select 1 from public.players where id = p_player and private.player_on_team(id, v.team_id)) then
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

-- Export covers the new records.
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
    'seasons', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.seasons s where s.org_id = p_org),
    'roster_entries', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.roster_entries r where r.org_id = p_org),
    'goals', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from public.goals g where g.org_id = p_org),
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
