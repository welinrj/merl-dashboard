-- =============================================================================
-- MERL Dashboard – Migration 0057: uploading a file takes the editor roles
-- =============================================================================
-- UPDATE and DELETE on the datasets, project-documents, activity-photos and
-- activity-reports buckets already required merl.is_editor() (system_admin,
-- docc_me_officer, project_manager). INSERT alone accepted any signed-in MERL
-- user, so a Viewer — an account the portal presents as read-only, and whose
-- navigation carries no upload control at all — could write arbitrary files
-- into government storage through the Storage API directly.
--
-- The inconsistency with the sibling policies on the same buckets is what marks
-- this as an oversight rather than a decision.
--
-- Untouched on purpose:
--   · merl-indicator-evidence, which has a stricter project-scoped check of its
--     own (merl.can_access_indicator_evidence).
--   · project-images, whose writes are already system_admin-only.
--   · every SELECT policy, so no existing read breaks.
-- =============================================================================

DROP POLICY IF EXISTS "datasets_insert" ON storage.objects;
CREATE POLICY "datasets_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'datasets' AND merl.is_editor());

DROP POLICY IF EXISTS "project-documents_insert" ON storage.objects;
CREATE POLICY "project-documents_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'project-documents' AND merl.is_editor());

DROP POLICY IF EXISTS "activity-photos_insert" ON storage.objects;
CREATE POLICY "activity-photos_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'activity-photos' AND merl.is_editor());

DROP POLICY IF EXISTS "activity-reports_insert" ON storage.objects;
CREATE POLICY "activity-reports_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'activity-reports' AND merl.is_editor());
