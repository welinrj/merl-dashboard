-- =============================================================================
-- MERL Dashboard – Migration 0031: five official roles, granular permissions,
-- and project-based access control (Phase 1 — access-control foundation)
-- =============================================================================
-- Consolidates the role model onto the five official user types, adds a
-- granular permission catalogue underneath them, introduces project-level
-- access control (user_project_assignments + can_access_project), and enforces
-- it with RESTRICTIVE RLS policies that AND with the existing role policies.
--
-- Credentials are untouched: only the role LABEL changes (ALTER TYPE RENAME
-- VALUE preserves each enum value's OID, so stored rows, policies and defaults
-- keep working). No auth identity, email or password hash is modified.
--
-- Role mapping (unambiguous — only administrator + project_manager are in use):
--   administrator        -> system_admin
--   docc_senior_officer  -> viewer            (now read-only; no longer reviews)
--   field_staff          -> data_entry_officer
--   docc_me_officer      -> docc_me_officer    (unchanged; the Reviewer/Approver)
--   project_manager      -> project_manager    (unchanged)
-- =============================================================================

-- 1) Rename the enum values to the official stable identifiers ----------------
ALTER TYPE merl.user_role RENAME VALUE 'administrator'       TO 'system_admin';
ALTER TYPE merl.user_role RENAME VALUE 'docc_senior_officer' TO 'viewer';
ALTER TYPE merl.user_role RENAME VALUE 'field_staff'         TO 'data_entry_officer';

-- 2) Recreate the plpgsql helpers that compared to the old literals -----------
CREATE OR REPLACE FUNCTION merl.is_admin()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    RETURN v_user.id IS NOT NULL AND v_user.role = 'system_admin';
END; $fn$;

CREATE OR REPLACE FUNCTION merl.is_editor()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    RETURN v_user.id IS NOT NULL
       AND v_user.role IN ('system_admin','docc_me_officer','project_manager');
END; $fn$;

CREATE OR REPLACE FUNCTION merl.require_editor()
RETURNS merl.users LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('system_admin','docc_me_officer','project_manager') THEN
        RAISE EXCEPTION 'Editor access required';
    END IF;
    RETURN v_user;
END; $fn$;

-- 3) Reviewer/Approver = DoCC M&E Officer (system_admin only for emergency
--    override). The former senior-officer role is now the read-only Viewer, so
--    it is dropped from every review/approve/verify path.
CREATE OR REPLACE FUNCTION public.review_project(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('system_admin','docc_me_officer') THEN
        RAISE EXCEPTION 'Reviewer access required (DoCC M&E Officer)';
    END IF;
    IF p_decision NOT IN ('approved','returned') THEN
        RAISE EXCEPTION 'Decision must be approved or returned';
    END IF;
    UPDATE merl.projects
       SET registration_status = p_decision, review_note = p_note,
           reviewed_by = v_user.id, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
END; $fn$;

CREATE OR REPLACE FUNCTION public.review_reporting_period(p_id uuid, p_decision text, p_comments text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_user merl.users; v_status TEXT;
BEGIN
    v_user := merl.current_db_user();
    IF v_user IS NULL OR v_user.role NOT IN ('system_admin','docc_me_officer') THEN
        RAISE EXCEPTION 'Approver access required (DoCC M&E Officer)';
    END IF;
    v_status := CASE p_decision WHEN 'approve' THEN 'approved' WHEN 'return' THEN 'returned'
                    WHEN 'review' THEN 'reviewed' ELSE NULL END;
    IF v_status IS NULL THEN RAISE EXCEPTION 'Invalid decision: %', p_decision; END IF;
    UPDATE merl.reporting_periods SET submission_status=v_status, reviewer_id=v_user.id,
           review_comments=p_comments,
           approved_at=CASE WHEN v_status='approved' THEN NOW() ELSE approved_at END, updated_by=v_user.id
     WHERE id=p_id AND submission_status IN ('submitted','reviewed');
    IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found or not awaiting review'; END IF;
END; $fn$;

CREATE OR REPLACE FUNCTION public.verify_dataset_values(p_dataset_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_actor merl.users; v_count INT;
BEGIN
    v_actor := merl.current_db_user();
    IF v_actor.id IS NULL OR v_actor.role NOT IN ('system_admin','docc_me_officer') THEN
        RAISE EXCEPTION 'Reviewer access required (DoCC M&E Officer)' USING ERRCODE='42501';
    END IF;
    UPDATE merl.indicator_values SET verified = TRUE, verified_by = v_actor.id
     WHERE source_dataset_id = p_dataset_id AND verified = FALSE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END; $fn$;

-- 4) Viewer is strictly read-only: drop it from the review/verify WRITE policies
--    (these previously granted the senior-officer role write/verify access).
DROP POLICY IF EXISTS du_update ON merl.document_uploads;
CREATE POLICY du_update ON merl.document_uploads FOR UPDATE
  USING ((merl.current_db_user()).role IN ('system_admin','docc_me_officer')
         OR uploaded_by = (merl.current_db_user()).id);

DROP POLICY IF EXISTS iv_update ON merl.indicator_values;
CREATE POLICY iv_update ON merl.indicator_values FOR UPDATE
  USING ((merl.current_db_user()).role IN ('system_admin','docc_me_officer')
         OR reported_by = (merl.current_db_user()).id);

DROP POLICY IF EXISTS datasets_update ON public.datasets;
CREATE POLICY datasets_update ON public.datasets FOR UPDATE
  USING ((merl.current_db_user()).role IN ('system_admin','docc_me_officer'));

-- 5) Granular permission catalogue (roles are collections of permissions) -----
CREATE TABLE IF NOT EXISTS merl.permissions (
    code        TEXT PRIMARY KEY,
    description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS merl.role_permissions (
    role            merl.user_role NOT NULL,
    permission_code TEXT NOT NULL REFERENCES merl.permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role, permission_code)
);
ALTER TABLE merl.permissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE merl.role_permissions  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_select ON merl.permissions;
CREATE POLICY permissions_select ON merl.permissions FOR SELECT USING (merl.current_db_user() IS NOT NULL);
DROP POLICY IF EXISTS role_permissions_select ON merl.role_permissions;
CREATE POLICY role_permissions_select ON merl.role_permissions FOR SELECT USING (merl.current_db_user() IS NOT NULL);

INSERT INTO merl.permissions(code, description) VALUES
  ('projects.view_all','View every project in the portfolio'),
  ('projects.view_assigned','View projects the user is assigned to'),
  ('projects.create','Create projects'),
  ('projects.edit','Edit project profiles'),
  ('projects.delete','Delete projects'),
  ('results.edit','Manage results framework (objectives/outcomes/outputs)'),
  ('indicators.edit','Create and edit indicators'),
  ('indicator_progress.enter','Enter indicator progress'),
  ('activities.edit','Manage activities and workplans'),
  ('finance.enter','Enter financial progress'),
  ('finance.enter_data','Data-entry financial access (permission-gated)'),
  ('beneficiaries.enter','Enter beneficiary / GEDSI data'),
  ('risks.edit','Manage risks and issues'),
  ('evidence.upload','Upload supporting evidence'),
  ('reports.submit','Submit reporting periods for review'),
  ('reports.review','Mark reporting periods under review / reviewed'),
  ('reports.return','Return reporting periods for correction'),
  ('reports.approve','Approve reporting periods'),
  ('reports.reopen','Reopen approved reporting periods'),
  ('reports.export','Export reports'),
  ('reports.generate_portfolio','Generate portfolio-wide reports'),
  ('users.manage','Create/deactivate users'),
  ('roles.manage','Assign roles'),
  ('assignments.manage','Assign project access'),
  ('settings.manage','Manage system configuration and reference tables'),
  ('audit.view','View the audit trail')
ON CONFLICT (code) DO NOTHING;

-- Role -> permission matrix (spec §25). system_admin gets every permission.
INSERT INTO merl.role_permissions(role, permission_code)
SELECT 'system_admin'::merl.user_role, code FROM merl.permissions
ON CONFLICT DO NOTHING;

INSERT INTO merl.role_permissions(role, permission_code)
SELECT 'docc_me_officer'::merl.user_role, code FROM merl.permissions
WHERE code IN ('projects.view_all','projects.view_assigned','projects.create','projects.edit',
  'results.edit','indicators.edit','indicator_progress.enter','activities.edit','finance.enter',
  'beneficiaries.enter','risks.edit','evidence.upload','reports.submit','reports.review',
  'reports.return','reports.approve','reports.reopen','reports.export','reports.generate_portfolio',
  'assignments.manage','audit.view')
ON CONFLICT DO NOTHING;

INSERT INTO merl.role_permissions(role, permission_code)
SELECT 'project_manager'::merl.user_role, code FROM merl.permissions
WHERE code IN ('projects.view_assigned','projects.edit','results.edit','indicators.edit',
  'indicator_progress.enter','activities.edit','finance.enter','beneficiaries.enter','risks.edit',
  'evidence.upload','reports.submit','reports.export')
ON CONFLICT DO NOTHING;

INSERT INTO merl.role_permissions(role, permission_code)
SELECT 'data_entry_officer'::merl.user_role, code FROM merl.permissions
WHERE code IN ('projects.view_assigned','indicator_progress.enter','activities.edit',
  'beneficiaries.enter','risks.edit','evidence.upload')
ON CONFLICT DO NOTHING;

INSERT INTO merl.role_permissions(role, permission_code)
SELECT 'viewer'::merl.user_role, code FROM merl.permissions
WHERE code IN ('projects.view_all','projects.view_assigned','reports.export','reports.generate_portfolio')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION merl.has_permission(p_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
    SELECT EXISTS (
        SELECT 1 FROM merl.role_permissions rp
        WHERE rp.role = (merl.current_db_user()).role AND rp.permission_code = p_code
    );
$fn$;

CREATE OR REPLACE VIEW public.v_my_permissions WITH (security_invoker = on) AS
SELECT rp.permission_code
FROM merl.role_permissions rp
WHERE rp.role = (merl.current_db_user()).role;

-- 6) Project-based access control --------------------------------------------
CREATE TABLE IF NOT EXISTS merl.user_project_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES merl.users(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES merl.projects(id) ON DELETE CASCADE,
    assignment_type TEXT NOT NULL DEFAULT 'contributor'
                    CHECK (assignment_type IN ('focal_point','manager','contributor','data_entry')),
    assigned_by     UUID REFERENCES merl.users(id) ON DELETE SET NULL,
    assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_upa_user    ON merl.user_project_assignments(user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_upa_project ON merl.user_project_assignments(project_id) WHERE is_active;
ALTER TABLE merl.user_project_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upa_select ON merl.user_project_assignments;
CREATE POLICY upa_select ON merl.user_project_assignments FOR SELECT
  USING (merl.is_admin()
         OR (merl.current_db_user()).role = 'docc_me_officer'
         OR user_id = (merl.current_db_user()).id);

CREATE OR REPLACE FUNCTION merl.can_access_project(p_project_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v merl.users;
BEGIN
    v := merl.current_db_user();
    IF v.id IS NULL THEN RETURN false; END IF;
    -- Portfolio-wide roles always have access.
    IF v.role IN ('system_admin','docc_me_officer','viewer') THEN RETURN true; END IF;
    -- Project Manager / Data Entry Officer: only where an active assignment exists.
    RETURN EXISTS (
        SELECT 1 FROM merl.user_project_assignments a
        WHERE a.user_id = v.id AND a.project_id = p_project_id AND a.is_active
    );
END; $fn$;

CREATE OR REPLACE FUNCTION public.assign_user_project(
    p_user_id uuid, p_project_id uuid, p_assignment_type text DEFAULT 'contributor')
RETURNS merl.user_project_assignments LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
DECLARE v_row merl.user_project_assignments;
BEGIN
    IF NOT merl.has_permission('assignments.manage') THEN
        RAISE EXCEPTION 'Assignment management access required' USING ERRCODE='42501';
    END IF;
    INSERT INTO merl.user_project_assignments(user_id, project_id, assignment_type, assigned_by, is_active)
    VALUES (p_user_id, p_project_id, p_assignment_type, (merl.current_db_user()).id, TRUE)
    ON CONFLICT (user_id, project_id) DO UPDATE
        SET is_active = TRUE, assignment_type = EXCLUDED.assignment_type,
            assigned_by = (merl.current_db_user()).id, assigned_at = NOW()
    RETURNING * INTO v_row;
    RETURN v_row;
END; $fn$;

CREATE OR REPLACE FUNCTION public.unassign_user_project(p_user_id uuid, p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'merl','public' AS $fn$
BEGIN
    IF NOT merl.has_permission('assignments.manage') THEN
        RAISE EXCEPTION 'Assignment management access required' USING ERRCODE='42501';
    END IF;
    UPDATE merl.user_project_assignments SET is_active = FALSE
     WHERE user_id = p_user_id AND project_id = p_project_id;
END; $fn$;

CREATE OR REPLACE VIEW public.v_user_project_assignments WITH (security_invoker = on) AS
SELECT a.id, a.user_id, u.full_name AS user_name, u.email, u.role,
       a.project_id, p.code AS project_code, p.name AS project_name,
       a.assignment_type, a.assigned_by, a.assigned_at, a.is_active
FROM merl.user_project_assignments a
JOIN merl.users u ON u.id = a.user_id
JOIN merl.projects p ON p.id = a.project_id;

-- 7) Seed assignments so existing Project Managers / Data Entry Officers keep
--    their current visibility (they could see every project before scoping).
--    Administrators should review and refine these assignments.
INSERT INTO merl.user_project_assignments(user_id, project_id, assignment_type, assigned_by)
SELECT u.id, p.id, CASE WHEN u.role='project_manager' THEN 'manager' ELSE 'data_entry' END, NULL
FROM merl.users u CROSS JOIN merl.projects p
WHERE u.role IN ('project_manager','data_entry_officer')
ON CONFLICT (user_id, project_id) DO NOTHING;

-- 8) Enforce project scoping with RESTRICTIVE policies (AND with existing role
--    policies). Portfolio roles pass can_access_project() unconditionally; PM /
--    Data Entry are limited to assigned projects for both read and write.
DO $do$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'beneficiaries','evidence','financial_progress','indicator_progress','learning_updates',
        'objectives','outcomes','outputs','project_activities','project_indicators',
        'project_locations','reporting_periods','risks_issues'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON merl.%I', t||'_scope', t);
        EXECUTE format(
            'CREATE POLICY %I ON merl.%I AS RESTRICTIVE FOR ALL '
            'USING (merl.can_access_project(project_id)) '
            'WITH CHECK (merl.can_access_project(project_id))', t||'_scope', t);
    END LOOP;
END $do$;

DROP POLICY IF EXISTS projects_scope ON merl.projects;
CREATE POLICY projects_scope ON merl.projects AS RESTRICTIVE FOR ALL
  USING (merl.can_access_project(id)) WITH CHECK (merl.can_access_project(id));

-- 9) Migration report (spec §26) ---------------------------------------------
CREATE OR REPLACE VIEW public.v_role_migration_report WITH (security_invoker = on) AS
SELECT u.full_name AS user_name, u.email,
       CASE u.role
         WHEN 'system_admin'       THEN 'administrator'
         WHEN 'viewer'             THEN 'docc_senior_officer'
         WHEN 'data_entry_officer' THEN 'field_staff'
         ELSE u.role::text
       END AS previous_role,
       u.role::text AS new_role,
       (SELECT COUNT(*) FROM merl.user_project_assignments a WHERE a.user_id=u.id AND a.is_active) AS active_assignments,
       u.active AS account_active,
       'migrated' AS migration_status
FROM merl.users u;

-- 10) Grants ------------------------------------------------------------------
DO $g$
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        GRANT SELECT ON merl.permissions, merl.role_permissions,
                       merl.user_project_assignments TO authenticated;
        GRANT SELECT ON public.v_my_permissions, public.v_user_project_assignments,
                        public.v_role_migration_report TO authenticated;
        GRANT EXECUTE ON FUNCTION merl.has_permission(text),
                                  merl.can_access_project(uuid),
                                  public.assign_user_project(uuid,uuid,text),
                                  public.unassign_user_project(uuid,uuid) TO authenticated;
    END IF;
END $g$;
