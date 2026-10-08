-- Preserve missing achievements and count inline submitted narratives.
-- Summary currency conversion uses the same dated RBV rates as the portal.
CREATE OR REPLACE VIEW public.v_project_period_progress WITH (security_invoker=true) AS
 SELECT rp.project_id,
    rp.id AS reporting_period_id,
    rp.period_label,
    rp.period_type,
    rp.period_start,
    rp.period_end,
    rp.submission_status,
    round(avg(CASE WHEN ip.achievement_pct IS NOT NULL THEN least(100,greatest(0,ip.achievement_pct)) END) FILTER (WHERE (ip.achievement_pct IS NOT NULL)), 2) AS progress_pct,
    count(ip.id) AS result_rows,
    count(ip.id) FILTER (WHERE ((ip.performance_status)::text = 'on_track'::text)) AS on_track_results,
    count(ip.id) FILTER (WHERE ((ip.performance_status)::text = 'attention_required'::text)) AS attention_results,
    count(ip.id) FILTER (WHERE ((ip.performance_status)::text = 'at_risk'::text)) AS at_risk_results,
    count(ip.id) FILTER (WHERE (ip.schedule_status = 'delayed'::text)) AS delayed_results,
    count(ip.id) FILTER (WHERE (ip.review_status = ANY (ARRAY['approved'::text, 'published'::text, 'locked'::text]))) AS approved_results,
    count(DISTINCT ip.id) FILTER (WHERE (COALESCE(nullif(ip.narrative,''), nullif(ip.key_achievements,''), rn.progress_summary, rn.key_achievements, rn.challenges, rn.corrective_actions, rn.next_period_priorities) IS NOT NULL)) AS narrative_rows
   FROM ((merl.reporting_periods rp
     LEFT JOIN (SELECT DISTINCT ON (project_id,indicator_id,reporting_period) * FROM merl.indicator_progress WHERE review_status IN ('submitted','under_review','resubmitted','approved','published','locked') ORDER BY project_id,indicator_id,reporting_period,updated_at DESC,created_at DESC,id DESC) ip ON (((ip.project_id = rp.project_id) AND (ip.reporting_period = rp.period_label))))
     LEFT JOIN merl.result_narratives rn ON ((rn.indicator_progress_id = ip.id)))
  GROUP BY rp.project_id, rp.id, rp.period_label, rp.period_type, rp.period_start, rp.period_end, rp.submission_status;

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
    SELECT project_id,round(avg(achievement_pct)::numeric,1) progress_pct,count(achievement_pct)::integer indicator_count
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
    docc_themes,project_manager,cumulative_expenditure_vuv,utilisation_pct,currency
  )
  SELECT p.id,p.code::text,p.name::text,p.acronym::text,p.description,p.lead_agency,
    coalesce((
      SELECT o.name FROM merl.project_organizations po
      JOIN merl.organizations o ON o.id=po.organization_id
      WHERE po.project_id=p.id AND po.role='donor'
      ORDER BY po.is_primary DESC,o.name LIMIT 1
    ),p.donor::text) AS donor,
    p.project_type::text,p.primary_climate_theme::text,p.expected_primary_outcome::text,
    CASE WHEN lower(coalesce(p.status::text,''))='completed' THEN 'completed'
         WHEN p.start_date>current_date OR lower(coalesce(p.status::text,'')) IN ('not_started','pipeline') THEN 'upcoming'
         ELSE 'ongoing' END,
    p.start_date,p.end_date,
    coalesce(nullif(p.budget_vuv,0),lf.approved_budget,p.budget_vuv),
    p.provinces,p.coverage_type::text,pp.progress_pct,
    coalesce(pp.indicator_count,0),bt.total_direct,lp.period_label,lp.approved_at,
    p.docc_url,p.docc_image_url,p.docc_themes,
    coalesce(nullif(btrim(p.project_manager),''),pm.full_name),
    lf.cumulative_expenditure,
    CASE WHEN coalesce(nullif(p.budget_vuv,0),lf.approved_budget,0)>0
              AND lf.cumulative_expenditure IS NOT NULL
         THEN round((lf.cumulative_expenditure/coalesce(nullif(p.budget_vuv,0),lf.approved_budget))*100,1)
         ELSE NULL END,p.currency
  FROM merl.projects p
  LEFT JOIN merl.users pm ON pm.id=p.project_manager_id
  LEFT JOIN project_progress pp ON pp.project_id=p.id
  LEFT JOIN beneficiary_totals bt ON bt.project_id=p.id
  LEFT JOIN latest_period lp ON lp.project_id=p.id
  LEFT JOIN latest_financial lf ON lf.project_id=p.id
  WHERE coalesce(p.code::text,'') <> 'AUDIT-2026';

  INSERT INTO public.public_portal_area_councils
  SELECT initcap(trim(pac.province_code)),trim(pac.area_council_name),count(distinct pac.project_id)::integer,
    array_agg(distinct pac.project_id),array_agg(distinct p.code::text) FILTER(WHERE p.code IS NOT NULL),
    array_agg(distinct p.name::text) FILTER(WHERE p.name IS NOT NULL)
  FROM merl.project_area_councils pac
  JOIN merl.projects p ON p.id=pac.project_id AND coalesce(p.code::text,'') <> 'AUDIT-2026'
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
  JOIN merl.projects p ON p.id=cfg.project_id AND coalesce(p.code::text,'') <> 'AUDIT-2026'
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
    round(avg(progress_pct) FILTER(WHERE progress_pct IS NOT NULL)::numeric,1),
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
END $function$
;
