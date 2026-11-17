-- Access helpers and row-level security.
-- Helpers live in the non-exposed `private` schema, run as SECURITY DEFINER with an
-- empty search_path, and only answer questions about the calling user (auth.uid()).

create or replace function private.cfg_num(p_key text) returns numeric
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::numeric from public.app_config where key = p_key
$$;

create or replace function private.org_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  join public.organizations o on o.id = m.org_id and o.deleted_at is null
  where m.org_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function private.is_org_owner(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.org_role(p_org) = 'owner', false)
$$;

create or replace function private.is_org_staff(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.org_role(p_org) in ('owner','coach'), false)
$$;

create or replace function private.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.org_role(p_org) is not null
$$;

-- Owner: every team in the org. Coach: all_teams or explicit assignment. Athlete: never.
create or replace function private.can_access_team(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.teams t
    join public.memberships m on m.org_id = t.org_id and m.user_id = auth.uid() and m.status = 'active'
    join public.organizations o on o.id = t.org_id and o.deleted_at is null
    where t.id = p_team
      and (
        m.role = 'owner'
        or (m.role = 'coach' and (m.all_teams or exists (
              select 1 from public.team_assignments ta where ta.membership_id = m.id and ta.team_id = t.id)))
      )
  )
$$;

-- Players the calling athlete account is linked to (active link + active athlete membership).
create or replace function private.my_player_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select al.player_id
  from public.athlete_links al
  join public.memberships m on m.org_id = al.org_id and m.user_id = al.user_id
       and m.status = 'active' and m.role = 'athlete'
  join public.players p on p.id = al.player_id and p.archived_at is null
  where al.user_id = auth.uid() and al.revoked_at is null
$$;

create or replace function private.is_my_player(p_player uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.my_player_ids() x where x = p_player)
$$;

create or replace function private.can_view_video(p_video uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.videos v
    where v.id = p_video and v.deleted_at is null and v.upload_status <> 'pending_upload'
      and (
        private.can_access_team(v.team_id)
        or (
          v.player_id is not null and private.is_my_player(v.player_id)
          and (v.shared_with_athlete or exists (
                select 1 from public.reports r where r.video_id = v.id and r.status = 'published'))
        )
      )
  )
$$;

create or replace function private.can_view_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.videos v
    where (v.storage_path = p_name or v.preview_path = p_name)
      and private.can_view_video(v.id)
  )
$$;

create or replace function private.can_upload_storage_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.videos v
    where v.storage_path = p_name
      and v.upload_status = 'pending_upload'
      and v.deleted_at is null
      and v.uploaded_by = auth.uid()
      and private.can_access_team(v.team_id)
  )
$$;

create or replace function private.is_platform_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_operators where user_id = auth.uid())
$$;

revoke all on all functions in schema private from public;
grant execute on function
  private.cfg_num(text), private.org_role(uuid), private.is_org_owner(uuid), private.is_org_staff(uuid),
  private.is_org_member(uuid), private.can_access_team(uuid), private.my_player_ids(), private.is_my_player(uuid),
  private.can_view_video(uuid), private.can_view_storage_object(text), private.can_upload_storage_object(text),
  private.is_platform_operator()
to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. Default deny; policies below grant the minimum.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'app_config','plans','organizations','teams','memberships','team_assignments','org_attestations',
    'platform_operators','players','athlete_links','invitations','practice_sessions','videos','entitlements',
    'subscriptions','stripe_events','pilot_codes','rate_limits','processing_jobs','usage_reservations',
    'usage_events','analysis_runs','analysis_raw_outputs','detected_events','draft_observations','review_items',
    'review_observations','coach_revisions','reports','comparisons','audit_events','worker_heartbeats']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Public, non-sensitive catalogue data
create policy plans_read on public.plans for select to authenticated using (true);
create policy app_config_read on public.app_config for select to authenticated using (true);

-- Organisations
create policy orgs_select on public.organizations for select to authenticated
  using (private.is_org_member(id));
create policy orgs_update on public.organizations for update to authenticated
  using (private.is_org_owner(id)) with check (private.is_org_owner(id));
revoke update on public.organizations from authenticated;
grant update (name, sport, display_name, accent_color, retention_days) on public.organizations to authenticated;

-- Teams: staff with access. Owners create/edit.
create policy teams_select on public.teams for select to authenticated
  using (private.can_access_team(id));
create policy teams_update on public.teams for update to authenticated
  using (private.is_org_owner(org_id)) with check (private.is_org_owner(org_id));
revoke insert, update, delete on public.teams from authenticated;
grant update (name, sport, archived_at) on public.teams to authenticated;

-- Memberships: everyone sees their own; staff see staff in their org; owners see all.
create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = auth.uid()
    or private.is_org_owner(org_id)
    or (private.is_org_staff(org_id) and role in ('owner','coach'))
  );
revoke insert, update, delete on public.memberships from authenticated;

create policy team_assignments_select on public.team_assignments for select to authenticated
  using (private.is_org_owner(org_id) or exists (
    select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()));
revoke insert, update, delete on public.team_assignments from authenticated;

create policy attestations_select on public.org_attestations for select to authenticated
  using (private.is_org_staff(org_id));
revoke insert, update, delete on public.org_attestations from authenticated;

create policy operators_self on public.platform_operators for select to authenticated
  using (user_id = auth.uid());
revoke insert, update, delete on public.platform_operators from authenticated;

-- Players: staff with team access manage; linked athletes see their own row.
create policy players_select on public.players for select to authenticated
  using (private.can_access_team(team_id) or private.is_my_player(id));
create policy players_insert on public.players for insert to authenticated
  with check (private.can_access_team(team_id) and created_by = auth.uid());
create policy players_update on public.players for update to authenticated
  using (private.can_access_team(team_id)) with check (private.can_access_team(team_id));
revoke delete on public.players from authenticated;
revoke update on public.players from authenticated;
grant update (team_id, display_name, jersey_number, position, bats_throws, notes, consent_status, archived_at, updated_at)
  on public.players to authenticated;

create policy athlete_links_select on public.athlete_links for select to authenticated
  using (user_id = auth.uid() or private.is_org_staff(org_id));
revoke insert, update, delete on public.athlete_links from authenticated;

create policy invitations_select on public.invitations for select to authenticated
  using (private.is_org_staff(org_id));
revoke insert, update, delete on public.invitations from authenticated;

-- Practice sessions
create policy sessions_select on public.practice_sessions for select to authenticated
  using (private.can_access_team(team_id));
create policy sessions_insert on public.practice_sessions for insert to authenticated
  with check (private.can_access_team(team_id) and created_by = auth.uid());
create policy sessions_update on public.practice_sessions for update to authenticated
  using (private.can_access_team(team_id)) with check (private.can_access_team(team_id));
create policy sessions_delete on public.practice_sessions for delete to authenticated
  using (private.can_access_team(team_id));

-- Videos: read only via policy; all writes go through RPCs.
create policy videos_select on public.videos for select to authenticated
  using (deleted_at is null and (private.can_access_team(team_id) or private.can_view_video(id)));
revoke insert, update, delete on public.videos from authenticated;

-- Entitlements / subscriptions / usage: staff read; writes only server-side.
create policy entitlements_select on public.entitlements for select to authenticated
  using (private.is_org_staff(org_id));
revoke insert, update, delete on public.entitlements from authenticated;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (private.is_org_owner(org_id));
revoke insert, update, delete on public.subscriptions from authenticated;
create policy usage_reservations_select on public.usage_reservations for select to authenticated
  using (private.is_org_staff(org_id));
revoke insert, update, delete on public.usage_reservations from authenticated;
create policy usage_events_select on public.usage_events for select to authenticated
  using (private.is_org_owner(org_id));
revoke insert, update, delete on public.usage_events from authenticated;

-- Jobs and drafts: staff with team access to the video's team.
create policy jobs_select on public.processing_jobs for select to authenticated
  using (video_id is not null and exists (
    select 1 from public.videos v where v.id = video_id and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.processing_jobs from authenticated;

create policy runs_select on public.analysis_runs for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and v.deleted_at is null and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.analysis_runs from authenticated;

create policy raw_select on public.analysis_raw_outputs for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and v.deleted_at is null and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.analysis_raw_outputs from authenticated;

create policy detected_select on public.detected_events for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and v.deleted_at is null and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.detected_events from authenticated;

create policy draft_obs_select on public.draft_observations for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and v.deleted_at is null and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.draft_observations from authenticated;

create policy review_items_select on public.review_items for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and v.deleted_at is null and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.review_items from authenticated;

create policy review_obs_select on public.review_observations for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and v.deleted_at is null and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.review_observations from authenticated;

create policy revisions_select on public.coach_revisions for select to authenticated
  using (exists (select 1 from public.videos v where v.id = video_id and private.can_access_team(v.team_id)));
revoke insert, update, delete on public.coach_revisions from authenticated;

-- Reports: staff with team access see all versions; athletes only published reports for their player.
create policy reports_select on public.reports for select to authenticated
  using (
    private.can_access_team(team_id)
    or (status = 'published' and private.is_my_player(player_id))
  );
revoke insert, update, delete on public.reports from authenticated;

create policy comparisons_select on public.comparisons for select to authenticated
  using (private.can_access_team(team_id));
create policy comparisons_insert on public.comparisons for insert to authenticated
  with check (private.can_access_team(team_id) and created_by = auth.uid());
create policy comparisons_update on public.comparisons for update to authenticated
  using (private.can_access_team(team_id)) with check (private.can_access_team(team_id));
create policy comparisons_delete on public.comparisons for delete to authenticated
  using (private.can_access_team(team_id));

create policy audit_select on public.audit_events for select to authenticated
  using (org_id is not null and private.is_org_owner(org_id));
revoke insert, update, delete on public.audit_events from authenticated;

-- No authenticated access at all: stripe_events, pilot_codes, rate_limits, worker_heartbeats
revoke all on public.stripe_events, public.pilot_codes, public.rate_limits, public.worker_heartbeats from authenticated;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

create trigger players_touch before update on public.players for each row execute function private.touch_updated_at();
create trigger sessions_touch before update on public.practice_sessions for each row execute function private.touch_updated_at();
create trigger videos_touch before update on public.videos for each row execute function private.touch_updated_at();
create trigger comparisons_touch before update on public.comparisons for each row execute function private.touch_updated_at();

-- Player rows: enforce plan player limit and same-org team.
create or replace function private.players_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit int; v_count int;
begin
  if tg_op = 'INSERT' or (new.archived_at is null and old.archived_at is not null) then
    select max_players into v_limit from private.effective_limits(new.org_id);
    select count(*) into v_count from public.players where org_id = new.org_id and archived_at is null and id <> new.id;
    if v_limit is not null and v_count >= v_limit then
      raise exception 'Player limit reached for this plan (% active players).', v_limit using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then
    raise exception 'Players cannot move between organisations';
  end if;
  return new;
end $$;

-- Comparisons must reference two videos of the same player in the same org.
create or replace function private.comparisons_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.videos a join public.videos b on b.id = new.video_b
                 where a.id = new.video_a and a.org_id = new.org_id and b.org_id = new.org_id
                   and a.player_id = new.player_id and b.player_id = new.player_id
                   and a.team_id = new.team_id and b.team_id = new.team_id
                   and a.deleted_at is null and b.deleted_at is null) then
    raise exception 'Comparison videos must belong to the same player and team';
  end if;
  return new;
end $$;
create trigger comparisons_guard before insert or update on public.comparisons
  for each row execute function private.comparisons_guard();

-- Sessions must belong to an org team the row claims.
create or replace function private.session_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.teams where id = new.team_id and org_id = new.org_id) then
    raise exception 'Team does not belong to organisation';
  end if;
  return new;
end $$;
create trigger sessions_guard before insert or update on public.practice_sessions
  for each row execute function private.session_guard();

-- Raw model outputs are immutable once written.
create or replace function private.immutable_row() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Rows in % are immutable', tg_table_name; end $$;
create trigger raw_outputs_immutable before update on public.analysis_raw_outputs
  for each row execute function private.immutable_row();
create trigger detected_events_immutable before update on public.detected_events
  for each row execute function private.immutable_row();
create trigger draft_observations_immutable before update on public.draft_observations
  for each row execute function private.immutable_row();
