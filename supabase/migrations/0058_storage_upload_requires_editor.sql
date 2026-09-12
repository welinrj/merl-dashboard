-- MERL Dashboard – uploads require an editor role.
DROP POLICY IF EXISTS "datasets_insert" ON storage.objects;
CREATE POLICY "datasets_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='datasets' AND merl.is_editor());

DROP POLICY IF EXISTS "project-documents_insert" ON storage.objects;
CREATE POLICY "project-documents_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='project-documents' AND merl.is_editor());

DROP POLICY IF EXISTS "activity-photos_insert" ON storage.objects;
CREATE POLICY "activity-photos_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='activity-photos' AND merl.is_editor());

DROP POLICY IF EXISTS "activity-reports_insert" ON storage.objects;
CREATE POLICY "activity-reports_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id='activity-reports' AND merl.is_editor());
