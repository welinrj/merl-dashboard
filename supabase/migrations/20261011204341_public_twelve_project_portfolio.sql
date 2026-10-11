-- Preserve recovered BOLD and GGGI support frameworks in the staff workspace.
-- They are not part of the confirmed twelve-project public portfolio.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('merl.refresh_public_portal()'::regprocedure) INTO definition;
  IF position($scope$AND lower(coalesce(p.status::text,'')) NOT IN ('completed','closed')$scope$ in definition)=0 THEN
    RAISE EXCEPTION 'Unexpected public project scope; review before applying';
  END IF;
  definition := replace(definition,
    $scope$AND lower(coalesce(p.status::text,'')) NOT IN ('completed','closed')$scope$,
    $scope$AND lower(coalesce(p.status::text,'')) NOT IN ('completed','closed')
    AND coalesce(p.code::text,'') NOT IN ('BOLD-VU','GGGI-SUPPORT-VU')$scope$);
  EXECUTE definition;
END;
$migration$;
-- Indicator breakdowns must use the same published project set as the cards.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('merl.refresh_public_indicator_categories()'::regprocedure) INTO definition;
  IF position('JOIN merl.projects p ON p.id=i.project_id' in definition)=0 THEN
    RAISE EXCEPTION 'Unexpected indicator publication scope; review before applying';
  END IF;
  definition := replace(definition,
    'JOIN merl.projects p ON p.id=i.project_id',
    'JOIN merl.projects p ON p.id=i.project_id JOIN public.public_portal_projects pub ON pub.id=p.id');
  EXECUTE definition;
END;
$migration$;
SELECT merl.refresh_public_portal();
SELECT merl.refresh_public_indicator_categories();
SELECT merl.refresh_public_portal_supplemental();
