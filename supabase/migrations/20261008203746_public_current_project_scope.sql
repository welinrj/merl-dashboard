-- Public overview displays all current DoCC projects, independently of
-- framework readiness. Signed-in dashboard eligibility remains unchanged.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('merl.refresh_public_portal()'::regprocedure) INTO definition;
  IF position($old$AND (EXISTS (SELECT 1 FROM merl.framework_nodes n WHERE n.project_id=p.id)
        OR EXISTS (SELECT 1 FROM merl.project_indicators i WHERE i.project_id=p.id))$old$ in definition)=0 THEN
    RAISE EXCEPTION 'Unexpected public scope; review before applying';
  END IF;
  definition := replace(definition,
    $old$AND (EXISTS (SELECT 1 FROM merl.framework_nodes n WHERE n.project_id=p.id)
        OR EXISTS (SELECT 1 FROM merl.project_indicators i WHERE i.project_id=p.id))$old$,
    $new$AND lower(coalesce(p.status::text,'')) NOT IN ('completed','closed')$new$);
  EXECUTE definition;
END;
$migration$;
SELECT merl.refresh_public_portal();
SELECT merl.refresh_public_indicator_categories();
SELECT merl.refresh_public_portal_supplemental();
