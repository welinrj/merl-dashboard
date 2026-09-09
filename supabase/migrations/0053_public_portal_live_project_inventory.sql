-- Live project inventory for the public overview. The public results tables
-- remain approval-gated; this function exposes aggregate counts only.
create or replace function public.public_portal_project_inventory()
returns table(total_projects bigint, approved_projects bigint, other_projects bigint)
language sql stable security definer
set search_path = ''
as $$
  select count(*)::bigint,
         count(*) filter (where registration_status = 'approved')::bigint,
         count(*) filter (where registration_status is distinct from 'approved')::bigint
  from merl.projects;
$$;
revoke all on function public.public_portal_project_inventory() from public, anon, authenticated;
grant execute on function public.public_portal_project_inventory() to anon, authenticated, service_role;
comment on function public.public_portal_project_inventory() is 'Live aggregate project inventory. Does not disclose unpublished project records or results.';
