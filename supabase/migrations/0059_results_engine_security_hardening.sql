-- MERL Dashboard – harden new results-engine RPCs and helper search paths.
-- Public write RPCs remain callable by authenticated users and continue to
-- enforce their internal role/project checks; anonymous execution is removed.

REVOKE EXECUTE ON FUNCTION public.delete_framework_node(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_indicator_schedule_status(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_framework_node(uuid,uuid,uuid,text,text,text,text,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_indicator_progress(uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,text,date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_project_indicator_v2(uuid,uuid,uuid,text,text,numeric,numeric,text,text,text,text,text,text,text,text,text,boolean,boolean,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_result_narrative(uuid,text,text,text,text,text,text,text) FROM anon;

ALTER FUNCTION merl.calculate_indicator_progress(numeric,numeric,numeric,text,numeric)
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.derive_performance_status(numeric,numeric,numeric)
  SET search_path = merl, public, pg_temp;
