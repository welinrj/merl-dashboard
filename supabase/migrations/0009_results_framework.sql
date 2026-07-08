-- =============================================================================
-- MERL Dashboard – Migration 0009: FRM-02 Results Framework Builder
-- =============================================================================
-- Adds the per-project Results-Based Management hierarchy defined by DoCC form
-- FRM-02: Objective → Outcome → Output → Activity, plus an Indicator register
-- that may link to any level. Every record is scoped to a merl.projects row and
-- carries an auto-generated, project-unique short code (OBJ-01, OUT-01, OP-01,
-- ACT-01, IND-01). Users never type codes — they are generated server-side.
--
-- Writes go exclusively through SECURITY DEFINER RPCs (role-gated to
-- administrator / docc_me_officer / project_manager); tables expose only a
-- SELECT policy to signed-in users, read through public.v_* views.
-- =============================================================================

BEGIN;

-- 1. Per-project code counter -------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.code_counters (
    project_id   UUID    NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    record_type  TEXT    NOT NULL,
    last_number  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, record_type)
);

COMMENT ON TABLE merl.code_counters IS
    'Monotonic per-project counters backing FRM auto-codes; codes are never reused after delete.';

-- Atomically claim the next number for a record type within a project and
-- return the formatted short code, e.g. next_code(<proj>, ''objective'', ''OBJ'') -> ''OBJ-03''.
CREATE OR REPLACE FUNCTION merl.next_code(
    p_project_id UUID, p_record_type TEXT, p_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_n INTEGER;
BEGIN
    INSERT INTO merl.code_counters (project_id, record_type, last_number)
    VALUES (p_project_id, p_record_type, 1)
    ON CONFLICT (project_id, record_type)
    DO UPDATE SET last_number = merl.code_counters.last_number + 1
    RETURNING last_number INTO v_n;

    RETURN p_prefix || '-' || lpad(v_n::TEXT, 2, '0');
END;
$$;

-- 2. Hierarchy tables ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.objectives (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID        NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    code           VARCHAR(30) NOT NULL,
    statement      TEXT        NOT NULL,
    climate_theme  VARCHAR(120),
    expected_outcome VARCHAR(120),
    notes          TEXT,
    status         VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'approved', 'archived')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS merl.outcomes (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID        NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    objective_id   UUID        NOT NULL REFERENCES merl.objectives (id) ON DELETE CASCADE,
    code           VARCHAR(30) NOT NULL,
    statement      TEXT        NOT NULL,
    responsible_officer_id UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'approved', 'archived')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS merl.outputs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID        NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    outcome_id     UUID        NOT NULL REFERENCES merl.outcomes (id) ON DELETE CASCADE,
    code           VARCHAR(30) NOT NULL,
    statement      TEXT        NOT NULL,
    responsible_officer_id UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'approved', 'archived')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS merl.project_activities (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID        NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    output_id      UUID        NOT NULL REFERENCES merl.outputs (id) ON DELETE CASCADE,
    code           VARCHAR(30) NOT NULL,
    name           VARCHAR(500) NOT NULL,
    description    TEXT,
    responsible_officer_id UUID REFERENCES merl.users (id) ON DELETE SET NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'not_started'
                   CHECK (status IN ('not_started', 'in_progress', 'completed', 'delayed', 'cancelled')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS merl.project_indicators (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID        NOT NULL REFERENCES merl.projects (id) ON DELETE CASCADE,
    code           VARCHAR(30) NOT NULL,
    name           VARCHAR(500) NOT NULL,
    unit           VARCHAR(100),
    baseline_value NUMERIC(18, 4),
    target_value   NUMERIC(18, 4),
    means_of_verification TEXT,
    frequency      VARCHAR(40),
    -- Polymorphic link to the level this indicator measures (objective /
    -- outcome / output / activity), following the merl.document_uploads pattern.
    linked_level   VARCHAR(20) CHECK (linked_level IN ('objective', 'outcome', 'output', 'activity')),
    linked_id      UUID,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, code)
);

-- 3. RLS: signed-in users may read; writes only via the RPCs below ------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['objectives','outcomes','outputs','project_activities','project_indicators']
    LOOP
        EXECUTE format('ALTER TABLE merl.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format($p$
            CREATE POLICY %1$s_select ON merl.%1$s
                FOR SELECT USING ( merl.current_db_user() IS NOT NULL )
        $p$, t);
    END LOOP;
END;
$$;

-- code_counters: internal bookkeeping — RLS on, no policies, so only the
-- SECURITY DEFINER RPCs (running as owner) can touch it.
ALTER TABLE merl.code_counters ENABLE ROW LEVEL SECURITY;

-- 4. Editor guard + write RPCs ------------------------------------------------
CREATE OR REPLACE FUNCTION merl.require_editor()
RETURNS merl.users
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('administrator', 'docc_me_officer', 'project_manager') THEN
        RAISE EXCEPTION 'Editor access required';
    END IF;
    RETURN v_user;
END;
$$;

-- Objectives ---
CREATE OR REPLACE FUNCTION public.create_objective(
    p_project_id UUID, p_statement TEXT,
    p_climate_theme TEXT DEFAULT NULL, p_expected_outcome TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID;
BEGIN
    PERFORM merl.require_editor();
    INSERT INTO merl.objectives (project_id, code, statement, climate_theme, expected_outcome, notes)
    VALUES (p_project_id, merl.next_code(p_project_id, 'objective', 'OBJ'),
            btrim(p_statement), p_climate_theme, p_expected_outcome, p_notes)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

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
        status = p_status, updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_objective(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.objectives WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
END; $$;

-- Outcomes (project derived from parent objective) ---
CREATE OR REPLACE FUNCTION public.create_outcome(
    p_objective_id UUID, p_statement TEXT, p_responsible_officer_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor();
    SELECT project_id INTO v_proj FROM merl.objectives WHERE id = p_objective_id;
    IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent objective not found'; END IF;
    INSERT INTO merl.outcomes (project_id, objective_id, code, statement, responsible_officer_id)
    VALUES (v_proj, p_objective_id, merl.next_code(v_proj, 'outcome', 'OUT'),
            btrim(p_statement), p_responsible_officer_id)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_outcome(
    p_id UUID, p_statement TEXT, p_responsible_officer_id UUID DEFAULT NULL, p_status TEXT DEFAULT 'draft'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.outcomes SET
        statement = btrim(p_statement), responsible_officer_id = p_responsible_officer_id,
        status = p_status, updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Outcome not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_outcome(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.outcomes WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Outcome not found'; END IF;
END; $$;

-- Outputs (project derived from parent outcome) ---
CREATE OR REPLACE FUNCTION public.create_output(
    p_outcome_id UUID, p_statement TEXT, p_responsible_officer_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID; v_proj UUID;
BEGIN
    PERFORM merl.require_editor();
    SELECT project_id INTO v_proj FROM merl.outcomes WHERE id = p_outcome_id;
    IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent outcome not found'; END IF;
    INSERT INTO merl.outputs (project_id, outcome_id, code, statement, responsible_officer_id)
    VALUES (v_proj, p_outcome_id, merl.next_code(v_proj, 'output', 'OP'),
            btrim(p_statement), p_responsible_officer_id)
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_output(
    p_id UUID, p_statement TEXT, p_responsible_officer_id UUID DEFAULT NULL, p_status TEXT DEFAULT 'draft'
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.outputs SET
        statement = btrim(p_statement), responsible_officer_id = p_responsible_officer_id,
        status = p_status, updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Output not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_output(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.outputs WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Output not found'; END IF;
END; $$;

-- Activities (project derived from parent output) ---
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
            btrim(p_name), p_description, p_responsible_officer_id, p_status)
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
        responsible_officer_id = p_responsible_officer_id, status = p_status, updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activity not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_project_activity(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.project_activities WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Activity not found'; END IF;
END; $$;

-- Indicators (link level is explicit; project passed directly) ---
CREATE OR REPLACE FUNCTION public.create_project_indicator(
    p_project_id UUID, p_name TEXT, p_unit TEXT DEFAULT NULL,
    p_baseline_value NUMERIC DEFAULT NULL, p_target_value NUMERIC DEFAULT NULL,
    p_means_of_verification TEXT DEFAULT NULL, p_frequency TEXT DEFAULT NULL,
    p_linked_level TEXT DEFAULT NULL, p_linked_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_id UUID;
BEGIN
    PERFORM merl.require_editor();
    INSERT INTO merl.project_indicators (
        project_id, code, name, unit, baseline_value, target_value,
        means_of_verification, frequency, linked_level, linked_id
    ) VALUES (
        p_project_id, merl.next_code(p_project_id, 'indicator', 'IND'),
        btrim(p_name), p_unit, p_baseline_value, p_target_value,
        p_means_of_verification, p_frequency, p_linked_level, p_linked_id
    )
    RETURNING id INTO v_id;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.update_project_indicator(
    p_id UUID, p_name TEXT, p_unit TEXT DEFAULT NULL,
    p_baseline_value NUMERIC DEFAULT NULL, p_target_value NUMERIC DEFAULT NULL,
    p_means_of_verification TEXT DEFAULT NULL, p_frequency TEXT DEFAULT NULL,
    p_linked_level TEXT DEFAULT NULL, p_linked_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.project_indicators SET
        name = btrim(p_name), unit = p_unit,
        baseline_value = p_baseline_value, target_value = p_target_value,
        means_of_verification = p_means_of_verification, frequency = p_frequency,
        linked_level = p_linked_level, linked_id = p_linked_id, updated_at = NOW()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Indicator not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_project_indicator(p_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.project_indicators WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Indicator not found'; END IF;
END; $$;

-- 5. Public read views --------------------------------------------------------
CREATE OR REPLACE VIEW public.v_objectives WITH (security_invoker = on) AS
SELECT o.id, o.project_id, o.code, o.statement, o.climate_theme, o.expected_outcome,
       o.notes, o.status, o.created_at, o.updated_at
FROM merl.objectives o;

CREATE OR REPLACE VIEW public.v_outcomes WITH (security_invoker = on) AS
SELECT oc.id, oc.project_id, oc.objective_id, oc.code, oc.statement,
       obj.code AS objective_code,
       oc.responsible_officer_id, ru.full_name AS responsible_officer_name,
       oc.status, oc.created_at, oc.updated_at
FROM merl.outcomes oc
JOIN merl.objectives obj ON obj.id = oc.objective_id
LEFT JOIN merl.users ru ON ru.id = oc.responsible_officer_id;

CREATE OR REPLACE VIEW public.v_outputs WITH (security_invoker = on) AS
SELECT op.id, op.project_id, op.outcome_id, op.code, op.statement,
       oc.code AS outcome_code,
       op.responsible_officer_id, ru.full_name AS responsible_officer_name,
       op.status, op.created_at, op.updated_at
FROM merl.outputs op
JOIN merl.outcomes oc ON oc.id = op.outcome_id
LEFT JOIN merl.users ru ON ru.id = op.responsible_officer_id;

CREATE OR REPLACE VIEW public.v_project_activities WITH (security_invoker = on) AS
SELECT a.id, a.project_id, a.output_id, a.code, a.name, a.description,
       op.code AS output_code,
       a.responsible_officer_id, ru.full_name AS responsible_officer_name,
       a.status, a.created_at, a.updated_at
FROM merl.project_activities a
JOIN merl.outputs op ON op.id = a.output_id
LEFT JOIN merl.users ru ON ru.id = a.responsible_officer_id;

CREATE OR REPLACE VIEW public.v_project_indicators WITH (security_invoker = on) AS
SELECT i.id, i.project_id, i.code, i.name, i.unit, i.baseline_value, i.target_value,
       i.means_of_verification, i.frequency, i.linked_level, i.linked_id,
       COALESCE(obj.code, oc.code, op.code, act.code) AS linked_code,
       i.created_at, i.updated_at
FROM merl.project_indicators i
LEFT JOIN merl.objectives         obj ON i.linked_level = 'objective' AND obj.id = i.linked_id
LEFT JOIN merl.outcomes           oc  ON i.linked_level = 'outcome'   AND oc.id  = i.linked_id
LEFT JOIN merl.outputs            op  ON i.linked_level = 'output'    AND op.id  = i.linked_id
LEFT JOIN merl.project_activities act ON i.linked_level = 'activity'  AND act.id = i.linked_id;

-- 6. Audit triggers (content tables only; code_counters has no id column) -----
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['objectives','outcomes','outputs','project_activities','project_indicators']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON merl.%1$s', t);
        EXECUTE format($tg$
            CREATE TRIGGER trg_audit_%1$s
                AFTER INSERT OR UPDATE OR DELETE ON merl.%1$s
                FOR EACH ROW EXECUTE FUNCTION merl.fn_audit_trigger()
        $tg$, t);
    END LOOP;
END;
$$;

-- 7. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON
            merl.objectives, merl.outcomes, merl.outputs,
            merl.project_activities, merl.project_indicators
        TO authenticated;
        GRANT SELECT ON
            public.v_objectives, public.v_outcomes, public.v_outputs,
            public.v_project_activities, public.v_project_indicators
        TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.create_objective(UUID, TEXT, TEXT, TEXT, TEXT),
            public.update_objective(UUID, TEXT, TEXT, TEXT, TEXT, TEXT),
            public.delete_objective(UUID),
            public.create_outcome(UUID, TEXT, UUID),
            public.update_outcome(UUID, TEXT, UUID, TEXT),
            public.delete_outcome(UUID),
            public.create_output(UUID, TEXT, UUID),
            public.update_output(UUID, TEXT, UUID, TEXT),
            public.delete_output(UUID),
            public.create_project_activity(UUID, TEXT, TEXT, UUID, TEXT),
            public.update_project_activity(UUID, TEXT, TEXT, UUID, TEXT),
            public.delete_project_activity(UUID),
            public.create_project_indicator(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID),
            public.update_project_indicator(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID),
            public.delete_project_indicator(UUID)
        TO authenticated;
        REVOKE EXECUTE ON FUNCTION
            public.create_objective(UUID, TEXT, TEXT, TEXT, TEXT),
            public.update_objective(UUID, TEXT, TEXT, TEXT, TEXT, TEXT),
            public.delete_objective(UUID),
            public.create_outcome(UUID, TEXT, UUID),
            public.update_outcome(UUID, TEXT, UUID, TEXT),
            public.delete_outcome(UUID),
            public.create_output(UUID, TEXT, UUID),
            public.update_output(UUID, TEXT, UUID, TEXT),
            public.delete_output(UUID),
            public.create_project_activity(UUID, TEXT, TEXT, UUID, TEXT),
            public.update_project_activity(UUID, TEXT, TEXT, UUID, TEXT),
            public.delete_project_activity(UUID),
            public.create_project_indicator(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID),
            public.update_project_indicator(UUID, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, UUID),
            public.delete_project_indicator(UUID)
        FROM anon, public;
    END IF;
END;
$$;

COMMIT;
