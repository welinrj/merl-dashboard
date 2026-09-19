-- 0072 — name the documents behind an indicator's evidence badge.
--
-- The badge told an officer that evidence existed but not what it was, so the
-- only way to see a filename was to open the panel. The status view now carries
-- the few most recent documents so the Results Framework table can name them in
-- place. Capped at three: the panel already lists the rest, and this view is
-- read for every indicator of every project at once.
--
-- Titles are translatable (merl.translatable_fields), so each document carries
-- its own i18n object for localiseRow() to swap on the client.

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
       end as evidence_state,
       -- Appended last: `create or replace view` can only add columns at the end.
       coalesce(d.recent_documents, '[]'::jsonb) as recent_documents
from merl.project_indicators i
left join ev on ev.indicator_id = i.id
left join an on an.indicator_id = i.id
left join counts c on c.indicator_id = i.id
left join lateral (
  select jsonb_agg(jsonb_build_object(
           'id', x.id, 'title', x.title, 'i18n', x.i18n,
           'document_type', x.document_type, 'document_date', x.document_date,
           'file_url', x.file_url) order by x.ord) as recent_documents
  from (
    select e.id, e.title, e.i18n, e.document_type, e.document_date, e.file_url,
           row_number() over (order by e.document_date desc nulls last, e.created_at desc) as ord
    from merl.evidence e
    where e.indicator_id = i.id and e.file_url is not null
    order by e.document_date desc nulls last, e.created_at desc
    limit 3
  ) x
) d on true;

grant select on public.v_indicator_evidence_status to authenticated;
revoke all on public.v_indicator_evidence_status from anon;
