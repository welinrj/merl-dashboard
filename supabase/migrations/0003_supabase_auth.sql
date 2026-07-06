-- =============================================================================
-- MERL Dashboard – Migration 0003: Supabase Auth integration + app surface
-- =============================================================================
-- Replaces the demo-mode login path with live Supabase Auth (Deliverable 2):
--
--   1. merl.users gains auth_user_id, linking a profile row to auth.users.
--   2. merl.current_db_user() resolves the caller via auth.uid() first and
--      falls back to the legacy app.current_user_id setting, so every existing
--      RLS policy now works for browser sessions authenticated with Supabase.
--   3. public.current_profile() lets the frontend load the signed-in user's
--      profile (PostgREST only exposes the public schema).
--   4. security_invoker views feed the Dashboard from live merl data.
--   5. public.datasets + storage bucket back the existing Datasets module.
--
-- The migration is portable: Supabase-specific objects (auth schema, storage
-- schema, authenticated role, realtime publication) are created only when
-- present, so the file also runs on plain PostgreSQL in local development.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Link profiles to Supabase Auth
-- ---------------------------------------------------------------------------
-- Deliberately no FK to auth.users: that schema does not exist outside
-- Supabase, and auth user rows may be provisioned after the profile row.
ALTER TABLE merl.users ADD COLUMN auth_user_id UUID UNIQUE;

COMMENT ON COLUMN merl.users.auth_user_id IS
    'Supabase auth.users.id for this profile; NULL until the account is provisioned.';

-- ---------------------------------------------------------------------------
-- 2. current_db_user(): auth.uid() first, legacy setting as fallback
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION merl.current_db_user()
RETURNS merl.users
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_user merl.users;
    v_uid  UUID;
    v_kid  TEXT;
BEGIN
    IF to_regproc('auth.uid') IS NOT NULL THEN
        EXECUTE 'SELECT auth.uid()' INTO v_uid;
        IF v_uid IS NOT NULL THEN
            SELECT * INTO v_user
            FROM merl.users
            WHERE auth_user_id = v_uid AND active = TRUE;
            IF FOUND THEN
                RETURN v_user;
            END IF;
            RETURN NULL;   -- authenticated but no active profile: no access
        END IF;
    END IF;

    v_kid := current_setting('app.current_user_id', TRUE);
    IF v_kid IS NULL OR v_kid = '' THEN
        RETURN NULL;
    END IF;
    SELECT * INTO v_user FROM merl.users WHERE keycloak_id = v_kid AND active = TRUE;
    RETURN v_user;
END;
$$;

-- Pin the trigger helper's search_path (security lint: mutable search_path).
ALTER FUNCTION merl.set_updated_at() SET search_path = merl, public;

-- ---------------------------------------------------------------------------
-- 3. Profile RPC for the frontend
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS TABLE (
    id           UUID,
    email        VARCHAR,
    full_name    VARCHAR,
    role         TEXT,
    organisation VARCHAR
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL THEN
        RETURN;
    END IF;
    RETURN QUERY SELECT v_user.id, v_user.email, v_user.full_name,
                        v_user.role::TEXT, v_user.organisation;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Dashboard views (security_invoker: underlying RLS applies to the caller)
-- ---------------------------------------------------------------------------
CREATE VIEW public.v_indicator_status
WITH (security_invoker = on) AS
SELECT
    i.id,
    i.code,
    i.name,
    i.domain::TEXT      AS domain,
    i.unit,
    i.baseline_value,
    i.target_value,
    i.target_year,
    lv.value            AS current_value,
    lv.reporting_period AS last_reported
FROM merl.indicators i
LEFT JOIN LATERAL (
    SELECT v.value, v.reporting_period
    FROM merl.indicator_values v
    WHERE v.indicator_id = i.id AND v.verified
    ORDER BY v.reporting_period DESC
    LIMIT 1
) lv ON TRUE;

CREATE VIEW public.v_domain_budget
WITH (security_invoker = on) AS
SELECT
    a.domain::TEXT              AS domain,
    SUM(a.budget_vuv)           AS budget_vuv,
    COALESCE(SUM(sp.spent), 0)  AS spent_vuv,
    COUNT(*)                            AS activities_total,
    COUNT(*) FILTER (WHERE a.status IN ('in_progress', 'completed'))
                                        AS activities_active
FROM merl.activities a
LEFT JOIN LATERAL (
    SELECT SUM(t.amount_vuv) AS spent
    FROM merl.financial_transactions t
    WHERE t.activity_id = a.id AND t.transaction_type = 'expenditure'
) sp ON TRUE
GROUP BY a.domain;

-- ---------------------------------------------------------------------------
-- 5. public.datasets — backing table for the Datasets module
-- ---------------------------------------------------------------------------
CREATE TABLE public.datasets (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT        NOT NULL,
    project_code  TEXT,
    type          TEXT,
    rows          INTEGER     NOT NULL DEFAULT 0,
    size_kb       INTEGER     NOT NULL DEFAULT 0,
    uploaded_by   TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
    tags          TEXT[]      NOT NULL DEFAULT '{}',
    storage_path  TEXT,
    reviewed_by   TEXT,
    review_note   TEXT,
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.datasets IS
    'Dataset submissions shown in the Datasets module; files live in the datasets storage bucket.';

CREATE INDEX idx_datasets_uploaded_at ON public.datasets (uploaded_at DESC);
CREATE INDEX idx_datasets_status       ON public.datasets (status);

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

-- Every signed-in user with a profile can see submissions (user-manual §2:
-- Datasets is visible to all five roles).
CREATE POLICY datasets_select ON public.datasets
    FOR SELECT
    USING ( merl.current_db_user() IS NOT NULL );

CREATE POLICY datasets_insert ON public.datasets
    FOR INSERT
    WITH CHECK ( merl.current_db_user() IS NOT NULL );

-- Review (approve/reject) is limited to M&E Officers and above (§6).
CREATE POLICY datasets_update ON public.datasets
    FOR UPDATE
    USING (
        (merl.current_db_user()).role IN
            ('administrator', 'docc_senior_officer', 'docc_me_officer')
    );

CREATE POLICY datasets_delete ON public.datasets
    FOR DELETE
    USING ( merl.is_admin() );

-- ---------------------------------------------------------------------------
-- 6. Supabase-only wiring: grants, realtime, storage
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT USAGE ON SCHEMA merl TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA merl TO authenticated;
        -- audit_logs has no RLS and must stay append-only via the audit trigger
        REVOKE INSERT, UPDATE, DELETE ON merl.audit_logs FROM authenticated;
        GRANT SELECT ON public.v_indicator_status, public.v_domain_budget TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets TO authenticated;
        GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
        REVOKE EXECUTE ON FUNCTION public.current_profile() FROM anon, public;
    END IF;

    IF EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.datasets;
    END IF;

    IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('datasets', 'datasets', FALSE)
        ON CONFLICT (id) DO NOTHING;

        EXECUTE $pol$
            CREATE POLICY datasets_bucket_rw ON storage.objects
                FOR ALL TO authenticated
                USING (bucket_id = 'datasets' AND merl.current_db_user() IS NOT NULL)
                WITH CHECK (bucket_id = 'datasets' AND merl.current_db_user() IS NOT NULL)
        $pol$;
    END IF;
END;
$$;

COMMIT;
