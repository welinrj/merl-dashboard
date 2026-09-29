-- Close the remaining RLS and RPC privilege gaps found by the live production
-- security audit. Public reporting stays readable, but anonymous callers no
-- longer execute privileged application code.

-- ---------------------------------------------------------------------------
-- 1. Every application table is protected by RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE merl.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_admin_select ON merl.audit_logs;
CREATE POLICY audit_logs_admin_select
  ON merl.audit_logs
  FOR SELECT
  TO authenticated
  USING ((SELECT merl.is_admin()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON merl.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON merl.audit_logs TO authenticated, service_role;

ALTER TABLE merl.period_label_fix_backup ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS period_label_fix_backup_deny_all ON merl.period_label_fix_backup;
CREATE POLICY period_label_fix_backup_deny_all
  ON merl.period_label_fix_backup
  FOR ALL
  TO PUBLIC
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON merl.period_label_fix_backup FROM PUBLIC, anon, authenticated;

ALTER TABLE merl.translatable_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS translatable_fields_deny_all ON merl.translatable_fields;
CREATE POLICY translatable_fields_deny_all
  ON merl.translatable_fields
  FOR ALL
  TO PUBLIC
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON merl.translatable_fields FROM PUBLIC, anon, authenticated;

-- PostGIS is no longer used by any MERL table, column, view, or function. A
-- non-CASCADE drop is deliberately used: PostgreSQL will refuse the migration
-- rather than delete an application object if a dependency is reintroduced.
-- This removes the extension-owned spatial_ref_sys table and its privileged
-- metadata functions from the exposed public schema.
DROP EXTENSION IF EXISTS postgis;

-- ---------------------------------------------------------------------------
-- 2. Publish formerly privileged public data into RLS-protected snapshots.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_portal_inventory (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  total_projects bigint NOT NULL DEFAULT 0,
  approved_projects bigint NOT NULL DEFAULT 0,
  other_projects bigint NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.public_portal_project_plans (
  project_id uuid PRIMARY KEY,
  inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.public_portal_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_portal_project_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_portal_inventory_read ON public.public_portal_inventory;
CREATE POLICY public_portal_inventory_read
  ON public.public_portal_inventory
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS public_portal_project_plans_read ON public.public_portal_project_plans;
CREATE POLICY public_portal_project_plans_read
  ON public.public_portal_project_plans
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON public.public_portal_inventory FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.public_portal_project_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_portal_inventory TO anon, authenticated, service_role;
GRANT SELECT ON public.public_portal_project_plans TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION merl.refresh_public_portal_supplemental()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  TRUNCATE public.public_portal_inventory,
           public.public_portal_project_plans;

  INSERT INTO public.public_portal_inventory (
    singleton, total_projects, approved_projects, other_projects, published_at
  )
  SELECT true,
         count(*)::bigint,
         count(*) FILTER (WHERE registration_status = 'approved')::bigint,
         count(*) FILTER (WHERE registration_status IS DISTINCT FROM 'approved')::bigint,
         now()
  FROM merl.projects
  WHERE coalesce(code::text, '') <> 'AUDIT-2026';

  INSERT INTO public.public_portal_project_plans (
    project_id, inputs, outputs, published_at
  )
  SELECT p.id,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('name', a.name, 'description', a.description)
        ORDER BY a.name
      )
      FROM merl.project_activities a
      WHERE a.project_id = p.id
        AND nullif(trim(a.name), '') IS NOT NULL
        AND a.status NOT IN ('draft', 'returned', 'pending_review')
    ), '[]'::jsonb),
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object('code', o.node_code, 'statement', o.title)
        ORDER BY o.sort_order, o.node_code
      )
      FROM merl.framework_nodes o
      WHERE o.project_id = p.id
        AND o.node_type = 'output'
        AND nullif(trim(o.title), '') IS NOT NULL
        AND o.status NOT IN ('draft', 'returned', 'pending_review')
    ), '[]'::jsonb),
    now()
  FROM merl.projects p
  JOIN public.public_portal_projects pub ON pub.id = p.id
  WHERE p.registration_status = 'approved';
END;
$function$;

REVOKE ALL ON FUNCTION merl.refresh_public_portal_supplemental()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION merl.refresh_public_portal_supplemental()
  TO service_role;

-- These anonymous RPCs now run with caller privileges and can read only the
-- explicitly published snapshot rows allowed by RLS.
CREATE OR REPLACE FUNCTION public.public_portal_project_inventory()
RETURNS TABLE(total_projects bigint, approved_projects bigint, other_projects bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT i.total_projects, i.approved_projects, i.other_projects
  FROM public.public_portal_inventory i
  WHERE i.singleton = true;
$function$;

CREATE OR REPLACE FUNCTION public.public_portal_project_plan()
RETURNS TABLE(project_id uuid, inputs jsonb, outputs jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT p.project_id, p.inputs, p.outputs
  FROM public.public_portal_project_plans p;
$function$;

REVOKE ALL ON FUNCTION public.public_portal_project_inventory() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_portal_project_plan() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_portal_project_inventory()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_portal_project_plan()
  TO anon, authenticated, service_role;

-- Publish every public snapshot in one transaction.
CREATE OR REPLACE FUNCTION public.publish_public_portal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF coalesce(merl.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'System administrator access required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM merl.refresh_public_portal();
  PERFORM merl.refresh_public_indicator_categories();
  PERFORM merl.refresh_public_portal_supplemental();

  SELECT jsonb_build_object(
    'published_at', s.updated_at,
    'project_count', s.project_count,
    'published_beneficiaries', s.published_beneficiaries,
    'projects_with_published_results', s.projects_with_published_results
  )
  INTO v_result
  FROM public.public_portal_summary s
  WHERE s.singleton = true;

  RETURN coalesce(v_result, jsonb_build_object('published_at', now()));
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_public_overview()
RETURNS TABLE(
  updated_at timestamptz,
  project_count integer,
  published_beneficiaries bigint,
  total_investment_vuv numeric,
  total_utilised_vuv numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(merl.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'System Administrator access required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM merl.refresh_public_portal();
  PERFORM merl.refresh_public_indicator_categories();
  PERFORM merl.refresh_public_portal_supplemental();

  RETURN QUERY
  SELECT s.updated_at, s.project_count, s.published_beneficiaries,
         s.total_investment_vuv, s.total_utilised_vuv
  FROM public.public_portal_summary s
  WHERE s.singleton = true;
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_public_portal()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_public_portal()
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_public_overview()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_public_overview()
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Remove anonymous execution from privileged RPCs and internal helpers.
-- ---------------------------------------------------------------------------
DO $hardening$
DECLARE
  r record;
  signature text;
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
  LOOP
    signature := format('%I.%I(%s)', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', signature);
  END LOOP;
END
$hardening$;

-- Internal SECURITY DEFINER helpers are not public RPCs. Only the small set
-- required by RLS policies and security-invoker views remains callable by a
-- signed-in database role.
DO $internal_hardening$
DECLARE
  r record;
  signature text;
  policy_helpers constant text[] := ARRAY[
    'can_access_indicator_evidence',
    'can_access_project',
    'can_edit_results_framework',
    'current_db_user',
    'has_auth_login',
    'is_admin',
    'is_editor'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'merl' AND p.prosecdef
  LOOP
    signature := format('%I.%I(%s)', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', signature);
    IF r.proname = ANY(policy_helpers) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', signature);
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', signature);
    END IF;
  END LOOP;
END
$internal_hardening$;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA merl
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- translation_coverage intentionally aggregates across the portfolio, but it
-- must still reject a JWT that does not map to an active MERL account.
CREATE OR REPLACE FUNCTION public.translation_coverage(p_lang text DEFAULT 'fr')
RETURNS TABLE(translated bigint, pending bigint, corrected bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $function$
DECLARE
  r record;
  v_parts text[] := '{}';
BEGIN
  IF merl.current_db_user() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT tf.table_name, tf.column_name
    FROM merl.translatable_fields tf
  LOOP
    v_parts := v_parts || format(
      $query$
        SELECT (s.i18n #>> ARRAY[%L, %L]) IS NOT NULL AS has_tr,
               COALESCE(s.i18n #>> ARRAY['_origin', %L, %L], '') = 'human' AS is_human
        FROM merl.%I s
        WHERE s.%I IS NOT NULL AND btrim(s.%I) <> ''
      $query$,
      p_lang, r.column_name, p_lang, r.column_name,
      r.table_name, r.column_name, r.column_name
    );
  END LOOP;

  IF cardinality(v_parts) = 0 THEN
    RETURN QUERY SELECT 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT count(*) FILTER (WHERE has_tr), count(*) FILTER (WHERE NOT has_tr), count(*) FILTER (WHERE is_human) FROM (%s) f',
    array_to_string(v_parts, ' UNION ALL ')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.translation_coverage(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translation_coverage(text)
  TO authenticated, service_role;

-- Seed the new snapshots from the already-published project snapshot.
SELECT merl.refresh_public_portal_supplemental();
