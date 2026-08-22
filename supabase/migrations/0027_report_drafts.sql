-- =============================================================================
-- 0027_report_drafts.sql
-- -----------------------------------------------------------------------------
-- Persists the officer's report narrative edits and sign-off details so they
-- are shared across users and devices instead of living only in one browser's
-- localStorage (ToR: "reliable reports for management and development
-- partners"). Keyed by report identity: "<type>|<period>|<project>".
-- =============================================================================
CREATE TABLE IF NOT EXISTS merl.report_drafts (
    identity   TEXT        PRIMARY KEY,
    body       JSONB       NOT NULL DEFAULT '{}'::JSONB,
    updated_by UUID        REFERENCES merl.users (id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE merl.report_drafts IS
    'Shared, durable report narrative + sign-off edits keyed by report identity.';

ALTER TABLE merl.report_drafts ENABLE ROW LEVEL SECURITY;

-- Any signed-in user with a profile may read drafts; writes go through the
-- editor-gated RPC below (SECURITY DEFINER), so no write policy is exposed.
DROP POLICY IF EXISTS report_drafts_select ON merl.report_drafts;
CREATE POLICY report_drafts_select ON merl.report_drafts
    FOR SELECT USING ((merl.current_db_user()).id IS NOT NULL);

-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_report_draft(p_identity TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_body JSONB;
BEGIN
    IF (merl.current_db_user()).id IS NULL THEN
        RETURN NULL;   -- not signed in
    END IF;
    SELECT body INTO v_body FROM merl.report_drafts WHERE identity = p_identity;
    RETURN v_body;   -- NULL when no draft yet
END;
$$;

CREATE OR REPLACE FUNCTION public.save_report_draft(p_identity TEXT, p_body JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_actor merl.users;
BEGIN
    v_actor := merl.require_editor();
    INSERT INTO merl.report_drafts (identity, body, updated_by, updated_at)
    VALUES (p_identity, COALESCE(p_body, '{}'::JSONB), v_actor.id, NOW())
    ON CONFLICT (identity) DO UPDATE
        SET body = EXCLUDED.body,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW();
END;
$$;

-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.report_drafts TO authenticated;
        GRANT EXECUTE ON FUNCTION public.get_report_draft(TEXT) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.save_report_draft(TEXT, JSONB) TO authenticated;
    END IF;
END $$;
