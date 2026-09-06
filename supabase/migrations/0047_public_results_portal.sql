-- Public results publication layer.
-- IMPORTANT: anonymous users can read only these three snapshot tables. Internal
-- MERL monitoring, review, risk, workflow and management records remain private.

create table if not exists public.public_portal_projects (
  id uuid primary key, code text, name text not null, acronym text, description text,
  lead_agency text, donor text, project_type text, primary_climate_theme text,
  expected_primary_outcome text,
  lifecycle_status text not null check (lifecycle_status in ('ongoing','completed','upcoming')),
  start_date date, end_date date, budget_vuv numeric, provinces text[], coverage_type text,
  progress_pct numeric, published_indicator_count integer not null default 0,
  published_beneficiaries bigint not null default 0, last_published_period text,
  published_at timestamptz
);

create table if not exists public.public_portal_area_councils (
  province text not null, area_council text not null, project_count integer not null default 0,
  project_ids uuid[] not null default '{}', project_codes text[] not null default '{}',
  project_names text[] not null default '{}', primary key (province, area_council)
);

create table if not exists public.public_portal_summary (
  singleton boolean primary key default true check (singleton), project_count integer not null default 0,
  overall_progress_pct numeric, published_beneficiaries bigint not null default 0,
  total_investment_vuv numeric not null default 0, projects_with_published_results integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.public_portal_projects enable row level security;
alter table public.public_portal_area_councils enable row level security;
alter table public.public_portal_summary enable row level security;

drop policy if exists public_portal_projects_read on public.public_portal_projects;
create policy public_portal_projects_read on public.public_portal_projects for select to anon, authenticated using (true);
drop policy if exists public_portal_area_councils_read on public.public_portal_area_councils;
create policy public_portal_area_councils_read on public.public_portal_area_councils for select to anon, authenticated using (true);
drop policy if exists public_portal_summary_read on public.public_portal_summary;
create policy public_portal_summary_read on public.public_portal_summary for select to anon, authenticated using (true);

revoke all on public.public_portal_projects from public, anon, authenticated;
revoke all on public.public_portal_area_councils from public, anon, authenticated;
revoke all on public.public_portal_summary from public, anon, authenticated;
grant select on public.public_portal_projects to anon, authenticated;
grant select on public.public_portal_area_councils to anon, authenticated;
grant select on public.public_portal_summary to anon, authenticated;
grant all on public.public_portal_projects to service_role;
grant all on public.public_portal_area_councils to service_role;
grant all on public.public_portal_summary to service_role;

create or replace function merl.refresh_public_portal() returns void
language plpgsql security definer set search_path=merl,public,pg_temp as $$
begin
  truncate public.public_portal_projects, public.public_portal_area_councils, public.public_portal_summary;

  with approved_periods as (
    select project_id,period_label,period_end,approved_at from merl.reporting_periods where submission_status='approved'
  ), latest_indicator as (
    select distinct on (ip.indicator_id) ip.project_id,ip.indicator_id,
      least(100::numeric,greatest(0::numeric,ip.achievement_pct)) achievement_pct,
      ap.period_label,ap.period_end,ap.approved_at
    from merl.indicator_progress ip join approved_periods ap
      on ap.project_id=ip.project_id and ap.period_label=ip.reporting_period
    where ip.achievement_pct is not null
    order by ip.indicator_id,ap.period_end desc nulls last,ip.updated_at desc nulls last
  ), project_progress as (
    select project_id,round(avg(achievement_pct)::numeric,1) progress_pct,count(*)::integer indicator_count
    from latest_indicator group by project_id
  ), beneficiary_totals as (
    select b.project_id,coalesce(sum(b.total_direct),0)::bigint total_direct from merl.beneficiaries b
    where exists(select 1 from approved_periods ap where ap.project_id=b.project_id and ap.period_label=b.reporting_period)
    group by b.project_id
  ), latest_period as (
    select distinct on(project_id) project_id,period_label,approved_at from approved_periods
    order by project_id,period_end desc nulls last,approved_at desc nulls last
  )
  insert into public.public_portal_projects
  select p.id,p.code::text,p.name::text,p.acronym::text,p.description,p.lead_agency,p.donor::text,p.project_type::text,
    p.primary_climate_theme::text,p.expected_primary_outcome::text,
    case when lower(coalesce(p.status::text,''))='completed' then 'completed'
         when p.start_date>current_date or lower(coalesce(p.status::text,'')) in('not_started','pipeline') then 'upcoming'
         else 'ongoing' end,
    p.start_date,p.end_date,p.budget_vuv,p.provinces,p.coverage_type::text,pp.progress_pct,
    coalesce(pp.indicator_count,0),coalesce(bt.total_direct,0),lp.period_label,lp.approved_at
  from merl.projects p left join project_progress pp on pp.project_id=p.id
  left join beneficiary_totals bt on bt.project_id=p.id left join latest_period lp on lp.project_id=p.id
  where p.registration_status='approved';

  insert into public.public_portal_area_councils
  select initcap(trim(l.province)),trim(l.area_council),count(distinct l.project_id)::integer,
    array_agg(distinct l.project_id),array_agg(distinct p.code::text) filter(where p.code is not null),
    array_agg(distinct p.name::text) filter(where p.name is not null)
  from merl.project_locations l join merl.projects p on p.id=l.project_id and p.registration_status='approved'
  where nullif(trim(l.area_council),'') is not null and nullif(trim(l.province),'') is not null and lower(trim(l.province))<>'national'
  group by initcap(trim(l.province)),trim(l.area_council);

  insert into public.public_portal_summary
  select true,count(*)::integer,round(avg(progress_pct) filter(where progress_pct is not null)::numeric,1),
    coalesce(sum(published_beneficiaries),0)::bigint,coalesce(sum(budget_vuv),0),
    count(*) filter(where progress_pct is not null)::integer,now() from public.public_portal_projects;
end $$;

revoke all on function merl.refresh_public_portal() from public,anon,authenticated;
grant execute on function merl.refresh_public_portal() to service_role;

create or replace function merl.trg_refresh_public_portal() returns trigger
language plpgsql security definer set search_path=merl,public,pg_temp as $$begin perform merl.refresh_public_portal(); return null; end$$;
revoke all on function merl.trg_refresh_public_portal() from public,anon,authenticated;

do $$ declare tbl text; begin
  foreach tbl in array array['projects','indicator_progress','reporting_periods','beneficiaries','project_locations'] loop
    execute format('drop trigger if exists refresh_public_portal_snapshot on merl.%I',tbl);
    execute format('create trigger refresh_public_portal_snapshot after insert or update or delete or truncate on merl.%I for each statement execute function merl.trg_refresh_public_portal()',tbl);
  end loop;
end $$;

select merl.refresh_public_portal();
