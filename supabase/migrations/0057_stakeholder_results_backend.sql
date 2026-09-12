-- Stakeholder-approved MERL backend consolidation.
-- Flexible results hierarchy, Area Council coverage, separate risk/delay status,
-- narrative support and report-period KPI sources.

BEGIN;

ALTER TABLE merl.project_activities
  ADD COLUMN IF NOT EXISTS framework_node_id uuid REFERENCES merl.framework_nodes(id) ON DELETE SET NULL;

UPDATE merl.project_activities pa
SET framework_node_id = fn.id
FROM merl.framework_nodes fn
WHERE pa.framework_node_id IS NULL
  AND (
    (pa.output_id IS NOT NULL AND fn.source_table='outputs' AND fn.source_id=pa.output_id)
    OR (pa.output_id IS NULL AND pa.outcome_id IS NOT NULL AND fn.source_table='outcomes' AND fn.source_id=pa.outcome_id)
  );

CREATE TABLE IF NOT EXISTS merl.result_review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_progress_id uuid NOT NULL REFERENCES merl.indicator_progress(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL CHECK (to_status IN ('draft','submitted','under_review','returned','resubmitted','approved','published','locked')),
  comment text,
  acted_by uuid REFERENCES merl.users(id) ON DELETE SET NULL,
  acted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_result_review_history_progress
  ON merl.result_review_history(indicator_progress_id,acted_at DESC);
ALTER TABLE merl.result_review_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS result_review_history_read ON merl.result_review_history;
CREATE POLICY result_review_history_read ON merl.result_review_history
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM merl.indicator_progress ip
    WHERE ip.id=indicator_progress_id AND merl.can_access_project(ip.project_id)
  )
);

CREATE OR REPLACE FUNCTION merl.calculate_indicator_progress(
  p_baseline numeric,
  p_actual numeric,
  p_target numeric,
  p_direction text,
  p_manual numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE v numeric;
BEGIN
  IF p_manual IS NOT NULL THEN RETURN greatest(0,least(100,p_manual)); END IF;
  IF p_actual IS NULL OR p_target IS NULL THEN RETURN NULL; END IF;

  IF p_direction='decrease' THEN
    IF p_baseline IS NULL OR p_baseline=p_target THEN RETURN NULL; END IF;
    v := ((p_baseline-p_actual)/(p_baseline-p_target))*100;
  ELSIF p_direction IN ('milestone','qualitative') THEN
    RETURN NULL;
  ELSE
    IF p_baseline IS NULL THEN p_baseline := 0; END IF;
    IF p_target=p_baseline THEN RETURN NULL; END IF;
    v := ((p_actual-p_baseline)/(p_target-p_baseline))*100;
  END IF;

  RETURN round(greatest(0,least(100,v)),1);
END $$;

DROP VIEW IF EXISTS public.v_project_indicators;
DROP VIEW IF EXISTS public.v_project_activities;
DROP VIEW IF EXISTS public.v_objectives;
DROP VIEW IF EXISTS public.v_outcomes;
DROP VIEW IF EXISTS public.v_outputs;

ALTER TABLE merl.project_indicators
  DROP CONSTRAINT IF EXISTS project_indicators_objective_id_fkey,
  DROP CONSTRAINT IF EXISTS project_indicators_outcome_id_fkey,
  DROP CONSTRAINT IF EXISTS project_indicators_output_id_fkey;
ALTER TABLE merl.project_indicators
  DROP COLUMN IF EXISTS objective_id,
  DROP COLUMN IF EXISTS outcome_id,
  DROP COLUMN IF EXISTS output_id;

ALTER TABLE merl.project_activities
  DROP CONSTRAINT IF EXISTS project_activities_outcome_id_fkey,
  DROP CONSTRAINT IF EXISTS project_activities_output_id_fkey;
ALTER TABLE merl.project_activities
  DROP COLUMN IF EXISTS outcome_id,
  DROP COLUMN IF EXISTS output_id;

UPDATE merl.framework_nodes
SET source_table=NULL,source_id=NULL
WHERE source_table IN ('objectives','outcomes','outputs');

DROP TABLE IF EXISTS merl.outputs;
DROP TABLE IF EXISTS merl.outcomes;
DROP TABLE IF EXISTS merl.objectives;

CREATE VIEW public.v_project_indicators WITH (security_invoker=true) AS
SELECT
  i.id,i.project_id,i.code,i.name,i.unit,i.baseline_value,i.target_value,
  i.means_of_verification,i.frequency,
  'framework_node'::varchar AS linked_level,
  i.framework_node_id AS linked_id,
  fn.node_code AS linked_code,
  i.created_at,i.updated_at,i.indicator_level,i.definition,i.baseline_year,i.target_date,
  i.data_source,i.collection_method,i.responsible_officer_id,i.disaggregation,
  i.verification_method,i.assumptions,
  NULL::uuid AS objective_id,NULL::uuid AS outcome_id,NULL::uuid AS output_id,
  i.is_qualitative,i.higher_is_better,i.i18n,i.responsible_officer,
  i.framework_node_id,i.direction,i.aggregation_method,i.progress_method,
  i.official_reporting_frequency,i.is_featured_kpi,i.kpi_label,i.kpi_order,i.is_public
FROM merl.project_indicators i
LEFT JOIN merl.framework_nodes fn ON fn.id=i.framework_node_id;

CREATE VIEW public.v_project_activities WITH (security_invoker=true) AS
SELECT
  a.id,a.project_id,NULL::uuid AS output_id,a.code,a.name,a.description,
  fn.node_code AS output_code,a.responsible_officer_id,u.full_name AS responsible_officer_name,
  a.status,a.created_at,a.updated_at,NULL::uuid AS outcome_id,a.responsible_org,a.province,a.island,
  a.area_council,a.community,a.planned_start_date,a.planned_end_date,a.actual_start_date,a.actual_end_date,
  a.planned_budget,a.actual_expenditure,a.physical_progress_pct,a.key_achievement,a.issue_delay,
  a.next_action,a.next_action_due,a.i18n,a.responsible_officer,a.framework_node_id
FROM merl.project_activities a
LEFT JOIN merl.framework_nodes fn ON fn.id=a.framework_node_id
LEFT JOIN merl.users u ON u.id=a.responsible_officer_id;

GRANT SELECT ON public.v_project_indicators,public.v_project_activities TO authenticated;

CREATE OR REPLACE VIEW public.v_indicator_result_latest WITH (security_invoker=true) AS
WITH targets AS (
  SELECT it.indicator_id,
    max(it.numeric_value) FILTER (WHERE it.target_type='baseline') baseline_value,
    max(it.numeric_value) FILTER (WHERE it.target_type='final') final_target
  FROM merl.indicator_targets it
  GROUP BY it.indicator_id
), latest AS (
  SELECT DISTINCT ON (ip.indicator_id) ip.*
  FROM merl.indicator_progress ip
  WHERE ip.review_status IN ('approved','published','locked')
  ORDER BY ip.indicator_id,coalesce(ip.date_reported,ip.created_at::date) DESC,ip.created_at DESC
)
SELECT
  pi.id indicator_id,pi.project_id,pi.framework_node_id,pi.code indicator_code,
  pi.name indicator_name,pi.unit,pi.direction,pi.aggregation_method,pi.progress_method,
  pi.official_reporting_frequency,t.baseline_value,t.final_target,l.id result_id,l.reporting_period,
  coalesce(l.cumulative_actual,l.actual_this_period) actual_value,
  coalesce(l.achievement_pct,merl.calculate_indicator_progress(
    t.baseline_value,coalesce(l.cumulative_actual,l.actual_this_period),t.final_target,pi.direction,NULL
  )) progress_pct,
  l.performance_status,l.schedule_status,l.review_status,l.area_council_name,l.approved_at,l.published_at
FROM merl.project_indicators pi
LEFT JOIN targets t ON t.indicator_id=pi.id
LEFT JOIN latest l ON l.indicator_id=pi.id;
GRANT SELECT ON public.v_indicator_result_latest TO authenticated;

CREATE OR REPLACE VIEW public.v_portfolio_kpis WITH (security_invoker=true) AS
WITH ps AS (
  SELECT * FROM public.v_project_portfolio_status WHERE registration_status <> 'rejected'
), coverage AS (
  SELECT
    count(DISTINCT area_council_name) FILTER (WHERE coverage_status<>'not_covered') area_councils_covered,
    count(DISTINCT area_council_name) FILTER (WHERE feasibility_status='confirmed') feasibility_confirmed
  FROM merl.project_area_councils
), project_counts AS (
  SELECT
    count(*) FILTER (WHERE coalesce(status,'') NOT IN ('completed','cancelled')) active_projects,
    avg(progress_pct) FILTER (WHERE progress_pct IS NOT NULL) average_progress,
    avg(reporting_completion_pct) FILTER (WHERE reporting_completion_pct IS NOT NULL) reporting_completion,
    count(*) FILTER (WHERE performance_status='at_risk') at_risk_projects,
    count(*) FILTER (WHERE schedule_status='delayed') delayed_projects
  FROM ps
)
SELECT
  pc.active_projects,
  round(pc.average_progress,1) overall_progress_pct,
  round(pc.reporting_completion,1) reporting_completion_pct,
  coalesce(c.area_councils_covered,0) area_councils_covered,
  coalesce(c.feasibility_confirmed,0) feasibility_confirmed,
  pc.at_risk_projects,
  pc.delayed_projects
FROM project_counts pc CROSS JOIN coverage c;
GRANT SELECT ON public.v_portfolio_kpis TO authenticated;

CREATE OR REPLACE VIEW public.v_project_kpis WITH (security_invoker=true) AS
SELECT
  s.project_id,s.code,s.name,s.progress_pct project_progress_pct,s.reporting_completion_pct,
  s.area_councils_covered,s.feasibility_confirmed,s.at_risk_results,s.delayed_results,
  s.performance_status,s.schedule_status
FROM public.v_project_portfolio_status s;
GRANT SELECT ON public.v_project_kpis TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_framework_node(
  p_id uuid,
  p_project_id uuid,
  p_parent_node_id uuid,
  p_node_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_status text DEFAULT 'draft',
  p_sort_order integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public'
AS $$
DECLARE v_id uuid; v_project uuid;
BEGIN
  IF p_id IS NULL THEN v_project := p_project_id;
  ELSE
    SELECT project_id INTO v_project FROM merl.framework_nodes WHERE id=p_id;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Framework node not found'; END IF;
  END IF;
  PERFORM merl.require_results_framework_editor(v_project);
  IF p_title IS NULL OR btrim(p_title)='' THEN RAISE EXCEPTION 'Title is required'; END IF;
  IF p_node_type NOT IN ('project_objective','impact','paradigm_shift','gcf_result_area','component','outcome','output','sub_output','co_benefit')
    THEN RAISE EXCEPTION 'Unsupported framework node type'; END IF;
  IF p_parent_node_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM merl.framework_nodes WHERE id=p_parent_node_id AND project_id=v_project
  ) THEN RAISE EXCEPTION 'Parent node must belong to the same project'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO merl.framework_nodes(project_id,parent_node_id,node_code,node_type,title,description,status,sort_order)
    VALUES (
      v_project,p_parent_node_id,
      merl.next_code_w(v_project,'framework_node',upper(left(p_node_type,3)),3),
      p_node_type,btrim(p_title),p_description,coalesce(p_status,'draft'),coalesce(p_sort_order,0)
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE merl.framework_nodes
    SET parent_node_id=p_parent_node_id,node_type=p_node_type,title=btrim(p_title),
        description=p_description,status=coalesce(p_status,status),sort_order=coalesce(p_sort_order,sort_order),
        updated_at=now()
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_framework_node(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public'
AS $$
DECLARE v_project uuid;
BEGIN
  SELECT project_id INTO v_project FROM merl.framework_nodes WHERE id=p_id;
  IF v_project IS NULL THEN RAISE EXCEPTION 'Framework node not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project);
  IF EXISTS (SELECT 1 FROM merl.framework_nodes WHERE parent_node_id=p_id) THEN
    RAISE EXCEPTION 'Framework node has child results';
  END IF;
  IF EXISTS (SELECT 1 FROM merl.project_indicators WHERE framework_node_id=p_id) THEN
    RAISE EXCEPTION 'Framework node has linked indicators';
  END IF;
  IF EXISTS (SELECT 1 FROM merl.project_activities WHERE framework_node_id=p_id) THEN
    RAISE EXCEPTION 'Framework node has linked activities';
  END IF;
  DELETE FROM merl.framework_nodes WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_project_indicator_v2(
  p_id uuid,
  p_project_id uuid,
  p_framework_node_id uuid,
  p_name text,
  p_unit text DEFAULT NULL,
  p_baseline_value numeric DEFAULT NULL,
  p_final_target numeric DEFAULT NULL,
  p_frequency text DEFAULT NULL,
  p_direction text DEFAULT 'increase',
  p_aggregation_method text DEFAULT 'latest',
  p_progress_method text DEFAULT 'auto',
  p_means_of_verification text DEFAULT NULL,
  p_data_source text DEFAULT NULL,
  p_collection_method text DEFAULT NULL,
  p_disaggregation text DEFAULT NULL,
  p_assumptions text DEFAULT NULL,
  p_is_qualitative boolean DEFAULT false,
  p_higher_is_better boolean DEFAULT true,
  p_responsible_officer text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public'
AS $$
DECLARE v_id uuid; v_project uuid;
BEGIN
  IF p_id IS NULL THEN v_project := p_project_id;
  ELSE
    SELECT project_id INTO v_project FROM merl.project_indicators WHERE id=p_id;
    IF v_project IS NULL THEN RAISE EXCEPTION 'Indicator not found'; END IF;
  END IF;
  PERFORM merl.require_results_framework_editor(v_project);
  IF p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'Indicator name is required'; END IF;
  IF p_framework_node_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM merl.framework_nodes WHERE id=p_framework_node_id AND project_id=v_project
  ) THEN RAISE EXCEPTION 'Framework node must belong to the same project'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO merl.project_indicators(
      project_id,code,name,unit,baseline_value,target_value,means_of_verification,frequency,
      linked_level,linked_id,framework_node_id,is_qualitative,higher_is_better,direction,
      aggregation_method,progress_method,official_reporting_frequency,data_source,collection_method,
      disaggregation,assumptions,responsible_officer
    )
    VALUES (
      v_project,merl.next_code_w(v_project,'indicator','IND',3),btrim(p_name),p_unit,
      p_baseline_value,p_final_target,p_means_of_verification,p_frequency,'framework_node',
      p_framework_node_id,p_framework_node_id,coalesce(p_is_qualitative,false),
      coalesce(p_higher_is_better,true),coalesce(p_direction,'increase'),
      coalesce(p_aggregation_method,'latest'),coalesce(p_progress_method,'auto'),p_frequency,
      p_data_source,p_collection_method,p_disaggregation,p_assumptions,nullif(btrim(p_responsible_officer),'')
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE merl.project_indicators SET
      framework_node_id=p_framework_node_id,linked_level='framework_node',linked_id=p_framework_node_id,
      name=btrim(p_name),unit=p_unit,baseline_value=p_baseline_value,target_value=p_final_target,
      means_of_verification=p_means_of_verification,frequency=p_frequency,
      official_reporting_frequency=p_frequency,direction=coalesce(p_direction,direction),
      aggregation_method=coalesce(p_aggregation_method,aggregation_method),
      progress_method=coalesce(p_progress_method,progress_method),
      is_qualitative=coalesce(p_is_qualitative,is_qualitative),
      higher_is_better=coalesce(p_higher_is_better,higher_is_better),
      data_source=p_data_source,collection_method=p_collection_method,disaggregation=p_disaggregation,
      assumptions=p_assumptions,responsible_officer=nullif(btrim(p_responsible_officer),''),
      updated_at=now()
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;

  DELETE FROM merl.indicator_targets
  WHERE indicator_id=v_id AND target_type IN ('baseline','final') AND period_label IN ('Baseline','Final');
  IF p_baseline_value IS NOT NULL THEN
    INSERT INTO merl.indicator_targets(indicator_id,target_type,period_label,numeric_value)
    VALUES(v_id,'baseline','Baseline',p_baseline_value);
  END IF;
  IF p_final_target IS NOT NULL THEN
    INSERT INTO merl.indicator_targets(indicator_id,target_type,period_label,numeric_value)
    VALUES(v_id,'final','Final',p_final_target);
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE VIEW public.v_indicator_narrative_latest WITH (security_invoker=true) AS
SELECT DISTINCT ON (ip.indicator_id)
  ip.project_id,ip.indicator_id,rn.id narrative_id,rn.reporting_period,
  rn.progress_summary,rn.key_achievements,rn.variance_explanation,rn.challenges,
  rn.corrective_actions,rn.next_period_priorities,rn.public_summary,rn.review_status,rn.updated_at
FROM merl.result_narratives rn
JOIN merl.indicator_progress ip ON ip.id=rn.indicator_progress_id
ORDER BY ip.indicator_id,rn.updated_at DESC,rn.created_at DESC;

GRANT EXECUTE ON FUNCTION public.upsert_framework_node(uuid,uuid,uuid,text,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_framework_node(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_project_indicator_v2(uuid,uuid,uuid,text,text,numeric,numeric,text,text,text,text,text,text,text,text,text,boolean,boolean,text) TO authenticated;
GRANT SELECT ON public.v_indicator_narrative_latest TO authenticated;

DROP FUNCTION IF EXISTS public.create_objective(uuid,text,text,text,text);
DROP FUNCTION IF EXISTS public.update_objective(uuid,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.delete_objective(uuid);
DROP FUNCTION IF EXISTS public.create_outcome(uuid,text,uuid);
DROP FUNCTION IF EXISTS public.update_outcome(uuid,text,uuid,text);
DROP FUNCTION IF EXISTS public.delete_outcome(uuid);
DROP FUNCTION IF EXISTS public.create_output(uuid,text,uuid);
DROP FUNCTION IF EXISTS public.update_output(uuid,text,uuid,text);
DROP FUNCTION IF EXISTS public.delete_output(uuid);
DROP FUNCTION IF EXISTS public.create_project_indicator(uuid,text,text,numeric,numeric,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.update_project_indicator(uuid,text,text,numeric,numeric,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.upsert_project_indicator(uuid,uuid,text,text,numeric,numeric,text,text,text,text,integer,date,text,text,uuid,text,text,text,uuid,uuid,uuid,boolean,boolean,text);

-- Public geographic output now comes only from project_area_councils.
CREATE OR REPLACE FUNCTION merl.refresh_public_portal()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public','pg_temp'
AS $$
BEGIN
  TRUNCATE TABLE public.public_portal_projects;
  TRUNCATE TABLE public.public_portal_area_councils;
  TRUNCATE TABLE public.public_portal_summary;

  WITH approved_periods AS (
    SELECT project_id,period_label,period_end,approved_at
    FROM merl.reporting_periods WHERE submission_status='approved'
  ), latest_indicator AS (
    SELECT DISTINCT ON (ip.indicator_id)
      ip.project_id,ip.indicator_id,
      least(100::numeric,greatest(0::numeric,ip.achievement_pct)) achievement_pct,
      ap.period_label,ap.period_end,ap.approved_at
    FROM merl.indicator_progress ip
    JOIN approved_periods ap ON ap.project_id=ip.project_id AND ap.period_label=ip.reporting_period
    WHERE ip.achievement_pct IS NOT NULL
    ORDER BY ip.indicator_id,ap.period_end DESC NULLS LAST,ip.updated_at DESC NULLS LAST
  ), project_progress AS (
    SELECT project_id,round(avg(achievement_pct)::numeric,1) progress_pct,count(*)::integer indicator_count
    FROM latest_indicator GROUP BY project_id
  ), beneficiary_totals AS (
    SELECT b.project_id,coalesce(sum(b.total_direct),0)::bigint total_direct
    FROM merl.beneficiaries b
    WHERE EXISTS (
      SELECT 1 FROM approved_periods ap
      WHERE ap.project_id=b.project_id AND ap.period_label=b.reporting_period
    )
    GROUP BY b.project_id
  ), latest_period AS (
    SELECT DISTINCT ON (project_id) project_id,period_label,approved_at
    FROM approved_periods
    ORDER BY project_id,period_end DESC NULLS LAST,approved_at DESC NULLS LAST
  )
  INSERT INTO public.public_portal_projects(
    id,code,name,acronym,description,lead_agency,donor,project_type,
    primary_climate_theme,expected_primary_outcome,lifecycle_status,
    start_date,end_date,budget_vuv,provinces,coverage_type,progress_pct,
    published_indicator_count,published_beneficiaries,last_published_period,
    published_at,docc_url,docc_image_url,docc_themes
  )
  SELECT
    p.id,p.code::text,p.name::text,p.acronym::text,p.description,p.lead_agency,p.donor::text,
    p.project_type::text,p.primary_climate_theme::text,p.expected_primary_outcome::text,
    CASE
      WHEN lower(coalesce(p.status::text,'')) IN ('completed','closed','cancelled') THEN 'completed'
      WHEN p.end_date IS NOT NULL AND p.end_date < current_date THEN 'completed'
      WHEN p.start_date IS NOT NULL AND p.start_date > current_date THEN 'upcoming'
      WHEN lower(coalesce(p.status::text,'')) IN ('not_started','pipeline','planning') THEN 'upcoming'
      ELSE 'ongoing'
    END,
    p.start_date,p.end_date,p.budget_vuv,p.provinces,p.coverage_type::text,pp.progress_pct,
    coalesce(pp.indicator_count,0),coalesce(bt.total_direct,0),lp.period_label,lp.approved_at,
    p.docc_url,p.docc_image_url,p.docc_themes
  FROM merl.projects p
  LEFT JOIN project_progress pp ON pp.project_id=p.id
  LEFT JOIN beneficiary_totals bt ON bt.project_id=p.id
  LEFT JOIN latest_period lp ON lp.project_id=p.id
  WHERE p.registration_status='approved';

  INSERT INTO public.public_portal_area_councils(
    province,area_council,project_count,project_ids,project_codes,project_names
  )
  SELECT
    initcap(lower(pac.province_code)),pac.area_council_name,
    count(DISTINCT pac.project_id)::integer,
    array_agg(DISTINCT pac.project_id),
    array_agg(DISTINCT p.code::text) FILTER (WHERE p.code IS NOT NULL),
    array_agg(DISTINCT p.name::text) FILTER (WHERE p.name IS NOT NULL)
  FROM merl.project_area_councils pac
  JOIN merl.projects p ON p.id=pac.project_id AND p.registration_status='approved'
  WHERE pac.coverage_status <> 'not_covered'
    AND nullif(btrim(pac.area_council_name),'') IS NOT NULL
    AND nullif(btrim(pac.province_code),'') IS NOT NULL
  GROUP BY initcap(lower(pac.province_code)),pac.area_council_name;

  INSERT INTO public.public_portal_summary(
    singleton,project_count,overall_progress_pct,published_beneficiaries,
    total_investment_vuv,projects_with_published_results,updated_at
  )
  SELECT
    true,count(*)::integer,
    round(avg(progress_pct) FILTER (WHERE progress_pct IS NOT NULL)::numeric,1),
    coalesce(sum(published_beneficiaries),0)::bigint,
    coalesce(sum(budget_vuv),0),
    count(*) FILTER (WHERE progress_pct IS NOT NULL)::integer,
    now()
  FROM public.public_portal_projects;
END $$;

DROP VIEW IF EXISTS public.v_project_locations;
DROP VIEW IF EXISTS public.v_ref_islands;
DROP VIEW IF EXISTS public.v_ref_villages;
DROP FUNCTION IF EXISTS public.add_village(text,text,text,text,numeric,numeric);
DROP FUNCTION IF EXISTS public.import_villages(jsonb);
DROP FUNCTION IF EXISTS public.upsert_project_location(uuid,uuid,text,text,text,text,numeric,numeric,text,text,integer,uuid);
DROP FUNCTION IF EXISTS public.delete_project_location(uuid);
DROP TABLE IF EXISTS merl.project_locations;
DROP TABLE IF EXISTS merl.ref_villages;
DROP TABLE IF EXISTS merl.ref_islands;

COMMIT;
