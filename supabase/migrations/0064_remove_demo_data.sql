-- Remove seeded DEMO projects and their dependent records from the active MERL dataset.
-- Real project records (including VCAP2 and VCCRP) are preserved.

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  -- Migration cleanup runs without an end-user JWT. Set the local claim so the
  -- existing project-scope triggers recognise this migration as service-role work.
  PERFORM set_config('request.jwt.claim.role','service_role',true);

  SELECT array_agg(id) INTO v_ids
  FROM merl.projects
  WHERE code LIKE 'DEMO-%';

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM merl.project_budget_allocations WHERE project_id = ANY(v_ids);
  DELETE FROM merl.project_source_register WHERE project_id = ANY(v_ids);

  -- All remaining project-scoped child records cascade from merl.projects.
  DELETE FROM merl.projects WHERE id = ANY(v_ids);
END $$;

-- Rebuild the public snapshot so no previously published demo project remains.
SELECT merl.refresh_public_portal();
