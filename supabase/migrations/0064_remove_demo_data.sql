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

  -- Most other project-scoped MERL tables are ON DELETE CASCADE.
  DELETE FROM merl.projects WHERE id = ANY(v_ids);
END $$;

-- Remove any public snapshot rows left from previously published demo projects.
DELETE FROM public.public_portal_kpis p
WHERE NOT EXISTS (SELECT 1 FROM merl.projects m WHERE m.id=p.project_id);
DELETE FROM public.public_portal_area_councils a
WHERE NOT EXISTS (
  SELECT 1 FROM unnest(a.project_ids) pid
  JOIN merl.projects m ON m.id=pid
);
DELETE FROM public.public_portal_projects p
WHERE NOT EXISTS (SELECT 1 FROM merl.projects m WHERE m.id=p.id);

SELECT merl.refresh_public_portal();
