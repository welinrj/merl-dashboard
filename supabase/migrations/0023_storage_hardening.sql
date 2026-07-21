-- =============================================================================
-- MERL Dashboard — Migration 0023: storage bucket hardening
-- =============================================================================
-- Addresses two security-review findings for Supabase Storage:
--
--   #2  The `activity-photos` bucket was PUBLIC, so every uploaded photo was
--       world-readable by anyone who could guess/enumerate the object path.
--       Make it private; the frontend now serves photos via short-lived signed
--       URLs (see frontend/src/lib/photoUrls.js).
--
--   #4  Every storage bucket used a single coarse `FOR ALL TO authenticated`
--       policy, so ANY signed-in user could overwrite or delete ANY file in
--       ANY of these buckets — including reports and documents they did not
--       upload. Split the coarse policy into per-verb policies:
--         SELECT  — any signed-in user (needed to mint signed URLs / download)
--         INSERT  — any signed-in user (keeps the submission/upload flows open,
--                   including field staff filing project documents)
--         UPDATE  — editors only (overwrite is a privileged, destructive op)
--         DELETE  — editors only (same)
-- =============================================================================

-- 1. activity-photos becomes private. -----------------------------------------
UPDATE storage.buckets SET public = FALSE WHERE id = 'activity-photos';

-- 2. Boolean editor check (mirrors merl.require_editor without raising), so it
--    can be used inside RLS USING/WITH CHECK expressions. -----------------------
CREATE OR REPLACE FUNCTION merl.is_editor()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = merl, public
AS $$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    RETURN v_user.id IS NOT NULL
       AND v_user.role IN ('administrator', 'docc_me_officer', 'project_manager');
END;
$$;

-- 3. Replace the coarse per-bucket policies with split, verb-specific ones. -----
DO $$
DECLARE b TEXT;
BEGIN
    IF NOT EXISTS (SELECT FROM pg_namespace WHERE nspname = 'storage') THEN
        RETURN;
    END IF;

    -- Drop the historical coarse "FOR ALL" policies (one per bucket).
    DROP POLICY IF EXISTS activity_photos_write   ON storage.objects;
    DROP POLICY IF EXISTS activity_reports_rw      ON storage.objects;
    DROP POLICY IF EXISTS project_documents_rw     ON storage.objects;
    DROP POLICY IF EXISTS datasets_bucket_rw       ON storage.objects;

    FOREACH b IN ARRAY ARRAY['activity-photos', 'activity-reports', 'project-documents', 'datasets']
    LOOP
        -- Clean re-run safety.
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_select');
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_insert');
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_update');
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_delete');

        -- Read: any signed-in user (required to create signed URLs / download).
        EXECUTE format($p$
            CREATE POLICY %I ON storage.objects
                FOR SELECT TO authenticated
                USING (bucket_id = %L AND merl.current_db_user() IS NOT NULL)
        $p$, b || '_select', b);

        -- Create: any signed-in user (upload / submission flows).
        EXECUTE format($p$
            CREATE POLICY %I ON storage.objects
                FOR INSERT TO authenticated
                WITH CHECK (bucket_id = %L AND merl.current_db_user() IS NOT NULL)
        $p$, b || '_insert', b);

        -- Overwrite: editors only.
        EXECUTE format($p$
            CREATE POLICY %I ON storage.objects
                FOR UPDATE TO authenticated
                USING (bucket_id = %L AND merl.is_editor())
                WITH CHECK (bucket_id = %L AND merl.is_editor())
        $p$, b || '_update', b, b);

        -- Delete: editors only.
        EXECUTE format($p$
            CREATE POLICY %I ON storage.objects
                FOR DELETE TO authenticated
                USING (bucket_id = %L AND merl.is_editor())
        $p$, b || '_delete', b);
    END LOOP;
END $$;

-- 4. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT EXECUTE ON FUNCTION merl.is_editor() TO authenticated;
    END IF;
END $$;
