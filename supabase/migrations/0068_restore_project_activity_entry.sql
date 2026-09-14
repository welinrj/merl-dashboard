-- Restore Form 5 / project activity entry after the Results Framework rebuild.
-- The legacy upsert_project_activity_full() still dereferences merl.outputs,
-- which was retired by the framework-node engine.  This RPC writes directly
-- to the current project_activities.framework_node_id relationship.

CREATE OR REPLACE FUNCTION public.upsert_project_activity_v2(
  p_id uuid,
  p_project_id uuid,
  p_framework_node_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_status text DEFAULT 'not_started',
  p_responsible_org text DEFAULT NULL,
  p_responsible_officer text DEFAULT NULL,
  p_province text DEFAULT NULL,
  p_island text DEFAULT NULL,
  p_area_council text DEFAULT NULL,
  p_community text DEFAULT NULL,
  p_planned_start_date date DEFAULT NULL,
  p_planned_end_date date DEFAULT NULL,
  p_actual_start_date date DEFAULT NULL,
  p_actual_end_date date DEFAULT NULL,
  p_planned_budget numeric DEFAULT NULL,
  p_actual_expenditure numeric DEFAULT NULL,
  p_physical_progress_pct numeric DEFAULT NULL,
  p_key_achievement text DEFAULT NULL,
  p_issue_delay text DEFAULT NULL,
  p_next_action text DEFAULT NULL,
  p_next_action_due date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_node_project uuid;
BEGIN
  PERFORM merl.require_editor('activities.edit');

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'Project is required';
  END IF;
  IF NOT merl.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Activity title is required';
  END IF;
  IF p_status NOT IN ('not_started','in_progress','completed','delayed','on_hold','cancelled') THEN
    RAISE EXCEPTION 'Invalid activity status';
  END IF;
  IF p_physical_progress_pct IS NOT NULL AND (p_physical_progress_pct < 0 OR p_physical_progress_pct > 100) THEN
    RAISE EXCEPTION 'Physical progress must be between 0 and 100';
  END IF;
  IF p_planned_budget IS NOT NULL AND p_planned_budget < 0 THEN
    RAISE EXCEPTION 'Planned budget cannot be negative';
  END IF;
  IF p_actual_expenditure IS NOT NULL AND p_actual_expenditure < 0 THEN
    RAISE EXCEPTION 'Actual expenditure cannot be negative';
  END IF;
  IF p_planned_start_date IS NOT NULL AND p_planned_end_date IS NOT NULL AND p_planned_end_date < p_planned_start_date THEN
    RAISE EXCEPTION 'Planned end date cannot be earlier than planned start date';
  END IF;
  IF p_actual_start_date IS NOT NULL AND p_actual_end_date IS NOT NULL AND p_actual_end_date < p_actual_start_date THEN
    RAISE EXCEPTION 'Actual end date cannot be earlier than actual start date';
  END IF;

  IF p_framework_node_id IS NOT NULL THEN
    SELECT project_id INTO v_node_project
    FROM merl.framework_nodes
    WHERE id = p_framework_node_id;
    IF v_node_project IS NULL THEN
      RAISE EXCEPTION 'Linked result not found';
    END IF;
    IF v_node_project <> p_project_id THEN
      RAISE EXCEPTION 'Linked result belongs to a different project';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO merl.project_activities (
      project_id, framework_node_id, code, name, description, status,
      responsible_org, responsible_officer, province, island, area_council, community,
      planned_start_date, planned_end_date, actual_start_date, actual_end_date,
      planned_budget, actual_expenditure, physical_progress_pct,
      key_achievement, issue_delay, next_action, next_action_due
    ) VALUES (
      p_project_id, p_framework_node_id,
      merl.next_code_w(p_project_id, 'activity', 'ACT', 3),
      btrim(p_name), NULLIF(btrim(p_description), ''), p_status,
      NULLIF(btrim(p_responsible_org), ''), NULLIF(btrim(p_responsible_officer), ''),
      NULLIF(btrim(p_province), ''), NULLIF(btrim(p_island), ''),
      NULLIF(btrim(p_area_council), ''), NULLIF(btrim(p_community), ''),
      p_planned_start_date, p_planned_end_date, p_actual_start_date, p_actual_end_date,
      p_planned_budget, p_actual_expenditure, p_physical_progress_pct,
      NULLIF(btrim(p_key_achievement), ''), NULLIF(btrim(p_issue_delay), ''),
      NULLIF(btrim(p_next_action), ''), p_next_action_due
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE merl.project_activities
    SET framework_node_id = p_framework_node_id,
        name = btrim(p_name),
        description = NULLIF(btrim(p_description), ''),
        status = p_status,
        responsible_org = NULLIF(btrim(p_responsible_org), ''),
        responsible_officer = NULLIF(btrim(p_responsible_officer), ''),
        province = NULLIF(btrim(p_province), ''),
        island = NULLIF(btrim(p_island), ''),
        area_council = NULLIF(btrim(p_area_council), ''),
        community = NULLIF(btrim(p_community), ''),
        planned_start_date = p_planned_start_date,
        planned_end_date = p_planned_end_date,
        actual_start_date = p_actual_start_date,
        actual_end_date = p_actual_end_date,
        planned_budget = p_planned_budget,
        actual_expenditure = p_actual_expenditure,
        physical_progress_pct = p_physical_progress_pct,
        key_achievement = NULLIF(btrim(p_key_achievement), ''),
        issue_delay = NULLIF(btrim(p_issue_delay), ''),
        next_action = NULLIF(btrim(p_next_action), ''),
        next_action_due = p_next_action_due,
        updated_at = now()
    WHERE id = p_id AND project_id = p_project_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Activity not found in the selected project';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_project_activity_v2(
  uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,date,date,date,date,numeric,numeric,numeric,text,text,text,date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_project_activity_v2(
  uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,date,date,date,date,numeric,numeric,numeric,text,text,text,date
) TO authenticated;
