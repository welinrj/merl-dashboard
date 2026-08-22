-- =============================================================================
-- MERL Dashboard – Migration 0030: DoCC Project Setup upsert RPCs
-- =============================================================================
-- Editor-gated (require_editor) upsert RPCs backing the DoCC Project Setup
-- wizard, so a single screen can create/update a project (Form 1) and its
-- indicators (Form 3) and activities (Form 5) covering the full DoCC field set
-- added in migration 0029. Objectives/outcomes/outputs (Form 2) and locations
-- (Form 7) already have create/update/upsert RPCs (0009 / 0029).
--
-- Project codes auto-generate via the existing DCC-YYYY-NNN scheme
-- (merl.next_project_code); child codes use merl.next_code / next_code_w.
-- =============================================================================

-- Form 1 — Project profile upsert (auto-code on insert, editor-gated) ---------
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
            v_code, btrim(p_name), p_acronym, p_description, COALESCE(p_status,'pipeline'), p_category,
            p_lead_agency, p_executing_agency, COALESCE(p_implementing_partners,'{}'), p_donor,
            p_funding_window, COALESCE(p_currency,'VUV'), p_budget_vuv, p_start_date, p_end_date,
            p_approval_date, p_project_type, p_primary_climate_theme, p_coverage_type,
            COALESCE(p_provinces,'{}'), COALESCE(p_islands,'{}'), COALESCE(p_area_councils,'{}'),
            COALESCE(p_communities,'{}'), p_project_manager_id, p_me_officer_id, p_finance_officer_id,
            p_est_direct_beneficiaries, p_est_indirect_beneficiaries, p_expected_primary_outcome,
            'draft'
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE merl.projects SET
            name = btrim(p_name), acronym = p_acronym, description = p_description,
            status = COALESCE(p_status, status), category = p_category, lead_agency = p_lead_agency,
            executing_agency = p_executing_agency, implementing_partners = COALESCE(p_implementing_partners,'{}'),
            donor = p_donor, funding_window = p_funding_window, currency = COALESCE(p_currency,'VUV'),
            budget_vuv = p_budget_vuv, start_date = p_start_date, end_date = p_end_date,
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

-- Form 3 — Indicator upsert (full DoCC field set, 3-digit IND code) -----------
CREATE OR REPLACE FUNCTION public.upsert_project_indicator(
    p_id UUID, p_project_id UUID, p_name TEXT,
    p_unit TEXT DEFAULT NULL, p_baseline_value NUMERIC DEFAULT NULL, p_target_value NUMERIC DEFAULT NULL,
    p_means_of_verification TEXT DEFAULT NULL, p_frequency TEXT DEFAULT NULL,
    p_indicator_level TEXT DEFAULT NULL, p_definition TEXT DEFAULT NULL,
    p_baseline_year INTEGER DEFAULT NULL, p_target_date DATE DEFAULT NULL,
    p_data_source TEXT DEFAULT NULL, p_collection_method TEXT DEFAULT NULL,
    p_responsible_officer_id UUID DEFAULT NULL, p_disaggregation TEXT DEFAULT NULL,
    p_verification_method TEXT DEFAULT NULL, p_assumptions TEXT DEFAULT NULL,
    p_objective_id UUID DEFAULT NULL, p_outcome_id UUID DEFAULT NULL, p_output_id UUID DEFAULT NULL,
    p_is_qualitative BOOLEAN DEFAULT FALSE, p_higher_is_better BOOLEAN DEFAULT TRUE
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_level TEXT; v_linked UUID;
BEGIN
    PERFORM merl.require_editor();
    IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Indicator name is required'; END IF;
    -- Derive the polymorphic linked_level/linked_id from the most specific link set.
    v_level := CASE WHEN p_output_id IS NOT NULL THEN 'output'
                    WHEN p_outcome_id IS NOT NULL THEN 'outcome'
                    WHEN p_objective_id IS NOT NULL THEN 'objective' END;
    v_linked := COALESCE(p_output_id, p_outcome_id, p_objective_id);
    IF p_id IS NULL THEN
        INSERT INTO merl.project_indicators (
            project_id, code, name, unit, baseline_value, target_value, means_of_verification, frequency,
            linked_level, linked_id, indicator_level, definition, baseline_year, target_date, data_source,
            collection_method, responsible_officer_id, disaggregation, verification_method, assumptions,
            objective_id, outcome_id, output_id, is_qualitative, higher_is_better
        ) VALUES (
            p_project_id, merl.next_code_w(p_project_id,'indicator','IND',3), btrim(p_name), p_unit,
            p_baseline_value, p_target_value, p_means_of_verification, p_frequency, v_level, v_linked,
            p_indicator_level, p_definition, p_baseline_year, p_target_date, p_data_source,
            p_collection_method, p_responsible_officer_id, p_disaggregation, p_verification_method,
            p_assumptions, p_objective_id, p_outcome_id, p_output_id,
            COALESCE(p_is_qualitative,FALSE), COALESCE(p_higher_is_better,TRUE)
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE merl.project_indicators SET
            name = btrim(p_name), unit = p_unit, baseline_value = p_baseline_value,
            target_value = p_target_value, means_of_verification = p_means_of_verification,
            frequency = p_frequency, linked_level = v_level, linked_id = v_linked,
            indicator_level = p_indicator_level, definition = p_definition, baseline_year = p_baseline_year,
            target_date = p_target_date, data_source = p_data_source, collection_method = p_collection_method,
            responsible_officer_id = p_responsible_officer_id, disaggregation = p_disaggregation,
            verification_method = p_verification_method, assumptions = p_assumptions,
            objective_id = p_objective_id, outcome_id = p_outcome_id, output_id = p_output_id,
            is_qualitative = COALESCE(p_is_qualitative,is_qualitative),
            higher_is_better = COALESCE(p_higher_is_better,higher_is_better), updated_at = NOW()
        WHERE id = p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Indicator not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

-- Form 5 — Activity upsert (full DoCC operational field set) -------------------
CREATE OR REPLACE FUNCTION public.upsert_project_activity_full(
    p_id UUID, p_output_id UUID, p_name TEXT,
    p_description TEXT DEFAULT NULL, p_responsible_officer_id UUID DEFAULT NULL, p_status TEXT DEFAULT 'not_started',
    p_outcome_id UUID DEFAULT NULL, p_responsible_org TEXT DEFAULT NULL,
    p_province TEXT DEFAULT NULL, p_island TEXT DEFAULT NULL, p_area_council TEXT DEFAULT NULL, p_community TEXT DEFAULT NULL,
    p_planned_start_date DATE DEFAULT NULL, p_planned_end_date DATE DEFAULT NULL,
    p_actual_start_date DATE DEFAULT NULL, p_actual_end_date DATE DEFAULT NULL,
    p_planned_budget NUMERIC DEFAULT NULL, p_actual_expenditure NUMERIC DEFAULT NULL,
    p_physical_progress_pct NUMERIC DEFAULT NULL, p_key_achievement TEXT DEFAULT NULL,
    p_issue_delay TEXT DEFAULT NULL, p_next_action TEXT DEFAULT NULL, p_next_action_due DATE DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor();
    IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Activity title is required'; END IF;
    IF p_id IS NULL THEN
        SELECT project_id INTO v_proj FROM merl.outputs WHERE id = p_output_id;
        IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent output not found'; END IF;
        INSERT INTO merl.project_activities (
            project_id, output_id, code, name, description, responsible_officer_id, status, outcome_id,
            responsible_org, province, island, area_council, community, planned_start_date, planned_end_date,
            actual_start_date, actual_end_date, planned_budget, actual_expenditure, physical_progress_pct,
            key_achievement, issue_delay, next_action, next_action_due
        ) VALUES (
            v_proj, p_output_id, merl.next_code_w(v_proj,'activity','ACT',3), btrim(p_name), p_description,
            p_responsible_officer_id, COALESCE(p_status,'not_started'), p_outcome_id, p_responsible_org,
            p_province, p_island, p_area_council, p_community, p_planned_start_date, p_planned_end_date,
            p_actual_start_date, p_actual_end_date, p_planned_budget, p_actual_expenditure,
            p_physical_progress_pct, p_key_achievement, p_issue_delay, p_next_action, p_next_action_due
        ) RETURNING id INTO v_id;
    ELSE
        UPDATE merl.project_activities SET
            output_id = p_output_id, name = btrim(p_name), description = p_description,
            responsible_officer_id = p_responsible_officer_id, status = COALESCE(p_status,status),
            outcome_id = p_outcome_id, responsible_org = p_responsible_org, province = p_province,
            island = p_island, area_council = p_area_council, community = p_community,
            planned_start_date = p_planned_start_date, planned_end_date = p_planned_end_date,
            actual_start_date = p_actual_start_date, actual_end_date = p_actual_end_date,
            planned_budget = p_planned_budget, actual_expenditure = p_actual_expenditure,
            physical_progress_pct = p_physical_progress_pct, key_achievement = p_key_achievement,
            issue_delay = p_issue_delay, next_action = p_next_action, next_action_due = p_next_action_due,
            updated_at = NOW()
        WHERE id = p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Activity not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

-- Assignable users (editor-gated) for officer dropdowns in the wizard. Plain
-- invoker views can't be used because merl.users RLS hides other users from
-- non-admins, so this is a SECURITY DEFINER function returning minimal fields.
CREATE OR REPLACE FUNCTION public.list_assignable_users()
RETURNS TABLE (id UUID, full_name TEXT, role TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    RETURN QUERY
        SELECT u.id, u.full_name::text, u.role::text
        FROM merl.users u WHERE u.active = TRUE ORDER BY u.full_name;
END; $$;
REVOKE EXECUTE ON FUNCTION public.list_assignable_users() FROM anon, public;

-- Grants -----------------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname IN
            ('upsert_project','upsert_project_indicator','upsert_project_activity_full','list_assignable_users')
    LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
        END IF;
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
    END LOOP;
END $$;
