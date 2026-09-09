-- Complete DoCC project source profile register.
-- Captures every column from the Department workbook without treating annual
-- allocations as the approved total project budget.

CREATE TABLE IF NOT EXISTS merl.docc_project_profiles_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES merl.projects(id) ON DELETE CASCADE,
  source_workbook text NOT NULL DEFAULT 'DoCC Projects Infor(1).xlsx',
  source_sheet text NOT NULL DEFAULT 'DOCC PMU',
  source_row integer NOT NULL,
  npp_code text,
  gip_code text,
  programme_project_title text NOT NULL,
  description text,
  disaster text,
  ministry text,
  department text,
  cost_centre text,
  program text,
  activity text,
  start_date date,
  end_date date,
  support_type text,
  budget_2020_vuv numeric,
  budget_2021_vuv numeric,
  budget_2022_vuv numeric,
  budget_2023_vuv numeric,
  budget_2024_vuv numeric,
  budget_2025_vuv numeric,
  budget_2026_vuv numeric,
  funding_source text,
  budget_policy_priority text,
  confirm_status text,
  raw_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_workbook, source_sheet, source_row)
);

ALTER TABLE merl.docc_project_profiles_source ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS docc_project_profiles_source_read ON merl.docc_project_profiles_source;
CREATE POLICY docc_project_profiles_source_read
  ON merl.docc_project_profiles_source FOR SELECT TO authenticated
  USING (merl.can_access_project(project_id));

REVOKE ALL ON merl.docc_project_profiles_source FROM anon;
GRANT SELECT ON merl.docc_project_profiles_source TO authenticated;

CREATE OR REPLACE VIEW public.v_docc_project_profiles_source
WITH (security_invoker=true) AS
SELECT s.*,
       COALESCE(s.budget_2020_vuv,0)+COALESCE(s.budget_2021_vuv,0)+
       COALESCE(s.budget_2022_vuv,0)+COALESCE(s.budget_2023_vuv,0)+
       COALESCE(s.budget_2024_vuv,0)+COALESCE(s.budget_2025_vuv,0)+
       COALESCE(s.budget_2026_vuv,0) AS source_budget_total_vuv
FROM merl.docc_project_profiles_source s;
GRANT SELECT ON public.v_docc_project_profiles_source TO authenticated;

-- The source rows themselves are loaded from the controlled Department workbook
-- during deployment/import. Keeping the schema migration independent of generated
-- UUIDs makes the migration replayable across environments.
