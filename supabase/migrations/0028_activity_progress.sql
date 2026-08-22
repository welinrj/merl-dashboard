-- =============================================================================
-- MERL Dashboard – Migration 0028: FRM-03 Monthly Activity Progress
-- =============================================================================
-- Adds the periodic project-reporting form defined by DoCC form FRM-03. Each
-- record captures one project activity's progress for one reporting period —
-- the standardised data projects submit so the dashboard KPIs (progress rating,
-- % complete, beneficiaries reached, expenditure) can be aggregated in near
-- real time, and so the "learnings and experiences" the ToR calls for are
-- captured in a structured way rather than in free-form documents.
--
-- Mirrors the FRM-02 conventions (migration 0009):
--   * project-scoped, auto-generated short code RPT-## via merl.next_code();
--   * writes only through role-gated SECURITY DEFINER RPCs (editor roles =
--     administrator / docc_me_officer / project_manager), plus a
--     submit-for-review / approve-or-return workflow (reviewer roles =
--     administrator / docc_senior_officer / docc_me_officer);
--   * table exposes a SELECT policy to signed-in users, read via public.v_*;
--   * audit trigger attached; grants to the authenticated role only.
-- =============================================================================

BEGIN;

-- 1. Progress-report table ----------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.activity_progress (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id           UUID        NOT NULL REFERENCES merl.projects (id)           ON DELETE CASCADE,
    activity_id          UUID        NOT NULL REFERENCES merl.project_activities (id) ON DELETE CASCADE,
    code                 VARCHAR(30) NOT NULL,

    -- Reporting period ---------------------------------------------------------
    period_type          VARCHAR(20) NOT NULL DEFAULT 'Monthly'
                         CHECK (period_type IN ('Monthly', 'Quarterly', 'Annual')),
    reporting_period     VARCHAR(60) NOT NULL,        -- e.g. 'January 2026', 'Q1 2026'

    -- Progress -----------------------------------------------------------------
    status               VARCHAR(20) NOT NULL DEFAULT 'on_track'
                         CHECK (status IN ('on_track', 'at_risk', 'off_track', 'completed')),
    percent_complete     NUMERIC(5, 2) CHECK (percent_complete BETWEEN 0 AND 100),
    narrative            TEXT,                        -- work undertaken this period

    -- Beneficiaries reached (GEDSI-disaggregated) ------------------------------
    beneficiaries_male   INTEGER CHECK (beneficiaries_male   >= 0),
    beneficiaries_female INTEGER CHECK (beneficiaries_female >= 0),
    beneficiaries_other  INTEGER CHECK (beneficiaries_other  >= 0),
    beneficiaries_pwd    INTEGER CHECK (beneficiaries_pwd    >= 0),   -- persons with disabilities
    beneficiaries_youth  INTEGER CHECK (beneficiaries_youth  >= 0),

    -- Finance ------------------------------------------------------------------
    budget_spent_vuv     NUMERIC(18, 2) CHECK (budget_spent_vuv >= 0),

    -- Learning & risk ----------------------------------------------------------
    issues               TEXT,                        -- challenges / issues encountered
    lessons_learned      TEXT,                        -- learnings & experiences (ToR)
    next_steps           TEXT,

    -- Review workflow ----------------------------------------------------------
    report_status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                         CHECK (report_status IN ('draft', 'pending_review', 'approved', 'returned')),
    review_note          TEXT,
    reviewed_by          UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    reviewed_at          TIMESTAMPTZ,

    created_by           UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

COMMENT ON TABLE merl.activity_progress IS
    'FRM-03 Monthly Activity Progress: one activity''s progress for one reporting period.';

CREATE INDEX IF NOT EXISTS idx_activity_progress_project  ON merl.activity_progress (project_id);
CREATE INDEX IF NOT EXISTS idx_activity_progress_activity ON merl.activity_progress (activity_id);

-- 2. RLS: signed-in users may read; writes only via the RPCs below ------------
ALTER TABLE merl.activity_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS activity_progress_select ON merl.activity_progress;
CREATE POLICY activity_progress_select ON merl.activity_progress
    FOR SELECT USING ( merl.current_db_user() IS NOT NULL );

-- 3. Write RPCs (project derived from the parent activity) ---------------------
CREATE OR REPLACE FUNCTION public.create_activity_progress(
    p_activity_id       UUID,
    p_reporting_period  TEXT,
    p_period_type       TEXT      DEFAULT 'Monthly',
    p_status            TEXT      DEFAULT 'on_track',
    p_percent_complete  NUMERIC   DEFAULT NULL,
    p_narrative         TEXT      DEFAULT NULL,
    p_ben_male          INTEGER   DEFAULT NULL,
    p_ben_female        INTEGER   DEFAULT NULL,
    p_ben_other         INTEGER   DEFAULT NULL,
    p_ben_pwd           INTEGER   DEFAULT NULL,
    p_ben_youth         INTEGER   DEFAULT NULL,
    p_budget_spent      NUMERIC   DEFAULT NULL,
    p_issues            TEXT      DEFAULT NULL,
    p_lessons           TEXT      DEFAULT NULL,
    p_next_steps        TEXT      DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_proj UUID; v_user merl.users;
BEGIN
    v_user := merl.require_editor();
    SELECT project_id INTO v_proj FROM merl.project_activities WHERE id = p_activity_id;
    IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent activity not found'; END IF;
    IF btrim(coalesce(p_reporting_period, '')) = '' THEN RAISE EXCEPTION 'Reporting period is required'; END IF;

    INSERT INTO merl.activity_progress (
        project_id, activity_id, code, period_type, reporting_period, status,
        percent_complete, narrative,
        beneficiaries_male, beneficiaries_female, beneficiaries_other,
        beneficiaries_pwd, beneficiaries_youth, budget_spent_vuv,
        issues, lessons_learned, next_steps, created_by
    ) VALUES (
        v_proj, p_activity_id, merl.next_code(v_proj, 'report', 'RPT'),
        coalesce(p_period_type, 'Monthly'), btrim(p_reporting_period),
        coalesce(p_status, 'on_track'), p_percent_complete, p_narrative,
        p_ben_male, p_ben_female, p_ben_other, p_ben_pwd, p_ben_youth, p_budget_spent,
        p_issues, p_lessons, p_next_steps, v_user.id
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_activity_progress(
    p_id                UUID,
    p_reporting_period  TEXT,
    p_period_type       TEXT      DEFAULT 'Monthly',
    p_status            TEXT      DEFAULT 'on_track',
    p_percent_complete  NUMERIC   DEFAULT NULL,
    p_narrative         TEXT      DEFAULT NULL,
    p_ben_male          INTEGER   DEFAULT NULL,
    p_ben_female        INTEGER   DEFAULT NULL,
    p_ben_other         INTEGER   DEFAULT NULL,
    p_ben_pwd           INTEGER   DEFAULT NULL,
    p_ben_youth         INTEGER   DEFAULT NULL,
    p_budget_spent      NUMERIC   DEFAULT NULL,
    p_issues            TEXT      DEFAULT NULL,
    p_lessons           TEXT      DEFAULT NULL,
    p_next_steps        TEXT      DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    IF btrim(coalesce(p_reporting_period, '')) = '' THEN RAISE EXCEPTION 'Reporting period is required'; END IF;

    UPDATE merl.activity_progress SET
        reporting_period     = btrim(p_reporting_period),
        period_type          = coalesce(p_period_type, 'Monthly'),
        status               = coalesce(p_status, 'on_track'),
        percent_complete     = p_percent_complete,
        narrative            = p_narrative,
        beneficiaries_male   = p_ben_male,
        beneficiaries_female = p_ben_female,
        beneficiaries_other  = p_ben_other,
        beneficiaries_pwd    = p_ben_pwd,
        beneficiaries_youth  = p_ben_youth,
        budget_spent_vuv     = p_budget_spent,
        issues               = p_issues,
        lessons_learned      = p_lessons,
        next_steps           = p_next_steps,
        updated_at           = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Progress report not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_activity_progress(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.activity_progress WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Progress report not found'; END IF;
END; $$;

-- Submit-for-review / approve-or-return workflow (mirrors FRM-01 projects) -----
CREATE OR REPLACE FUNCTION public.submit_activity_progress_for_review(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.activity_progress
       SET report_status = 'pending_review', review_note = NULL, updated_at = NOW()
     WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Progress report not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.review_activity_progress(
    p_id UUID, p_decision TEXT, p_note TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('administrator', 'docc_senior_officer', 'docc_me_officer') THEN
        RAISE EXCEPTION 'Reviewer access required';
    END IF;
    IF p_decision NOT IN ('approved', 'returned') THEN
        RAISE EXCEPTION 'Decision must be approved or returned';
    END IF;
    UPDATE merl.activity_progress
       SET report_status = p_decision, review_note = p_note,
           reviewed_by = v_user.id, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Progress report not found'; END IF;
END; $$;

-- 4. Public read view ---------------------------------------------------------
CREATE OR REPLACE VIEW public.v_activity_progress WITH (security_invoker = on) AS
SELECT ap.id, ap.project_id, ap.activity_id, ap.code,
       a.code AS activity_code, a.name AS activity_name,
       ap.period_type, ap.reporting_period, ap.status,
       ap.percent_complete, ap.narrative,
       ap.beneficiaries_male, ap.beneficiaries_female, ap.beneficiaries_other,
       ap.beneficiaries_pwd, ap.beneficiaries_youth,
       COALESCE(ap.beneficiaries_male, 0) + COALESCE(ap.beneficiaries_female, 0)
         + COALESCE(ap.beneficiaries_other, 0) AS beneficiaries_total,
       ap.budget_spent_vuv, ap.issues, ap.lessons_learned, ap.next_steps,
       ap.report_status, ap.review_note, ap.reviewed_by, ru.full_name AS reviewed_by_name,
       ap.reviewed_at, ap.created_by, cu.full_name AS created_by_name,
       ap.created_at, ap.updated_at
FROM merl.activity_progress ap
JOIN merl.project_activities a ON a.id = ap.activity_id
LEFT JOIN merl.users ru ON ru.id = ap.reviewed_by
LEFT JOIN merl.users cu ON cu.id = ap.created_by;

-- 5. Audit trigger ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_audit_activity_progress ON merl.activity_progress;
CREATE TRIGGER trg_audit_activity_progress
    AFTER INSERT OR UPDATE OR DELETE ON merl.activity_progress
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

-- 6. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.activity_progress   TO authenticated;
        GRANT SELECT ON public.v_activity_progress TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.create_activity_progress(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT),
            public.update_activity_progress(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT),
            public.delete_activity_progress(UUID),
            public.submit_activity_progress_for_review(UUID),
            public.review_activity_progress(UUID, TEXT, TEXT)
        TO authenticated;
        REVOKE EXECUTE ON FUNCTION
            public.create_activity_progress(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT),
            public.update_activity_progress(UUID, TEXT, TEXT, TEXT, NUMERIC, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT),
            public.delete_activity_progress(UUID),
            public.submit_activity_progress_for_review(UUID),
            public.review_activity_progress(UUID, TEXT, TEXT)
        FROM anon, public;
    END IF;
END;
$$;

COMMIT;
