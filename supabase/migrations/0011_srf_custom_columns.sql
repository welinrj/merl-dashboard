-- =============================================================================
-- MERL Dashboard – Migration 0011: SRF custom columns
-- =============================================================================
-- Lets editors add / rename / delete custom columns on the Strategic Results
-- Framework activities register. Column definitions live in merl.srf_columns;
-- per-activity values live in a JSONB `custom` map keyed by column key.
-- =============================================================================

BEGIN;

-- Per-activity custom values ---------------------------------------------------
ALTER TABLE merl.srf_activities ADD COLUMN IF NOT EXISTS custom JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Column definitions -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.srf_columns (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT NOT NULL UNIQUE,
    label       TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text','number','date','select')),
    options     JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE merl.srf_columns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srf_columns_select ON merl.srf_columns;
CREATE POLICY srf_columns_select ON merl.srf_columns FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.v_srf_columns WITH (security_invoker = on) AS
SELECT id, key, label, type, options, sort_order, created_at FROM merl.srf_columns;

-- Extend the activities view with the custom map --------------------------------
CREATE OR REPLACE VIEW public.v_srf_activities WITH (security_invoker = on) AS
SELECT id, code, name, theme, focus_area, indicator, budget_vuv, status,
       progress, risk, target_2030, sort_order, created_at, updated_at, custom
FROM merl.srf_activities;

-- Slugify helper (editor-gated callers only reach this indirectly) --------------
CREATE OR REPLACE FUNCTION merl.srf_slug(p_label TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s TEXT;
BEGIN
    s := regexp_replace(lower(coalesce(p_label,'')), '[^a-z0-9]+', '_', 'g');
    s := trim(both '_' from s);
    IF s = '' THEN s := 'col'; END IF;
    RETURN s;
END; $$;

-- Column management RPCs -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_srf_column(
    p_label TEXT, p_type TEXT DEFAULT 'text', p_options JSONB DEFAULT '[]'::jsonb
) RETURNS merl.srf_columns
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_columns; v_key TEXT; v_base TEXT; v_n INTEGER := 1; v_sort INTEGER;
BEGIN
    PERFORM merl.require_editor();
    IF p_type NOT IN ('text','number','date','select') THEN RAISE EXCEPTION 'Invalid type: %', p_type; END IF;
    IF coalesce(trim(p_label),'') = '' THEN RAISE EXCEPTION 'Column label is required'; END IF;
    v_base := merl.srf_slug(p_label); v_key := v_base;
    WHILE EXISTS (SELECT 1 FROM merl.srf_columns WHERE key = v_key) LOOP
        v_n := v_n + 1; v_key := v_base || '_' || v_n;
    END LOOP;
    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort FROM merl.srf_columns;
    INSERT INTO merl.srf_columns (key, label, type, options, sort_order)
    VALUES (v_key, trim(p_label), p_type, COALESCE(p_options,'[]'::jsonb), v_sort)
    RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.update_srf_column(
    p_id UUID, p_label TEXT, p_type TEXT DEFAULT 'text', p_options JSONB DEFAULT '[]'::jsonb
) RETURNS merl.srf_columns
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_columns;
BEGIN
    PERFORM merl.require_editor();
    IF p_type NOT IN ('text','number','date','select') THEN RAISE EXCEPTION 'Invalid type: %', p_type; END IF;
    UPDATE merl.srf_columns SET label=trim(p_label), type=p_type, options=COALESCE(p_options,'[]'::jsonb)
    WHERE id=p_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Column not found: %', p_id; END IF;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_srf_column(p_id UUID)
RETURNS VOID LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_key TEXT;
BEGIN
    PERFORM merl.require_editor();
    SELECT key INTO v_key FROM merl.srf_columns WHERE id = p_id;
    IF v_key IS NULL THEN RETURN; END IF;
    DELETE FROM merl.srf_columns WHERE id = p_id;
    UPDATE merl.srf_activities SET custom = custom - v_key WHERE custom ? v_key;
END; $$;

-- Save an activity's custom values (merge) -------------------------------------
CREATE OR REPLACE FUNCTION public.set_srf_activity_custom(p_id UUID, p_custom JSONB)
RETURNS merl.srf_activities
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activities;
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.srf_activities
    SET custom = COALESCE(custom,'{}'::jsonb) || COALESCE(p_custom,'{}'::jsonb), updated_at = now()
    WHERE id = p_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Activity not found: %', p_id; END IF;
    RETURN v_row;
END; $$;

-- Grants -----------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.srf_columns TO authenticated;
        GRANT SELECT ON public.v_srf_columns TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.create_srf_column(TEXT,TEXT,JSONB),
            public.update_srf_column(UUID,TEXT,TEXT,JSONB),
            public.delete_srf_column(UUID),
            public.set_srf_activity_custom(UUID,JSONB)
        TO authenticated;
    END IF;
END $$;

COMMIT;
