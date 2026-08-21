-- =============================================================================
-- 0026_indicator_ingestion.sql
-- -----------------------------------------------------------------------------
-- Turns the Datasets module from an opaque file store into a data-consolidation
-- pipeline (ToR: "automatically consolidates data from different sources to
-- reduce manual reporting"). Uploaded CSV/Excel rows are parsed client-side,
-- mapped to indicator fields, then landed here in merl.indicator_values — which
-- already flows into v_indicator_status / v_indicator_trends and the Reports
-- indicator section.
-- =============================================================================

-- Link ingested time-series points back to the dataset they came from, so a
-- dataset's values can be verified/removed as a unit.
ALTER TABLE merl.indicator_values
    ADD COLUMN IF NOT EXISTS source_dataset_id UUID
        REFERENCES public.datasets (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_indicator_values_source_dataset
    ON merl.indicator_values (source_dataset_id);

-- ---------------------------------------------------------------------------
-- 1. Indicator register view for the mapping UI (list + validate codes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_indicators
WITH (security_invoker = on) AS
SELECT code, name, domain::TEXT AS domain, unit,
       baseline_value, target_value, target_year,
       disaggregation_type::TEXT AS disaggregation_type
FROM merl.indicators
ORDER BY code;

-- ---------------------------------------------------------------------------
-- 2. Bulk ingest RPC — validate + insert mapped rows
-- ---------------------------------------------------------------------------
-- p_rows is a JSON array of objects with keys:
--   indicator_code, reporting_period, value (required)
--   disaggregation_key, disaggregation_value, location_island,
--   location_province, notes (optional)
-- Returns { inserted, skipped, errors: [{ row, reason }] }.
CREATE OR REPLACE FUNCTION public.ingest_indicator_values(
    p_dataset_id UUID,
    p_rows       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_actor     merl.users;
    v_elem      JSONB;
    v_idx       INT := 0;
    v_inserted  INT := 0;
    v_skipped   INT := 0;
    v_errors    JSONB := '[]'::JSONB;
    v_ind_id    UUID;
    v_code      TEXT;
    v_value     NUMERIC;
    v_period    DATE;
BEGIN
    v_actor := merl.require_editor();   -- raises unless caller is an editor

    IF jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'p_rows must be a JSON array';
    END IF;

    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
        v_idx := v_idx + 1;
        v_code := NULLIF(trim(v_elem->>'indicator_code'), '');

        -- Resolve indicator by code (case-insensitive).
        SELECT id INTO v_ind_id FROM merl.indicators
         WHERE lower(code) = lower(v_code) LIMIT 1;

        IF v_code IS NULL THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'missing indicator_code');
            CONTINUE;
        ELSIF v_ind_id IS NULL THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'unknown indicator code: ' || v_code);
            CONTINUE;
        END IF;

        -- Validate value (required, numeric).
        BEGIN
            v_value := (v_elem->>'value')::NUMERIC;
        EXCEPTION WHEN others THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'value is not a number: ' || COALESCE(v_elem->>'value','∅'));
            CONTINUE;
        END;
        IF v_value IS NULL THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'missing value');
            CONTINUE;
        END IF;

        -- Validate reporting_period (required, date).
        BEGIN
            v_period := (v_elem->>'reporting_period')::DATE;
        EXCEPTION WHEN others THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'invalid reporting_period: ' || COALESCE(v_elem->>'reporting_period','∅'));
            CONTINUE;
        END;
        IF v_period IS NULL THEN
            v_skipped := v_skipped + 1;
            v_errors := v_errors || jsonb_build_object('row', v_idx, 'reason', 'missing reporting_period');
            CONTINUE;
        END IF;

        INSERT INTO merl.indicator_values (
            indicator_id, value, reporting_period, reported_by,
            location_island, location_province,
            disaggregation_key, disaggregation_value, notes,
            source_dataset_id
        ) VALUES (
            v_ind_id, v_value, v_period, v_actor.id,
            NULLIF(trim(v_elem->>'location_island'), ''),
            NULLIF(trim(v_elem->>'location_province'), ''),
            NULLIF(trim(v_elem->>'disaggregation_key'), ''),
            NULLIF(trim(v_elem->>'disaggregation_value'), ''),
            NULLIF(trim(v_elem->>'notes'), ''),
            p_dataset_id
        );
        v_inserted := v_inserted + 1;
    END LOOP;

    -- Record the real parsed row count on the dataset submission.
    IF p_dataset_id IS NOT NULL THEN
        UPDATE public.datasets SET rows = v_inserted WHERE id = p_dataset_id;
    END IF;

    RETURN jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'errors', v_errors);
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Mark a dataset's ingested values verified (on approval)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_dataset_values(p_dataset_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_actor merl.users;
    v_count INT;
BEGIN
    -- Same reviewer set that may approve a dataset (see datasets_update RLS):
    -- administrator, DoCC senior officer, DoCC M&E officer.
    v_actor := merl.current_db_user();
    IF v_actor.id IS NULL
       OR v_actor.role NOT IN ('administrator', 'docc_senior_officer', 'docc_me_officer') THEN
        RAISE EXCEPTION 'Reviewer access required' USING ERRCODE = '42501';
    END IF;

    UPDATE merl.indicator_values
       SET verified = TRUE, verified_by = v_actor.id
     WHERE source_dataset_id = p_dataset_id AND verified = FALSE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_indicators TO authenticated;
        GRANT EXECUTE ON FUNCTION public.ingest_indicator_values(UUID, JSONB) TO authenticated;
        GRANT EXECUTE ON FUNCTION public.verify_dataset_values(UUID) TO authenticated;
    END IF;
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        GRANT SELECT ON public.v_indicators TO anon;
    END IF;
END $$;
