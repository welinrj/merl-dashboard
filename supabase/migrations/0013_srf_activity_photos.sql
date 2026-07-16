-- =============================================================================
-- MERL Dashboard – Migration 0013: SRF activity photos
-- =============================================================================
-- Lets editors attach photographs to Strategic Results Framework activities
-- (both the seeded activities and any created in-app). Photo binaries live in
-- the public `activity-photos` storage bucket; metadata (path + caption) lives
-- in merl.srf_activity_photos. Reads go through the public view; writes go
-- through SECURITY DEFINER RPCs gated to editor roles. Generated quarterly
-- reports pull these photos into a Photo Documentation section.
-- =============================================================================

BEGIN;

-- 1. Table --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.srf_activity_photos (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id   UUID NOT NULL REFERENCES merl.srf_activities(id) ON DELETE CASCADE,
    storage_path  TEXT NOT NULL,
    caption       TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    uploaded_by   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE merl.srf_activity_photos IS
    'Photographs attached to SRF activities; binaries in the activity-photos storage bucket.';

CREATE INDEX IF NOT EXISTS srf_activity_photos_activity_idx
    ON merl.srf_activity_photos(activity_id, sort_order);

ALTER TABLE merl.srf_activity_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS srf_activity_photos_select ON merl.srf_activity_photos;
CREATE POLICY srf_activity_photos_select ON merl.srf_activity_photos
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- 2. Public view --------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_srf_activity_photos WITH (security_invoker = on) AS
SELECT id, activity_id, storage_path, caption, sort_order, uploaded_by, created_at
FROM merl.srf_activity_photos;

-- 3. Write RPCs (editor-gated, SECURITY DEFINER) ------------------------------
CREATE OR REPLACE FUNCTION public.add_srf_activity_photo(
    p_activity_id UUID, p_storage_path TEXT, p_caption TEXT DEFAULT NULL
) RETURNS merl.srf_activity_photos
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activity_photos; v_user merl.users; v_sort INTEGER;
BEGIN
    v_user := merl.require_editor();
    IF coalesce(trim(p_storage_path),'') = '' THEN
        RAISE EXCEPTION 'Storage path is required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM merl.srf_activities WHERE id = p_activity_id) THEN
        RAISE EXCEPTION 'Activity not found: %', p_activity_id;
    END IF;
    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort
        FROM merl.srf_activity_photos WHERE activity_id = p_activity_id;
    INSERT INTO merl.srf_activity_photos (activity_id, storage_path, caption, sort_order, uploaded_by)
    VALUES (p_activity_id, trim(p_storage_path), NULLIF(trim(coalesce(p_caption,'')),''), v_sort, v_user.full_name)
    RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.update_srf_activity_photo(p_id UUID, p_caption TEXT)
RETURNS merl.srf_activity_photos
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activity_photos;
BEGIN
    PERFORM merl.require_editor();
    UPDATE merl.srf_activity_photos
    SET caption = NULLIF(trim(coalesce(p_caption,'')),'')
    WHERE id = p_id RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'Photo not found: %', p_id; END IF;
    RETURN v_row;
END; $$;

-- Returns the deleted row's storage_path so the caller can also remove the
-- object from storage.
CREATE OR REPLACE FUNCTION public.delete_srf_activity_photo(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_path TEXT;
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.srf_activity_photos WHERE id = p_id RETURNING storage_path INTO v_path;
    RETURN v_path;
END; $$;

-- 4. Storage bucket + policies ------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'storage') THEN
        -- Public bucket: photos are meant to appear in published reports, so
        -- objects are world-readable; writes stay gated to signed-in users.
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('activity-photos', 'activity-photos', TRUE)
        ON CONFLICT (id) DO NOTHING;

        DROP POLICY IF EXISTS activity_photos_write ON storage.objects;
        EXECUTE $pol$
            CREATE POLICY activity_photos_write ON storage.objects
                FOR ALL TO authenticated
                USING (bucket_id = 'activity-photos' AND merl.current_db_user() IS NOT NULL)
                WITH CHECK (bucket_id = 'activity-photos' AND merl.current_db_user() IS NOT NULL)
        $pol$;
    END IF;
END $$;

-- 5. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.srf_activity_photos TO authenticated;
        GRANT SELECT ON public.v_srf_activity_photos TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.add_srf_activity_photo(UUID,TEXT,TEXT),
            public.update_srf_activity_photo(UUID,TEXT),
            public.delete_srf_activity_photo(UUID)
        TO authenticated;
    END IF;
END $$;

COMMIT;
