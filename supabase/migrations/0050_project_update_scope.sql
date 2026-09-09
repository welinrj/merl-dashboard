-- Project profile update scope.
-- System Administrator and DoCC M&E Officer may update any project.
-- Project Managers may update only projects actively assigned to them.
-- Viewers and unauthenticated users are read-only. Service-role maintenance is
-- allowed so migrations and controlled backend jobs are not blocked.

CREATE OR REPLACE FUNCTION merl.enforce_project_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO merl, public
AS $function$
DECLARE
  v_user merl.users;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_user := merl.current_db_user();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'Project editor access required' USING ERRCODE = '42501';
  END IF;

  IF v_user.role IN ('system_admin', 'docc_me_officer') THEN
    RETURN NEW;
  END IF;

  IF v_user.role = 'project_manager' AND merl.can_access_project(OLD.id) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You do not have permission to update this project'
    USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS projects_update_scope_guard ON merl.projects;
CREATE TRIGGER projects_update_scope_guard
BEFORE UPDATE ON merl.projects
FOR EACH ROW
EXECUTE FUNCTION merl.enforce_project_update_scope();

COMMENT ON FUNCTION merl.enforce_project_update_scope() IS
  'Prevents project profile updates outside the signed-in user''s authorised project scope.';
