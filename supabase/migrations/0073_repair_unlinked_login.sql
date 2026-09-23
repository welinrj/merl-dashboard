-- An existing MERL profile may predate Supabase Auth and have no login.
-- Let a system administrator provision its missing identity in the Users panel.
-- The temporary password is returned once to that administrator; only its
-- bcrypt hash is stored. Existing Auth accounts and passwords are untouched.

CREATE OR REPLACE FUNCTION merl.has_auth_login(p_auth_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p_auth_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users a
    WHERE a.id = p_auth_user_id AND a.encrypted_password IS NOT NULL
      AND a.email_confirmed_at IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.identities i
                  WHERE i.user_id = a.id AND i.provider = 'email')
  );
$$;
REVOKE ALL ON FUNCTION merl.has_auth_login(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION merl.has_auth_login(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.v_admin_users WITH (security_invoker = on) AS
SELECT u.id, u.email, u.full_name, u.role::text AS role,
       u.organisation, u.active, u.created_at,
       merl.has_auth_login(u.auth_user_id) AS has_login
FROM merl.users u;

CREATE OR REPLACE FUNCTION public.admin_provision_login(p_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target merl.users;
  v_actor merl.users;
  v_uid uuid;
  v_password text;
  v_email text;
BEGIN
  IF NOT merl.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;
  v_actor := merl.current_db_user();

  SELECT * INTO v_target FROM merl.users WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF NOT v_target.active THEN RAISE EXCEPTION 'Activate the profile before creating a login'; END IF;
  IF v_target.auth_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM auth.users WHERE id = v_target.auth_user_id) THEN
    RAISE EXCEPTION 'This user already has a login account';
  END IF;
  PERFORM merl.assert_valid_user_input(v_target.email, v_target.full_name);

  v_email := lower(btrim(v_target.email));
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'An Auth account already uses this email; contact the system administrator';
  END IF;

  v_uid := gen_random_uuid();
  v_password := merl.gen_temp_password();
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', now(), now(), now()
  );

  UPDATE merl.users SET auth_user_id = v_uid WHERE id = p_id;
  INSERT INTO merl.audit_logs (table_name, record_id, action, user_id, app_user_name, new_values)
  VALUES ('users', p_id, 'UPDATE', v_actor.id, v_actor.full_name,
          jsonb_build_object('event', 'login_provisioned', 'for', v_email));
  RETURN v_password;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_provision_login(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provision_login(uuid) TO authenticated;

-- A dangling auth_user_id previously made these RPCs report success while
-- UPDATE touched zero rows. Never return a password that cannot work.
CREATE OR REPLACE FUNCTION public.admin_reset_password(p_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public, auth, extensions
AS $$
DECLARE v_pw text; v_auth uuid;
BEGIN
  IF NOT merl.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT auth_user_id INTO v_auth FROM merl.users WHERE id = p_id;
  IF v_auth IS NULL THEN RAISE EXCEPTION 'This user has no login account'; END IF;
  v_pw := merl.gen_temp_password();
  UPDATE auth.users SET encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')),
                        updated_at = now() WHERE id = v_auth;
  IF NOT FOUND THEN RAISE EXCEPTION 'The linked Auth account is missing. Create the missing login first'; END IF;
  RETURN v_pw;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_password(p_id uuid, p_new text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = merl, public, auth, extensions
AS $$
DECLARE v_actor merl.users; v_target merl.users;
BEGIN
  IF NOT merl.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  v_actor := merl.current_db_user();
  PERFORM merl.assert_password_acceptable(p_new);
  SELECT * INTO v_target FROM merl.users WHERE id = p_id;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_target.auth_user_id IS NULL THEN RAISE EXCEPTION 'This user has no login account'; END IF;
  UPDATE auth.users SET encrypted_password = extensions.crypt(p_new, extensions.gen_salt('bf')),
                        updated_at = now() WHERE id = v_target.auth_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The linked Auth account is missing. Create the missing login first'; END IF;
  IF v_target.id <> v_actor.id THEN
    DELETE FROM auth.sessions WHERE user_id = v_target.auth_user_id;
  END IF;
  INSERT INTO merl.audit_logs (table_name, record_id, action, user_id, app_user_name, new_values)
  VALUES ('users', v_target.id, 'UPDATE', v_actor.id, v_actor.full_name,
          jsonb_build_object('event', 'password_set_by_admin',
                             'for', v_target.email,
                             'sessions_ended', v_target.id <> v_actor.id));
END;
$$;
