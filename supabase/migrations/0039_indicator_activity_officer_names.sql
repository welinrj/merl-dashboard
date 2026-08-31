-- =============================================================================
-- 0039_indicator_activity_officer_names.sql — the responsible officer on an
-- indicator and on an activity is written down by name too.
--
-- 0038 did this for the three officers on the project profile. Forms 3 and 5
-- carry the same field and had the same problem: a dropdown over merl.users,
-- so the officer responsible for collecting an indicator, or for running an
-- activity, could only be recorded if they already held a portal account. The
-- field stood empty for everyone else.
--
-- Same shape as 0038 throughout: a TEXT column beside the existing link, the
-- link left in place, the typed name appended to the read view, and the upsert
-- RPC extended to write it.
-- =============================================================================

BEGIN;

-- 1. The names, as entered -----------------------------------------------------
ALTER TABLE merl.project_indicators ADD COLUMN IF NOT EXISTS responsible_officer TEXT;
ALTER TABLE merl.project_activities ADD COLUMN IF NOT EXISTS responsible_officer TEXT;

COMMENT ON COLUMN merl.project_indicators.responsible_officer IS
    'Officer responsible for this indicator, as written on Form 3. Free text: they need not hold a portal account.';
COMMENT ON COLUMN merl.project_activities.responsible_officer IS
    'Officer responsible for this activity, as written on Form 5. Free text: they need not hold a portal account.';

-- Carry across what the links already say, so every row on the register keeps
-- its officer. As in 0038, this steps around the scope trigger from 0035 — a
-- BEFORE UPDATE row trigger that refuses writes from a caller without a portal
-- account, which a migration never has — and puts it straight back. The audit
-- triggers, and the indicator parentage check, are deliberately left running:
-- neither objects to this update, and both are worth keeping honest.
DO $$
DECLARE
    r        RECORD;
    v_scoped BOOLEAN;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('project_indicators', 'trg_scope_project_indicators'),
            ('project_activities', 'trg_scope_project_activities')
        ) AS t(tbl, trg)
    LOOP
        v_scoped := EXISTS (
            SELECT FROM pg_trigger
            WHERE tgrelid = ('merl.' || r.tbl)::regclass AND tgname = r.trg);

        IF v_scoped THEN
            EXECUTE format('ALTER TABLE merl.%I DISABLE TRIGGER %I', r.tbl, r.trg);
        END IF;

        EXECUTE format($sql$
            UPDATE merl.%I x SET responsible_officer = COALESCE(
                x.responsible_officer,
                (SELECT u.full_name FROM merl.users u WHERE u.id = x.responsible_officer_id))
            WHERE x.responsible_officer_id IS NOT NULL
        $sql$, r.tbl);

        IF v_scoped THEN
            EXECUTE format('ALTER TABLE merl.%I ENABLE TRIGGER %I', r.tbl, r.trg);
        END IF;
    END LOOP;
END $$;

-- 2. Serve them from the read views ---------------------------------------------
-- Appended to whatever definition the latest migration left behind, rather than
-- written out here — the same reasoning as 0038. v_project_activities already
-- carries responsible_officer_name (the linked account's name from 0009);
-- v_project_indicators never did, which is why its form had nothing to show
-- when the dropdown came up empty.
DO $$
DECLARE
    r     RECORD;
    v_def TEXT;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('v_project_indicators', 'project_indicators'),
            ('v_project_activities', 'project_activities')
        ) AS t(view_name, tbl)
    LOOP
        v_def := rtrim(btrim(pg_get_viewdef(('public.' || r.view_name)::regclass, true)), ';');
        EXECUTE format(
            'CREATE OR REPLACE VIEW public.%I WITH (security_invoker = on) AS '
            'SELECT base.*, src.responsible_officer '
            'FROM (%s) base LEFT JOIN merl.%I src ON src.id = base.id',
            r.view_name, v_def, r.tbl);

        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('GRANT SELECT ON public.%I TO authenticated', r.view_name);
        END IF;
    END LOOP;
END $$;

-- 3. Accept them on the write path ---------------------------------------------
-- Appending a parameter makes a new function rather than replacing the old one,
-- so both RPCs have every overload dropped first and exactly one definition left
-- standing. A client that has not been redeployed keeps working: its arguments
-- still resolve, the new one defaulting to NULL.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('upsert_project_indicator', 'upsert_project_activity_full')
    LOOP
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END $$;

-- Form 3 — indicators ----------------------------------------------------------
CREATE FUNCTION public.upsert_project_indicator(
    p_id UUID, p_project_id UUID, p_name TEXT,
    p_unit TEXT DEFAULT NULL, p_baseline_value NUMERIC DEFAULT NULL,
    p_target_value NUMERIC DEFAULT NULL, p_means_of_verification TEXT DEFAULT NULL,
    p_frequency TEXT DEFAULT NULL, p_indicator_level TEXT DEFAULT NULL,
    p_definition TEXT DEFAULT NULL, p_baseline_year INTEGER DEFAULT NULL,
    p_target_date DATE DEFAULT NULL, p_data_source TEXT DEFAULT NULL,
    p_collection_method TEXT DEFAULT NULL, p_responsible_officer_id UUID DEFAULT NULL,
    p_disaggregation TEXT DEFAULT NULL, p_verification_method TEXT DEFAULT NULL,
    p_assumptions TEXT DEFAULT NULL, p_objective_id UUID DEFAULT NULL,
    p_outcome_id UUID DEFAULT NULL, p_output_id UUID DEFAULT NULL,
    p_is_qualitative BOOLEAN DEFAULT FALSE, p_higher_is_better BOOLEAN DEFAULT TRUE,
    -- The responsible officer, written down by name (0039).
    p_responsible_officer TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_level TEXT; v_linked UUID;
BEGIN
    PERFORM merl.require_editor();
    IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Indicator name is required'; END IF;
    v_level := CASE WHEN p_output_id IS NOT NULL THEN 'output'
                    WHEN p_outcome_id IS NOT NULL THEN 'outcome'
                    WHEN p_objective_id IS NOT NULL THEN 'objective' END;
    v_linked := COALESCE(p_output_id, p_outcome_id, p_objective_id);
    IF p_id IS NULL THEN
        INSERT INTO merl.project_indicators (
            project_id, code, name, unit, baseline_value, target_value, means_of_verification, frequency,
            linked_level, linked_id, indicator_level, definition, baseline_year, target_date, data_source,
            collection_method, responsible_officer_id, disaggregation, verification_method, assumptions,
            objective_id, outcome_id, output_id, is_qualitative, higher_is_better, responsible_officer
        ) VALUES (
            p_project_id, merl.next_code_w(p_project_id,'indicator','IND',3), btrim(p_name), p_unit,
            p_baseline_value, p_target_value, p_means_of_verification, p_frequency, v_level, v_linked,
            p_indicator_level, p_definition, p_baseline_year, p_target_date, p_data_source,
            p_collection_method, p_responsible_officer_id, p_disaggregation, p_verification_method,
            p_assumptions, p_objective_id, p_outcome_id, p_output_id,
            COALESCE(p_is_qualitative,FALSE), COALESCE(p_higher_is_better,TRUE),
            NULLIF(btrim(p_responsible_officer),'')
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
            higher_is_better = COALESCE(p_higher_is_better,higher_is_better),
            responsible_officer = NULLIF(btrim(p_responsible_officer),''),
            updated_at = NOW()
        WHERE id = p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Indicator not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

-- Form 5 — activities ----------------------------------------------------------
CREATE FUNCTION public.upsert_project_activity_full(
    p_id UUID, p_output_id UUID, p_name TEXT,
    p_description TEXT DEFAULT NULL, p_responsible_officer_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT 'not_started', p_outcome_id UUID DEFAULT NULL,
    p_responsible_org TEXT DEFAULT NULL, p_province TEXT DEFAULT NULL,
    p_island TEXT DEFAULT NULL, p_area_council TEXT DEFAULT NULL,
    p_community TEXT DEFAULT NULL, p_planned_start_date DATE DEFAULT NULL,
    p_planned_end_date DATE DEFAULT NULL, p_actual_start_date DATE DEFAULT NULL,
    p_actual_end_date DATE DEFAULT NULL, p_planned_budget NUMERIC DEFAULT NULL,
    p_actual_expenditure NUMERIC DEFAULT NULL, p_physical_progress_pct NUMERIC DEFAULT NULL,
    p_key_achievement TEXT DEFAULT NULL, p_issue_delay TEXT DEFAULT NULL,
    p_next_action TEXT DEFAULT NULL, p_next_action_due DATE DEFAULT NULL,
    -- The responsible officer, written down by name (0039).
    p_responsible_officer TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor('activities.edit');
    IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'Activity title is required'; END IF;
    IF p_id IS NULL THEN
        SELECT project_id INTO v_proj FROM merl.outputs WHERE id = p_output_id;
        IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent output not found'; END IF;
        INSERT INTO merl.project_activities (
            project_id, output_id, code, name, description, responsible_officer_id, status, outcome_id,
            responsible_org, province, island, area_council, community, planned_start_date, planned_end_date,
            actual_start_date, actual_end_date, planned_budget, actual_expenditure, physical_progress_pct,
            key_achievement, issue_delay, next_action, next_action_due, responsible_officer
        ) VALUES (
            v_proj, p_output_id, merl.next_code_w(v_proj,'activity','ACT',3), btrim(p_name), p_description,
            p_responsible_officer_id, COALESCE(p_status,'not_started'), p_outcome_id, p_responsible_org,
            p_province, p_island, p_area_council, p_community, p_planned_start_date, p_planned_end_date,
            p_actual_start_date, p_actual_end_date, p_planned_budget, p_actual_expenditure,
            p_physical_progress_pct, p_key_achievement, p_issue_delay, p_next_action, p_next_action_due,
            NULLIF(btrim(p_responsible_officer),'')
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
            responsible_officer = NULLIF(btrim(p_responsible_officer),''),
            updated_at = NOW()
        WHERE id = p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Activity not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

-- Grants — the same lookup the rest of the setup RPCs use (0030).
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('upsert_project_indicator', 'upsert_project_activity_full')
    LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
        END IF;
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
    END LOOP;
END $$;

COMMIT;
