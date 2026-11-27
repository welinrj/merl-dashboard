CREATE OR REPLACE FUNCTION merl.publish_implementation_locations()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 delete from merl.published_implementation_locations where assignment_id is not null;
 insert into merl.published_implementation_locations(assignment_id,project_id,area_council_id,item_id,kind,label,category_key)
 select a.id,a.project_id,a.area_council_id,a.indicator_id,'indicator',d.indicator_name,d.category_key
 from merl.implementation_location_assignments a join public.public_portal_indicator_details d on d.indicator_id=a.indicator_id and d.project_id=a.project_id
 join public.public_portal_projects p on p.id=a.project_id
 where d.category_key is not null and nullif(trim(d.indicator_name),'') is not null
 union all
 select a.id,a.project_id,a.area_council_id,a.activity_id,'activity',act.name,a.category_key
 from merl.implementation_location_assignments a join merl.project_activities act on act.id=a.activity_id and act.project_id=a.project_id join public.public_portal_projects p on p.id=a.project_id
 where act.status<>'cancelled' and nullif(trim(act.name),'') is not null and p.code not in ('CBIT-VU','BOLD-VU');
 perform merl.refresh_public_implementation_locations();
end;$function$
;

CREATE OR REPLACE FUNCTION merl.refresh_public_implementation_locations()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
 update public.public_portal_area_councils a set implementation_details=coalesce((
 select jsonb_agg(jsonb_build_object('id',pl.assignment_id,'project_id',pl.project_id,'item_id',pl.item_id,'kind',pl.kind,'label',pl.label,'category_key',pl.category_key) order by pl.label,pl.assignment_id)
 from merl.published_implementation_locations pl join merl.ref_area_councils r on r.id=pl.area_council_id
 where pl.project_id=any(a.project_ids) and lower(trim(r.name))=lower(trim(a.area_council)) and lower(trim(r.province_code))=lower(trim(a.province))
 and exists(select 1 from merl.project_area_councils pac where pac.project_id=pl.project_id and lower(trim(pac.area_council_name))=lower(trim(r.name)) and lower(trim(pac.province_code))=lower(trim(r.province_code)) and pac.coverage_status<>'not_covered')
 and ((pl.kind='indicator' and exists(select 1 from public.public_portal_indicator_details d where d.indicator_id=pl.item_id and d.project_id=pl.project_id)) or (pl.kind='activity' and exists(select 1 from merl.project_activities act where act.id=pl.item_id and act.project_id=pl.project_id and act.status<>'cancelled')))
 ),'[]'::jsonb) WHERE a.province IS NOT NULL AND a.area_council IS NOT NULL;
$function$
;

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

  INSERT INTO public.public_portal_area_councils(province,area_council,project_count,project_ids,project_codes,project_names)
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

  -- Only publish explicitly council-tagged records; never copy national totals.
  UPDATE public.public_portal_area_councils area
  SET local_details = coalesce((
    SELECT jsonb_agg(detail ORDER BY detail->>'label',detail->>'id')
    FROM (
      SELECT jsonb_build_object('id',a.id,'project_id',a.project_id,'label',a.name,
        'kind','activity') AS detail
      FROM merl.project_activities a
      JOIN merl.projects p ON p.id=a.project_id
      WHERE a.project_id=ANY(area.project_ids)
        AND lower(trim(a.area_council))=lower(trim(area.area_council))
        AND (nullif(trim(a.province),'') IS NULL OR lower(trim(a.province))=lower(trim(area.province)))
        AND nullif(trim(a.name),'') IS NOT NULL
        AND p.registration_status='approved'
        AND coalesce(p.code,'') NOT IN ('CBIT-VU','BOLD-VU')
        AND a.status NOT IN ('draft','returned','pending_review')
      UNION ALL
      SELECT jsonb_build_object('id',latest.id,'project_id',latest.project_id,
        'label',latest.name,'kind','indicator','value',latest.actual,'unit',latest.unit,'period',latest.period_label)
      FROM (
        SELECT DISTINCT ON (ip.project_id,ip.indicator_id)
          ip.id,ip.project_id,pi.name,pi.unit,coalesce(ip.cumulative_actual,ip.actual_this_period) AS actual,ap.period_label
        FROM merl.indicator_progress ip
        JOIN merl.project_indicators pi ON pi.id=ip.indicator_id AND pi.project_id=ip.project_id
        JOIN merl.reporting_periods ap ON ap.project_id=ip.project_id AND ap.period_label=ip.reporting_period
        WHERE ip.project_id=ANY(area.project_ids)
          AND lower(trim(ip.area_council_name))=lower(trim(area.area_council))
          AND ap.submission_status='approved'
          AND ip.review_status IN ('approved','published','locked')
          AND (pi.is_public=true OR EXISTS (
            SELECT 1 FROM merl.dashboard_kpi_config cfg
            WHERE cfg.project_id=pi.project_id AND cfg.indicator_id=pi.id
              AND cfg.active=true AND cfg.is_public=true))
        ORDER BY ip.project_id,ip.indicator_id,ap.period_end DESC NULLS LAST,ip.updated_at DESC NULLS LAST,ip.id
      ) latest
    ) records
  ),'[]'::jsonb) WHERE area.province IS NOT NULL AND area.area_council IS NOT NULL;


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
  PERFORM merl.refresh_public_implementation_locations();
END;
$function$
;