-- Public planning information only. Never expose reporting drafts or internal records.
create or replace function public.public_portal_project_plan()
returns table(project_id uuid, inputs jsonb, outputs jsonb)
language sql stable security definer
set search_path = merl, public, pg_temp
as $$
  select p.id,
    coalesce((select jsonb_agg(jsonb_build_object('name',a.name,'description',a.description) order by a.name)
      from merl.project_activities a where a.project_id=p.id and nullif(trim(a.name),'') is not null),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('code',o.code,'statement',o.statement) order by o.code)
      from merl.outputs o where o.project_id=p.id and nullif(trim(o.statement),'') is not null),'[]'::jsonb)
  from merl.projects p
  join public.public_portal_projects pub on pub.id=p.id
  where p.registration_status='approved';
$$;
revoke all on function public.public_portal_project_plan() from public;
grant execute on function public.public_portal_project_plan() to anon, authenticated, service_role;