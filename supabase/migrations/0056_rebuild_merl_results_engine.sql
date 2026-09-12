-- MERL Dashboard – Migration 0056: consolidated results engine
-- Stakeholder-driven rebuild for VCAP2/VCCRP-compatible results frameworks.
-- Key changes: donor/partner separation, Area Council coverage/feasibility,
-- flexible framework nodes, normalized targets, narrative reporting, separate
-- at-risk vs delayed states, KPI configuration, and removal of obsolete empty
-- pre-project tables.

BEGIN;

CREATE TABLE IF NOT EXISTS merl.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  short_name text,
  organization_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_unique UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS merl.project_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES merl.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES merl.organizations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN (
    'donor','co_financier','accredited_entity','executing_entity',
    'implementing_partner','technical_partner','government_partner','lead_agency'
  )),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, organization_id, role)
);

INSERT INTO merl.organizations(name, organization_type)
SELECT DISTINCT btrim(donor), 'donor' FROM merl.projects
WHERE nullif(btrim(donor),'') IS NOT NULL ON CONFLICT (name) DO NOTHING;
INSERT INTO merl.organizations(name, organization_type)
SELECT DISTINCT btrim(executing_agency), 'executing_entity' FROM merl.projects
WHERE nullif(btrim(executing_agency),'') IS NOT NULL ON CONFLICT (name) DO NOTHING;
INSERT INTO merl.organizations(name, organization_type)
SELECT DISTINCT btrim(lead_agency), 'lead_agency' FROM merl.projects
WHERE nullif(btrim(lead_agency),'') IS NOT NULL ON CONFLICT (name) DO NOTHING;
INSERT INTO merl.organizations(name, organization_type)
SELECT DISTINCT btrim(x), 'implementing_partner'
FROM merl.projects p CROSS JOIN LATERAL unnest(coalesce(p.implementing_partners,'{}'::text[])) AS x
WHERE nullif(btrim(x),'') IS NOT NULL ON CONFLICT (name) DO NOTHING;

INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
SELECT p.id,o.id,'donor',true FROM merl.projects p JOIN merl.organizations o ON o.name=btrim(p.donor)
WHERE nullif(btrim(p.donor),'') IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
SELECT p.id,o.id,'executing_entity',true FROM merl.projects p JOIN merl.organizations o ON o.name=btrim(p.executing_agency)
WHERE nullif(btrim(p.executing_agency),'') IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
SELECT p.id,o.id,'lead_agency',true FROM merl.projects p JOIN merl.organizations o ON o.name=btrim(p.lead_agency)
WHERE nullif(btrim(p.lead_agency),'') IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO merl.project_organizations(project_id,organization_id,role,is_primary)
SELECT p.id,o.id,'implementing_partner',false
FROM merl.projects p
CROSS JOIN LATERAL unnest(coalesce(p.implementing_partners,'{}'::text[])) AS x
JOIN merl.organizations o ON o.name=btrim(x)
WHERE nullif(btrim(x),'') IS NOT NULL ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS merl.project_area_councils (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES merl.projects(id) ON DELETE CASCADE,
  area_council_id bigint REFERENCES merl.ref_area_councils(id) ON DELETE SET NULL,
  province_code text REFERENCES merl.ref_provinces(code) ON DELETE SET NULL,
  area_council_name text NOT NULL,
  coverage_status text NOT NULL DEFAULT 'active'
    CHECK (coverage_status IN ('planned','active','completed','not_covered')),
  feasibility_status text NOT NULL DEFAULT 'not_assessed'
    CHECK (feasibility_status IN ('confirmed','conditional','under_assessment','not_feasible','not_assessed')),
  feasibility_note text,
  verified_at timestamptz,
  verified_by uuid REFERENCES merl.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, area_council_name)
);

INSERT INTO merl.project_area_councils(project_id,area_council_id,province_code,area_council_name)
SELECT p.id,ac.id,ac.province_code,btrim(x)
FROM merl.projects p
CROSS JOIN LATERAL unnest(coalesce(p.area_councils,'{}'::text[])) AS x
LEFT JOIN merl.ref_area_councils ac ON lower(ac.name)=lower(btrim(x))
WHERE nullif(btrim(x),'') IS NOT NULL
ON CONFLICT (project_id,area_council_name) DO NOTHING;

INSERT INTO merl.project_area_councils(project_id,area_council_id,province_code,area_council_name)
SELECT DISTINCT l.project_id,ac.id,ac.province_code,btrim(l.area_council)
FROM merl.project_locations l
LEFT JOIN merl.ref_area_councils ac ON lower(ac.name)=lower(btrim(l.area_council))
WHERE nullif(btrim(l.area_council),'') IS NOT NULL
ON CONFLICT (project_id,area_council_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS merl.framework_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES merl.projects(id) ON DELETE CASCADE,
  parent_node_id uuid REFERENCES merl.framework_nodes(id) ON DELETE CASCADE,
  node_code text,
  node_type text NOT NULL CHECK (node_type IN (
    'project_objective','impact','paradigm_shift','gcf_result_area',
    'component','outcome','output','sub_output','co_benefit'
  )),
  title text NOT NULL,
  description text,
  source_table text,
  source_id uuid,
  status text NOT NULL DEFAULT 'draft',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_table, source_id)
);

INSERT INTO merl.framework_nodes(project_id,node_code,node_type,title,description,source_table,source_id,status)
SELECT o.project_id,o.code,'project_objective',o.statement,o.notes,'objectives',o.id,coalesce(o.status,'draft')
FROM merl.objectives o
ON CONFLICT (source_table,source_id) DO UPDATE
SET title=excluded.title,description=excluded.description,status=excluded.status,updated_at=now();

INSERT INTO merl.framework_nodes(project_id,parent_node_id,node_code,node_type,title,source_table,source_id,status)
SELECT oc.project_id,fn.id,oc.code,'outcome',oc.statement,'outcomes',oc.id,coalesce(oc.status,'draft')
FROM merl.outcomes oc
LEFT JOIN merl.framework_nodes fn ON fn.source_table='objectives' AND fn.source_id=oc.objective_id
ON CONFLICT (source_table,source_id) DO UPDATE
SET parent_node_id=excluded.parent_node_id,title=excluded.title,status=excluded.status,updated_at=now();

INSERT INTO merl.framework_nodes(project_id,parent_node_id,node_code,node_type,title,source_table,source_id,status)
SELECT op.project_id,fn.id,op.code,'output',op.statement,'outputs',op.id,coalesce(op.status,'draft')
FROM merl.outputs op
LEFT JOIN merl.framework_nodes fn ON fn.source_table='outcomes' AND fn.source_id=op.outcome_id
ON CONFLICT (source_table,source_id) DO UPDATE
SET parent_node_id=excluded.parent_node_id,title=excluded.title,status=excluded.status,updated_at=now();

ALTER TABLE merl.project_indicators
  ADD COLUMN IF NOT EXISTS framework_node_id uuid REFERENCES merl.framework_nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'increase'
    CHECK (direction IN ('increase','decrease','maintain','milestone','qualitative')),
  ADD COLUMN IF NOT EXISTS aggregation_method text NOT NULL DEFAULT 'latest'
    CHECK (aggregation_method IN ('sum','latest','average','minimum','maximum','weighted_average','percentage','milestone','qualitative')),
  ADD COLUMN IF NOT EXISTS progress_method text NOT NULL DEFAULT 'auto'
    CHECK (progress_method IN ('auto','increase','decrease','milestone','qualitative','manual')),
  ADD COLUMN IF NOT EXISTS official_reporting_frequency text,
  ADD COLUMN IF NOT EXISTS is_featured_kpi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kpi_label text,
  ADD COLUMN IF NOT EXISTS kpi_order integer,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

ALTER TABLE merl.project_indicators DISABLE TRIGGER USER;
UPDATE merl.project_indicators pi
SET framework_node_id=fn.id
FROM merl.framework_nodes fn
WHERE pi.framework_node_id IS NULL
AND (
 (pi.output_id IS NOT NULL AND fn.source_table='outputs' AND fn.source_id=pi.output_id)
 OR (pi.output_id IS NULL AND pi.outcome_id IS NOT NULL AND fn.source_table='outcomes' AND fn.source_id=pi.outcome_id)
 OR (pi.output_id IS NULL AND pi.outcome_id IS NULL AND pi.objective_id IS NOT NULL AND fn.source_table='objectives' AND fn.source_id=pi.objective_id)
);
UPDATE merl.project_indicators
SET direction=CASE WHEN higher_is_better=false THEN 'decrease' ELSE direction END,
    progress_method=CASE WHEN is_qualitative THEN 'qualitative'
                         WHEN higher_is_better=false THEN 'decrease'
                         ELSE progress_method END,
    official_reporting_frequency=coalesce(official_reporting_frequency,frequency);
ALTER TABLE merl.project_indicators ENABLE TRIGGER USER;

CREATE TABLE IF NOT EXISTS merl.indicator_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id uuid NOT NULL REFERENCES merl.project_indicators(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN (
    'baseline','mid_term','final','monthly','quarterly','six_monthly','annual','milestone','custom'
  )),
  period_label text NOT NULL DEFAULT '',
  period_start date,
  period_end date,
  numeric_value numeric,
  text_value text,
  ordinal_value numeric,
  female_value numeric,
  male_value numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(indicator_id,target_type,period_label)
);

INSERT INTO merl.indicator_targets(indicator_id,target_type,period_label,numeric_value,notes)
SELECT id,'baseline','Baseline',baseline_value,'Migrated from project_indicators.baseline_value'
FROM merl.project_indicators WHERE baseline_value IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO merl.indicator_targets(indicator_id,target_type,period_label,numeric_value,notes)
SELECT id,'final','Final',target_value,'Migrated from project_indicators.target_value'
FROM merl.project_indicators WHERE target_value IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE merl.indicator_progress
  ADD COLUMN IF NOT EXISTS schedule_status text NOT NULL DEFAULT 'on_schedule'
    CHECK (schedule_status IN ('on_schedule','delayed')),
  ADD COLUMN IF NOT EXISTS key_achievements text,
  ADD COLUMN IF NOT EXISTS next_period_priorities text,
  ADD COLUMN IF NOT EXISTS area_council_name text,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft','submitted','under_review','returned','resubmitted','approved','published','locked')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES merl.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE merl.indicator_progress DISABLE TRIGGER USER;
UPDATE merl.indicator_progress ip
SET review_status='approved',approved_at=coalesce(ip.approved_at,rp.approved_at)
FROM merl.reporting_periods rp
WHERE rp.project_id=ip.project_id
AND rp.period_label=ip.reporting_period
AND rp.submission_status='approved'
AND ip.review_status='draft';
ALTER TABLE merl.indicator_progress ENABLE TRIGGER USER;

CREATE TABLE IF NOT EXISTS merl.result_narratives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES merl.projects(id) ON DELETE CASCADE,
  indicator_progress_id uuid REFERENCES merl.indicator_progress(id) ON DELETE CASCADE,
  framework_node_id uuid REFERENCES merl.framework_nodes(id) ON DELETE CASCADE,
  reporting_period text NOT NULL,
  progress_summary text,
  key_achievements text,
  variance_explanation text,
  challenges text,
  corrective_actions text,
  next_period_priorities text,
  public_summary text,
  review_status text NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft','submitted','under_review','returned','resubmitted','approved','published','locked')),
  created_by uuid REFERENCES merl.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES merl.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(indicator_progress_id)
);

INSERT INTO merl.result_narratives(
  project_id,indicator_progress_id,reporting_period,progress_summary,key_achievements,
  variance_explanation,corrective_actions,next_period_priorities,review_status,
  created_by,approved_by,approved_at
)
SELECT ip.project_id,ip.id,ip.reporting_period,ip.narrative,ip.key_achievements,
       ip.variance_reason,ip.corrective_action,ip.next_period_priorities,ip.review_status,
       ip.created_by,ip.approved_by,ip.approved_at
FROM merl.indicator_progress ip
WHERE coalesce(ip.narrative,ip.key_achievements,ip.variance_reason,ip.corrective_action,ip.next_period_priorities) IS NOT NULL
ON CONFLICT (indicator_progress_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS merl.dashboard_kpi_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES merl.projects(id) ON DELETE CASCADE,
  indicator_id uuid REFERENCES merl.project_indicators(id) ON DELETE CASCADE,
  dashboard_scope text NOT NULL DEFAULT 'project' CHECK (dashboard_scope IN ('portfolio','project','public')),
  short_label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  show_target boolean NOT NULL DEFAULT true,
  show_progress boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  UNIQUE(project_id,indicator_id,dashboard_scope)
);

CREATE TABLE IF NOT EXISTS merl.portfolio_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  progress_weighting_method text NOT NULL DEFAULT 'equal_project'
    CHECK (progress_weighting_method IN ('equal_project','by_project_weight','by_budget','custom')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO merl.portfolio_settings(singleton) VALUES(true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW public.v_project_organizations WITH (security_invoker=true) AS
SELECT po.project_id,po.role,po.is_primary,o.id AS organization_id,o.name,o.short_name,o.organization_type
FROM merl.project_organizations po
JOIN merl.organizations o ON o.id=po.organization_id;

CREATE OR REPLACE VIEW public.v_project_area_councils WITH (security_invoker=true) AS
SELECT pac.id,pac.project_id,pac.area_council_id,pac.province_code,pac.area_council_name,
       pac.coverage_status,pac.feasibility_status,pac.feasibility_note,pac.verified_at
FROM merl.project_area_councils pac;

CREATE OR REPLACE VIEW public.v_framework_nodes WITH (security_invoker=true) AS
SELECT * FROM merl.framework_nodes;

CREATE OR REPLACE VIEW public.v_indicator_targets WITH (security_invoker=true) AS
SELECT * FROM merl.indicator_targets;

CREATE OR REPLACE VIEW public.v_result_narratives WITH (security_invoker=true) AS
SELECT * FROM merl.result_narratives;

CREATE OR REPLACE VIEW public.v_dashboard_kpi_config WITH (security_invoker=true) AS
SELECT * FROM merl.dashboard_kpi_config WHERE active=true;

CREATE OR REPLACE VIEW public.v_project_portfolio_status WITH (security_invoker=true) AS
WITH latest_progress AS (
  SELECT DISTINCT ON (ip.indicator_id)
    ip.project_id,ip.indicator_id,ip.achievement_pct,ip.performance_status,
    ip.schedule_status,ip.review_status,ip.reporting_period,ip.created_at
  FROM merl.indicator_progress ip
  ORDER BY ip.indicator_id,coalesce(ip.date_reported,ip.created_at::date) DESC,ip.created_at DESC
),
indicator_rollup AS (
  SELECT p.id AS project_id,
         avg(lp.achievement_pct) FILTER (WHERE lp.achievement_pct IS NOT NULL) AS progress_pct,
         count(*) FILTER (WHERE lp.performance_status='attention_required') AS attention_results,
         count(*) FILTER (WHERE lp.performance_status IN ('off_track','at_risk')) AS at_risk_results,
         count(*) FILTER (WHERE lp.schedule_status='delayed') AS delayed_results
  FROM merl.projects p
  LEFT JOIN merl.project_indicators pi ON pi.project_id=p.id
  LEFT JOIN latest_progress lp ON lp.indicator_id=pi.id
  GROUP BY p.id
),
reporting_rollup AS (
  SELECT project_id,count(*) AS expected_reports,
         count(*) FILTER (WHERE submission_status='approved') AS approved_reports
  FROM merl.reporting_periods
  GROUP BY project_id
),
coverage_rollup AS (
  SELECT project_id,
         count(*) FILTER (WHERE coverage_status<>'not_covered') AS area_councils_covered,
         count(*) FILTER (WHERE feasibility_status='confirmed') AS feasibility_confirmed
  FROM merl.project_area_councils
  GROUP BY project_id
),
activity_delay AS (
  SELECT project_id,count(*) FILTER (WHERE status='delayed') AS delayed_activities
  FROM merl.project_activities
  GROUP BY project_id
)
SELECT p.id AS project_id,p.code,p.name,p.status,p.registration_status,
       ir.progress_pct,
       CASE WHEN coalesce(ir.at_risk_results,0)>0 THEN 'at_risk'
            WHEN coalesce(ir.attention_results,0)>0 THEN 'attention'
            ELSE 'on_track' END AS performance_status,
       CASE WHEN coalesce(ir.delayed_results,0)+coalesce(ad.delayed_activities,0)>0
            THEN 'delayed' ELSE 'on_schedule' END AS schedule_status,
       coalesce(ir.attention_results,0) AS attention_results,
       coalesce(ir.at_risk_results,0) AS at_risk_results,
       coalesce(ir.delayed_results,0)+coalesce(ad.delayed_activities,0) AS delayed_results,
       CASE WHEN coalesce(rr.expected_reports,0)=0 THEN NULL
            ELSE round((rr.approved_reports::numeric/rr.expected_reports::numeric)*100,1) END AS reporting_completion_pct,
       coalesce(cr.area_councils_covered,0) AS area_councils_covered,
       coalesce(cr.feasibility_confirmed,0) AS feasibility_confirmed
FROM merl.projects p
LEFT JOIN indicator_rollup ir ON ir.project_id=p.id
LEFT JOIN reporting_rollup rr ON rr.project_id=p.id
LEFT JOIN coverage_rollup cr ON cr.project_id=p.id
LEFT JOIN activity_delay ad ON ad.project_id=p.id;

ALTER TABLE merl.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.project_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.project_area_councils ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.framework_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.indicator_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.result_narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.dashboard_kpi_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.portfolio_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_read ON merl.organizations;
CREATE POLICY organizations_read ON merl.organizations FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS project_organizations_read ON merl.project_organizations;
CREATE POLICY project_organizations_read ON merl.project_organizations FOR SELECT TO authenticated
USING (merl.can_access_project(project_id));

DROP POLICY IF EXISTS project_area_councils_read ON merl.project_area_councils;
CREATE POLICY project_area_councils_read ON merl.project_area_councils FOR SELECT TO authenticated
USING (merl.can_access_project(project_id));

DROP POLICY IF EXISTS framework_nodes_read ON merl.framework_nodes;
CREATE POLICY framework_nodes_read ON merl.framework_nodes FOR SELECT TO authenticated
USING (merl.can_access_project(project_id));

DROP POLICY IF EXISTS indicator_targets_read ON merl.indicator_targets;
CREATE POLICY indicator_targets_read ON merl.indicator_targets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM merl.project_indicators pi
  WHERE pi.id=indicator_id AND merl.can_access_project(pi.project_id)
));

DROP POLICY IF EXISTS result_narratives_read ON merl.result_narratives;
CREATE POLICY result_narratives_read ON merl.result_narratives FOR SELECT TO authenticated
USING (merl.can_access_project(project_id));

DROP POLICY IF EXISTS dashboard_kpi_config_read ON merl.dashboard_kpi_config;
CREATE POLICY dashboard_kpi_config_read ON merl.dashboard_kpi_config FOR SELECT TO authenticated
USING (project_id IS NULL OR merl.can_access_project(project_id));

DROP POLICY IF EXISTS portfolio_settings_read ON merl.portfolio_settings;
CREATE POLICY portfolio_settings_read ON merl.portfolio_settings FOR SELECT TO authenticated USING (true);

GRANT SELECT ON
  public.v_project_organizations,
  public.v_project_area_councils,
  public.v_framework_nodes,
  public.v_indicator_targets,
  public.v_result_narratives,
  public.v_dashboard_kpi_config,
  public.v_project_portfolio_status
TO authenticated;

-- Retire only the empty legacy pre-project tables superseded by the project-
-- scoped forms and the rebuilt results engine.
DROP VIEW IF EXISTS public.v_activities;
DROP VIEW IF EXISTS public.v_activity_milestones;
DROP VIEW IF EXISTS public.v_domain_budget;
DROP VIEW IF EXISTS public.v_indicator_status;
DROP VIEW IF EXISTS public.v_indicator_trends;
DROP VIEW IF EXISTS public.v_indicators;
DROP VIEW IF EXISTS public.v_engagement_stats;
DROP VIEW IF EXISTS public.v_ld_events;

DROP TABLE IF EXISTS merl.activity_milestones;
DROP TABLE IF EXISTS merl.financial_transactions;
DROP TABLE IF EXISTS merl.activities;
DROP TABLE IF EXISTS merl.indicator_values;
DROP TABLE IF EXISTS merl.indicators;
DROP TABLE IF EXISTS merl.community_engagements;
DROP TABLE IF EXISTS merl.ld_events;
DROP TABLE IF EXISTS merl.learning_entries;

COMMIT;
