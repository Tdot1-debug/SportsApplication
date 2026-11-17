-- Small read helpers used by the web app.
create or replace function public.analysis_available() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.worker_heartbeats
                 where (capabilities->>'analysis')::boolean and last_seen_at > now() - interval '15 minutes')
$$;
revoke all on function public.analysis_available() from public, anon;
grant execute on function public.analysis_available() to authenticated;

-- Owners see member emails (to manage access). Coaches see staff names and roles only.
create or replace function public.list_org_members(p_org uuid)
returns table (membership_id uuid, user_id uuid, role text, status text, display_name text, email text, all_teams boolean,
               team_ids uuid[], created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not private.is_org_staff(p_org) then raise exception 'Not allowed'; end if;
  return query
  select m.id, m.user_id, m.role, m.status, m.display_name,
         case when private.is_org_owner(p_org) or m.user_id = auth.uid() then u.email::text else null end,
         m.all_teams,
         coalesce((select array_agg(ta.team_id) from public.team_assignments ta where ta.membership_id = m.id), '{}'),
         m.created_at
  from public.memberships m join auth.users u on u.id = m.user_id
  where m.org_id = p_org and m.status = 'active'
    and (private.is_org_owner(p_org) or m.role in ('owner','coach'))
  order by case m.role when 'owner' then 0 when 'coach' then 1 else 2 end, m.created_at;
end $$;
revoke all on function public.list_org_members(uuid) from public, anon;
grant execute on function public.list_org_members(uuid) to authenticated;
