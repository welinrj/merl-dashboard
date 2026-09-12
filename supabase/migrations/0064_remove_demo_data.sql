-- Remove seeded DEMO projects and their dependent records from the active MERL dataset.
-- Real project records (including VCAP2 and VCCRP) are preserved.

DO $$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);

  SELECT array_agg(id) INTO v_ids
  FROM merl.projects
  WHERE code LIKE 'DEMO-%';

  IF v_ids IS NULL OR array_length(v_ids,1) IS NULL THEN
    RETURN;
  END IF;

  -- Demo periods may have been marked approved by test fixtures. Unlock them
  -- before cascading deletion so the normal locked-period protection does not
  -- block deliberate removal of seeded data.
  UPDATE merl.reporting_periods
  SET submission_status='draft',
      approved_at=NULL,
      locked_at=NULL,
      reviewer_id=NULL,
      review_comments=NULL,
      updated_at=now()
  WHERE project_id = ANY(v_ids);

  DELETE FROM merl.project_budget_allocations WHERE project_id = ANY(v_ids);
  DELETE FROM merl.project_source_register WHERE project_id = ANY(v_ids);

  DELETE FROM merl.projects WHERE id = ANY(v_ids);
END $$;

SELECT merl.refresh_public_portal();
