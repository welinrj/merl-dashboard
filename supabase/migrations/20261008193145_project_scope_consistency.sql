-- Preserve existing publication gates and permissions; align lifecycle labels.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('merl.refresh_public_portal()'::regprocedure) INTO definition;
  IF position($old$IN ('not_started','pipeline')$old$ in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected public refresh definition: review lifecycle mapping before applying';
  END IF;
  definition := replace(definition, $old$lower(coalesce(p.status::text,''))='completed'$old$, $new$lower(coalesce(p.status::text,'')) IN ('completed','closed')$new$);
  definition := replace(definition, $old$IN ('not_started','pipeline')$old$, $new$IN ('planning','not_started','pipeline','approved')$new$);
  EXECUTE definition;
END;
$migration$;
SELECT merl.refresh_public_portal();
