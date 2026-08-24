-- =============================================================================
-- MERL Dashboard – Migration 0034: fix NOT NULL violations in the setup RPCs
-- =============================================================================
-- Creating a project through the Project Setup wizard failed with
--
--     null value in column "budget_vuv" of relation "projects"
--     violates not-null constraint
--
-- whenever the Approved Budget field was left blank.
--
-- merl.projects declares two of the columns this RPC writes as NOT NULL with a
-- column default (migration 0007):
--
--     budget_vuv NUMERIC(18,2) NOT NULL DEFAULT 0
--     category   VARCHAR(30)   NOT NULL DEFAULT 'CC-ADAPT'
--
-- A column default only applies when the column is omitted from the INSERT or
-- given the DEFAULT keyword. Passing an explicit NULL overrides it and trips the
-- constraint. The original upsert_project in migration 0008 knew this and wrapped
-- the value in COALESCE; the rewritten version in migration 0030 dropped that for
-- both columns, so any blank Approved Budget — or blank Theme / Sector, which is
-- the same latent bug one column earlier — aborted the insert.
--
-- This restores the COALESCE on both, matching each column's declared default:
--   · INSERT — fall back to the column default (0 / 'CC-ADAPT').
--   · UPDATE — fall back to the row's existing value, so clearing a field in the
--     form never silently rewrites a stored budget to 0.
--
-- Nothing else in the function changes; the signature is identical, so no
-- frontend or PostgREST change is required for this migration to take effect.
--
-- The same class of bug is fixed in four more RPCs from migration 0009, which
-- assign `status = p_status` straight into a NOT NULL DEFAULT column:
--
--     update_objective, update_outcome, update_output   (merl.{objectives,
--         outcomes,outputs}.status — NOT NULL DEFAULT 'draft')
--     create_project_activity / update_project_activity (merl.project_
--         activities.status — NOT NULL DEFAULT 'not_started')
--
-- The first three are reachable from the wizard today: the Results Framework
-- modal's Status select is optional and sends NULL when left blank, so editing
-- an objective, outcome or output without choosing a status failed exactly the
-- way the budget did. The two activity RPCs are superseded in the UI by
-- upsert_project_activity_full (which already COALESCEs), but they remain
-- callable SECURITY DEFINER functions, so they are corrected here too rather
-- than left as a known crash.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_project(
    p_id UUID,
    p_name TEXT,
    p_acronym TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'pipeline',
    p_category TEXT DEFAULT NULL,
    p_lead_agency TEXT DEFAULT NULL,
    p_executing_agency TEXT DEFAULT NULL,
    p_implementing_partners TEXT[] DEFAULT '{}',
    p_donor TEXT DEFAULT NULL,
    p_funding_window TEXT DEFAULT NULL,
    p_currency TEXT DEFAULT 'VUV',
    p_budget_vuv NUMERIC DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_approval_date DATE DEFAULT NULL,
    p_project_type TEXT DEFAULT NULL,
    p_primary_climate_theme TEXT DEFAULT NULL,
    p_coverage_type TEXT DEFAULT NULL,
    p_provinces TEXT[] DEFAULT '{}',
    p_islands TEXT[] DEFAULT '{}',
    p_area_councils TEXT[] DEFAULT '{}',
    p_communities TEXT[] DEFAULT '{}',
    p_project_manager_id UUID DEFAULT NULL,
    p_me_officer_id UUID DEFAULT NULL,
    p_finance_officer_id UUID DEFAULT NULL,
    p_est_direct_beneficiaries INTEGER DEFAULT NULL,
    p_est_indirect_beneficiaries INTEGER DEFAULT NULL,
    p_expected_primary_outcome TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID; v_code TEXT;
BEGIN
    PERFORM merl.require_editor();
    IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Project title is required'; END IF;
    IF p_end_date IS NOT NULL AND p_start_date IS NOT NULL AND p_end_date < p_start_date THEN
        RAISE EXCEPTION 'End date cannot be earlier than start date';
    END IF;

    IF p_id IS NULL THEN
        v_code := merl.next_project_code();
        INSERT INTO merl.projects (
            code, name, acronym, description, status, category, lead_agency, executing_agency,
            implementing_partners, donor, funding_window, currency, budget_vuv, start_date, end_date,
            approval_date, project_type, primary_climate_theme, coverage_type, provinces, islands,
            area_councils, communities, project_manager_id, me_officer_id, finance_officer_id,
            est_direct_beneficiaries, est_indirect_beneficiaries, expected_primary_outcome,
            registration_status
        ) VALUES (
            -- category and budget_vuv are NOT NULL with a column default; fall back
            -- to that default rather than letting an explicit NULL abort the insert.
            v_code, btrim(p_name), p_acronym, p_description, COALESCE(p_status,'pipeline'),
            COALESCE(p_category,'CC-ADAPT'),
            p_lead_agency, p_executing_agency, COALESCE(p_implementing_partners,'{}'), p_donor,
            p_funding_window, COALESCE(p_currency,'VUV'), COALESCE(p_budget_vuv, 0), p_start_date, p_end_date,
            p_approval_date, p_project_type, p_primary_climate_theme, p_coverage_type,
            COALESCE(p_provinces,'{}'), COALESCE(p_islands,'{}'), COALESCE(p_area_councils,'{}'),
            COALESCE(p_communities,'{}'), p_project_manager_id, p_me_officer_id, p_finance_officer_id,
            p_est_direct_beneficiaries, p_est_indirect_beneficiaries, p_expected_primary_outcome,
            'draft'
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE merl.projects SET
            name = btrim(p_name), acronym = p_acronym, description = p_description,
            status = COALESCE(p_status, status),
            -- On update, keep whatever is stored when the field arrives blank, so
            -- clearing the input never silently rewrites a recorded budget to 0.
            category = COALESCE(p_category, category),
            lead_agency = p_lead_agency,
            executing_agency = p_executing_agency, implementing_partners = COALESCE(p_implementing_partners,'{}'),
            donor = p_donor, funding_window = p_funding_window, currency = COALESCE(p_currency,'VUV'),
            budget_vuv = COALESCE(p_budget_vuv, budget_vuv), start_date = p_start_date, end_date = p_end_date,
            approval_date = p_approval_date, project_type = p_project_type,
            primary_climate_theme = p_primary_climate_theme, coverage_type = p_coverage_type,
            provinces = COALESCE(p_provinces,'{}'), islands = COALESCE(p_islands,'{}'),
            area_councils = COALESCE(p_area_councils,'{}'), communities = COALESCE(p_communities,'{}'),
            project_manager_id = p_project_manager_id, me_officer_id = p_me_officer_id,
            finance_officer_id = p_finance_officer_id, est_direct_beneficiaries = p_est_direct_beneficiaries,
            est_indirect_beneficiaries = p_est_indirect_beneficiaries,
            expected_primary_outcome = p_expected_primary_outcome, updated_at = NOW()
        WHERE id = p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

-- Results Framework (0009) — status is NOT NULL DEFAULT 'draft' on all three ---
-- On update, an omitted status keeps the row's current value rather than
-- aborting; the wizard's Status select is optional and sends NULL when blank.

CREATE OR REPLACE FUNCTION public.update_objective(
    p_id UUID, p_statement TEXT,
    p_climate_theme TEXT DEFAULT NULL, p_expected_outcome TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL, p_status TEXT DEFAULT 'draft'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.objectives SET
        statement = btrim(p_statement), climate_theme = p_climate_theme,
        expected_outcome = p_expected_outcome, notes = p_notes,
        status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.update_outcome(
    p_id UUID, p_statement TEXT, p_responsible_officer_id UUID DEFAULT NULL, p_status TEXT DEFAULT 'draft'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.outcomes SET
        statement = btrim(p_statement), responsible_officer_id = p_responsible_officer_id,
        status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Outcome not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.update_output(
    p_id UUID, p_statement TEXT, p_responsible_officer_id UUID DEFAULT NULL, p_status TEXT DEFAULT 'draft'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.outputs SET
        statement = btrim(p_statement), responsible_officer_id = p_responsible_officer_id,
        status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Output not found'; END IF;
END; $$;

-- Activity RPCs (0009) — superseded in the UI by upsert_project_activity_full,
-- but still callable, so the same NULL crash is closed off here.

CREATE OR REPLACE FUNCTION public.create_project_activity(
    p_output_id UUID, p_name TEXT, p_description TEXT DEFAULT NULL,
    p_responsible_officer_id UUID DEFAULT NULL, p_status TEXT DEFAULT 'not_started'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor();
    SELECT project_id INTO v_proj FROM merl.outputs WHERE id = p_output_id;
    IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent output not found'; END IF;
    INSERT INTO merl.project_activities (project_id, output_id, code, name, description, responsible_officer_id, status)
    VALUES (v_proj, p_output_id, merl.next_code(v_proj, 'activity', 'ACT'),
            btrim(p_name), p_description, p_responsible_officer_id, COALESCE(p_status, 'not_started'))
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_project_activity(
    p_id UUID, p_name TEXT, p_description TEXT DEFAULT NULL,
    p_responsible_officer_id UUID DEFAULT NULL, p_status TEXT DEFAULT 'not_started'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.project_activities SET
        name = btrim(p_name), description = p_description,
        responsible_officer_id = p_responsible_officer_id,
        status = COALESCE(p_status, status), updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activity not found'; END IF;
END; $$;

COMMIT;
