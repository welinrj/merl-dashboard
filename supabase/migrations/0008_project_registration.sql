-- =============================================================================
-- MERL Dashboard – Migration 0008: FRM-01 Project Registration
-- =============================================================================
-- Extends merl.projects into the full "Project Registration" master record
-- defined by DoCC form FRM-01 (Draft v2.0). All new columns are nullable so
-- existing rows and the current admin_create_project / admin_update_project
-- calls from the Admin Panel keep working unchanged.
--
-- Also:
--   * relaxes the project status CHECK to the FRM-01 status list (lowercase
--     tokens so existing 'active'/'completed'/'suspended' rows stay valid);
--   * drop+recreates the two project RPCs with the extra FRM-01 fields appended
--     as defaulted parameters, and auto-generates a DCC-YYYY-### Project ID when
--     no code is supplied;
--   * adds submit-for-review / review RPCs for the FRM-01 approval workflow;
--   * rebuilds public.v_projects with the full column set + officer names;
--   * wires the (previously missing) audit trigger on merl.projects.
-- =============================================================================

BEGIN;

-- 1. Extend merl.projects -----------------------------------------------------
ALTER TABLE merl.projects
    ADD COLUMN IF NOT EXISTS acronym                  VARCHAR(60),
    ADD COLUMN IF NOT EXISTS project_type             VARCHAR(60),
    ADD COLUMN IF NOT EXISTS primary_climate_theme    VARCHAR(120),
    ADD COLUMN IF NOT EXISTS secondary_climate_themes TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS expected_primary_outcome VARCHAR(120),
    ADD COLUMN IF NOT EXISTS nsdp_alignment           TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS sdg_alignment            TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS coverage_type            VARCHAR(40),
    ADD COLUMN IF NOT EXISTS islands                  TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS area_councils            TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS communities              TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS donor                    VARCHAR(120),
    ADD COLUMN IF NOT EXISTS funding_window           VARCHAR(255),
    ADD COLUMN IF NOT EXISTS currency                 VARCHAR(10) NOT NULL DEFAULT 'VUV',
    ADD COLUMN IF NOT EXISTS executing_agency         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS implementing_partners    TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS project_manager_id       UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS me_officer_id            UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS finance_officer_id       UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approval_date            DATE,
    ADD COLUMN IF NOT EXISTS est_direct_beneficiaries   INTEGER CHECK (est_direct_beneficiaries   IS NULL OR est_direct_beneficiaries   >= 0),
    ADD COLUMN IF NOT EXISTS est_indirect_beneficiaries INTEGER CHECK (est_indirect_beneficiaries IS NULL OR est_indirect_beneficiaries >= 0),
    ADD COLUMN IF NOT EXISTS expected_households        INTEGER CHECK (expected_households        IS NULL OR expected_households        >= 0),
    ADD COLUMN IF NOT EXISTS expected_communities       INTEGER CHECK (expected_communities       IS NULL OR expected_communities       >= 0),
    ADD COLUMN IF NOT EXISTS registration_status      VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (registration_status IN ('draft', 'pending_review', 'approved', 'returned')),
    ADD COLUMN IF NOT EXISTS review_note              TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by              UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at              TIMESTAMPTZ;

-- Relax the operational status CHECK to the FRM-01 Project Status list. Stored
-- as lowercase tokens; the UI maps them to display labels. Existing rows use
-- 'active'/'completed'/'suspended', all of which remain valid.
ALTER TABLE merl.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE merl.projects
    ADD CONSTRAINT projects_status_check CHECK (status IN (
        'planning', 'not_started', 'active', 'on_hold', 'completed', 'suspended', 'cancelled'
    ));

-- 2. Project-ID generator (DCC-YYYY-###) --------------------------------------
-- Only used when a project is registered without an explicit code. Existing
-- programme codes (VCCRP-001 etc.) are preserved because they pass an explicit
-- code. Serialised with a transaction-level advisory lock to avoid races.
CREATE OR REPLACE FUNCTION merl.next_project_code(p_year INTEGER DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_year   INTEGER := COALESCE(p_year, EXTRACT(YEAR FROM NOW())::INTEGER);
    v_prefix TEXT;
    v_next   INTEGER;
BEGIN
    v_prefix := 'DCC-' || v_year || '-';
    PERFORM pg_advisory_xact_lock(hashtext('project_code:' || v_year));
    SELECT COALESCE(MAX(substring(code FROM '\d+$')::INTEGER), 0) + 1
      INTO v_next
      FROM merl.projects
     WHERE code LIKE v_prefix || '%';
    RETURN v_prefix || lpad(v_next::TEXT, 3, '0');
END;
$$;

-- 3. Rebuild the project RPCs with FRM-01 fields ------------------------------
-- Drop the old signatures first (params are appended, changing the signature).
DROP FUNCTION IF EXISTS public.admin_create_project(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[]);
DROP FUNCTION IF EXISTS public.admin_update_project(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[]);

CREATE FUNCTION public.admin_create_project(
    -- original parameters (unchanged order/names) --------------------------
    p_code        TEXT,
    p_name        TEXT,
    p_category    TEXT,
    p_lead_agency TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_start_date  DATE DEFAULT NULL,
    p_end_date    DATE DEFAULT NULL,
    p_budget_vuv  NUMERIC DEFAULT 0,
    p_status      TEXT DEFAULT 'active',
    p_provinces   TEXT[] DEFAULT '{}',
    -- FRM-01 additions (all optional) --------------------------------------
    p_acronym                  TEXT    DEFAULT NULL,
    p_project_type             TEXT    DEFAULT NULL,
    p_primary_climate_theme    TEXT    DEFAULT NULL,
    p_secondary_climate_themes TEXT[]  DEFAULT '{}',
    p_expected_primary_outcome TEXT    DEFAULT NULL,
    p_nsdp_alignment           TEXT[]  DEFAULT '{}',
    p_sdg_alignment            TEXT[]  DEFAULT '{}',
    p_coverage_type            TEXT    DEFAULT NULL,
    p_islands                  TEXT[]  DEFAULT '{}',
    p_area_councils            TEXT[]  DEFAULT '{}',
    p_communities              TEXT[]  DEFAULT '{}',
    p_donor                    TEXT    DEFAULT NULL,
    p_funding_window           TEXT    DEFAULT NULL,
    p_currency                 TEXT    DEFAULT 'VUV',
    p_executing_agency         TEXT    DEFAULT NULL,
    p_implementing_partners    TEXT[]  DEFAULT '{}',
    p_project_manager_id       UUID    DEFAULT NULL,
    p_me_officer_id            UUID    DEFAULT NULL,
    p_finance_officer_id       UUID    DEFAULT NULL,
    p_approval_date            DATE    DEFAULT NULL,
    p_est_direct_beneficiaries   INTEGER DEFAULT NULL,
    p_est_indirect_beneficiaries INTEGER DEFAULT NULL,
    p_expected_households        INTEGER DEFAULT NULL,
    p_expected_communities       INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_id   UUID;
    v_code TEXT;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    -- Auto-generate a Project ID when none was supplied (FRM-01 rule).
    IF p_code IS NULL OR btrim(p_code) = '' THEN
        v_code := merl.next_project_code();
    ELSE
        v_code := upper(btrim(p_code));
    END IF;

    INSERT INTO merl.projects (
        code, name, category, lead_agency, description,
        start_date, end_date, budget_vuv, status, provinces,
        acronym, project_type, primary_climate_theme, secondary_climate_themes,
        expected_primary_outcome, nsdp_alignment, sdg_alignment,
        coverage_type, islands, area_councils, communities,
        donor, funding_window, currency, executing_agency, implementing_partners,
        project_manager_id, me_officer_id, finance_officer_id,
        approval_date, est_direct_beneficiaries, est_indirect_beneficiaries,
        expected_households, expected_communities
    ) VALUES (
        v_code, btrim(p_name), p_category, p_lead_agency, p_description,
        p_start_date, p_end_date, COALESCE(p_budget_vuv, 0), p_status, COALESCE(p_provinces, '{}'),
        p_acronym, p_project_type, p_primary_climate_theme, COALESCE(p_secondary_climate_themes, '{}'),
        p_expected_primary_outcome, COALESCE(p_nsdp_alignment, '{}'), COALESCE(p_sdg_alignment, '{}'),
        p_coverage_type, COALESCE(p_islands, '{}'), COALESCE(p_area_councils, '{}'), COALESCE(p_communities, '{}'),
        p_donor, p_funding_window, COALESCE(p_currency, 'VUV'), p_executing_agency, COALESCE(p_implementing_partners, '{}'),
        p_project_manager_id, p_me_officer_id, p_finance_officer_id,
        p_approval_date, p_est_direct_beneficiaries, p_est_indirect_beneficiaries,
        p_expected_households, p_expected_communities
    )
    RETURNING id INTO v_id;

    RETURN v_id;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A project with code "%" already exists.', v_code;
END;
$$;

CREATE FUNCTION public.admin_update_project(
    p_id          UUID,
    p_name        TEXT,
    p_category    TEXT,
    p_lead_agency TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_start_date  DATE DEFAULT NULL,
    p_end_date    DATE DEFAULT NULL,
    p_budget_vuv  NUMERIC DEFAULT 0,
    p_status      TEXT DEFAULT 'active',
    p_provinces   TEXT[] DEFAULT '{}',
    p_acronym                  TEXT    DEFAULT NULL,
    p_project_type             TEXT    DEFAULT NULL,
    p_primary_climate_theme    TEXT    DEFAULT NULL,
    p_secondary_climate_themes TEXT[]  DEFAULT '{}',
    p_expected_primary_outcome TEXT    DEFAULT NULL,
    p_nsdp_alignment           TEXT[]  DEFAULT '{}',
    p_sdg_alignment            TEXT[]  DEFAULT '{}',
    p_coverage_type            TEXT    DEFAULT NULL,
    p_islands                  TEXT[]  DEFAULT '{}',
    p_area_councils            TEXT[]  DEFAULT '{}',
    p_communities              TEXT[]  DEFAULT '{}',
    p_donor                    TEXT    DEFAULT NULL,
    p_funding_window           TEXT    DEFAULT NULL,
    p_currency                 TEXT    DEFAULT 'VUV',
    p_executing_agency         TEXT    DEFAULT NULL,
    p_implementing_partners    TEXT[]  DEFAULT '{}',
    p_project_manager_id       UUID    DEFAULT NULL,
    p_me_officer_id            UUID    DEFAULT NULL,
    p_finance_officer_id       UUID    DEFAULT NULL,
    p_approval_date            DATE    DEFAULT NULL,
    p_est_direct_beneficiaries   INTEGER DEFAULT NULL,
    p_est_indirect_beneficiaries INTEGER DEFAULT NULL,
    p_expected_households        INTEGER DEFAULT NULL,
    p_expected_communities       INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    UPDATE merl.projects SET
        name        = btrim(p_name),
        category    = p_category,
        lead_agency = p_lead_agency,
        description = p_description,
        start_date  = p_start_date,
        end_date    = p_end_date,
        budget_vuv  = COALESCE(p_budget_vuv, 0),
        status      = p_status,
        provinces   = COALESCE(p_provinces, '{}'),
        acronym                  = p_acronym,
        project_type             = p_project_type,
        primary_climate_theme    = p_primary_climate_theme,
        secondary_climate_themes = COALESCE(p_secondary_climate_themes, '{}'),
        expected_primary_outcome = p_expected_primary_outcome,
        nsdp_alignment           = COALESCE(p_nsdp_alignment, '{}'),
        sdg_alignment            = COALESCE(p_sdg_alignment, '{}'),
        coverage_type            = p_coverage_type,
        islands                  = COALESCE(p_islands, '{}'),
        area_councils            = COALESCE(p_area_councils, '{}'),
        communities              = COALESCE(p_communities, '{}'),
        donor                    = p_donor,
        funding_window           = p_funding_window,
        currency                 = COALESCE(p_currency, 'VUV'),
        executing_agency         = p_executing_agency,
        implementing_partners    = COALESCE(p_implementing_partners, '{}'),
        project_manager_id       = p_project_manager_id,
        me_officer_id            = p_me_officer_id,
        finance_officer_id       = p_finance_officer_id,
        approval_date            = p_approval_date,
        est_direct_beneficiaries   = p_est_direct_beneficiaries,
        est_indirect_beneficiaries = p_est_indirect_beneficiaries,
        expected_households        = p_expected_households,
        expected_communities       = p_expected_communities,
        updated_at  = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found';
    END IF;
END;
$$;

-- 4. Approval workflow RPCs (FRM-01 "Reviewed by") ----------------------------
-- The manager who completes registration submits it; a senior/M&E reviewer then
-- approves or returns it. Submit is open to any signed-in user who owns the
-- workflow; review is restricted to senior/M&E/admin roles.
CREATE OR REPLACE FUNCTION public.submit_project_for_review(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
BEGIN
    IF merl.current_db_user() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    UPDATE merl.projects
       SET registration_status = 'pending_review', review_note = NULL, updated_at = NOW()
     WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_project(
    p_id       UUID,
    p_decision TEXT,             -- 'approved' | 'returned'
    p_note     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('administrator', 'docc_senior_officer', 'docc_me_officer') THEN
        RAISE EXCEPTION 'Reviewer access required';
    END IF;
    IF p_decision NOT IN ('approved', 'returned') THEN
        RAISE EXCEPTION 'Decision must be approved or returned';
    END IF;

    UPDATE merl.projects
       SET registration_status = p_decision,
           review_note = p_note,
           reviewed_by = v_user.id,
           reviewed_at = NOW(),
           updated_at  = NOW()
     WHERE id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found';
    END IF;
END;
$$;

-- 5. Rebuild the public read view --------------------------------------------
CREATE OR REPLACE VIEW public.v_projects
WITH (security_invoker = on) AS
SELECT
    p.id, p.code, p.name, p.category, p.lead_agency, p.description,
    p.start_date, p.end_date, p.budget_vuv, p.spent_vuv, p.status, p.provinces,
    p.acronym, p.project_type, p.primary_climate_theme, p.secondary_climate_themes,
    p.expected_primary_outcome, p.nsdp_alignment, p.sdg_alignment,
    p.coverage_type, p.islands, p.area_councils, p.communities,
    p.donor, p.funding_window, p.currency, p.executing_agency, p.implementing_partners,
    p.project_manager_id, pm.full_name AS project_manager_name,
    p.me_officer_id,      me.full_name AS me_officer_name,
    p.finance_officer_id, fo.full_name AS finance_officer_name,
    p.approval_date, p.est_direct_beneficiaries, p.est_indirect_beneficiaries,
    p.expected_households, p.expected_communities,
    p.registration_status, p.review_note, p.reviewed_by, p.reviewed_at,
    p.created_at, p.updated_at
FROM merl.projects p
LEFT JOIN merl.users pm ON pm.id = p.project_manager_id
LEFT JOIN merl.users me ON me.id = p.me_officer_id
LEFT JOIN merl.users fo ON fo.id = p.finance_officer_id;

-- 6. Audit trigger on merl.projects (was missing in 0007) ---------------------
DROP TRIGGER IF EXISTS trg_audit_projects ON merl.projects;
CREATE TRIGGER trg_audit_projects
    AFTER INSERT OR UPDATE OR DELETE ON merl.projects
    FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger();

-- 7. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.projects TO authenticated;   -- security_invoker view
        GRANT SELECT ON public.v_projects TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.admin_create_project(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[],
                TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT[], TEXT[], TEXT, TEXT[], TEXT[], TEXT[],
                TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, UUID, UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER),
            public.admin_update_project(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[],
                TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT[], TEXT[], TEXT, TEXT[], TEXT[], TEXT[],
                TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, UUID, UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER),
            public.submit_project_for_review(UUID),
            public.review_project(UUID, TEXT, TEXT)
        TO authenticated;
        REVOKE EXECUTE ON FUNCTION
            public.admin_create_project(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[],
                TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT[], TEXT[], TEXT, TEXT[], TEXT[], TEXT[],
                TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, UUID, UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER),
            public.admin_update_project(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[],
                TEXT, TEXT, TEXT, TEXT[], TEXT, TEXT[], TEXT[], TEXT, TEXT[], TEXT[], TEXT[],
                TEXT, TEXT, TEXT, TEXT, TEXT[], UUID, UUID, UUID, DATE, INTEGER, INTEGER, INTEGER, INTEGER),
            public.submit_project_for_review(UUID),
            public.review_project(UUID, TEXT, TEXT)
        FROM anon, public;
    END IF;

    IF EXISTS (SELECT FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- idempotent: ignore if merl.projects is already in the publication
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE merl.projects;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    END IF;
END;
$$;

COMMIT;
