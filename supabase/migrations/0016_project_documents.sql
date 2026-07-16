-- =============================================================================
-- MERL Dashboard – Migration 0016: Project document submissions
-- =============================================================================
-- A submission portal for project documents (Annual Workplan, 6-Month Report,
-- Annual Report). Users pick the document type, enter the project name and the
-- submitting officer's name; the portal scans the file for a summary and stores
-- the binary in the private `project-documents` bucket. Each submission logs the
-- typed officer name plus the signed-in user and a server timestamp. Documents
-- are browsable in the Project Files tab grouped by project.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS merl.project_documents (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_name  TEXT NOT NULL,
    doc_type      TEXT NOT NULL
                  CHECK (doc_type IN ('annual_workplan','six_month_report','annual_report')),
    submitted_by  TEXT NOT NULL,          -- officer name typed on the form
    storage_path  TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    file_type     TEXT,
    file_size     BIGINT,
    summary       TEXT,
    word_count    INTEGER,
    uploaded_by   TEXT,                    -- signed-in user (audit)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE merl.project_documents IS
    'Project document submissions (workplans / reports); binaries in the private project-documents bucket.';

CREATE INDEX IF NOT EXISTS project_documents_project_idx
    ON merl.project_documents(lower(project_name), created_at DESC);

ALTER TABLE merl.project_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_documents_select ON merl.project_documents;
CREATE POLICY project_documents_select ON merl.project_documents
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.v_project_documents WITH (security_invoker = on) AS
SELECT id, project_name, doc_type, submitted_by, storage_path, file_name,
       file_type, file_size, summary, word_count, uploaded_by, created_at
FROM merl.project_documents;

-- Submit a document. Any signed-in user may submit (this is a submission
-- portal); the signed-in identity is recorded alongside the typed officer name.
CREATE OR REPLACE FUNCTION public.add_project_document(
    p_project_name TEXT, p_doc_type TEXT, p_submitted_by TEXT,
    p_storage_path TEXT, p_file_name TEXT,
    p_file_type TEXT DEFAULT NULL, p_file_size BIGINT DEFAULT NULL,
    p_summary TEXT DEFAULT NULL, p_word_count INTEGER DEFAULT NULL
) RETURNS merl.project_documents
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_row merl.project_documents; v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
    IF p_doc_type NOT IN ('annual_workplan','six_month_report','annual_report') THEN
        RAISE EXCEPTION 'Invalid document type: %', p_doc_type;
    END IF;
    IF coalesce(trim(p_project_name),'') = '' THEN RAISE EXCEPTION 'Project name is required'; END IF;
    IF coalesce(trim(p_submitted_by),'') = '' THEN RAISE EXCEPTION 'Submitting officer is required'; END IF;
    IF coalesce(trim(p_storage_path),'') = '' OR coalesce(trim(p_file_name),'') = '' THEN
        RAISE EXCEPTION 'Storage path and file name are required';
    END IF;
    INSERT INTO merl.project_documents
        (project_name, doc_type, submitted_by, storage_path, file_name, file_type, file_size, summary, word_count, uploaded_by)
    VALUES (trim(p_project_name), p_doc_type, trim(p_submitted_by), trim(p_storage_path), trim(p_file_name),
            p_file_type, p_file_size, NULLIF(trim(coalesce(p_summary,'')),''), p_word_count, v_user.full_name)
    RETURNING * INTO v_row;
    RETURN v_row;
END; $$;

-- Delete a submission (editor-gated). Returns the storage path to purge.
CREATE OR REPLACE FUNCTION public.delete_project_document(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_path TEXT;
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.project_documents WHERE id = p_id RETURNING storage_path INTO v_path;
    RETURN v_path;
END; $$;

-- Storage bucket (private) + read/write for signed-in users.
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_namespace WHERE nspname = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public)
        VALUES ('project-documents', 'project-documents', FALSE)
        ON CONFLICT (id) DO NOTHING;

        DROP POLICY IF EXISTS project_documents_rw ON storage.objects;
        EXECUTE $pol$
            CREATE POLICY project_documents_rw ON storage.objects
                FOR ALL TO authenticated
                USING (bucket_id = 'project-documents' AND merl.current_db_user() IS NOT NULL)
                WITH CHECK (bucket_id = 'project-documents' AND merl.current_db_user() IS NOT NULL)
        $pol$;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.project_documents TO authenticated;
        GRANT SELECT ON public.v_project_documents TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.add_project_document(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,TEXT,INTEGER),
            public.delete_project_document(UUID)
        TO authenticated;
    END IF;
END $$;

COMMIT;
