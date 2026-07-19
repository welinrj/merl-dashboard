-- =============================================================================
-- MERL Dashboard — Migration 0021: report types + extracted activities
-- =============================================================================
-- 1. Widens the project-document types to the full reporting set (Back to Office
--    Report, Monthly / Quarterly / 6-Month / Annual Report, Annual Workplan).
-- 2. Adds merl.project_report_activities: the individual activities the portal
--    extracts from a submitted report, so they can be shown in an activities
--    register and counted by month and by submitting officer. Rows cascade-
--    delete with their parent document.
-- =============================================================================


-- 1. Widen the document-type set --------------------------------------------
ALTER TABLE merl.project_documents DROP CONSTRAINT IF EXISTS project_documents_doc_type_check;
ALTER TABLE merl.project_documents ADD CONSTRAINT project_documents_doc_type_check
    CHECK (doc_type IN (
        'annual_workplan', 'back_to_office', 'monthly_report',
        'quarterly_report', 'six_month_report', 'annual_report'
    ));

-- Recreate the submit RPC with the widened validation list (same signature, so
-- existing grants are preserved).
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
    IF p_doc_type NOT IN (
        'annual_workplan','back_to_office','monthly_report',
        'quarterly_report','six_month_report','annual_report'
    ) THEN
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


-- 2. Extracted activities -----------------------------------------------------
CREATE TABLE IF NOT EXISTS merl.project_report_activities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   UUID REFERENCES merl.project_documents(id) ON DELETE CASCADE,
    project_name  TEXT NOT NULL,
    doc_type      TEXT,
    submitted_by  TEXT,
    activity_date DATE,                 -- parsed from the report where present
    activity_month TEXT,                -- 'YYYY-MM' (from the date or report period)
    description   TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE merl.project_report_activities IS
    'Activities auto-extracted from submitted project reports; cascade-delete with the parent document.';

CREATE INDEX IF NOT EXISTS report_activities_project_idx
    ON merl.project_report_activities(lower(project_name), activity_month);
CREATE INDEX IF NOT EXISTS report_activities_document_idx
    ON merl.project_report_activities(document_id);

ALTER TABLE merl.project_report_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_activities_select ON merl.project_report_activities;
CREATE POLICY report_activities_select ON merl.project_report_activities
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE VIEW public.v_project_report_activities WITH (security_invoker = on) AS
SELECT id, document_id, project_name, doc_type, submitted_by,
       activity_date, activity_month, description, created_at
FROM merl.project_report_activities;


-- Bulk-insert the activities extracted from a document. Each element of
-- p_activities is {date?: 'YYYY-MM-DD', month?: 'YYYY-MM', description: text}.
-- The month is derived from the date when not supplied. Returns the row count.
CREATE OR REPLACE FUNCTION public.add_report_activities(
    p_document_id UUID, p_activities JSONB
) RETURNS INTEGER
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
DECLARE v_doc merl.project_documents; v_count INTEGER;
BEGIN
    IF merl.current_db_user() IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
    SELECT * INTO v_doc FROM merl.project_documents WHERE id = p_document_id;
    IF v_doc.id IS NULL THEN RAISE EXCEPTION 'Document not found: %', p_document_id; END IF;

    INSERT INTO merl.project_report_activities
        (document_id, project_name, doc_type, submitted_by, activity_date, activity_month, description)
    SELECT
        v_doc.id, v_doc.project_name, v_doc.doc_type, v_doc.submitted_by,
        NULLIF(a->>'date','')::date,
        COALESCE(
            NULLIF(a->>'month',''),
            to_char(NULLIF(a->>'date','')::date, 'YYYY-MM')
        ),
        left(btrim(a->>'description'), 500)
    FROM jsonb_array_elements(COALESCE(p_activities, '[]'::jsonb)) AS a
    WHERE COALESCE(btrim(a->>'description'), '') <> '';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $$;

-- Delete a single extracted activity (editor-gated).
CREATE OR REPLACE FUNCTION public.delete_report_activity(p_id UUID)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = merl, public AS $$
BEGIN
    PERFORM merl.require_editor();
    DELETE FROM merl.project_report_activities WHERE id = p_id;
END; $$;


-- 3. Grants -------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.project_report_activities TO authenticated;
        GRANT SELECT ON public.v_project_report_activities TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.add_report_activities(UUID, JSONB),
            public.delete_report_activity(UUID)
        TO authenticated;
    END IF;
END $$;
