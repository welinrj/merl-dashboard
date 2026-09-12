-- Remove seeded demo/test user profiles and their matching Supabase Auth users.
-- Real MERL users are preserved.

DO $$
DECLARE
  v_auth_ids uuid[];
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);

  SELECT array_agg(auth_user_id) FILTER (WHERE auth_user_id IS NOT NULL)
  INTO v_auth_ids
  FROM merl.users
  WHERE email ILIKE '%@docc.demo'
     OR organisation = 'DEMO';

  DELETE FROM merl.users
  WHERE email ILIKE '%@docc.demo'
     OR organisation = 'DEMO';

  IF v_auth_ids IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_auth_ids);
  END IF;

  -- Catch matching demo Auth records that had no MERL profile link.
  DELETE FROM auth.users WHERE email ILIKE '%@docc.demo';
END $$;
