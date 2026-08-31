-- =============================================================================
-- 0038_officer_names.sql — the responsible officers are written down by name.
--
-- Form 1 recorded the Project Manager, M&E Officer and Finance Officer as
-- dropdowns over merl.users, storing a UUID against each. That only works where
-- the officer already holds a portal account, and often they do not: the focal
-- point is in a partner agency, or a provincial officer, or simply has not been
-- given a login yet. The dropdowns then stand empty, and the project is filed
-- with no officer recorded against it at all. So the three become names typed
-- into the form, kept in three TEXT columns beside the existing links.
--
-- The UUID columns are deliberately NOT dropped. They are what the portal has
-- recorded until now; nothing about project access depends on them (that runs
-- through merl.project_assignments and the role model in 0031, not these
-- columns); and dropping a populated column to add a text one loses history for
-- nothing. The view keeps serving the linked account's name under the name it
-- always used (project_manager_name), and serves the typed name beside it, so a
-- project registered before this migration still shows its officer.
-- =============================================================================

BEGIN;

-- 1. The names, as entered -----------------------------------------------------
ALTER TABLE merl.projects
    ADD COLUMN IF NOT EXISTS project_manager TEXT,
    ADD COLUMN IF NOT EXISTS me_officer      TEXT,
    ADD COLUMN IF NOT EXISTS finance_officer TEXT;

COMMENT ON COLUMN merl.projects.project_manager IS
    'Project Manager / focal point as written on Form 1. Free text: the officer need not hold a portal account.';
COMMENT ON COLUMN merl.projects.me_officer IS
    'M&E Officer as written on Form 1. Free text: the officer need not hold a portal account.';
COMMENT ON COLUMN merl.projects.finance_officer IS
    'Finance Officer as written on Form 1. Free text: the officer need not hold a portal account.';

-- Carry across what the links already say, so every project already on the
-- register carries its officer into the new column at once. Doing it here, and
-- not leaving the read to fall back to the linked account's name, is what makes
-- clearing a name work: once the column is the only source, an emptied box
-- stays empty instead of the old link surfacing again on the next read.
--
-- The backfill has to step around trg_scope_projects (0035), a BEFORE UPDATE
-- row trigger calling merl.require_project_access(NEW.id), which refuses any
-- write from a caller with no portal account — and a migration, running as the
-- database owner rather than as an officer, never has one. It is disabled for
-- this one statement and put straight back. The audit trigger is deliberately
-- left running, so the backfill is recorded like any other change to these rows.
DO $$
DECLARE
    v_scoped BOOLEAN := EXISTS (
        SELECT FROM pg_trigger
        WHERE tgrelid = 'merl.projects'::regclass AND tgname = 'trg_scope_projects');
BEGIN
    IF v_scoped THEN
        ALTER TABLE merl.projects DISABLE TRIGGER trg_scope_projects;
    END IF;

    UPDATE merl.projects p SET
        project_manager = COALESCE(p.project_manager, (SELECT u.full_name FROM merl.users u WHERE u.id = p.project_manager_id)),
        me_officer      = COALESCE(p.me_officer,      (SELECT u.full_name FROM merl.users u WHERE u.id = p.me_officer_id)),
        finance_officer = COALESCE(p.finance_officer, (SELECT u.full_name FROM merl.users u WHERE u.id = p.finance_officer_id))
    WHERE p.project_manager_id IS NOT NULL
       OR p.me_officer_id IS NOT NULL
       OR p.finance_officer_id IS NOT NULL;

    IF v_scoped THEN
        ALTER TABLE merl.projects ENABLE TRIGGER trg_scope_projects;
    END IF;
END $$;

-- 2. Serve them from the read view ---------------------------------------------
-- Appended rather than written out in full: CREATE OR REPLACE VIEW may add
-- columns to the end of the list, so whatever definition the latest migration
-- left behind (0036 appends `i18n`) carries through as it stands instead of
-- being silently reverted to a copy pasted in here. The new columns are named
-- for the officer rather than *_name precisely so they can sit beside the
-- existing project_manager_name, which stays what it always was: the full name
-- of the linked portal account.
DO $$
DECLARE
    v_def TEXT;
BEGIN
    v_def := rtrim(btrim(pg_get_viewdef('public.v_projects'::regclass, true)), ';');
    EXECUTE format(
        'CREATE OR REPLACE VIEW public.v_projects WITH (security_invoker = on) AS '
        'SELECT base.*, src.project_manager, src.me_officer, src.finance_officer '
        'FROM (%s) base JOIN merl.projects src ON src.id = base.id', v_def);

    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_projects TO authenticated;
    END IF;
END $$;

-- 3. Accept them on the write path ---------------------------------------------
-- The three parameters are appended to the signature 0034 left, which makes a
-- NEW function rather than replacing the old one: Postgres matches CREATE OR
-- REPLACE on the argument types, so the 29-argument version would survive
-- alongside this 32-argument one, and every call that relies on defaults would
-- fail as "function is not unique". Every overload is therefore dropped first,
-- by lookup rather than by a signature written out here, so exactly one
-- definition is left standing. A client that has not been redeployed keeps
-- working: its 29 named arguments still resolve, the three new ones defaulting
-- to NULL.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'upsert_project'
    LOOP
        EXECUTE format('DROP FUNCTION %s', r.sig);
    END LOOP;
END $$;

CREATE FUNCTION public.upsert_project(
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
    p_expected_primary_outcome TEXT DEFAULT NULL,
    -- The responsible officers, written down by name (0038).
    p_project_manager TEXT DEFAULT NULL,
    p_me_officer TEXT DEFAULT NULL,
    p_finance_officer TEXT DEFAULT NULL
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
            project_manager, me_officer, finance_officer,
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
            NULLIF(btrim(p_project_manager),''), NULLIF(btrim(p_me_officer),''),
            NULLIF(btrim(p_finance_officer),''),
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
            expected_primary_outcome = p_expected_primary_outcome,
            project_manager = NULLIF(btrim(p_project_manager),''),
            me_officer      = NULLIF(btrim(p_me_officer),''),
            finance_officer = NULLIF(btrim(p_finance_officer),''),
            updated_at = NOW()
        WHERE id = p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Project not found'; END IF;
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
        WHERE n.nspname = 'public' AND p.proname = 'upsert_project'
    LOOP
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
        END IF;
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
    END LOOP;
END $$;

COMMIT;
