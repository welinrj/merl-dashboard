-- Match indicatorTargets' effective-date, revision and ID ordering. Keep the
-- existing project authorisation, approved-period locks and partial-edit rules.
DO $$
DECLARE definition text; old_order text := 'ORDER BY created_at,id LIMIT 1';
BEGIN
  definition := pg_get_functiondef('public.patch_results_framework_row(uuid,jsonb,uuid)'::regprocedure);
  IF (length(definition)-length(replace(definition,old_order,'')))/length(old_order) <> 2 THEN
    RAISE EXCEPTION 'Unexpected framework target sync definition; review before migration';
  END IF;
  definition := replace(definition,old_order,'ORDER BY coalesce(period_end::timestamptz,created_at) DESC,coalesce(updated_at,created_at) DESC,id DESC LIMIT 1');
  EXECUTE definition;
END $$;

-- Extend the existing translation registry. No source text is rewritten.
ALTER TABLE merl.framework_nodes ADD COLUMN IF NOT EXISTS i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE merl.result_narratives ADD COLUMN IF NOT EXISTS i18n jsonb NOT NULL DEFAULT '{}'::jsonb;
INSERT INTO merl.translatable_fields(table_name,column_name,view_name) VALUES
 ('framework_nodes','title','v_framework_nodes'),
 ('framework_nodes','description','v_framework_nodes'),
 ('result_narratives','progress_summary','v_result_narratives'),
 ('result_narratives','key_achievements','v_result_narratives'),
 ('result_narratives','variance_explanation','v_result_narratives'),
 ('result_narratives','challenges','v_result_narratives'),
 ('result_narratives','corrective_actions','v_result_narratives'),
 ('result_narratives','next_period_priorities','v_result_narratives'),
 ('result_narratives','public_summary','v_result_narratives')
ON CONFLICT(table_name,column_name) DO NOTHING;

-- Append the translation column without dropping dependent views, existing
-- grants, or any existing row-access predicates. Retain security_invoker.
DO $$
DECLARE item record; definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES ('v_framework_nodes','framework_nodes'),('v_result_narratives','result_narratives')) AS x(view_name,table_name) LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=item.view_name AND column_name='i18n') THEN
      definition := rtrim(btrim(pg_get_viewdef(('public.'||item.view_name)::regclass,true)),';');
      EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_invoker=true) AS SELECT base.*,src.i18n FROM (%s) base JOIN merl.%I src ON src.id=base.id',item.view_name,definition,item.table_name);
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
