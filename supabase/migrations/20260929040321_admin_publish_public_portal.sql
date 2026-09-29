-- Let a signed-in system administrator explicitly refresh the public portal
-- snapshot from the authenticated Overview. The underlying refresh routines
-- remain service-role-only; this narrowly scoped wrapper validates the actor.

CREATE OR REPLACE FUNCTION public.publish_public_portal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF coalesce(merl.is_admin(), false) IS NOT TRUE THEN
    RAISE EXCEPTION 'System administrator access required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM merl.refresh_public_portal();
  PERFORM merl.refresh_public_indicator_categories();

  SELECT jsonb_build_object(
    'published_at', s.updated_at,
    'project_count', s.project_count,
    'published_beneficiaries', s.published_beneficiaries,
    'projects_with_published_results', s.projects_with_published_results
  )
  INTO v_result
  FROM public.public_portal_summary s
  WHERE s.singleton = true;

  RETURN coalesce(v_result, jsonb_build_object('published_at', now()));
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_public_portal()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_public_portal()
  TO authenticated, service_role;
