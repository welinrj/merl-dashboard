-- =============================================================================
-- MERL Dashboard – Migration 0041: retire the Data Entry / Project Officer role
-- =============================================================================
-- The portal now offers four user types: System Administrator, DoCC M&E
-- Officer, Project Manager / Project Focal Point, and Viewer / Executive.
--
-- What this does, and why in this order:
--   1. moves every account still on 'data_entry_officer' to 'viewer' — the
--      nearest surviving role that grants no capability the account did not
--      already have, so nobody gains access by being migrated;
--   2. drops the role's permission grants, so a stray row cannot pick them up;
--   3. rewrites the two RLS policies that still name it, so the database is not
--      quietly holding a write door open for a role the portal has retired;
--   4. teaches admin_create_user to refuse it, so a stale browser tab holding
--      the old dropdown cannot mint one after this deploys.
--
-- What this deliberately does NOT do: drop the enum value. Postgres has no
-- ALTER TYPE ... DROP VALUE; removing it would mean recreating merl.user_role
-- and rewriting every column default, function signature and policy that
-- depends on it — a large, risky change to delete an unreachable label. After
-- this migration no row carries the value and nothing can write it, so it is
-- inert. The frontend maps it to the read-only Viewer for the same reason: if a
-- row ever did carry it, the officer signs in with the least privilege instead
-- of meeting a blank screen.
--
-- Credentials are untouched: no auth identity, email or password hash is read
-- or written here.
-- =============================================================================

BEGIN;

-- 1) Move the holders ---------------------------------------------------------
-- merl.users carries only its audit and normalise triggers (no scope trigger),
-- so this needs no trigger juggling. The audit trigger records each change.
UPDATE merl.users
   SET role = 'viewer'
 WHERE role = 'data_entry_officer';

-- Their project assignments are left in place, deactivated rather than deleted:
-- a Viewer passes merl.can_access_project() unconditionally, so the rows grant
-- nothing, and keeping them preserves who was assigned to what.
UPDATE merl.user_project_assignments
   SET is_active = FALSE
 WHERE assignment_type = 'data_entry' AND is_active;

-- 2) Drop the role's permission grants ----------------------------------------
DELETE FROM merl.role_permissions WHERE role = 'data_entry_officer';

-- 3) Rewrite the policies that still name the role ----------------------------
-- Both are re-created from the live definitions with the retired role removed
-- and nothing else changed.
DROP POLICY IF EXISTS iv_insert ON merl.indicator_values;
CREATE POLICY iv_insert ON merl.indicator_values FOR INSERT
  WITH CHECK ((merl.current_db_user()).role = ANY (ARRAY[
      'system_admin'::merl.user_role,
      'docc_me_officer'::merl.user_role,
      'project_manager'::merl.user_role]));

DROP POLICY IF EXISTS ce_write ON merl.community_engagements;
CREATE POLICY ce_write ON merl.community_engagements FOR ALL
  USING ((merl.current_db_user()).role = ANY (ARRAY[
      'system_admin'::merl.user_role,
      'docc_me_officer'::merl.user_role,
      'project_manager'::merl.user_role]))
  WITH CHECK ((merl.current_db_user()).role = ANY (ARRAY[
      'system_admin'::merl.user_role,
      'docc_me_officer'::merl.user_role,
      'project_manager'::merl.user_role]));

-- 4) Refuse the retired role on creation --------------------------------------
-- The body below is public.admin_create_user exactly as pg_get_functiondef
-- reports it on the live database today, with one guard added ahead of the
-- work. Nothing else about it is changed.
--
-- Note for whoever reads this next: the live body is 0005's, not the hardened
-- one 0035 wrote (0035's other objects — assert_valid_user_input, the scope
-- triggers — are present, so only this function drifted back). Restoring 0035's
-- version is a separate decision about email validation and duplicate checks,
-- not something to smuggle in with a role change, so this migration preserves
-- what is running and adds only the guard.
--
-- An unknown label already fails on the ::merl.user_role cast with a Postgres
-- type error; this turns the one label an old client might still send into a
-- sentence an administrator can act on.
CREATE OR REPLACE FUNCTION public.admin_create_user(
    p_email TEXT, p_full_name TEXT, p_role TEXT, p_organisation TEXT DEFAULT NULL
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl', 'public', 'auth', 'extensions' AS $fn$
DECLARE v_pw TEXT; v_uid UUID;
BEGIN
    IF NOT merl.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
    IF p_role = 'data_entry_officer' THEN
        RAISE EXCEPTION 'The Data Entry / Project Officer role has been retired. '
                        'Create the account as a Project Manager or a Viewer.';
    END IF;
    v_pw := merl.gen_temp_password();
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
    VALUES ('00000000-0000-0000-0000-000000000000',v_uid,'authenticated','authenticated',lower(p_email),extensions.crypt(v_pw,extensions.gen_salt('bf')),NOW(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,NOW(),NOW(),'','','','','');
    INSERT INTO auth.identities (id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
    VALUES (gen_random_uuid(),v_uid,v_uid::TEXT,jsonb_build_object('sub',v_uid::TEXT,'email',lower(p_email),'email_verified',true),'email',NOW(),NOW(),NOW());
    INSERT INTO merl.users (email,full_name,role,organisation,auth_user_id)
    VALUES (lower(p_email),p_full_name,p_role::merl.user_role,p_organisation,v_uid);
    RETURN v_pw;
END; $fn$;

COMMIT;
