-- Hide completed/closed projects throughout the dashboard's read API.
-- Source records, approvals, attachments and audit history in merl stay intact.
-- Existing grants, column shapes and security-invoker options are preserved.
DO $migration$
DECLARE
  view_row record;
  definition text;
  options_sql text;
BEGIN
  SELECT pg_get_viewdef('public.v_projects'::regclass, true) INTO definition;
  IF position('__merl_open_project' IN definition) = 0 THEN
    SELECT CASE WHEN reloptions IS NULL THEN ''
      ELSE ' WITH (' || array_to_string(reloptions, ', ') || ')' END
      INTO options_sql FROM pg_class WHERE oid='public.v_projects'::regclass;
    EXECUTE 'CREATE OR REPLACE VIEW public.v_projects' || options_sql || ' AS '
      || 'SELECT __merl_open_project.* FROM (' || regexp_replace(definition, ';\s*$', '')
      || ') __merl_open_project WHERE lower(btrim(coalesce(__merl_open_project.status::text, ''''))) '
      || 'NOT IN (''completed'', ''closed'')';
  END IF;

  -- Scope related rows too: hiding only project names leaves historic money,
  -- indicators, search hits and review notifications in portfolio aggregates.
  FOR view_row IN
    SELECT c.oid, c.relname, c.reloptions
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='v' AND c.relname LIKE 'v\_%' ESCAPE '\'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid
        AND a.attname='project_id' AND NOT a.attisdropped)
  LOOP
    SELECT pg_get_viewdef(view_row.oid, true) INTO definition;
    IF position('__merl_open_row' IN definition) > 0 THEN CONTINUE; END IF;
    options_sql := CASE WHEN view_row.reloptions IS NULL THEN ''
      ELSE ' WITH (' || array_to_string(view_row.reloptions, ', ') || ')' END;
    EXECUTE format('CREATE OR REPLACE VIEW public.%I', view_row.relname) || options_sql || ' AS '
      || 'SELECT __merl_open_row.* FROM (' || regexp_replace(definition, ';\s*$', '')
      || ') __merl_open_row WHERE __merl_open_row.project_id IS NULL OR EXISTS '
      || '(SELECT 1 FROM public.v_projects open_project WHERE open_project.id=__merl_open_row.project_id)';
  END LOOP;

  -- Targets reference an indicator rather than a project directly.
  SELECT pg_get_viewdef('public.v_indicator_targets'::regclass, true) INTO definition;
  IF position('__merl_open_target' IN definition) = 0 THEN
    SELECT CASE WHEN reloptions IS NULL THEN ''
      ELSE ' WITH (' || array_to_string(reloptions, ', ') || ')' END
      INTO options_sql FROM pg_class WHERE oid='public.v_indicator_targets'::regclass;
    EXECUTE 'CREATE OR REPLACE VIEW public.v_indicator_targets' || options_sql || ' AS '
      || 'SELECT __merl_open_target.* FROM (' || regexp_replace(definition, ';\s*$', '')
      || ') __merl_open_target WHERE EXISTS (SELECT 1 FROM public.v_project_indicators i '
      || 'WHERE i.id=__merl_open_target.indicator_id)';
  END IF;
END;
$migration$;

-- This existing aggregate otherwise counts historic Area Councils directly.
DO $coverage$
DECLARE definition text;
BEGIN
  SELECT pg_get_viewdef('public.v_portfolio_kpis'::regclass,true) INTO definition;
  IF position('merl.project_area_councils' IN definition)>0 THEN
    definition := replace(definition, 'FROM merl.project_area_councils',
      'FROM public.v_project_area_councils AS project_area_councils');
    EXECUTE 'CREATE OR REPLACE VIEW public.v_portfolio_kpis WITH (security_invoker=true) AS ' || definition;
  END IF;
END;
$coverage$;

NOTIFY pgrst, 'reload schema';
