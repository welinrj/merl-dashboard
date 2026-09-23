-- Route credential lifecycle operations through Supabase Auth's Admin API.
-- These service-role-only helpers let the admin-user-auth Edge Function
-- authorize a MERL system administrator and update the application profile
-- without exposing the merl schema through PostgREST.

BEGIN;

CREATE OR REPLACE FUNCTION public.edge_admin_authorized(p_actor_auth_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM merl.users
    WHERE auth_user_id = p_actor_auth_user_id
      AND active
      AND role = 'system_admin'::merl.user_role
  );
$$;

CREATE OR REPLACE FUNCTION public.edge_admin_auth_target(
  p_actor_auth_user_id uuid,
  p_profile_id uuid
)
RETURNS TABLE (
  profile_id uuid,
  auth_user_id uuid,
  email text,
  full_name text,
  active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target.id, target.auth_user_id, lower(target.email), target.full_name, target.active
  FROM merl.users AS target
  WHERE target.id = p_profile_id
    AND EXISTS (
      SELECT 1
      FROM merl.users AS actor
      WHERE actor.auth_user_id = p_actor_auth_user_id
        AND actor.active
        AND actor.role = 'system_admin'::merl.user_role
    );
$$;

CREATE OR REPLACE FUNCTION public.edge_admin_create_profile(
  p_actor_auth_user_id uuid,
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_role text,
  p_organisation text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile_id uuid;
  v_actor merl.users;
BEGIN
  SELECT * INTO v_actor
  FROM merl.users
  WHERE auth_user_id = p_actor_auth_user_id
    AND active
    AND role = 'system_admin'::merl.user_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  PERFORM merl.assert_valid_user_input(p_email, p_full_name);
  IF p_role NOT IN ('system_admin', 'docc_me_officer', 'project_manager', 'viewer') THEN
    RAISE EXCEPTION 'Invalid user role';
  END IF;

  INSERT INTO merl.users (email, full_name, role, organisation, auth_user_id)
  VALUES (
    lower(btrim(p_email)), btrim(p_full_name), p_role::merl.user_role,
    nullif(btrim(p_organisation), ''), p_auth_user_id
  )
  RETURNING id INTO v_profile_id;

  INSERT INTO merl.audit_logs (table_name, record_id, action, user_id, app_user_name, new_values)
  VALUES ('users', v_profile_id, 'INSERT', v_actor.id, v_actor.full_name,
          jsonb_build_object('event', 'user_created', 'for', lower(btrim(p_email))));
  RETURN v_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.edge_admin_link_login(
  p_actor_auth_user_id uuid,
  p_profile_id uuid,
  p_auth_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor merl.users;
  v_target merl.users;
BEGIN
  SELECT * INTO v_actor FROM merl.users
  WHERE auth_user_id = p_actor_auth_user_id AND active
    AND role = 'system_admin'::merl.user_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_target FROM merl.users WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF NOT v_target.active THEN RAISE EXCEPTION 'Activate the profile before creating a login'; END IF;
  IF v_target.auth_user_id IS NOT NULL THEN RAISE EXCEPTION 'This user already has a login account'; END IF;

  UPDATE merl.users SET auth_user_id = p_auth_user_id WHERE id = p_profile_id;
  INSERT INTO merl.audit_logs (table_name, record_id, action, user_id, app_user_name, new_values)
  VALUES ('users', p_profile_id, 'UPDATE', v_actor.id, v_actor.full_name,
          jsonb_build_object('event', 'login_provisioned', 'for', lower(v_target.email)));
END;
$$;

CREATE OR REPLACE FUNCTION public.edge_admin_record_auth_event(
  p_actor_auth_user_id uuid,
  p_profile_id uuid,
  p_event text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor merl.users;
  v_target merl.users;
BEGIN
  SELECT * INTO v_actor FROM merl.users
  WHERE auth_user_id = p_actor_auth_user_id AND active
    AND role = 'system_admin'::merl.user_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT * INTO v_target FROM merl.users WHERE id = p_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  INSERT INTO merl.audit_logs (table_name, record_id, action, user_id, app_user_name, new_values)
  VALUES ('users', p_profile_id, 'UPDATE', v_actor.id, v_actor.full_name,
          jsonb_build_object('event', p_event, 'for', lower(v_target.email)));
END;
$$;

REVOKE ALL ON FUNCTION public.edge_admin_authorized(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edge_admin_auth_target(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edge_admin_create_profile(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edge_admin_link_login(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.edge_admin_record_auth_event(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.edge_admin_authorized(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.edge_admin_auth_target(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.edge_admin_create_profile(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.edge_admin_link_login(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.edge_admin_record_auth_event(uuid, uuid, text) TO service_role;

-- These routines wrote directly to auth.users. Keep their definitions for
-- migration compatibility, but make them unreachable from application roles.
REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reset_password(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_password(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_provision_login(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.change_my_password(text, text) FROM PUBLIC, anon, authenticated;

COMMIT;
