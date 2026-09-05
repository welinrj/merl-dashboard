-- Portal audit hardening (2026-09-05)
--
-- Addresses the highest-risk findings from the frontend/backend inspection:
--   * make the shared SRF aggregate view run with caller privileges
--   * remove anonymous EXECUTE from custom SECURITY DEFINER RPCs
--   * pin helper-function search_path values
--   * make intentionally-private code_counters RLS explicit
--   * remove redundant SELECT evaluation from legacy ALL policies
--   * avoid per-row auth.uid()/current_setting() evaluation in read policies
--   * add covering indexes for single-column foreign keys that lack one

-- ---------------------------------------------------------------------------
-- 1. Shared aggregate view: caller privileges, read-only, signed-in only.
-- ---------------------------------------------------------------------------
ALTER VIEW public.v_srf_analytics SET (security_invoker = true);

REVOKE ALL ON TABLE public.v_srf_analytics FROM anon, authenticated;
GRANT SELECT ON TABLE public.v_srf_analytics TO authenticated, service_role;

-- A security-invoker view needs the caller to be able to read its backing MV.
GRANT USAGE ON SCHEMA merl TO authenticated, service_role;
GRANT SELECT ON TABLE merl.mv_srf_analytics TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. RPC surface: SECURITY DEFINER functions must never be callable anonymously.
--    PostgREST users authenticate as the database role `authenticated`, so
--    application-role authorization remains enforced inside each RPC.
-- ---------------------------------------------------------------------------
DO $hardening$
DECLARE
  r record;
  signature text;
  service_only constant text[] := ARRAY[
    'import_villages',
    'save_machine_translation',
    'translation_backlog'
  ];
BEGIN
  FOR r IN
    SELECT p.oid,
           n.nspname,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       -- Do not change functions owned by extensions such as PostGIS.
       AND NOT EXISTS (
         SELECT 1
           FROM pg_depend d
           JOIN pg_extension e ON e.oid = d.refobjid
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p.oid
            AND d.deptype = 'e'
       )
  LOOP
    signature := format('%I.%I(%s)', r.nspname, r.proname, r.args);

    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', signature);

    IF r.proname = ANY(service_only) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', signature);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', signature);
    END IF;
  END LOOP;
END
$hardening$;

-- New functions created by the migration owner should not default back to
-- executable-by-PUBLIC. Individual migrations must grant the required role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3. Pin search_path on helpers identified by the database security advisor.
-- ---------------------------------------------------------------------------
ALTER FUNCTION merl.gen_temp_password()
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.srf_slug(text)
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.fn_users_normalise()
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.risk_rating(integer, integer)
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.assert_valid_user_input(text, text)
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.assert_statement(text, text)
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.jsonb_put(jsonb, text[], jsonb)
  SET search_path = merl, public, pg_temp;
ALTER FUNCTION merl.validate_or_warn(text, text)
  SET search_path = merl, public, pg_temp;

-- ---------------------------------------------------------------------------
-- 4. RLS clean-up.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS code_counters_deny_all ON merl.code_counters;
CREATE POLICY code_counters_deny_all
  ON merl.code_counters
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Evaluate auth state once per statement, not for every row.
ALTER POLICY project_documents_select ON merl.project_documents
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY project_profiles_select ON merl.project_profiles
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY report_activities_select ON merl.project_report_activities
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY srf_activities_select ON merl.srf_activities
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY srf_columns_select ON merl.srf_columns
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY srf_activity_photos_select ON merl.srf_activity_photos
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY srf_activity_reports_select ON merl.srf_activity_reports
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY users_select ON merl.users
  USING (
    merl.is_admin()
    OR keycloak_id::text = (SELECT current_setting('app.current_user_id', true))
  );

-- Legacy ALL policies also count as SELECT policies. Split them into write-only
-- policies so SELECT is evaluated exactly once.
DO $policies$
DECLARE
  spec record;
  allowed text := '(merl.current_db_user()).role = ANY (ARRAY[''' ||
    'system_admin''::merl.user_role, ''docc_me_officer''::merl.user_role, ' ||
    '''project_manager''::merl.user_role])';
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      ('activity_milestones', 'am'),
      ('community_engagements', 'ce'),
      ('ld_events', 'lde'),
      ('learning_entries', 'le')
    ) AS x(table_name, prefix)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON merl.%I', spec.prefix || '_write', spec.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON merl.%I', spec.prefix || '_insert', spec.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON merl.%I', spec.prefix || '_update', spec.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON merl.%I', spec.prefix || '_delete', spec.table_name);

    EXECUTE format(
      'CREATE POLICY %I ON merl.%I FOR INSERT TO public WITH CHECK (%s)',
      spec.prefix || '_insert', spec.table_name, allowed
    );
    EXECUTE format(
      'CREATE POLICY %I ON merl.%I FOR UPDATE TO public USING (%s) WITH CHECK (%s)',
      spec.prefix || '_update', spec.table_name, allowed, allowed
    );
    EXECUTE format(
      'CREATE POLICY %I ON merl.%I FOR DELETE TO public USING (%s)',
      spec.prefix || '_delete', spec.table_name, allowed
    );
  END LOOP;
END
$policies$;

-- ---------------------------------------------------------------------------
-- 5. Cover every single-column FK that currently has no leading-column index.
--    This keeps joins/deletes predictable as MERL reporting volume grows.
-- ---------------------------------------------------------------------------
DO $indexes$
DECLARE
  r record;
  idx_name text;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           con.conname,
           a.attname AS column_name
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a
        ON a.attrelid = con.conrelid
       AND a.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND n.nspname IN ('merl', 'public')
       AND array_length(con.conkey, 1) = 1
       AND NOT EXISTS (
         SELECT 1
           FROM pg_index i
          WHERE i.indrelid = con.conrelid
            AND i.indisvalid
            AND i.indisready
            AND i.indkey[0] = con.conkey[1]
       )
  LOOP
    idx_name := left('idx_fk_' || r.table_name || '_' || r.column_name, 54)
                || '_' || substr(md5(r.conname), 1, 8);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I)',
      idx_name, r.schema_name, r.table_name, r.column_name
    );
  END LOOP;
END
$indexes$;
