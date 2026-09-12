-- Fix authenticated reads for security_invoker views introduced by the rebuilt MERL engine.
-- These base tables already have RLS read policies; authenticated users need SELECT
-- privileges for security_invoker views to work.

GRANT SELECT ON merl.project_area_councils TO authenticated;
GRANT SELECT ON merl.project_organizations TO authenticated;
GRANT SELECT ON merl.organizations TO authenticated;
GRANT SELECT ON merl.framework_nodes TO authenticated;
GRANT SELECT ON merl.indicator_targets TO authenticated;
GRANT SELECT ON merl.result_narratives TO authenticated;
GRANT SELECT ON merl.dashboard_kpi_config TO authenticated;
GRANT SELECT ON merl.ref_area_councils TO authenticated;

REVOKE SELECT ON merl.project_area_councils FROM anon;
REVOKE SELECT ON merl.project_organizations FROM anon;
REVOKE SELECT ON merl.organizations FROM anon;
REVOKE SELECT ON merl.framework_nodes FROM anon;
REVOKE SELECT ON merl.indicator_targets FROM anon;
REVOKE SELECT ON merl.result_narratives FROM anon;
REVOKE SELECT ON merl.dashboard_kpi_config FROM anon;
REVOKE SELECT ON merl.ref_area_councils FROM anon;
