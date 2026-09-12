-- Remove seeded DEMO projects and their dependent records from the active MERL dataset.
-- Real project records (including VCAP2 and VCCRP) are preserved.

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM merl.projects
  WHERE code LIKE 'DEMO-%';

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM merl.project_budget_allocations WHERE project_id = ANY(v_ids);
  DELETE FROM merl.project_source_register WHERE project_id = ANY(v_ids);

  -- Migration runs outside an end-user auth session. Temporarily bypass only
  -- the row-scope guard that expects a logged-in user; all FK/audit triggers stay active.
  ALTER TABLE merl.projects DISABLE TRIGGER trg_scope_projects;
  DELETE FROM merl.projects WHERE id = ANY(v_ids);
  ALTER TABLE merl.projects ENABLE TRIGGER trg_scope_projects;
END $$;

-- Rebuild the public snapshot so no previously published demo project remains.
SELECT merl.refresh_public_portal();
