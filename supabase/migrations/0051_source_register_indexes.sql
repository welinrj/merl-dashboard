-- Cover foreign keys used by the DoCC website/source reconciliation views.
-- These are additive indexes only; no data or constraint semantics change.

CREATE INDEX IF NOT EXISTS docc_project_profiles_source_project_id_idx
  ON merl.docc_project_profiles_source(project_id);

CREATE INDEX IF NOT EXISTS project_source_register_project_id_idx
  ON merl.project_source_register(project_id);
