-- =============================================================================
-- MERL Dashboard – Migration 0015: SRF activity reports + report photos
-- =============================================================================
-- Lets editors upload narrative reports (.doc/.docx/.pdf/.xlsx) against each
-- Strategic Results Framework activity. Report binaries live in the private
-- `activity-reports` storage bucket; metadata + an auto-generated summary live
-- in merl.srf_activity_reports. Photos found inside a report are extracted by
-- the browser and stored in the existing activity-photos bucket / table, tagged
-- source='report' and linked to the report so they appear in the gallery
-- slideshow and the generated quarterly report.
-- =============================================================================

BEGIN;

-- 1. Reports table ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.srf_activity_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id   UUID NOT NULL REFERENCES merl.srf_activities(id) ON DELETE CASCADE,
    storage_path  TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    file_type     TEXT,
    file_size     BIGINT,
    summary       TEXT,
    word_count    INTEGER,
    photo_count   INTEGER NOT NULL DEFAULT 0,
    uploaded_by   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE merl.srf_activity_reports IS
    'Narrative reports uploaded against SRF activities; binaries in the private activity-reports bucket.';

CREATE INDEX IF NOT EXISTS srf_activity_reports_activity_idx
    ON merl.srf_activity_reports(activity_id, created_at);

ALTER TABLE merl.srf_activity_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS srf_activity_reports_select ON merl.srf_activity_reports;
CREATE POLICY srf_activity_reports_select ON merl.srf_activity_reports
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.v_srf_activity_reports WITH (security_invoker = on) AS
SELECT id, activity_id, storage_path, file_name, file_type, file_size,
       summary, word_count, photo_count, uploaded_by, created_at
FROM merl.srf_activity_reports;

-- 2. Extend photos with provenance --------------------------------------------
ALTER TABLE merl.srf_activity_photos
    ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE merl.srf_activity_photos
    ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES merl.srf_activity_reports(id) ON DELETE CASCADE;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'srf_activity_photos_source_chk') THEN
        ALTER TABLE merl.srf_activity_photos
            ADD CONSTRAINT srf_activity_photos_source_chk CHECK (source IN ('manual','report'));
    END IF;
END $$;

CREATE OR REPLACE VIEW public.v_srf_activity_photos WITH (security_invoker = on) AS
SELECT id, activity_id, storage_path, caption, sort_order, uploaded_by, created_at,
       source, report_id
FROM merl.srf_activity_photos;

-- 3. Report RPCs (editor-gated) -----------------------------------------------
CREATE OR REPLACE FUNCTION public.add_srf_activity_report(
    p_activity_id UUID, p_storage_path TEXT, p_file_name TEXT,
    p_file_type TEXT DEFAULT NULL, p_file_size BIGINT DEFAULT NULL,
    p_summary TEXT DEFAULT NULL, p_word_count INTEGER DEFAULT NULL, p_photo_count INTEGER DEFAULT 0
) RETURNS merl.srf_activity_reports
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activity_reports; v_user merl.users;
BEGIN
    v_user := merl.require_editor();
    IF coalesce(trim(p_storage_path),'') = '' OR coalesce(trim(p_file_name),'') = '' THEN
        RAISE EXCEPTION 'Storage path and file name are required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM merl.srf_activities WHERE id = p_activity_id) THEN
        RAISE EXCEPTION 'Activity not found: %', p_activity_id;
    END IF;
    INSERT INTO merl.srf_activity_reports
        (activity_id, storage_path, file_name, file_type, file_size, summary, word_count, photo_count, uploaded_by)
    VALUES (p_activity_id, trim(p_storage_path), trim(p_file_name), p_file_type, p_file_size,
            NULLIF(trim(coalesce(p_summary,'')),''), p_word_count, COALESCE(p_photo_count,0), v_user.full_name)
    RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

-- Returns the report's storage_path plus its report-sourced photo paths so the
-- caller can also purge them from storage.
CREATE OR REPLACE FUNCTION public.delete_srf_activity_report(p_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_paths TEXT[]; v_report_path TEXT;
BEGIN
    PERFORM merl.require_editor();
    SELECT storage_path INTO v_report_path FROM merl.srf_activity_reports WHERE id = p_id;
    IF v_report_path IS NULL THEN RETURN ARRAY[]::TEXT[]; END IF;
    SELECT array_agg(storage_path) INTO v_paths
        FROM merl.srf_activity_photos WHERE report_id = p_id;
    DELETE FROM merl.srf_activity_reports WHERE id = p_id;  -- cascades photo rows
    RETURN COALESCE(v_paths, ARRAY[]::TEXT[]) || v_report_path;
END; $$;

-- Attach a report-extracted photo.
CREATE OR REPLACE FUNCTION public.add_srf_report_photo(
    p_activity_id UUID, p_report_id UUID, p_storage_path TEXT, p_caption TEXT DEFAULT NULL
) RETURNS merl.srf_activity_photos
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.srf_activity_photos; v_user merl.users; v_sort INTEGER;
BEGIN
    v_user := merl.require_editor();
    IF coalesce(trim(p_storage_path),'') = '' THEN RAISE EXCEPTION 'Storage path is required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM merl.srf_activities WHERE id = p_activity_id) THEN
        RAISE EXCEPTION 'Activity not found: %', p_activity_id;
    END IF;
    SELECT COALESCE(MAX(sort_order),0)+1 INTO v_sort
        FROM merl.srf_activity_photos WHERE activity_id = p_activity_id;
    INSERT INTO merl.srf_activity_photos
        (activity_id, storage_path, caption, sort_order, uploaded_by, source, report_id)
    VALUES (p_activity_id, trim(p_storage_path), NULLIF(trim(coalesce(p_caption,'')),''),
            v_sort, v_user.full_name, 'report', p_report_id)
    RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

-- 4. Storage bucket (private) + write policy ----------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('activity-reports', 'activity-reports', FALSE)
        ON CONFLICT (id) DO NOTHING;

        DROP POLICY IF EXISTS activity_reports_rw ON storage.objects;
        EXECUTE $pol$
            CREATE POLICY activity_reports_rw ON storage.objects
                FOR ALL TO authenticated
                USING (bucket_id = 'activity-reports' AND merl.current_db_user() IS NOT NULL)
                WITH CHECK (bucket_id = 'activity-reports' AND merl.current_db_user() IS NOT NULL)
        $pol$;
    END IF;
END $$;

-- 5. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.srf_activity_reports TO authenticated;
        GRANT SELECT ON public.v_srf_activity_reports TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.add_srf_activity_report(UUID,TEXT,TEXT,TEXT,BIGINT,TEXT,INTEGER,INTEGER),
            public.delete_srf_activity_report(UUID),
            public.add_srf_report_photo(UUID,UUID,TEXT,TEXT)
        TO authenticated;
    END IF;
END $$;

COMMIT;
