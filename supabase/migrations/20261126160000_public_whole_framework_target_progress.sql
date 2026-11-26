-- Public project progress: approved achieved final targets / all registered framework indicators.
-- Individual public KPI/evidence visibility is unchanged; only aggregate counts are exposed.
ALTER TABLE public.public_portal_projects
 ADD COLUMN IF NOT EXISTS total_target_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS assessed_target_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS achieved_target_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS progress_basis text,
 ADD COLUMN IF NOT EXISTS target_summary_period text,
 ADD COLUMN IF NOT EXISTS target_summary_published_at timestamptz;
ALTER TABLE public.public_portal_summary
 ADD COLUMN IF NOT EXISTS total_target_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS assessed_target_count integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS achieved_target_count integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.public_portal_projects.progress_pct IS
 'Achieved approved final targets divided by all project framework indicators; NULL when no final target is assessable.';
COMMENT ON COLUMN public.public_portal_projects.published_indicator_count IS
 'Count of individually public indicator results; never the denominator of project target achievement.';
CREATE OR REPLACE FUNCTION merl.refresh_public_target_summary()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $target_summary$
BEGIN
WITH latest AS (
 SELECT DISTINCT ON (p.indicator_id) p.*, rp.period_end
 FROM merl.indicator_progress p
 JOIN merl.reporting_periods rp ON rp.project_id=p.project_id AND rp.period_label=p.reporting_period
 WHERE rp.submission_status='approved' AND p.review_status IN ('approved','published','locked')
 ORDER BY p.indicator_id,coalesce(rp.period_end,p.date_reported,p.created_at::date) DESC,
 p.updated_at DESC,p.id DESC
), targets AS (
 SELECT i.project_id,i.id,
 CASE WHEN l.id IS NULL THEN NULL
 WHEN coalesce(i.is_qualitative,false) THEN
   CASE WHEN l.period_target IS NULL AND l.achievement_pct IS NOT NULL THEN l.achievement_pct>=100 ELSE NULL END
 WHEN l.cumulative_actual IS NULL OR i.target_value IS NULL THEN NULL
 WHEN i.higher_is_better=false THEN l.cumulative_actual<=i.target_value
 ELSE l.cumulative_actual>=i.target_value END AS attained
 FROM merl.project_indicators i JOIN public.public_portal_projects pub ON pub.id=i.project_id
 LEFT JOIN latest l ON l.project_id=i.project_id AND l.indicator_id=i.id
), totals AS (
 SELECT project_id,count(*)::integer AS total,count(attained)::integer AS assessed,
 count(*) FILTER(WHERE attained=true)::integer AS achieved FROM targets GROUP BY project_id
)
 UPDATE public.public_portal_projects p SET
 total_target_count=coalesce(t.total,0),
 assessed_target_count=coalesce(t.assessed,0),
 achieved_target_count=coalesce(t.achieved,0),
 progress_basis='final_targets',
 progress_pct=CASE WHEN t.total>0 AND t.assessed>0 THEN round(t.achieved::numeric/t.total*100,1) ELSE NULL END,
 target_summary_period=(SELECT l.reporting_period FROM latest l WHERE l.project_id=p.id
   ORDER BY coalesce(l.period_end,l.date_reported,l.created_at::date) DESC,l.updated_at DESC,l.id DESC LIMIT 1),
 target_summary_published_at=now()
 FROM (SELECT pub.id,x.total,x.assessed,x.achieved FROM public.public_portal_projects pub
       LEFT JOIN totals x ON x.project_id=pub.id) t WHERE p.id=t.id;

 UPDATE public.public_portal_summary s SET
 total_target_count=x.total,assessed_target_count=x.assessed,achieved_target_count=x.achieved,
 overall_progress_pct=CASE WHEN x.total>0 AND x.assessed>0 THEN round(x.achieved::numeric/x.total*100,1) ELSE NULL END,
 projects_with_published_results=x.reporting,updated_at=now()
 FROM (SELECT coalesce(sum(total_target_count),0)::integer AS total,
       coalesce(sum(assessed_target_count),0)::integer AS assessed,
       coalesce(sum(achieved_target_count),0)::integer AS achieved,
       count(*) FILTER(WHERE assessed_target_count>0)::integer AS reporting
       FROM public.public_portal_projects) x WHERE s.singleton=true;
END;
$target_summary$;
REVOKE ALL ON FUNCTION merl.refresh_public_target_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION merl.refresh_public_target_summary() TO service_role;

CREATE OR REPLACE FUNCTION merl.refresh_public_portal()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'merl', 'public', 'pg_temp'
AS $function$
BEGIN
  TRUNCATE public.public_portal_kpis, public.public_portal_projects,
           public.public_portal_area_councils, public.public_portal_summary;

  WITH approved_periods AS (
    SELECT project_id,period_label,period_end,approved_at
    FROM merl.reporting_periods WHERE submission_status='approved'
  ), public_indicator_ids AS (
    SELECT DISTINCT pi.id
    FROM merl.project_indicators pi
    LEFT JOIN merl.dashboard_kpi_config cfg
      ON cfg.indicator_id=pi.id AND cfg.project_id=pi.project_id
      AND cfg.active=true AND cfg.is_public=true
    WHERE pi.is_public=true OR cfg.id IS NOT NULL
  ), latest_indicator AS (
    SELECT DISTINCT ON (ip.indicator_id)
      ip.project_id,ip.indicator_id,
      CASE WHEN ip.achievement_pct IS NOT NULL THEN least(100::numeric,greatest(0::numeric,ip.achievement_pct)) END achievement_pct,
      ap.period_label,ap.period_end,ap.approved_at
    FROM merl.indicator_progress ip
    JOIN approved_periods ap ON ap.project_id=ip.project_id AND ap.period_label=ip.reporting_period
    JOIN public_indicator_ids pub ON pub.id=ip.indicator_id
    WHERE ip.review_status IN ('approved','published','locked')
    ORDER BY ip.indicator_id,ap.period_end DESC NULLS LAST,ip.updated_at DESC NULLS LAST
  ), project_progress AS (
    SELECT project_id,count(achievement_pct)::integer indicator_count
    FROM latest_indicator GROUP BY project_id
  ), approved_beneficiary_rows AS (
    SELECT b.*
    FROM merl.beneficiaries b
    WHERE EXISTS (
      SELECT 1 FROM approved_periods ap
      WHERE ap.project_id=b.project_id AND ap.period_label=b.reporting_period
    )
  ), beneficiary_totals AS (
    SELECT project_id,
      CASE WHEN bool_and(coalesce(double_counting_check,false))
        THEN sum(total_direct)
        ELSE max(total_direct)
      END::bigint AS total_direct
    FROM approved_beneficiary_rows GROUP BY project_id
  ), latest_period AS (
    SELECT DISTINCT ON(project_id) project_id,period_label,approved_at
    FROM approved_periods
    ORDER BY project_id,period_end DESC NULLS LAST,approved_at DESC NULLS LAST
  ), latest_financial AS (
    SELECT DISTINCT ON(fp.project_id)
      fp.project_id,fp.approved_budget,fp.cumulative_expenditure,ap.period_end
    FROM merl.financial_progress fp
    JOIN approved_periods ap
      ON ap.project_id=fp.project_id AND ap.period_label=fp.reporting_period
    ORDER BY fp.project_id,ap.period_end DESC NULLS LAST,fp.updated_at DESC NULLS LAST
  )
  INSERT INTO public.public_portal_projects(
    id,code,name,acronym,description,lead_agency,donor,project_type,
    primary_climate_theme,expected_primary_outcome,lifecycle_status,start_date,end_date,
    budget_vuv,provinces,coverage_type,progress_pct,published_indicator_count,
    published_beneficiaries,last_published_period,published_at,docc_url,docc_image_url,
    docc_themes,project_manager,cumulative_expenditure_vuv,utilisation_pct,currency,approved_budget_confirmed
  )
  SELECT p.id,p.code::text,p.name::text,p.acronym::text,p.description,p.lead_agency,
    coalesce((
      SELECT o.name FROM merl.project_organizations po
      JOIN merl.organizations o ON o.id=po.organization_id
      WHERE po.project_id=p.id AND po.role='donor'
      ORDER BY po.is_primary DESC,o.name LIMIT 1
    ),p.donor::text) AS donor,
    p.project_type::text,p.primary_climate_theme::text,p.expected_primary_outcome::text,
    CASE WHEN lower(coalesce(p.status::text,'')) IN ('completed','closed') THEN 'completed'
         WHEN p.start_date>current_date OR lower(coalesce(p.status::text,'')) IN ('planning','not_started','pipeline','approved') THEN 'upcoming'
         ELSE 'ongoing' END,
    p.start_date,p.end_date,
    CASE WHEN p.budget_vuv=0 AND NOT coalesce(p.approved_budget_confirmed,false) THEN lf.approved_budget ELSE coalesce(p.budget_vuv,lf.approved_budget) END,
    p.provinces,p.coverage_type::text,NULL::numeric,
    coalesce(pp.indicator_count,0),bt.total_direct,lp.period_label,lp.approved_at,
    p.docc_url,p.docc_image_url,p.docc_themes,
    coalesce(nullif(btrim(p.project_manager),''),pm.full_name),
    lf.cumulative_expenditure,
    CASE WHEN coalesce(nullif(p.budget_vuv,0),lf.approved_budget,0)>0
              AND lf.cumulative_expenditure IS NOT NULL
         THEN round((lf.cumulative_expenditure/coalesce(nullif(p.budget_vuv,0),lf.approved_budget))*100,1)
         ELSE NULL END,p.currency,coalesce(p.approved_budget_confirmed,false) OR lf.approved_budget IS NOT NULL
  FROM merl.projects p
  LEFT JOIN merl.users pm ON pm.id=p.project_manager_id
  LEFT JOIN project_progress pp ON pp.project_id=p.id
  LEFT JOIN beneficiary_totals bt ON bt.project_id=p.id
  LEFT JOIN latest_period lp ON lp.project_id=p.id
  LEFT JOIN latest_financial lf ON lf.project_id=p.id
  WHERE coalesce(p.code::text,'') <> 'AUDIT-2026'
      AND lower(coalesce(p.status::text,'')) NOT IN ('completed','closed')
    AND NOT p.excluded_from_current_portfolio
      AND lower(p.status::text) <> 'cancelled';

  INSERT INTO public.public_portal_area_councils
  SELECT initcap(trim(pac.province_code)),trim(pac.area_council_name),count(distinct pac.project_id)::integer,
    array_agg(distinct pac.project_id),array_agg(distinct p.code::text) FILTER(WHERE p.code IS NOT NULL),
    array_agg(distinct p.name::text) FILTER(WHERE p.name IS NOT NULL)
  FROM merl.project_area_councils pac
  JOIN merl.projects p ON p.id=pac.project_id
    JOIN public.public_portal_projects pub ON pub.id=p.id
  WHERE pac.coverage_status<>'not_covered'
    AND nullif(trim(pac.area_council_name),'') IS NOT NULL
    AND nullif(trim(pac.province_code),'') IS NOT NULL
  GROUP BY initcap(trim(pac.province_code)),trim(pac.area_council_name);

  WITH approved_periods AS (
    SELECT project_id,period_label,period_end,approved_at
    FROM merl.reporting_periods WHERE submission_status='approved'
  ), latest_public AS (
    SELECT DISTINCT ON (ip.indicator_id)
      ip.project_id,ip.indicator_id,ip.cumulative_actual,ip.actual_this_period,
      ip.achievement_pct,ap.period_label,ap.period_end,ap.approved_at
    FROM merl.indicator_progress ip
    JOIN approved_periods ap ON ap.project_id=ip.project_id AND ap.period_label=ip.reporting_period
    WHERE ip.review_status IN ('approved','published','locked')
    ORDER BY ip.indicator_id,ap.period_end DESC NULLS LAST,ip.updated_at DESC NULLS LAST
  )
  INSERT INTO public.public_portal_kpis(
    project_id,indicator_id,indicator_code,label,unit,actual_value,target_value,
    progress_pct,period_label,display_order,published_at
  )
  SELECT cfg.project_id,pi.id,pi.code::text,cfg.short_label,pi.unit::text,
    coalesce(lp.cumulative_actual,lp.actual_this_period),pi.target_value,
    CASE WHEN lp.achievement_pct IS NOT NULL THEN least(100::numeric,greatest(0::numeric,lp.achievement_pct)) END,lp.period_label,cfg.display_order,lp.approved_at
  FROM merl.dashboard_kpi_config cfg
  JOIN merl.project_indicators pi ON pi.id=cfg.indicator_id AND pi.project_id=cfg.project_id
  JOIN merl.projects p ON p.id=cfg.project_id
    JOIN public.public_portal_projects pub ON pub.id=p.id
  JOIN latest_public lp ON lp.indicator_id=pi.id AND lp.project_id=pi.project_id
  WHERE cfg.active=true AND cfg.is_public=true
    AND cfg.dashboard_scope IN ('project','public')
  ORDER BY cfg.project_id,cfg.display_order;

  INSERT INTO public.public_portal_summary(
    singleton,project_count,overall_progress_pct,published_beneficiaries,
    total_investment_vuv,projects_with_published_results,updated_at,
    total_utilised_vuv,financial_utilisation_pct
  )
  SELECT true,count(*)::integer,
    NULL::numeric,
    sum(published_beneficiaries)::bigint,
    coalesce(sum(budget_vuv * rate),0),
    count(*) FILTER(WHERE progress_pct IS NOT NULL)::integer,now(),
    sum(cumulative_expenditure_vuv * rate),
    CASE WHEN coalesce(sum(budget_vuv * rate),0)>0 AND sum(cumulative_expenditure_vuv * rate) IS NOT NULL
         THEN round((sum(cumulative_expenditure_vuv * rate)/sum(budget_vuv * rate))*100,1)
         ELSE NULL END
  FROM public.public_portal_projects
  LEFT JOIN (VALUES ('VUV',1::numeric),('USD',117.58::numeric),('AUD',82.46::numeric),
    ('NZD',66.56::numeric),('EUR',133.80::numeric),('GBP',155.38::numeric),('JPY',0.7404::numeric))
    rates(code,rate) ON rates.code=upper(coalesce(nullif(trim(currency),''),'VUV'));
  -- Project summaries count all framework targets, independently of featured KPI visibility.
  PERFORM merl.refresh_public_target_summary();
END;
$function$;

-- Backfill only aggregate progress fields. Preserve the existing public profiles,
-- featured KPI snapshots, publication settings and all source approvals.
SELECT merl.refresh_public_target_summary();
