-- The two partial unique indexes below are byte-for-byte equivalent and neither
-- backs a named constraint. Keep the canonical projects_gip_code_unique index.
DROP INDEX IF EXISTS merl.project_source_gip_unique;
