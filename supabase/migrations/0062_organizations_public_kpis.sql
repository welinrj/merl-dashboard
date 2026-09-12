-- MERL Dashboard – normalized donor/partner management and public KPI publication.
-- Public results remain snapshot-based. Only approved periods and explicitly
-- public KPI configurations are copied into anonymous-readable tables.

CREATE OR REPLACE FUNCTION public.upsert_project_organization(
  p_id uuid,
  p_project_id uuid,
  p_name text,
  p_short_name text DEFAULT NULL,
  p_organization_type text DEFAULT NULL,
  p_role text DEFAULT 'implementing_partner',
  p_is_primary boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE
  v_user merl.users;
  v_org_id uuid;
  v_link_id uuid;
BEGIN
  v_user := merl.require_editor();
  IF NOT merl.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_name),'') IS NULL THEN RAISE EXCEPTION 'Organization name is required'; END IF;
  IF p_role NOT IN ('donor','co_financier','accredited_entity','executing_entity','implementing_partner','technical_partner','government_partner') THEN
    RAISE EXCEPTION 'Invalid organization role';
  END IF;

  SELECT id INTO v_org_id FROM merl.organizations
  WHERE lower(name)=lower(btrim(p_name)) LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO merl.organizations(name,short_name,organization_type,active)
    VALUES (btrim(p_name),nullif(btrim(p_short_name),''),nullif(btrim(p_organization_type),''),true)
    RETURNING id INTO v_org_id;
  ELSE
    UPDATE merl.organizations SET
      short_name=coalesce(nullif(btrim(p_short_name),''),short_name),
      organization_type=coalesce(nullif(btrim(p_organization_type),''),organization_type),
      active=true,updated_at=now()
    WHERE id=v_org_id;
  END IF;

  IF p_is_primary THEN
    UPDATE merl.project_organizations
    SET is_primary=false
    WHERE project_id=p_project_id AND role=p_role;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
    VALUES (p_project_id,v_org_id,p_role,coalesce(p_is_primary,false))
    ON CONFLICT (project_id,organization_id,role) DO UPDATE SET is_primary=excluded.is_primary
    RETURNING id INTO v_link_id;
  ELSE
    UPDATE merl.project_organizations SET
      organization_id=v_org_id,role=p_role,is_primary=coalesce(p_is_primary,false)
    WHERE id=p_id AND project_id=p_project_id
    RETURNING id INTO v_link_id;
    IF v_link_id IS NULL THEN RAISE EXCEPTION 'Project organization link not found'; END IF;
  END IF;
  RETURN v_link_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_project_organization(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor();
  SELECT project_id INTO v_project_id FROM merl.project_organizations WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Project organization link not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  DELETE FROM merl.project_organizations WHERE id=p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_project_organization(uuid,uuid,text,text,text,text,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_project_organization(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_project_organization(uuid,uuid,text,text,text,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_organization(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.public_portal_kpis (
  project_id uuid NOT NULL,
  indicator_id uuid NOT NULL,
  indicator_code text,
  label text NOT NULL,
  unit text,
  actual_value numeric,
  target_value numeric,
  progress_pct numeric,
  period_label text,
  display_order integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  PRIMARY KEY(project_id,indicator_id)
);
ALTER TABLE public.public_portal_kpis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_portal_kpis_read ON public.public_portal_kpis;
CREATE POLICY public_portal_kpis_read ON public.public_portal_kpis FOR SELECT TO anon,authenticated USING (true);
REVOKE ALL ON public.public_portal_kpis FROM public,anon,authenticated;
GRANT SELECT ON public.public_portal_kpis TO anon,authenticated;
GRANT ALL ON public.public_portal_kpis TO service_role;

CREATE OR REPLACE FUNCTION merl.refresh_public_portal() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
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
      least(100::numeric,greatest(0::numeric,ip.achievement_pct)) achievement_pct,
      ap.period_label,ap.period_end,ap.approved_at
    FROM merl.indicator_progress ip
    JOIN approved_periods ap ON ap.project_id=ip.project_id AND ap.period_label=ip.reporting_period
    JOIN public_indicator_ids pub ON pub.id=ip.indicator_id
    WHERE ip.achievement_pct IS NOT NULL
    ORDER BY ip.indicator_id,ap.period_end DESC NULLS LAST,ip.updated_at DESC NULLS LAST
  ), project_progress AS (
    SELECT project_id,round(avg(achievement_pct)::numeric,1) progress_pct,count(*)::integer indicator_count
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
        THEN coalesce(sum(total_direct),0)
        ELSE coalesce(max(total_direct),0)
      END::bigint AS total_direct
    FROM approved_beneficiary_rows GROUP BY project_id
  ), latest_period AS (
    SELECT DISTINCT ON(project_id) project_id,period_label,approved_at
    FROM approved_periods
    ORDER BY project_id,period_end DESC NULLS LAST,approved_at DESC NULLS LAST
  )
  INSERT INTO public.public_portal_projects
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
    p.start_date,p.end_date,p.budget_vuv,p.provinces,p.coverage_type::text,pp.progress_pct,
    coalesce(pp.indicator_count,0),coalesce(bt.total_direct,0),lp.period_label,lp.approved_at,
    p.docc_url,p.docc_image_url,p.docc_themes
  FROM merl.projects p
  LEFT JOIN project_progress pp ON pp.project_id=p.id
  LEFT JOIN beneficiary_totals bt ON bt.project_id=p.id
  LEFT JOIN latest_period lp ON lp.project_id=p.id
  WHERE p.registration_status='approved';

  INSERT INTO public.public_portal_area_councils
  SELECT initcap(trim(pac.province_code)),trim(pac.area_council_name),count(distinct pac.project_id)::integer,
    array_agg(distinct pac.project_id),array_agg(distinct p.code::text) FILTER(WHERE p.code IS NOT NULL),
    array_agg(distinct p.name::text) FILTER(WHERE p.name IS NOT NULL)
  FROM merl.project_area_councils pac
  JOIN merl.projects p ON p.id=pac.project_id AND p.registration_status='approved'
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
    ORDER BY ip.indicator_id,ap.period_end DESC NULLS LAST,ip.updated_at DESC NULLS LAST
  )
  INSERT INTO public.public_portal_kpis(
    project_id,indicator_id,indicator_code,label,unit,actual_value,target_value,
    progress_pct,period_label,display_order,published_at
  )
  SELECT cfg.project_id,pi.id,pi.code::text,cfg.short_label,pi.unit::text,
    coalesce(lp.cumulative_actual,lp.actual_this_period),pi.target_value,
    least(100::numeric,greatest(0::numeric,lp.achievement_pct)),lp.period_label,cfg.display_order,lp.approved_at
  FROM merl.dashboard_kpi_config cfg
  JOIN merl.project_indicators pi ON pi.id=cfg.indicator_id AND pi.project_id=cfg.project_id
  JOIN merl.projects p ON p.id=cfg.project_id AND p.registration_status='approved'
  JOIN latest_public lp ON lp.indicator_id=pi.id AND lp.project_id=pi.project_id
  WHERE cfg.active=true AND cfg.is_public=true
    AND cfg.dashboard_scope IN ('project','public')
  ORDER BY cfg.project_id,cfg.display_order;

  INSERT INTO public.public_portal_summary
  SELECT true,count(*)::integer,
    round(avg(progress_pct) FILTER(WHERE progress_pct IS NOT NULL)::numeric,1),
    coalesce(sum(published_beneficiaries),0)::bigint,
    coalesce(sum(budget_vuv),0),
    count(*) FILTER(WHERE progress_pct IS NOT NULL)::integer,now()
  FROM public.public_portal_projects;
END $$;

REVOKE ALL ON FUNCTION merl.refresh_public_portal() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION merl.refresh_public_portal() TO service_role;

DO $$ DECLARE tbl text; BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'projects','indicator_progress','reporting_periods','beneficiaries',
    'project_area_councils','dashboard_kpi_config','project_indicators',
    'project_organizations','organizations'
  ] LOOP
    IF to_regclass(format('merl.%I',tbl)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS refresh_public_portal_snapshot ON merl.%I',tbl);
      EXECUTE format('CREATE TRIGGER refresh_public_portal_snapshot AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON merl.%I FOR EACH STATEMENT EXECUTE FUNCTION merl.trg_refresh_public_portal()',tbl);
    END IF;
  END LOOP;
END $$;

SELECT merl.refresh_public_portal();
