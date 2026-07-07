-- =============================================================================
-- MERL Dashboard – Migration 0005: admin user management
-- =============================================================================
-- Secure, admin-only user administration exposed to the frontend as RPCs.
-- Each function is SECURITY DEFINER but self-guards with merl.is_admin(), so
-- only a signed-in System Administrator can call them. Passwords are never
-- readable — a reset generates a NEW temporary password, returned once so the
-- admin can hand it over; the stored value remains a one-way bcrypt hash.
-- =============================================================================

BEGIN;

-- Admin-visible user list (security_invoker: RLS on merl.users means an admin
-- sees everyone, a non-admin sees only their own row).
CREATE OR REPLACE VIEW public.v_admin_users
WITH (security_invoker = on) AS
SELECT
    u.id,
    u.email,
    u.full_name,
    u.role::TEXT               AS role,
    u.organisation,
    u.active,
    u.created_at,
    (u.auth_user_id IS NOT NULL) AS has_login
FROM merl.users u;

-- Generate a readable temporary password.
CREATE OR REPLACE FUNCTION merl.gen_temp_password()
RETURNS TEXT
LANGUAGE sql
VOLATILE
AS $$
    SELECT 'Vu-' || substr(
        translate(encode(extensions.gen_random_bytes(12), 'base64'), '/+=', 'xyz'),
        1, 12);
$$;

-- Create a user (auth account + profile). Returns the temporary password.
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT, p_full_name TEXT, p_role TEXT, p_organisation TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, auth, extensions
AS $$
DECLARE v_pw TEXT; v_uid UUID;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    v_pw  := merl.gen_temp_password();
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current
    ) VALUES (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        lower(p_email), extensions.crypt(v_pw, extensions.gen_salt('bf')),
        NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
        NOW(), NOW(), '', '', '', '', ''
    );

    INSERT INTO auth.identities (
        id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at
    ) VALUES (
        gen_random_uuid(), v_uid, v_uid::TEXT,
        jsonb_build_object('sub', v_uid::TEXT, 'email', lower(p_email), 'email_verified', true),
        'email', NOW(), NOW(), NOW()
    );

    INSERT INTO merl.users (email, full_name, role, organisation, auth_user_id)
    VALUES (lower(p_email), p_full_name, p_role::merl.user_role, p_organisation, v_uid);

    RETURN v_pw;
END;
$$;

-- Reset a user's password. Returns the new temporary password.
CREATE OR REPLACE FUNCTION public.admin_reset_password(p_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, auth, extensions
AS $$
DECLARE v_pw TEXT; v_auth UUID;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    SELECT auth_user_id INTO v_auth FROM merl.users WHERE id = p_id;
    IF v_auth IS NULL THEN
        RAISE EXCEPTION 'This user has no login account';
    END IF;

    v_pw := merl.gen_temp_password();
    UPDATE auth.users
       SET encrypted_password = extensions.crypt(v_pw, extensions.gen_salt('bf')),
           updated_at = NOW()
     WHERE id = v_auth;

    RETURN v_pw;
END;
$$;

-- Activate / deactivate a user. A deactivated profile blocks all app access
-- (current_db_user() requires active = TRUE) while preserving the audit trail.
CREATE OR REPLACE FUNCTION public.admin_set_active(p_id UUID, p_active BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public
AS $$
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;
    UPDATE merl.users SET active = p_active WHERE id = p_id;
END;
$$;

-- Permanently delete a user (profile + auth account). Fails if the user has
-- linked records (e.g. document uploads); deactivate instead in that case.
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, auth
AS $$
DECLARE v_auth UUID;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;

    SELECT auth_user_id INTO v_auth FROM merl.users WHERE id = p_id;
    DELETE FROM merl.users WHERE id = p_id;
    IF v_auth IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = v_auth;
    END IF;
EXCEPTION WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'This user has linked records and cannot be deleted. Deactivate the account instead.';
END;
$$;

-- Grants: callable only by signed-in users (functions self-guard to admins).
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON public.v_admin_users TO authenticated;
        GRANT EXECUTE ON FUNCTION
            public.admin_create_user(TEXT, TEXT, TEXT, TEXT),
            public.admin_reset_password(UUID),
            public.admin_set_active(UUID, BOOLEAN),
            public.admin_delete_user(UUID)
        TO authenticated;
        REVOKE EXECUTE ON FUNCTION
            public.admin_create_user(TEXT, TEXT, TEXT, TEXT),
            public.admin_reset_password(UUID),
            public.admin_set_active(UUID, BOOLEAN),
            public.admin_delete_user(UUID)
        FROM anon, public;
    END IF;
END;
$$;

COMMIT;
