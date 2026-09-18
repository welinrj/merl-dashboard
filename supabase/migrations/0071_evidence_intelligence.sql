-- Evidence intelligence: read uploaded Word/PDF evidence, decide whether it says
-- anything about the indicator it is filed under, and reconcile any figure it
-- reports against what the results framework already holds.
--
-- Nothing here writes indicator_progress by itself. The analyser proposes; an
-- editor accepts; only then does a draft progress row appear. That keeps the
-- existing review workflow (0049) in charge of what counts as reported.

create table if not exists merl.evidence_analysis (
  id                   uuid primary key default gen_random_uuid(),
  evidence_id          uuid not null references merl.evidence(id) on delete cascade,
  indicator_id         uuid not null references merl.project_indicators(id) on delete cascade,
  project_id           uuid not null references merl.projects(id) on delete cascade,

  -- pipeline state
  status               text not null default 'queued'
                       check (status in ('queued','extracting','analysing','complete','failed')),
  error_message        text,
  extract_method       text,           -- 'pdf' | 'docx' | 'text'
  doc_chars            integer,
  doc_pages            integer,

  -- does this document say anything about THIS indicator?
  relevance            text check (relevance in ('relevant','partial','not_relevant','unclear')),
  relevance_reason     text,

  -- is there a reportable figure in it?
  progress_found       boolean,
  extracted_value      numeric,
  extracted_unit       text,
  extracted_period     text,
  as_of_date           date,
  evidence_quote       text,           -- verbatim sentence the figure came from
  source_location      text,           -- page / heading
  confidence           numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),

  -- reconciliation against what is already recorded (computed in SQL, not by the model)
  reconciliation       text check (reconciliation in
                       ('new_progress','already_reported','outdated','conflicting','no_progress','not_relevant')),
  reconciliation_detail text,
  compared_progress_id uuid references merl.indicator_progress(id) on delete set null,

  -- human decision
  review_state         text not null default 'proposed'
                       check (review_state in ('proposed','accepted','rejected','superseded')),
  applied_progress_id  uuid references merl.indicator_progress(id) on delete set null,
  reviewed_by          uuid references merl.users(id) on delete set null,
  reviewed_at          timestamptz,

  model                text,
  raw                  jsonb not null default '{}'::jsonb,
  analysed_at          timestamptz,
  created_by           uuid references merl.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists evidence_analysis_indicator_idx on merl.evidence_analysis(indicator_id, created_at desc);
create index if not exists evidence_analysis_evidence_idx  on merl.evidence_analysis(evidence_id);
create index if not exists evidence_analysis_status_idx    on merl.evidence_analysis(status) where status in ('queued','extracting','analysing');
-- one live analysis per (evidence, indicator); re-running replaces it
create unique index if not exists evidence_analysis_unique on merl.evidence_analysis(evidence_id, indicator_id)
  where review_state <> 'superseded';

drop trigger if exists trg_evidence_analysis_updated_at on merl.evidence_analysis;
create trigger trg_evidence_analysis_updated_at before update on merl.evidence_analysis
  for each row execute function merl.set_updated_at();

alter table merl.evidence_analysis enable row level security;

drop policy if exists evidence_analysis_read on merl.evidence_analysis;
create policy evidence_analysis_read on merl.evidence_analysis for select to authenticated
  using (merl.can_access_project(project_id));

-- Writes go through the SECURITY DEFINER functions below, never directly.
revoke all on merl.evidence_analysis from anon, authenticated;
grant select on merl.evidence_analysis to authenticated;

-- ── reconciliation ──────────────────────────────────────────────────────────
-- Compare a figure lifted from a document against what the framework already
-- holds for that indicator. Deterministic on purpose: the model reads prose,
-- the database decides whether the number is news.
create or replace function merl.reconcile_evidence_figure(
  p_indicator_id uuid, p_value numeric, p_period text, p_as_of date)
returns table (verdict text, detail text, compared_id uuid)
language plpgsql stable security definer set search_path = merl, public, pg_temp
as $$
declare
  v_latest merl.indicator_progress%rowtype;
  v_same_period merl.indicator_progress%rowtype;
  v_tol numeric;
begin
  if p_value is null then
    return query select 'no_progress'::text,
      'The document was read but no numeric figure for this indicator was found in it.'::text, null::uuid;
    return;
  end if;

  select * into v_latest from merl.indicator_progress
   where indicator_id = p_indicator_id
     and coalesce(cumulative_actual, actual_this_period) is not null
   order by coalesce(date_reported, created_at::date) desc, created_at desc
   limit 1;

  if not found then
    return query select 'new_progress'::text,
      format('No figure is recorded for this indicator yet. The document reports %s.', p_value)::text,
      null::uuid;
    return;
  end if;

  -- treat figures within 0.5% (or 0.01 absolute) as the same number
  v_tol := greatest(abs(coalesce(v_latest.cumulative_actual, v_latest.actual_this_period)) * 0.005, 0.01);

  if p_period is not null then
    select * into v_same_period from merl.indicator_progress
     where indicator_id = p_indicator_id and reporting_period = p_period
     order by created_at desc limit 1;
  end if;

  -- same period already carries a figure
  if v_same_period.id is not null
     and coalesce(v_same_period.cumulative_actual, v_same_period.actual_this_period) is not null then
    if abs(coalesce(v_same_period.cumulative_actual, v_same_period.actual_this_period) - p_value) <= v_tol then
      return query select 'already_reported'::text,
        format('%s is already recorded for %s. Nothing to add.', p_value, p_period)::text, v_same_period.id;
    else
      return query select 'conflicting'::text,
        format('%s is recorded for %s, but this document reports %s. The difference needs resolving before either is used.',
               coalesce(v_same_period.cumulative_actual, v_same_period.actual_this_period), p_period, p_value)::text,
        v_same_period.id;
    end if;
    return;
  end if;

  -- document predates what is already recorded
  if p_as_of is not null and v_latest.date_reported is not null and p_as_of < v_latest.date_reported then
    return query select 'outdated'::text,
      format('This document reports as at %s, but %s is already recorded as at %s. The document is behind the framework.',
             p_as_of, coalesce(v_latest.cumulative_actual, v_latest.actual_this_period), v_latest.date_reported)::text,
      v_latest.id;
    return;
  end if;

  if abs(coalesce(v_latest.cumulative_actual, v_latest.actual_this_period) - p_value) <= v_tol then
    return query select 'already_reported'::text,
      format('%s matches the figure already recorded for %s.', p_value, v_latest.reporting_period)::text, v_latest.id;
    return;
  end if;

  return query select 'new_progress'::text,
    format('Currently recorded: %s (%s). This document reports %s%s.',
           coalesce(v_latest.cumulative_actual, v_latest.actual_this_period), v_latest.reporting_period, p_value,
           case when p_period is not null then ' for ' || p_period else '' end)::text,
    v_latest.id;
end; $$;

-- ── queue an analysis (called by the app, picked up by the edge function) ────
create or replace function public.request_evidence_analysis(p_evidence_id uuid)
returns uuid language plpgsql security definer set search_path = merl, public, pg_temp
as $$
declare v_ev merl.evidence%rowtype; v_id uuid;
begin
  select * into v_ev from merl.evidence where id = p_evidence_id;
  if not found then raise exception 'Evidence not found.'; end if;
  if v_ev.indicator_id is null then
    raise exception 'This evidence is not linked to an indicator. Attach it to an indicator before analysing it.';
  end if;
  if v_ev.file_url is null then raise exception 'This evidence has no uploaded file to read.'; end if;
  perform merl.require_project_access(v_ev.project_id);
  if not merl.is_editor() then raise exception 'You do not have permission to run evidence analysis.'; end if;

  update merl.evidence_analysis set review_state = 'superseded'
   where evidence_id = p_evidence_id and indicator_id = v_ev.indicator_id and review_state = 'proposed';

  insert into merl.evidence_analysis (evidence_id, indicator_id, project_id, status, created_by)
  values (p_evidence_id, v_ev.indicator_id, v_ev.project_id, 'queued', (merl.current_db_user()).id)
  returning id into v_id;
  return v_id;
end; $$;

-- ── record the analyser's findings (service_role only: the edge function) ────
create or replace function public.record_evidence_analysis(
  p_analysis_id uuid, p_status text, p_payload jsonb)
returns void language plpgsql security definer set search_path = merl, public, pg_temp
as $$
declare v_row merl.evidence_analysis%rowtype; v_rec record; v_val numeric; v_period text; v_asof date;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the analysis service may record findings.' using errcode = '42501';
  end if;
  select * into v_row from merl.evidence_analysis where id = p_analysis_id;
  if not found then raise exception 'Analysis not found.'; end if;

  if p_status = 'failed' then
    update merl.evidence_analysis
       set status = 'failed', error_message = nullif(p_payload->>'error',''), analysed_at = now()
     where id = p_analysis_id;
    return;
  end if;

  v_val    := nullif(p_payload->>'extracted_value','')::numeric;
  v_period := nullif(p_payload->>'extracted_period','');
  v_asof   := nullif(p_payload->>'as_of_date','')::date;

  if coalesce(p_payload->>'relevance','unclear') = 'not_relevant' then
    v_rec := row('not_relevant',
      'The document does not discuss this indicator, so there is nothing to reconcile.', null::uuid);
  else
    select * into v_rec from merl.reconcile_evidence_figure(v_row.indicator_id, v_val, v_period, v_asof);
  end if;

  update merl.evidence_analysis set
    status = 'complete',
    extract_method   = nullif(p_payload->>'extract_method',''),
    doc_chars        = nullif(p_payload->>'doc_chars','')::integer,
    doc_pages        = nullif(p_payload->>'doc_pages','')::integer,
    relevance        = nullif(p_payload->>'relevance',''),
    relevance_reason = nullif(p_payload->>'relevance_reason',''),
    progress_found   = coalesce((p_payload->>'progress_found')::boolean, false),
    extracted_value  = v_val,
    extracted_unit   = nullif(p_payload->>'extracted_unit',''),
    extracted_period = v_period,
    as_of_date       = v_asof,
    evidence_quote   = nullif(p_payload->>'evidence_quote',''),
    source_location  = nullif(p_payload->>'source_location',''),
    confidence       = nullif(p_payload->>'confidence','')::numeric,
    model            = nullif(p_payload->>'model',''),
    raw              = p_payload,
    reconciliation        = v_rec.verdict,
    reconciliation_detail = v_rec.detail,
    compared_progress_id  = v_rec.compared_id,
    error_message    = null,
    analysed_at      = now()
  where id = p_analysis_id;
end; $$;

-- ── accept a proposal: write a DRAFT progress row, never an approved one ─────
create or replace function public.apply_evidence_analysis(p_analysis_id uuid, p_period text default null)
returns uuid language plpgsql security definer set search_path = merl, public, pg_temp
as $$
declare
  a merl.evidence_analysis%rowtype; e merl.evidence%rowtype; i merl.project_indicators%rowtype;
  v_period text; v_progress_id uuid;
begin
  select * into a from merl.evidence_analysis where id = p_analysis_id;
  if not found then raise exception 'Analysis not found.'; end if;
  perform merl.require_project_access(a.project_id);
  if not merl.is_editor() then raise exception 'You do not have permission to apply evidence findings.'; end if;
  if a.status <> 'complete' then raise exception 'This analysis has not finished running.'; end if;
  if a.review_state <> 'proposed' then raise exception 'This analysis has already been actioned.'; end if;
  if coalesce(a.reconciliation,'') not in ('new_progress','conflicting') then
    raise exception 'There is no new figure in this document to apply (%).', coalesce(a.reconciliation,'unknown');
  end if;

  select * into e from merl.evidence where id = a.evidence_id;
  select * into i from merl.project_indicators where id = a.indicator_id;
  v_period := coalesce(p_period, a.extracted_period, e.reporting_period);
  if v_period is null then raise exception 'No reporting period could be determined. Pass one explicitly.'; end if;

  insert into merl.indicator_progress (
    project_id, indicator_id, reporting_period, cumulative_actual, achievement_pct,
    performance_status, narrative, date_reported, review_status, created_by, reported_by)
  values (
    a.project_id, a.indicator_id, v_period, a.extracted_value,
    case when a.extracted_value is null or i.target_value is null or i.target_value = 0 then null
         else round(a.extracted_value / i.target_value * 100, 1) end,
    null,
    format('Read from uploaded evidence "%s"%s. Quoted: "%s"%s Analysed by %s with confidence %s. This figure has NOT been verified against the source document by a person.',
           e.title,
           case when a.source_location is not null then ' (' || a.source_location || ')' else '' end,
           coalesce(a.evidence_quote,'(no quote captured)'),
           case when a.reconciliation = 'conflicting' then ' CONFLICT: ' || a.reconciliation_detail else '' end,
           coalesce(a.model,'the analyser'), coalesce(a.confidence::text,'unstated')),
    coalesce(a.as_of_date, e.document_date, current_date),
    'draft', (merl.current_db_user()).id, (merl.current_db_user()).id)
  returning id into v_progress_id;

  update merl.evidence_analysis
     set review_state = 'accepted', applied_progress_id = v_progress_id,
         reviewed_by = (merl.current_db_user()).id, reviewed_at = now()
   where id = p_analysis_id;

  insert into merl.result_review_history (indicator_progress_id, from_status, to_status, comment, acted_by)
  values (v_progress_id, null, 'draft',
    format('Created from evidence analysis %s of document "%s". Awaiting human verification.', p_analysis_id, e.title),
    (merl.current_db_user()).id);

  return v_progress_id;
end; $$;

create or replace function public.reject_evidence_analysis(p_analysis_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = merl, public, pg_temp
as $$
declare a merl.evidence_analysis%rowtype;
begin
  select * into a from merl.evidence_analysis where id = p_analysis_id;
  if not found then raise exception 'Analysis not found.'; end if;
  perform merl.require_project_access(a.project_id);
  if not merl.is_editor() then raise exception 'You do not have permission to action evidence findings.'; end if;
  update merl.evidence_analysis
     set review_state = 'rejected',
         reconciliation_detail = coalesce(nullif(p_reason,''), reconciliation_detail),
         reviewed_by = (merl.current_db_user()).id, reviewed_at = now()
   where id = p_analysis_id;
end; $$;

-- ── read models ─────────────────────────────────────────────────────────────
create or replace view public.v_evidence_analysis
with (security_invoker = on) as
select a.*, e.title as evidence_title, e.file_url, e.document_type, e.document_date,
       e.reporting_period as evidence_period,
       i.code as indicator_code, i.name as indicator_name, i.unit as indicator_unit,
       i.target_value, u.full_name as reviewed_by_name
from merl.evidence_analysis a
join merl.evidence e on e.id = a.evidence_id
join merl.project_indicators i on i.id = a.indicator_id
left join merl.users u on u.id = a.reviewed_by;

-- One row per indicator: is there evidence, does it say anything, is it news?
create or replace view public.v_indicator_evidence_status
with (security_invoker = on) as
with ev as (
  select indicator_id, count(*)::int as evidence_count, max(created_at) as last_uploaded_at
  from merl.evidence where indicator_id is not null and file_url is not null
  group by indicator_id
), an as (
  select distinct on (indicator_id) indicator_id, id as latest_analysis_id, status, relevance,
         progress_found, extracted_value, extracted_unit, extracted_period, as_of_date,
         confidence, reconciliation, reconciliation_detail, review_state, analysed_at, error_message
  from merl.evidence_analysis where review_state <> 'superseded'
  order by indicator_id, created_at desc
), counts as (
  select indicator_id,
         count(*) filter (where status = 'complete' and relevance in ('relevant','partial'))::int as relevant_count,
         count(*) filter (where reconciliation = 'new_progress' and review_state = 'proposed')::int as unactioned_new,
         count(*) filter (where reconciliation = 'conflicting' and review_state = 'proposed')::int as unresolved_conflicts,
         count(*) filter (where reconciliation = 'outdated')::int as outdated_count,
         count(*) filter (where status in ('queued','extracting','analysing'))::int as pending_count,
         count(*) filter (where status = 'failed')::int as failed_count
  from merl.evidence_analysis where review_state <> 'superseded' group by indicator_id
)
select i.id as indicator_id, i.project_id, i.code as indicator_code, i.name as indicator_name, i.unit,
       coalesce(ev.evidence_count, 0) as evidence_count,
       ev.last_uploaded_at,
       coalesce(c.relevant_count, 0)      as relevant_count,
       coalesce(c.unactioned_new, 0)      as unactioned_new,
       coalesce(c.unresolved_conflicts,0) as unresolved_conflicts,
       coalesce(c.outdated_count, 0)      as outdated_count,
       coalesce(c.pending_count, 0)       as pending_count,
       coalesce(c.failed_count, 0)        as failed_count,
       an.latest_analysis_id, an.status as latest_status, an.relevance as latest_relevance,
       an.progress_found, an.extracted_value, an.extracted_unit, an.extracted_period,
       an.confidence, an.reconciliation, an.reconciliation_detail, an.review_state, an.analysed_at,
       case
         when coalesce(ev.evidence_count,0) = 0                then 'no_evidence'
         when coalesce(c.pending_count,0) > 0                  then 'analysing'
         when an.latest_analysis_id is null                    then 'not_analysed'
         when coalesce(c.unresolved_conflicts,0) > 0           then 'conflicting'
         when coalesce(c.unactioned_new,0) > 0                 then 'new_progress'
         when coalesce(c.relevant_count,0) = 0                 then 'not_relevant'
         when an.reconciliation = 'outdated'                   then 'outdated'
         when an.reconciliation = 'already_reported'           then 'already_reported'
         when an.reconciliation = 'no_progress'                then 'no_figure'
         else 'reviewed'
       end as evidence_state
from merl.project_indicators i
left join ev on ev.indicator_id = i.id
left join an on an.indicator_id = i.id
left join counts c on c.indicator_id = i.id;

grant select on public.v_evidence_analysis, public.v_indicator_evidence_status to authenticated;
revoke all on public.v_evidence_analysis, public.v_indicator_evidence_status from anon;

revoke all on function public.request_evidence_analysis(uuid)       from public, anon;
revoke all on function public.apply_evidence_analysis(uuid, text)   from public, anon;
revoke all on function public.reject_evidence_analysis(uuid, text)  from public, anon;
revoke all on function public.record_evidence_analysis(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.request_evidence_analysis(uuid)      to authenticated;
grant execute on function public.apply_evidence_analysis(uuid, text)  to authenticated;
grant execute on function public.reject_evidence_analysis(uuid, text) to authenticated;
grant execute on function public.record_evidence_analysis(uuid, text, jsonb) to service_role;
