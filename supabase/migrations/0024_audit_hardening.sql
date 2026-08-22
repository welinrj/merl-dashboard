-- =============================================================================
-- 0024_audit_hardening.sql
-- -----------------------------------------------------------------------------
-- Makes the immutable audit trail actually usable for accountability (ToR
-- outcome: "transparent accountability"):
--   1. Fix actor attribution — the generic trigger now resolves the signed-in
--      user via merl.current_db_user() and records both user_id and
--      app_user_name (previously NULL on the Supabase browser path), plus the
--      real schema_name.
--   2. Extend audit coverage to the actively-used modules (SRF, project
--      profiles/documents, datasets) that were outside the trail.
--   3. Expose the trail to administrators via public.admin_audit_log(), and
--      surface real system health via public.system_status().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Authorization correctness — composite-NULL guard fix
-- ---------------------------------------------------------------------------
-- `row IS NOT NULL` is true only when EVERY column is non-null, so a users row
-- with any NULL column (e.g. keycloak_id, which admin_create_user never sets on
-- the Supabase path) makes merl.is_admin() and the inline RLS
-- `current_db_user() IS NOT NULL` checks wrongly evaluate FALSE — locking
-- Admin-Panel-created users out of admin actions and row-level reads. Seeded
-- users happen to be fully populated, which is why this stayed hidden.
--
-- Two-part fix, matching the correct `.id IS NOT NULL` pattern already used by
-- merl.is_editor() (migration 0023):
--   (a) harden is_admin() itself, and
--   (b) guarantee every users row is fully populated so the many inline RLS
--       `current_db_user() IS NOT NULL` policies keep working unchanged.

CREATE OR REPLACE FUNCTION merl.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    RETURN v_user.id IS NOT NULL AND v_user.role = 'administrator';
END;
$$;

-- Compatibility shim: keep users rows free of NULLs in the nullable columns so
-- composite `IS NOT NULL` checks in existing RLS policies hold for every user,
-- however the row was created. keycloak_id stays unique (id/auth_user_id are).
CREATE OR REPLACE FUNCTION merl.fn_users_normalise()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.keycloak_id  := COALESCE(NEW.keycloak_id, NEW.auth_user_id::TEXT, NEW.id::TEXT);
    NEW.organisation := COALESCE(NULLIF(NEW.organisation, ''), 'Department of Climate Change');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_normalise ON merl.users;
CREATE TRIGGER trg_users_normalise
    BEFORE INSERT OR UPDATE ON merl.users
    FOR EACH ROW EXECUTE FUNCTION merl.fn_users_normalise();

-- Backfill any already-created users that carry NULLs.
UPDATE merl.users
   SET keycloak_id  = COALESCE(keycloak_id, auth_user_id::TEXT, id::TEXT),
       organisation = COALESCE(NULLIF(organisation, ''), 'Department of Climate Change')
 WHERE keycloak_id IS NULL OR organisation IS NULL OR organisation = '';

-- ---------------------------------------------------------------------------
-- 1. Improved generic audit trigger — actor + schema attribution
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merl.fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER                     -- bypasses RLS so we can always write
SET search_path = merl, public
AS $$
DECLARE
    v_record_id UUID;
    v_old       JSONB;
    v_new       JSONB;
    v_actor     merl.users;
    v_name      TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_record_id := OLD.id;
        v_old       := to_jsonb(OLD);
        v_new       := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_record_id := NEW.id;
        v_old       := NULL;
        v_new       := to_jsonb(NEW);
    ELSE   -- UPDATE
        v_record_id := NEW.id;
        v_old       := to_jsonb(OLD);
        v_new       := to_jsonb(NEW);
    END IF;

    -- Resolve the acting user. On the Supabase browser path this comes from the
    -- JWT (auth.uid()); on a legacy backend connection it falls back to the
    -- app.current_user_name GUC.
    v_actor := merl.current_db_user();
    v_name  := COALESCE(v_actor.full_name,
                        current_setting('app.current_user_name', TRUE));

    INSERT INTO merl.audit_logs (
        schema_name, table_name, record_id, action,
        user_id, app_user_name, changed_at,
        old_values, new_values
    ) VALUES (
        TG_TABLE_SCHEMA,
        TG_TABLE_NAME,
        v_record_id,
        TG_OP,
        v_actor.id,
        v_name,
        NOW(),
        v_old,
        v_new
    );

    RETURN NULL;   -- AFTER trigger; return value is ignored
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Extend audit coverage to the actively-used modules
-- ---------------------------------------------------------------------------
-- All of these carry a UUID `id` column, which fn_audit_trigger() records.
DO $$
DECLARE
    t TEXT;
    tbls TEXT[] := ARRAY[
        'merl.srf_activities',
        'merl.srf_columns',
        'merl.srf_activity_photos',
        'merl.srf_activity_reports',
        'merl.project_documents',
        'merl.project_report_activities',
        'merl.project_profiles',
        'public.datasets'
    ];
BEGIN
    FOREACH t IN ARRAY tbls LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%s ON %s',
                       split_part(t, '.', 2), t);
        EXECUTE format(
            'CREATE TRIGGER trg_audit_%s AFTER INSERT OR UPDATE OR DELETE ON %s '
            'FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger()',
            split_part(t, '.', 2), t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Admin-only reader over the audit trail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_audit_log(
    p_limit  INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0,
    p_table  TEXT    DEFAULT NULL,
    p_action TEXT    DEFAULT NULL,
    p_search TEXT    DEFAULT NULL
)
RETURNS TABLE (
    id            BIGINT,
    schema_name   TEXT,
    table_name    TEXT,
    record_id     UUID,
    action        TEXT,
    actor_name    TEXT,
    actor_role    TEXT,
    changed_at    TIMESTAMPTZ,
    old_values    JSONB,
    new_values    JSONB,
    total_count   BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Only administrators may read the audit log'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH filtered AS (
        SELECT a.*, u.full_name AS actor_full_name, u.role::TEXT AS actor_role_txt
        FROM merl.audit_logs a
        LEFT JOIN merl.users u ON u.id = a.user_id
        WHERE (p_table  IS NULL OR a.table_name = p_table)
          AND (p_action IS NULL OR a.action     = p_action)
          AND (p_search IS NULL OR p_search = '' OR
               a.table_name    ILIKE '%' || p_search || '%' OR
               a.app_user_name ILIKE '%' || p_search || '%' OR
               a.record_id::TEXT ILIKE '%' || p_search || '%')
    )
    SELECT f.id, f.schema_name::TEXT, f.table_name::TEXT, f.record_id, f.action::TEXT,
           COALESCE(f.actor_full_name, f.app_user_name)::TEXT AS actor_name,
           f.actor_role_txt AS actor_role,
           f.changed_at, f.old_values, f.new_values,
           (SELECT COUNT(*) FROM filtered) AS total_count
    FROM filtered f
    ORDER BY f.changed_at DESC
    LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Real system-health snapshot for the Admin System tab
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.system_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Only administrators may read system status'
            USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'audit_row_count',   (SELECT COUNT(*) FROM merl.audit_logs),
        'last_audit_at',     (SELECT MAX(changed_at) FROM merl.audit_logs),
        'analytics_computed_at',
            (SELECT computed_at FROM merl.mv_srf_analytics LIMIT 1),
        'rls_tables', (
            SELECT jsonb_agg(jsonb_build_object(
                       'table', n.nspname || '.' || c.relname,
                       'rls_enabled', c.relrowsecurity)
                     ORDER BY n.nspname, c.relname)
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r'
              AND (n.nspname = 'merl'
                   OR (n.nspname = 'public' AND c.relname = 'datasets'))
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION public.admin_audit_log(INTEGER, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.system_status() TO authenticated;
    END IF;
END $$;
