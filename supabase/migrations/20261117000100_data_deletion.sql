-- Complete data deletion: organisations, personal workspaces and user accounts.
--
-- Before this migration, deleting an organisation purged recordings but left athlete names, goals, notes,
-- invitations (emails) and reports in the database indefinitely, and a user could not delete their account.
--
-- Now:
-- 1. delete_organization soft-deletes recordings (the worker purges storage, as before) and immediately
--    removes the organisation's personal data: athletes, goals, roster history, sessions and their notes,
--    invitations, athlete links, comparisons and reports.
-- 2. Once every recording's storage is purged, the worker calls finalize_deleted_organizations, which
--    removes the organisation row and everything that still hangs off it. A row in deletion_log (ids and
--    dates only, no names) records that it happened.
-- 3. delete_my_account deletes the caller's personal workspaces the same way, refuses while the caller is
--    the only owner of a team organisation, and revokes their memberships. The web server then deletes the
--    auth user with the service-role key.
-- 4. Every reference to auth.users that would have blocked deleting a user now becomes NULL instead
--    ("deleted user"), so records an organisation keeps (uploads, approvals, edits) survive the account.

-- ---------------------------------------------------------------------------
-- 4. Let user deletion succeed: non-cascading references to auth.users become ON DELETE SET NULL.
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and c.confdeltype in ('a', 'r')  -- no action / restrict
  loop
    execute format('alter table %s alter column %I drop not null', r.tbl, r.col);
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',
                   r.tbl, r.conname, r.col);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Deletion log: proof of deletion without keeping personal data.
-- ---------------------------------------------------------------------------
create table public.deletion_log (
  id bigint generated always as identity primary key,
  subject_kind text not null check (subject_kind in ('organization', 'user')),
  subject_id uuid not null,
  org_kind text,
  requested_at timestamptz not null,
  completed_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
alter table public.deletion_log enable row level security;
alter table public.deletion_log force row level security;
revoke all on public.deletion_log from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Organisation deletion
-- ---------------------------------------------------------------------------
create or replace function private.delete_org_data(p_org uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_vid uuid;
begin
  for v_vid in select id from public.videos where org_id = p_org and deleted_at is null loop
    perform private.soft_delete_video(v_vid, p_reason);
  end loop;
  -- Free text and personal details go now; recordings go when the worker purges storage.
  update public.videos set player_id = null, session_id = null, original_filename = null
    where org_id = p_org;
  delete from public.comparisons where org_id = p_org;
  delete from public.reports where org_id = p_org;
  delete from public.goals where org_id = p_org;
  delete from public.roster_entries where org_id = p_org;
  delete from public.athlete_links where org_id = p_org;
  delete from public.players where org_id = p_org;
  delete from public.practice_sessions where org_id = p_org;
  delete from public.invitations where org_id = p_org;
  delete from public.seasons where org_id = p_org;
  update public.memberships set status = 'revoked', revoked_at = coalesce(revoked_at, now()), display_name = null
    where org_id = p_org;
  update public.organizations set deleted_at = coalesce(deleted_at, now()), display_name = null where id = p_org;
  perform private.audit(p_org, 'organization.deleted', 'organization', p_org::text, jsonb_build_object('reason', p_reason));
end $$;
revoke all on function private.delete_org_data(uuid, text) from public, anon, authenticated;

create or replace function public.delete_organization(p_org uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  perform private.require_user();
  if not private.is_org_owner(p_org) then raise exception 'Only owners can delete an organisation'; end if;
  select name into v_name from public.organizations where id = p_org and deleted_at is null;
  if v_name is distinct from p_confirm_name then raise exception 'Type the organisation name exactly to confirm'; end if;
  perform private.delete_org_data(p_org, 'Organisation deleted');
end $$;

-- 2. Called by the worker. An organisation is removed once no recording is waiting for storage purge.
create or replace function public.finalize_deleted_organizations() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in
    select o.id, o.kind, o.deleted_at from public.organizations o
    where o.deleted_at is not null
      and not exists (select 1 from public.videos v where v.org_id = o.id and v.purged_at is null)
      and not exists (select 1 from public.processing_jobs j where j.org_id = o.id and j.status in ('queued', 'running'))
    limit 50
  loop
    insert into public.deletion_log (subject_kind, subject_id, org_kind, requested_at)
      values ('organization', r.id, r.kind, r.deleted_at);
    -- Rows with RESTRICT references to teams go first; everything else cascades from the organisation.
    delete from public.reports where org_id = r.id;
    delete from public.videos where org_id = r.id;
    delete from public.organizations where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.finalize_deleted_organizations() from public, anon, authenticated;
grant execute on function public.finalize_deleted_organizations() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Account deletion (step 1 of 2; the server then deletes the auth user)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account(p_confirm_email text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_email text; v_blocking text; r record; v_personal int := 0;
begin
  v_uid := private.require_user();
  select email into v_email from auth.users where id = v_uid;
  if v_email is null or lower(v_email) is distinct from lower(trim(coalesce(p_confirm_email, ''))) then
    raise exception 'Type your email address exactly to confirm';
  end if;
  select string_agg(o.name, ', ' order by o.name) into v_blocking
  from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = v_uid and m.role = 'owner' and m.status = 'active' and o.kind = 'team' and o.deleted_at is null
    and not exists (select 1 from public.memberships m2 where m2.org_id = o.id and m2.role = 'owner'
                    and m2.status = 'active' and m2.user_id <> v_uid);
  if v_blocking is not null then
    raise exception 'You are the only owner of: %. Delete that organisation in its settings first.', v_blocking;
  end if;
  for r in
    select o.id from public.memberships m join public.organizations o on o.id = m.org_id
    where m.user_id = v_uid and m.role = 'owner' and m.status = 'active' and o.kind = 'personal' and o.deleted_at is null
  loop
    perform private.delete_org_data(r.id, 'Account deleted');
    v_personal := v_personal + 1;
  end loop;
  for r in select org_id from public.memberships where user_id = v_uid and status = 'active' loop
    perform private.audit(r.org_id, 'member.account_deleted', 'user', v_uid::text);
  end loop;
  update public.memberships set status = 'revoked', revoked_at = now(), display_name = null where user_id = v_uid;
  delete from public.athlete_links where user_id = v_uid;
  update public.players set self_user_id = null where self_user_id = v_uid;
  insert into public.deletion_log (subject_kind, subject_id, requested_at, details)
    values ('user', v_uid, now(), jsonb_build_object('personal_workspaces', v_personal));
  return jsonb_build_object('user_id', v_uid, 'personal_workspaces_deleted', v_personal);
end $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
