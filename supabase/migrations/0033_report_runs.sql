-- =============================================================================
-- MERL Dashboard – Migration 0033: report run log (Report Library, spec §48-51)
-- =============================================================================
-- Records each official report generated from the standardised dataset so the
-- portal keeps an auditable Report Library ("who generated which report, for
-- what scope, when"). Reads go through public.v_report_runs; writes go through
-- the SECURITY DEFINER RPC public.log_report_run so no direct write policy is
-- exposed. Any signed-in user who can view Reports may log a generation.
-- =============================================================================

-- 1) Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.report_runs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type      TEXT        NOT NULL,
    report_label     TEXT,
    project_id       UUID        REFERENCES merl.projects (id) ON DELETE SET NULL,
    reporting_period TEXT,
    params           JSONB       NOT NULL DEFAULT '{}'::JSONB,
    generated_by     UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.report_runs IS
    'Audit log of official reports generated from the standardised MERL dataset.';

CREATE INDEX IF NOT EXISTS report_runs_generated_at_idx
    ON merl.report_runs (generated_at DESC);

ALTER TABLE merl.report_runs ENABLE ROW LEVEL SECURITY;

-- Any signed-in user with a profile may read the library; writes go through the
-- RPC below (SECURITY DEFINER), so no write policy is exposed.
DROP POLICY IF EXISTS report_runs_select ON merl.report_runs;
CREATE POLICY report_runs_select ON merl.report_runs
    FOR SELECT USING ((merl.current_db_user()).id IS NOT NULL);

-- 2) Read view (adds generator name + project code) ---------------------------
CREATE OR REPLACE VIEW public.v_report_runs WITH (security_invoker = on) AS
SELECT rr.*,
       u.full_name AS generated_by_name,
       p.code      AS project_code,
       p.name      AS project_name
FROM merl.report_runs rr
LEFT JOIN merl.users    u ON u.id = rr.generated_by
LEFT JOIN merl.projects p ON p.id = rr.project_id;

-- 3) Log RPC ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_report_run(
    p_report_type      TEXT,
    p_report_label     TEXT DEFAULT NULL,
    p_project_id       UUID DEFAULT NULL,
    p_reporting_period TEXT DEFAULT NULL,
    p_params           JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_user merl.users;
    v_id   UUID;
BEGIN
    v_user := merl.current_db_user();
    IF v_user.id IS NULL THEN
        RAISE EXCEPTION 'Sign-in required to generate reports' USING ERRCODE = '42501';
    END IF;
    INSERT INTO merl.report_runs (report_type, report_label, project_id, reporting_period, params, generated_by)
    VALUES (p_report_type, p_report_label, p_project_id, NULLIF(TRIM(p_reporting_period), ''),
            COALESCE(p_params, '{}'::JSONB), v_user.id)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;

-- 4) Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.report_runs TO authenticated;
        GRANT SELECT ON public.v_report_runs TO authenticated;
        GRANT EXECUTE ON FUNCTION public.log_report_run(TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;
    END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_report_run(TEXT, TEXT, UUID, TEXT, JSONB) FROM anon, public;
