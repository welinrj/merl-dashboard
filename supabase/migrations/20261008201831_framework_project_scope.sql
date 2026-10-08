-- Scope dashboard visibility to projects with actual framework records.
-- Preserve the full project register and all existing row permissions.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_viewdef('public.v_projects'::regclass, true) INTO definition;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='v_projects' AND column_name='has_results_framework') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.v_projects WITH (security_invoker = true) AS SELECT base.*, (EXISTS (SELECT 1 FROM merl.framework_nodes n WHERE n.project_id=base.id) OR EXISTS (SELECT 1 FROM merl.project_indicators i WHERE i.project_id=base.id)) AS has_results_framework FROM (' || rtrim(definition, E';\n ') || ') base';
  END IF;

  SELECT pg_get_functiondef('merl.refresh_public_portal()'::regprocedure) INTO definition;
  IF position($old$WHERE coalesce(p.code::text,'') <> 'AUDIT-2026';$old$ in definition)=0 THEN
    RAISE EXCEPTION 'Unexpected public refresh scope; review before applying';
  END IF;
  definition := replace(definition,
    $old$WHERE coalesce(p.code::text,'') <> 'AUDIT-2026';$old$,
    $new$WHERE coalesce(p.code::text,'') <> 'AUDIT-2026'
      AND (EXISTS (SELECT 1 FROM merl.framework_nodes n WHERE n.project_id=p.id)
        OR EXISTS (SELECT 1 FROM merl.project_indicators i WHERE i.project_id=p.id));$new$);
  definition := replace(definition,
    $old$JOIN merl.projects p ON p.id=pac.project_id AND coalesce(p.code::text,'') <> 'AUDIT-2026'$old$,
    $new$JOIN merl.projects p ON p.id=pac.project_id
    JOIN public.public_portal_projects pub ON pub.id=p.id$new$);
  definition := replace(definition,
    $old$JOIN merl.projects p ON p.id=cfg.project_id AND coalesce(p.code::text,'') <> 'AUDIT-2026'$old$,
    $new$JOIN merl.projects p ON p.id=cfg.project_id
    JOIN public.public_portal_projects pub ON pub.id=p.id$new$);
  EXECUTE definition;

  SELECT pg_get_functiondef('merl.refresh_public_portal_supplemental()'::regprocedure) INTO definition;
  definition := replace(definition,
    $old$WHERE coalesce(code::text, '') <> 'AUDIT-2026';$old$,
    $new$WHERE id IN (SELECT id FROM public.public_portal_projects);$new$);
  EXECUTE definition;
END;
$migration$;
SELECT merl.refresh_public_portal();
SELECT merl.refresh_public_indicator_categories();
SELECT merl.refresh_public_portal_supplemental();
NOTIFY pgrst, 'reload schema';
