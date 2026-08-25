-- =============================================================================
-- 0037_village_gazetteer.sql
--
-- Form 7 asks for a Community / Site as free text. Two officers reporting on the
-- same village write it two ways, and neither spelling maps to anywhere — the
-- field carries no coordinates, so a location entered as "Central community"
-- cannot be put on a map or joined to anything.
--
-- This adds a fourth level to the existing Province → Island → Area Council
-- reference chain from 0029: a village gazetteer with coordinates, so the form
-- can offer a list instead of an empty box.
--
-- The gazetteer fills from two directions
-- ---------------------------------------
-- 1. An authoritative import (scripts/import-villages.mjs), for a shapefile or
--    GeoJSON from the Vanuatu National Statistics Office or Lands. Rows land
--    with source = 'gazetteer'.
-- 2. Officers. When a village is not in the list, the form lets them name it and
--    drop a pin, and that village is added with source = 'officer' so the next
--    officer finds it in the dropdown rather than typing it a third way.
--
-- The second path matters because it means the feature is useful from the day it
-- ships, before any authoritative file has been loaded — and every village an
-- officer adds is one the import will later reconcile rather than duplicate.
-- =============================================================================

BEGIN;

-- ── 1. The gazetteer ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merl.ref_villages (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    province_code TEXT REFERENCES merl.ref_provinces (code) ON DELETE SET NULL,
    island        TEXT,
    area_council  TEXT,
    latitude      NUMERIC(9,6),
    longitude     NUMERIC(9,6),
    -- 'gazetteer' — from an authoritative import.
    -- 'officer'   — added from the form by someone who could not find it.
    source        TEXT NOT NULL DEFAULT 'officer' CHECK (source IN ('gazetteer','officer')),
    -- An imported row is trusted on arrival; an officer's is not until someone
    -- says so. Nothing depends on this yet — it exists so a later reconciliation
    -- pass has somewhere to record its verdict.
    verified      BOOLEAN NOT NULL DEFAULT FALSE,
    external_ref  TEXT,           -- the source dataset's own id, for re-import
    created_by    UUID REFERENCES merl.users (id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ref_villages_name_not_blank CHECK (btrim(name) <> ''),
    CONSTRAINT ref_villages_latitude_check  CHECK (latitude  IS NULL OR latitude  BETWEEN -90  AND 90),
    CONSTRAINT ref_villages_longitude_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

COMMENT ON TABLE merl.ref_villages IS
    'Village / settlement gazetteer for Form 7. Filled by import and by officers who could not find their village.';

-- One village per name within an island. Case- and space-insensitive, because
-- the whole point is to stop "Central community" and "Central Community" from
-- becoming two places. COALESCE keeps the uniqueness meaningful when island or
-- province is unknown, which NULLs would otherwise defeat.
CREATE UNIQUE INDEX IF NOT EXISTS ref_villages_unique_name
    ON merl.ref_villages (
        lower(btrim(name)),
        COALESCE(province_code, ''),
        lower(COALESCE(btrim(island), ''))
    );

CREATE INDEX IF NOT EXISTS ref_villages_province_idx ON merl.ref_villages (province_code);
CREATE INDEX IF NOT EXISTS ref_villages_island_idx   ON merl.ref_villages (lower(island));

DROP TRIGGER IF EXISTS trg_ref_villages_updated_at ON merl.ref_villages;
CREATE TRIGGER trg_ref_villages_updated_at
    BEFORE UPDATE ON merl.ref_villages
    FOR EACH ROW EXECUTE FUNCTION merl.set_updated_at();

-- ── 2. Read path ─────────────────────────────────────────────────────────────
-- The gazetteer is reference data: every signed-in user may read all of it, the
-- same as provinces and islands. Nothing in it is project-scoped.

CREATE OR REPLACE VIEW public.v_ref_villages WITH (security_invoker = on) AS
SELECT id, name, province_code, island, area_council, latitude, longitude,
       source, verified
FROM merl.ref_villages
ORDER BY province_code, island NULLS LAST, name;

GRANT SELECT ON public.v_ref_villages TO authenticated;

-- ── 3. Adding a village from the form ────────────────────────────────────────
-- Takes the same permission as entering the location it is being added for: a
-- role that may write. Returns the existing row when the village is already
-- known, so a race between two officers adding the same village at the same
-- moment resolves to one village rather than an error either of them has to
-- read.

CREATE OR REPLACE FUNCTION public.add_village(
    p_name          TEXT,
    p_province_code TEXT DEFAULT NULL,
    p_island        TEXT DEFAULT NULL,
    p_area_council  TEXT DEFAULT NULL,
    p_latitude      NUMERIC DEFAULT NULL,
    p_longitude     NUMERIC DEFAULT NULL
)
RETURNS merl.ref_villages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_user merl.users;
    v_row  merl.ref_villages;
BEGIN
    v_user := merl.require_editor();

    IF p_name IS NULL OR btrim(p_name) = '' THEN
        RAISE EXCEPTION 'Village name is required.';
    END IF;
    IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
        RAISE EXCEPTION 'Latitude must be between -90 and 90.';
    END IF;
    IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
        RAISE EXCEPTION 'Longitude must be between -180 and 180.';
    END IF;

    INSERT INTO merl.ref_villages
        (name, province_code, island, area_council, latitude, longitude, source, created_by)
    VALUES
        (btrim(p_name), NULLIF(btrim(COALESCE(p_province_code, '')), ''),
         NULLIF(btrim(COALESCE(p_island, '')), ''),
         NULLIF(btrim(COALESCE(p_area_council, '')), ''),
         p_latitude, p_longitude, 'officer', v_user.id)
    ON CONFLICT (lower(btrim(name)), COALESCE(province_code, ''), lower(COALESCE(btrim(island), '')))
    DO UPDATE SET
        -- Fill in what the existing row is missing; never overwrite what it has,
        -- and never let an officer's pin move a village the import placed.
        area_council = COALESCE(merl.ref_villages.area_council, EXCLUDED.area_council),
        latitude     = CASE WHEN merl.ref_villages.source = 'gazetteer'
                            THEN merl.ref_villages.latitude
                            ELSE COALESCE(merl.ref_villages.latitude, EXCLUDED.latitude) END,
        longitude    = CASE WHEN merl.ref_villages.source = 'gazetteer'
                            THEN merl.ref_villages.longitude
                            ELSE COALESCE(merl.ref_villages.longitude, EXCLUDED.longitude) END
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.add_village(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_village(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated;

-- ── 4. Bulk import ───────────────────────────────────────────────────────────
-- Used by scripts/import-villages.mjs. Takes the whole file as one JSON array so
-- a large gazetteer arrives in a handful of statements rather than thousands,
-- and so a re-import updates in place instead of duplicating.

CREATE OR REPLACE FUNCTION public.import_villages(p_rows JSONB)
RETURNS TABLE (inserted BIGINT, updated BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE
    v_before BIGINT;
    v_after  BIGINT;
    v_touched BIGINT;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'import_villages is for the import script only';
    END IF;
    IF jsonb_typeof(p_rows) <> 'array' THEN
        RAISE EXCEPTION 'Expected a JSON array of villages.';
    END IF;

    SELECT count(*) INTO v_before FROM merl.ref_villages;

    WITH incoming AS (
        SELECT btrim(r->>'name')                                   AS name,
               NULLIF(btrim(COALESCE(r->>'province_code','')), '') AS province_code,
               NULLIF(btrim(COALESCE(r->>'island','')), '')        AS island,
               NULLIF(btrim(COALESCE(r->>'area_council','')), '')  AS area_council,
               (r->>'latitude')::NUMERIC                           AS latitude,
               (r->>'longitude')::NUMERIC                          AS longitude,
               NULLIF(btrim(COALESCE(r->>'external_ref','')), '')  AS external_ref
        FROM jsonb_array_elements(p_rows) AS r
        WHERE btrim(COALESCE(r->>'name','')) <> ''
    ), deduped AS (
        -- The source file may itself name the same village twice; ON CONFLICT
        -- cannot resolve two conflicting rows inside one statement.
        SELECT DISTINCT ON (lower(name), COALESCE(province_code,''), lower(COALESCE(island,'')))
               *
        FROM incoming
        ORDER BY lower(name), COALESCE(province_code,''), lower(COALESCE(island,'')),
                 (latitude IS NOT NULL) DESC
    )
    INSERT INTO merl.ref_villages
        (name, province_code, island, area_council, latitude, longitude, source, verified, external_ref)
    SELECT name, province_code, island, area_council, latitude, longitude, 'gazetteer', TRUE, external_ref
    FROM deduped
    ON CONFLICT (lower(btrim(name)), COALESCE(province_code, ''), lower(COALESCE(btrim(island), '')))
    DO UPDATE SET
        -- The authoritative file wins over whatever an officer typed, including
        -- its coordinates: that is what makes it authoritative.
        area_council = COALESCE(EXCLUDED.area_council, merl.ref_villages.area_council),
        latitude     = COALESCE(EXCLUDED.latitude,  merl.ref_villages.latitude),
        longitude    = COALESCE(EXCLUDED.longitude, merl.ref_villages.longitude),
        external_ref = COALESCE(EXCLUDED.external_ref, merl.ref_villages.external_ref),
        source       = 'gazetteer',
        verified     = TRUE;

    GET DIAGNOSTICS v_touched = ROW_COUNT;
    SELECT count(*) INTO v_after FROM merl.ref_villages;

    inserted := v_after - v_before;
    updated  := v_touched - (v_after - v_before);
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.import_villages(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_villages(JSONB) TO service_role;

-- ── 5. Remember which village a location refers to ───────────────────────────
-- The community column keeps the name that was entered, so nothing that reads it
-- today changes. The new column records which gazetteer row it came from, which
-- is what lets a location be mapped and joined.

ALTER TABLE merl.project_locations
    ADD COLUMN IF NOT EXISTS village_id UUID REFERENCES merl.ref_villages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS project_locations_village_idx ON merl.project_locations (village_id);

-- Append village_id to the view (see 0036 for why the definition is wrapped
-- rather than restated).
DO $$
DECLARE v_def text; v_grants text;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='v_project_locations'
                 AND column_name='village_id') THEN RETURN; END IF;

    v_def := rtrim(btrim(pg_get_viewdef('public.v_project_locations'::regclass, true)), ';');

    SELECT string_agg(format('GRANT %s ON public.v_project_locations TO %I', privilege_type, grantee), '; ')
      INTO v_grants
      FROM information_schema.role_table_grants
     WHERE table_schema='public' AND table_name='v_project_locations';

    EXECUTE 'DROP VIEW public.v_project_locations CASCADE';
    EXECUTE format($f$
        CREATE VIEW public.v_project_locations WITH (security_invoker = on) AS
        SELECT base.*, src.village_id
        FROM (%s) base
        LEFT JOIN merl.project_locations src ON src.id = base.id
    $f$, v_def);

    IF v_grants IS NOT NULL THEN EXECUTE v_grants; END IF;
END $$;

-- upsert_project_location gains the village id. Defaulted, so every existing
-- caller — including the RPCs and any script — keeps working untouched.
CREATE OR REPLACE FUNCTION public.upsert_project_location(
    p_id UUID, p_project_id UUID, p_province TEXT DEFAULT NULL, p_island TEXT DEFAULT NULL,
    p_area_council TEXT DEFAULT NULL, p_community TEXT DEFAULT NULL,
    p_latitude NUMERIC DEFAULT NULL, p_longitude NUMERIC DEFAULT NULL,
    p_intervention TEXT DEFAULT NULL, p_status TEXT DEFAULT NULL,
    p_beneficiaries INTEGER DEFAULT NULL, p_village_id UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_user merl.users; v_id UUID;
BEGIN
    v_user := merl.require_editor();

    IF p_latitude IS NOT NULL AND (p_latitude < -90 OR p_latitude > 90) THEN
        RAISE EXCEPTION 'Latitude must be between -90 and 90.';
    END IF;
    IF p_longitude IS NOT NULL AND (p_longitude < -180 OR p_longitude > 180) THEN
        RAISE EXCEPTION 'Longitude must be between -180 and 180.';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO merl.project_locations (project_id, province, island, area_council,
            community, latitude, longitude, intervention, status, beneficiaries,
            village_id, created_by, updated_by)
        VALUES (p_project_id, p_province, p_island, p_area_council, p_community, p_latitude,
            p_longitude, p_intervention, p_status, p_beneficiaries, p_village_id, v_user.id, v_user.id)
        RETURNING id INTO v_id;
    ELSE
        UPDATE merl.project_locations SET province=p_province, island=p_island,
            area_council=p_area_council, community=p_community, latitude=p_latitude,
            longitude=p_longitude, intervention=p_intervention, status=p_status,
            beneficiaries=p_beneficiaries, village_id=p_village_id, updated_by=v_user.id
        WHERE id=p_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'Location not found'; END IF;
    END IF;
    RETURN v_id;
END; $$;

-- The 11-argument version from 0029 would still resolve for callers that omit
-- the new argument, leaving two functions where one is meant. Drop it: the new
-- one covers every existing call through its default.
DROP FUNCTION IF EXISTS public.upsert_project_location(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, INTEGER);

-- ── 6. Implementation status was free text ───────────────────────────────────
-- The form wrote whatever was typed, and the portal displayed the raw token —
-- a location saved through the UI reads "in_progress" on screen. The values are
-- the activity-status vocabulary the rest of Form 5 already uses; the constraint
-- is NOT VALID so a database holding older free text still migrates (see 0035).
ALTER TABLE merl.project_locations DROP CONSTRAINT IF EXISTS project_locations_status_check;
ALTER TABLE merl.project_locations ADD CONSTRAINT project_locations_status_check
    CHECK (status IS NULL OR status IN
        ('not_started','in_progress','completed','delayed','on_hold','cancelled')) NOT VALID;
SELECT merl.validate_or_warn('project_locations', 'project_locations_status_check');

COMMIT;
