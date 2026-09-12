-- MERL Dashboard – manage Area Council coverage/feasibility and project KPI configuration.
-- Writes are project-scoped and go through role-checked SECURITY DEFINER RPCs.

CREATE OR REPLACE FUNCTION public.upsert_project_area_council(
  p_id uuid,
  p_project_id uuid,
  p_area_council_name text,
  p_coverage_status text DEFAULT 'active',
  p_feasibility_status text DEFAULT 'not_assessed',
  p_feasibility_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE
  v_user merl.users;
  v_id uuid;
  v_ref merl.ref_area_councils;
BEGIN
  v_user := merl.require_editor();
  IF NOT merl.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_area_council_name),'') IS NULL THEN
    RAISE EXCEPTION 'Area Council is required';
  END IF;
  IF p_coverage_status NOT IN ('planned','active','completed','not_covered') THEN
    RAISE EXCEPTION 'Invalid coverage status';
  END IF;
  IF p_feasibility_status NOT IN ('confirmed','conditional','under_assessment','not_feasible','not_assessed') THEN
    RAISE EXCEPTION 'Invalid feasibility status';
  END IF;

  SELECT * INTO v_ref
  FROM merl.ref_area_councils
  WHERE lower(name)=lower(btrim(p_area_council_name))
  LIMIT 1;

  IF p_id IS NULL THEN
    INSERT INTO merl.project_area_councils(
      project_id,area_council_id,province_code,area_council_name,
      coverage_status,feasibility_status,feasibility_note,verified_at,verified_by,updated_at
    ) VALUES (
      p_project_id,v_ref.id,v_ref.province_code,btrim(p_area_council_name),
      p_coverage_status,p_feasibility_status,nullif(btrim(p_feasibility_note),''),
      CASE WHEN p_feasibility_status='confirmed' THEN now() ELSE NULL END,
      CASE WHEN p_feasibility_status='confirmed' THEN v_user.id ELSE NULL END,
      now()
    )
    ON CONFLICT (project_id,area_council_name) DO UPDATE SET
      area_council_id=excluded.area_council_id,
      province_code=excluded.province_code,
      coverage_status=excluded.coverage_status,
      feasibility_status=excluded.feasibility_status,
      feasibility_note=excluded.feasibility_note,
      verified_at=CASE WHEN excluded.feasibility_status='confirmed' THEN now() ELSE NULL END,
      verified_by=CASE WHEN excluded.feasibility_status='confirmed' THEN v_user.id ELSE NULL END,
      updated_at=now()
    RETURNING id INTO v_id;
  ELSE
    UPDATE merl.project_area_councils SET
      area_council_id=v_ref.id,
      province_code=v_ref.province_code,
      area_council_name=btrim(p_area_council_name),
      coverage_status=p_coverage_status,
      feasibility_status=p_feasibility_status,
      feasibility_note=nullif(btrim(p_feasibility_note),''),
      verified_at=CASE WHEN p_feasibility_status='confirmed' THEN now() ELSE NULL END,
      verified_by=CASE WHEN p_feasibility_status='confirmed' THEN v_user.id ELSE NULL END,
      updated_at=now()
    WHERE id=p_id AND project_id=p_project_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Area Council coverage record not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_project_area_council(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor();
  SELECT project_id INTO v_project_id FROM merl.project_area_councils WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Area Council coverage record not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  DELETE FROM merl.project_area_councils WHERE id=p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_dashboard_kpi_config(
  p_id uuid,
  p_project_id uuid,
  p_indicator_id uuid,
  p_dashboard_scope text DEFAULT 'project',
  p_short_label text DEFAULT NULL,
  p_display_order integer DEFAULT 0,
  p_show_target boolean DEFAULT true,
  p_show_progress boolean DEFAULT true,
  p_is_public boolean DEFAULT false,
  p_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  PERFORM merl.require_editor();
  IF NOT merl.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  IF p_dashboard_scope NOT IN ('portfolio','project','public') THEN
    RAISE EXCEPTION 'Invalid dashboard scope';
  END IF;
  SELECT name INTO v_name FROM merl.project_indicators
  WHERE id=p_indicator_id AND project_id=p_project_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Indicator does not belong to this project'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO merl.dashboard_kpi_config(
      project_id,indicator_id,dashboard_scope,short_label,display_order,
      show_target,show_progress,is_public,active
    ) VALUES (
      p_project_id,p_indicator_id,p_dashboard_scope,
      coalesce(nullif(btrim(p_short_label),''),v_name),coalesce(p_display_order,0),
      coalesce(p_show_target,true),coalesce(p_show_progress,true),
      coalesce(p_is_public,false),coalesce(p_active,true)
    )
    ON CONFLICT (project_id,indicator_id,dashboard_scope) DO UPDATE SET
      short_label=excluded.short_label,
      display_order=excluded.display_order,
      show_target=excluded.show_target,
      show_progress=excluded.show_progress,
      is_public=excluded.is_public,
      active=excluded.active
    RETURNING id INTO v_id;
  ELSE
    UPDATE merl.dashboard_kpi_config SET
      indicator_id=p_indicator_id,
      dashboard_scope=p_dashboard_scope,
      short_label=coalesce(nullif(btrim(p_short_label),''),v_name),
      display_order=coalesce(p_display_order,0),
      show_target=coalesce(p_show_target,true),
      show_progress=coalesce(p_show_progress,true),
      is_public=coalesce(p_is_public,false),
      active=coalesce(p_active,true)
    WHERE id=p_id AND project_id=p_project_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'KPI configuration not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_dashboard_kpi_config(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor();
  SELECT project_id INTO v_project_id FROM merl.dashboard_kpi_config WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'KPI configuration not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  DELETE FROM merl.dashboard_kpi_config WHERE id=p_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_project_area_council(uuid,uuid,text,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_project_area_council(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_dashboard_kpi_config(uuid,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_dashboard_kpi_config(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.upsert_project_area_council(uuid,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_area_council(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_dashboard_kpi_config(uuid,uuid,uuid,text,text,integer,boolean,boolean,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_dashboard_kpi_config(uuid) TO authenticated;
