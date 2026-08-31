-- =============================================================================
-- 0040_password_self_service.sql — everyone can change their own password.
--
-- Until now a password could only be changed by an administrator, through
-- admin_reset_password (0005), which replaces it with a generated temporary one
-- and hands that back to the admin to pass on. An officer who wanted a password
-- only they knew had no way to set one, and a password that has been read aloud
-- or sent in a message is not a password any more.
--
-- Two functions, matching the split the DoCC asked for:
--
--   change_my_password(current, new)  — any signed-in officer, their own login
--                                       only, and only on proving the current
--                                       password.
--   admin_set_password(user, new)     — the System Administrator, any account,
--                                       without the current password (they do
--                                       not have it) but gated on is_admin().
--
-- Both write auth.users.encrypted_password with bcrypt through pgcrypto, which
-- is exactly what admin_create_user and admin_reset_password have done since
-- 0005 — every account on the register carries a $2a$ hash — so a password set
-- here is one GoTrue accepts at the next sign-in.
--
-- Neither function records the password anywhere. The audit row says that a
-- password changed, who changed it and whose it was; the value itself is never
-- written to merl.audit_logs, the return value, or the log.
-- =============================================================================

BEGIN;

-- The house rule for a password an officer chooses. Deliberately short of a
-- character-class policy: length is what carries strength, and a rule that
-- demands a symbol mostly produces "Password1!" on a sticky note.
CREATE OR REPLACE FUNCTION merl.assert_password_acceptable(p_new TEXT)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE
SET search_path = merl, public AS $$
BEGIN
    IF p_new IS NULL OR btrim(p_new) = '' THEN
        RAISE EXCEPTION 'Enter a new password';
    END IF;
    IF length(p_new) < 10 THEN
        RAISE EXCEPTION 'The new password must be at least 10 characters';
    END IF;
END; $$;

COMMENT ON FUNCTION merl.assert_password_acceptable(TEXT) IS
    'Minimum standard for an officer-chosen password. One place to raise the bar.';

-- ── Change your own password ─────────────────────────────────────────────────
-- Scoped to the caller by construction: the account written is the one
-- current_db_user() resolves to from the JWT, never an id passed in. There is
-- no parameter naming a user, so there is nothing for a non-admin to point at
-- somebody else.
CREATE OR REPLACE FUNCTION public.change_my_password(p_current TEXT, p_new TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, auth, extensions
AS $$
DECLARE
    v_user merl.users;
    v_hash TEXT;
BEGIN
    v_user := merl.current_db_user();
    IF v_user.id IS NULL THEN
        RAISE EXCEPTION 'You are not signed in';
    END IF;
    IF v_user.auth_user_id IS NULL THEN
        RAISE EXCEPTION 'This profile has no login account';
    END IF;

    PERFORM merl.assert_password_acceptable(p_new);

    SELECT encrypted_password INTO v_hash FROM auth.users WHERE id = v_user.auth_user_id;
    IF v_hash IS NULL THEN
        RAISE EXCEPTION 'This profile has no login account';
    END IF;

    -- Proving the current password is what stops a borrowed session, or a phone
    -- left unlocked on a desk, from locking the owner out of their own account.
    IF extensions.crypt(COALESCE(p_current, ''), v_hash) <> v_hash THEN
        RAISE EXCEPTION 'Your current password is not correct';
    END IF;

    IF extensions.crypt(p_new, v_hash) = v_hash THEN
        RAISE EXCEPTION 'The new password must be different from the current one';
    END IF;

    UPDATE auth.users
       SET encrypted_password = extensions.crypt(p_new, extensions.gen_salt('bf')),
           updated_at = NOW()
     WHERE id = v_user.auth_user_id;

    -- Deliberately does NOT clear auth.sessions: the officer is changing their
    -- own password from a session they have just authenticated against, and
    -- signing them out of the device in their hand mid-task helps nobody.
    INSERT INTO merl.audit_logs (table_name, record_id, action, user_id, app_user_name, new_values)
    VALUES ('users', v_user.id, 'UPDATE', v_user.id, v_user.full_name,
            jsonb_build_object('event', 'password_changed', 'by', 'self'));
END; $$;

COMMENT ON FUNCTION public.change_my_password(TEXT, TEXT) IS
    'Change the signed-in officer''s own password, on proving the current one. Cannot touch any other account.';

-- ── Set anyone's password (System Administrator) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_password(p_id UUID, p_new TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, auth, extensions
AS $$
DECLARE
    v_actor  merl.users;
    v_target merl.users;
BEGIN
    IF NOT merl.is_admin() THEN
        RAISE EXCEPTION 'Administrator access required';
    END IF;
    v_actor := merl.current_db_user();

    PERFORM merl.assert_password_acceptable(p_new);

    SELECT * INTO v_target FROM merl.users WHERE id = p_id;
    IF v_target.id IS NULL THEN
        RAISE EXCEPTION 'User not found';
    END IF;
    IF v_target.auth_user_id IS NULL THEN
        RAISE EXCEPTION 'This user has no login account';
    END IF;

    UPDATE auth.users
       SET encrypted_password = extensions.crypt(p_new, extensions.gen_salt('bf')),
           updated_at = NOW()
     WHERE id = v_target.auth_user_id;

    -- An administrator setting someone else's password is usually answering a
    -- lost or shared credential, so every session that password opened is ended
    -- and the account has to be signed into again. Skipped when an admin is
    -- setting their own, which would sign them out of the screen they are on.
    IF v_target.id <> v_actor.id THEN
        DELETE FROM auth.sessions WHERE user_id = v_target.auth_user_id;
    END IF;

    INSERT INTO merl.audit_logs (table_name, record_id, action, user_id, app_user_name, new_values)
    VALUES ('users', v_target.id, 'UPDATE', v_actor.id, v_actor.full_name,
            jsonb_build_object('event', 'password_set_by_admin',
                               'for', v_target.email,
                               'sessions_ended', v_target.id <> v_actor.id));
END; $$;

COMMENT ON FUNCTION public.admin_set_password(UUID, TEXT) IS
    'Set any account''s password. System Administrator only; ends that account''s other sessions.';

-- Grants — signed-in callers only, never anon. change_my_password is safe for
-- every role precisely because it takes no user id.
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure::text AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN ('change_my_password', 'admin_set_password')
    LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, public', r.sig);
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
        END IF;
    END LOOP;
END $$;

COMMIT;
