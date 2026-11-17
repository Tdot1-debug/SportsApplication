-- Personal training workspaces, self-review labelling, revocable coach access and goals.
--
-- Model: a personal workspace is an organisation with kind = 'personal'. Its owner is the athlete. It has
-- exactly one team ("My training") and exactly one player row, the owner's own sporting record
-- (players.self_user_id = owner). This reuses every existing permission, storage, queue and review path
-- without a parallel data model. The owner can invite coaches (role 'coach', all teams) and revoke them.
-- Reports approved by the owner are labelled 'self'; reports approved by a coach are labelled 'coach'.

alter table public.organizations
  add column kind text not null default 'team' check (kind in ('team','personal'));

alter table public.players
  add column self_user_id uuid references auth.users(id) on delete set null,
  add column sports text[] not null default '{}'
    check (sports <@ array['strength','softball','tennis','boxing','other']::text[]);
create unique index players_one_self_per_org on public.players(org_id) where self_user_id is not null;

alter table public.reports
  add column review_kind text not null default 'coach' check (review_kind in ('coach','self'));

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  sport text not null check (sport in ('strength','softball','tennis','boxing','other')),
  text text not null check (char_length(text) between 3 and 500),
  status text not null default 'active' check (status in ('active','achieved','dropped')),
  target_date date,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index goals_player_idx on public.goals(player_id, status);
alter table public.goals enable row level security;
create policy goals_select on public.goals for select to authenticated
  using (private.is_org_staff(org_id) and private.can_access_team((select team_id from public.players p where p.id = player_id))
         or private.is_my_player(player_id));
revoke insert, update, delete on public.goals from authenticated;
grant select on public.goals to authenticated;
create trigger goals_touch before update on public.goals for each row execute function private.touch_updated_at();

create or replace function private.is_personal_org(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations where id = p_org and kind = 'personal')
$$;

-- A personal workspace holds only its owner's record and one team.
create or replace function private.personal_guard_players() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_personal_org(new.org_id) and new.self_user_id is null then
    raise exception 'A personal workspace holds only your own athlete profile';
  end if;
  return new;
end $$;
create trigger players_personal_guard before insert on public.players
  for each row execute function private.personal_guard_players();

create or replace function private.personal_guard_teams() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_personal_org(new.org_id) and exists (select 1 from public.teams where org_id = new.org_id) then
    raise exception 'A personal workspace has a single training log';
  end if;
  return new;
end $$;
create trigger teams_personal_guard before insert on public.teams
  for each row execute function private.personal_guard_teams();

create or replace function private.personal_guard_invitations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.is_personal_org(new.org_id) and new.role = 'athlete' then
    raise exception 'A personal workspace cannot invite athletes; invite a coach instead';
  end if;
  if private.is_personal_org(new.org_id) and new.role = 'coach' then
    new.all_teams := true;  -- the single training log
  end if;
  return new;
end $$;
create trigger invitations_personal_guard before insert on public.invitations
  for each row execute function private.personal_guard_invitations();

-- ---------------------------------------------------------------------------
-- Create a personal workspace
-- ---------------------------------------------------------------------------
create or replace function public.create_personal_workspace(
  p_display_name text, p_sports text[], p_adult_confirmed boolean, p_recording_attested boolean,
  p_notice_accepted boolean, p_goal text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_org uuid; v_team uuid; v_player uuid; v_name text; v_sports text[];
begin
  if not coalesce(p_adult_confirmed, false) then
    raise exception 'Personal workspaces are for adults (18+) only for now';
  end if;
  if not coalesce(p_recording_attested, false) or not coalesce(p_notice_accepted, false) then
    raise exception 'Recording permission attestation and data-use notice acceptance are required';
  end if;
  v_name := nullif(trim(p_display_name), '');
  if v_name is null or char_length(v_name) > 120 then raise exception 'Enter your name (up to 120 characters)'; end if;
  v_sports := coalesce(p_sports, '{}');
  if cardinality(v_sports) = 0 then raise exception 'Choose at least one sport'; end if;
  if not (v_sports <@ array['strength','softball','tennis','boxing','other']::text[]) then raise exception 'Unknown sport'; end if;
  if exists (select 1 from public.organizations o join public.memberships m on m.org_id = o.id
             where o.kind = 'personal' and o.deleted_at is null and m.user_id = v_user and m.role = 'owner' and m.status = 'active') then
    raise exception 'You already have a personal workspace';
  end if;
  if not private.hit_rate_limit('create_org:' || v_user::text, 5, 86400) then
    raise exception 'Too many workspaces created today. Try again tomorrow.';
  end if;
  insert into public.organizations (name, sport, kind, created_by)
    values (left(v_name || ' · personal training', 120), 'multi', 'personal', v_user) returning id into v_org;
  insert into public.memberships (org_id, user_id, role, all_teams, display_name)
    values (v_org, v_user, 'owner', true, v_name);
  insert into public.teams (org_id, name, sport) values (v_org, 'My training', 'multi') returning id into v_team;
  insert into public.players (org_id, team_id, display_name, consent_status, created_by, self_user_id, sports)
    values (v_org, v_team, v_name, 'not_required', v_user, v_user, v_sports) returning id into v_player;
  insert into public.org_attestations (org_id, kind, text_version, accepted_by) values
    (v_org, 'recording_permission', '2026-11-personal-v1', v_user),
    (v_org, 'data_use_notice', '2026-11-v1', v_user);
  insert into public.entitlements (org_id, plan_code, source, granted_by, note)
    values (v_org, 'manual', 'default', v_user, 'Default manual-review access');
  if nullif(trim(p_goal), '') is not null then
    insert into public.goals (org_id, player_id, sport, text, created_by)
      values (v_org, v_player, v_sports[1], left(trim(p_goal), 500), v_user);
  end if;
  perform private.audit(v_org, 'organization.created', 'organization', v_org::text,
    jsonb_build_object('kind', 'personal', 'team_id', v_team, 'player_id', v_player));
  return v_org;
end $$;

-- ---------------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------------
create or replace function public.upsert_goal(p_goal uuid, p_player uuid, p_sport text, p_text text,
  p_status text default 'active', p_target_date date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); p public.players; v_id uuid;
begin
  select * into p from public.players where id = p_player;
  if p.id is null or not private.is_org_staff(p.org_id) or not private.can_access_team(p.team_id) then
    raise exception 'Not allowed';
  end if;
  if p_goal is null then
    insert into public.goals (org_id, player_id, sport, text, status, target_date, created_by)
      values (p.org_id, p.id, p_sport, trim(p_text), p_status, p_target_date, v_user) returning id into v_id;
  else
    update public.goals set sport = p_sport, text = trim(p_text), status = p_status, target_date = p_target_date
      where id = p_goal and player_id = p.id returning id into v_id;
    if v_id is null then raise exception 'Goal not found'; end if;
  end if;
  perform private.audit(p.org_id, 'goal.saved', 'goal', v_id::text);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Approval records whether it is a coach approval or the athlete's own self-review.
-- ---------------------------------------------------------------------------
create or replace function private.review_kind_for(p_org uuid, p_player uuid) returns text
language sql stable security definer set search_path = '' as $$
  -- Self-review: the approver is the athlete whose record this is. Everything else is staff (coach) approval.
  select case when exists (select 1 from public.players where id = p_player and self_user_id = auth.uid())
              then 'self' else 'coach' end
$$;

create or replace function public.approve_review(p_video uuid, p_feedback text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.videos; v_id uuid; v_version int; v_run uuid; v_kind text; v_snap jsonb;
begin
  v := private.require_video_staff(p_video);
  if v.upload_status <> 'ready' then raise exception 'Video is not ready'; end if;
  if v.status in ('queued','processing') then raise exception 'Wait for the running analysis to finish or cancel it first'; end if;
  if v.player_id is null then raise exception 'Assign a player before approving a report'; end if;
  v_kind := private.review_kind_for(v.org_id, v.player_id);
  v_snap := private.compute_snapshot(v.id) || jsonb_build_object('review_kind', v_kind);
  if v_kind = 'self' then
    -- Never let a self-review read as a coach's confirmation.
    v_snap := jsonb_set(v_snap, '{statement}', to_jsonb(replace(v_snap->>'statement', 'coach-confirmed', 'self-reviewed')));
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.reports where video_id = v.id;
  select id into v_run from public.analysis_runs where video_id = v.id and generation = v.current_generation order by created_at desc limit 1;
  update public.reports set status = 'superseded' where video_id = v.id and status = 'approved';
  insert into public.reports (org_id, team_id, player_id, video_id, version, generation, run_id, status, snapshot,
     coach_feedback, approved_by, review_kind)
  values (v.org_id, v.team_id, v.player_id, v.id, v_version, v.current_generation, v_run, 'approved',
     v_snap, nullif(trim(p_feedback), ''), auth.uid(), v_kind)
  returning id into v_id;
  update public.videos set status = 'approved' where id = v.id;
  perform private.audit(v.org_id, 'report.approved', 'report', v_id::text,
    jsonb_build_object('video_id', v.id, 'version', v_version, 'review_kind', v_kind));
  return v_id;
end $$;

-- Remove a coach's access to a personal workspace (or any org); owners only. Wraps remove_member semantics
-- so personal users get a single clear action.
create or replace function public.revoke_coach_access(p_membership uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.memberships;
begin
  perform private.require_user();
  select * into m from public.memberships where id = p_membership;
  if m.id is null or m.role <> 'coach' then raise exception 'Coach membership not found'; end if;
  if not private.is_org_owner(m.org_id) then raise exception 'Only the owner can revoke coach access'; end if;
  update public.memberships set status = 'revoked', revoked_at = now() where id = m.id;
  delete from public.team_assignments where membership_id = m.id;
  perform private.audit(m.org_id, 'coach.revoked', 'membership', m.id::text);
end $$;

revoke all on function public.create_personal_workspace, public.upsert_goal, public.revoke_coach_access from public, anon;
grant execute on function public.create_personal_workspace, public.upsert_goal, public.revoke_coach_access to authenticated;

-- Only create_personal_workspace may set self_user_id: restrict direct inserts to the ordinary columns.
revoke insert on public.players from authenticated;
grant insert (org_id, team_id, display_name, jersey_number, position, bats_throws, notes, consent_status, created_by, sports)
  on public.players to authenticated;
grant update (sports) on public.players to authenticated;

create or replace function private.personal_guard_players_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.self_user_id is not null and (new.archived_at is not null or new.team_id <> old.team_id) then
    raise exception 'Your own athlete profile cannot be archived or moved';
  end if;
  if new.self_user_id is distinct from old.self_user_id and current_user = 'authenticated' then
    raise exception 'Not allowed';
  end if;
  return new;
end $$;
create trigger players_personal_guard_update before update on public.players
  for each row execute function private.personal_guard_players_update();
