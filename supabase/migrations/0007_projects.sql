-- =============================================================================
-- MERL Dashboard – Migration 0007: programme projects + admin management
-- =============================================================================
-- Adds a first-class `projects` register (distinct from the work-plan
-- activities/"components") and exposes it to the frontend the same way as user
-- management: a public security_invoker view for reads, and SECURITY DEFINER,
-- admin-guarded RPCs for create / update / delete. This replaces the Admin
-- Panel's previous in-memory mock list with real, persistent records.
-- =============================================================================

BEGIN;

-- 1. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.projects (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code         VARCHAR(30)  NOT NULL UNIQUE,
    name         VARCHAR(500) NOT NULL,
    category     VARCHAR(30)  NOT NULL DEFAULT 'CC-ADAPT',
    lead_agency  VARCHAR(255),
    description  TEXT,
    start_date   DATE,
    end_date     DATE,
    budget_vuv   NUMERIC(18, 2) NOT NULL DEFAULT 0,
    spent_vuv    NUMERIC(18, 2) NOT NULL DEFAULT 0,
    status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'suspended')),
    provinces    TEXT[]       NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT projects_dates_check CHECK (
        end_date IS NULL OR start_date IS NULL OR end_date >= start_date
    )
);

COMMENT ON TABLE merl.projects IS 'Programme projects register (managed from the Admin Panel).';

-- 2. RLS ----------------------------------------------------------------------
-- All signed-in users may read; every write goes through the admin-guarded
-- RPCs below (SECURITY DEFINER), so no direct write policies are defined.
ALTER TABLE merl.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON merl.projects
    FOR SELECT
    USING ( merl.current_db_user() IS NOT NULL );

-- 3. Public read view ---------------------------------------------------------
CREATE OR REPLACE VIEW public.v_projects
WITH (security_invoker = on) AS
SELECT
    p.id,
    p.code,
    p.name,
    p.category,
    p.lead_agency,
    p.description,
    p.start_date,
    p.end_date,
    p.budget_vuv,
    p.spent_vuv,
    p.status,
    p.provinces,
    p.created_at,
    p.updated_at
FROM merl.projects p;

-- 4. Admin-guarded RPCs -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_project(
    p_code        TEXT,
    p_name        TEXT,
    p_category    TEXT,
    p_lead_agency TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_start_date  DATE DEFAULT NULL,
    p_end_date    DATE DEFAULT NULL,
    p_budget_vuv  NUMERIC DEFAULT 0,
    p_status      TEXT DEFAULT 'active',
    p_provinces   TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_id UUID;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    INSERT INTO merl.projects (
        code, name, category, lead_agency, description,
        start_date, end_date, budget_vuv, status, provinces
    ) VALUES (
        upper(trim(p_code)), trim(p_name), p_category, p_lead_agency, p_description,
        p_start_date, p_end_date, COALESCE(p_budget_vuv, 0), p_status, COALESCE(p_provinces, '{}')
    )
    RETURNING id INTO v_id;

    RETURN v_id;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'A project with code "%" already exists.', upper(trim(p_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_project(
    p_id          UUID,
    p_name        TEXT,
    p_category    TEXT,
    p_lead_agency TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_start_date  DATE DEFAULT NULL,
    p_end_date    DATE DEFAULT NULL,
    p_budget_vuv  NUMERIC DEFAULT 0,
    p_status      TEXT DEFAULT 'active',
    p_provinces   TEXT[] DEFAULT '{}'
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
        name        = trim(p_name),
        category    = p_category,
        lead_agency = p_lead_agency,
        description = p_description,
        start_date  = p_start_date,
        end_date    = p_end_date,
        budget_vuv  = COALESCE(p_budget_vuv, 0),
        status      = p_status,
        provinces   = COALESCE(p_provinces, '{}'),
        updated_at  = NOW()
    WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_project(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    DELETE FROM merl.projects WHERE id = p_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found';
    END IF;
END;
$$;

-- 5. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_projects TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.admin_create_project(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[]),
            public.admin_update_project(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[]),
            public.admin_delete_project(UUID)
        TO authenticated;
        REVOKE EXECUTE ON FUNCTION
            public.admin_create_project(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[]),
            public.admin_update_project(UUID, TEXT, TEXT, TEXT, TEXT, DATE, DATE, NUMERIC, TEXT, TEXT[]),
            public.admin_delete_project(UUID)
        FROM anon, public;
    END IF;
END;
$$;

-- 6. Seed the two existing programme projects (idempotent) --------------------
INSERT INTO merl.projects (code, name, category, lead_agency, budget_vuv, status, provinces)
VALUES
    ('VCCRP-001', 'Vanuatu Community Climate Resilience Project', 'CC-RESIL', 'DoCC',
     95000000, 'active', ARRAY['Shefa', 'Sanma', 'Penama', 'Tafea']),
    ('VCAP2-001', 'Vanuatu Climate Adaptation Project Phase 2', 'CC-ADAPT', 'DoCC / MALFFB',
     120000000, 'active', ARRAY['Shefa', 'Sanma', 'Penama', 'Malampa', 'Torba', 'Tafea'])
ON CONFLICT (code) DO NOTHING;

COMMIT;
