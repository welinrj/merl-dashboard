-- Results framework edit scope.
-- System Administrator and DoCC M&E Officer may edit every project framework.
-- Project Managers may edit only projects actively assigned to them. Viewers are read-only.

CREATE OR REPLACE FUNCTION merl.can_edit_results_framework(p_project_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO merl, public
AS $function$
DECLARE v_user merl.users;
BEGIN
  v_user := merl.current_db_user();
  IF v_user.id IS NULL OR p_project_id IS NULL THEN RETURN false; END IF;
  IF v_user.role IN ('system_admin','docc_me_officer') THEN RETURN true; END IF;
  IF v_user.role = 'project_manager' THEN
    RETURN EXISTS (
      SELECT 1 FROM merl.user_project_assignments a
      WHERE a.user_id = v_user.id AND a.project_id = p_project_id AND a.is_active
    );
  END IF;
  RETURN false;
END;
$function$;

CREATE OR REPLACE FUNCTION merl.require_results_framework_editor(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO merl, public
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;
  IF NOT merl.can_edit_results_framework(p_project_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this project results framework'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_results_framework_editable_projects()
RETURNS TABLE(project_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO merl, public
AS $function$
  SELECT p.id FROM merl.projects p
  WHERE merl.can_edit_results_framework(p.id)
  ORDER BY p.id;
$function$;
REVOKE ALL ON FUNCTION public.list_results_framework_editable_projects() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_results_framework_editable_projects() TO authenticated;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['objectives','outcomes','outputs','project_indicators'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_scope ON merl.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON merl.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON merl.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON merl.%I', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON merl.%I FOR INSERT WITH CHECK (merl.can_edit_results_framework(project_id))', t, t);
    EXECUTE format('CREATE POLICY %I_update ON merl.%I FOR UPDATE USING (merl.can_edit_results_framework(project_id)) WITH CHECK (merl.can_edit_results_framework(project_id))', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON merl.%I FOR DELETE USING (merl.can_edit_results_framework(project_id))', t, t);
  END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION public.create_objective(p_project_id uuid, p_statement text, p_climate_theme text DEFAULT NULL, p_expected_outcome text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM merl.require_results_framework_editor(p_project_id);
  INSERT INTO merl.objectives (project_id, code, statement, climate_theme, expected_outcome, notes)
  VALUES (p_project_id, merl.next_code(p_project_id,'objective','OBJ'), merl.assert_statement(p_statement,'Objective'), p_climate_theme, p_expected_outcome, p_notes)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_objective(p_id uuid, p_statement text, p_climate_theme text DEFAULT NULL, p_expected_outcome text DEFAULT NULL, p_notes text DEFAULT NULL, p_status text DEFAULT 'draft')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.objectives WHERE id = p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Objective not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  UPDATE merl.objectives SET statement=merl.assert_statement(p_statement,'Objective'), climate_theme=p_climate_theme, expected_outcome=p_expected_outcome, notes=p_notes, status=COALESCE(p_status,status), updated_at=NOW() WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_objective(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.objectives WHERE id = p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Objective not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  DELETE FROM merl.objectives WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_outcome(p_objective_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_id uuid; v_proj uuid;
BEGIN
  SELECT project_id INTO v_proj FROM merl.objectives WHERE id=p_objective_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent objective not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_proj);
  INSERT INTO merl.outcomes (project_id,objective_id,code,statement,responsible_officer_id)
  VALUES (v_proj,p_objective_id,merl.next_code(v_proj,'outcome','OUT'),merl.assert_statement(p_statement,'Outcome'),p_responsible_officer_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_outcome(p_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL, p_status text DEFAULT 'draft')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.outcomes WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Outcome not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  UPDATE merl.outcomes SET statement=merl.assert_statement(p_statement,'Outcome'), responsible_officer_id=p_responsible_officer_id, status=COALESCE(p_status,status), updated_at=NOW() WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_outcome(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.outcomes WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Outcome not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  DELETE FROM merl.outcomes WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_output(p_outcome_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_id uuid; v_proj uuid;
BEGIN
  SELECT project_id INTO v_proj FROM merl.outcomes WHERE id=p_outcome_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'Parent outcome not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_proj);
  INSERT INTO merl.outputs (project_id,outcome_id,code,statement,responsible_officer_id)
  VALUES (v_proj,p_outcome_id,merl.next_code(v_proj,'output','OP'),merl.assert_statement(p_statement,'Output'),p_responsible_officer_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_output(p_id uuid, p_statement text, p_responsible_officer_id uuid DEFAULT NULL, p_status text DEFAULT 'draft')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.outputs WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Output not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  UPDATE merl.outputs SET statement=merl.assert_statement(p_statement,'Output'), responsible_officer_id=p_responsible_officer_id, status=COALESCE(p_status,status), updated_at=NOW() WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_output(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.outputs WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Output not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  DELETE FROM merl.outputs WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_project_indicator(p_project_id uuid, p_name text, p_unit text DEFAULT NULL, p_baseline_value numeric DEFAULT NULL, p_target_value numeric DEFAULT NULL, p_means_of_verification text DEFAULT NULL, p_frequency text DEFAULT NULL, p_linked_level text DEFAULT NULL, p_linked_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_id uuid;
BEGIN
  PERFORM merl.require_results_framework_editor(p_project_id);
  INSERT INTO merl.project_indicators (project_id,code,name,unit,baseline_value,target_value,means_of_verification,frequency,linked_level,linked_id)
  VALUES (p_project_id,merl.next_code(p_project_id,'indicator','IND'),btrim(p_name),p_unit,p_baseline_value,p_target_value,p_means_of_verification,p_frequency,p_linked_level,p_linked_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_project_indicator(p_id uuid, p_name text, p_unit text DEFAULT NULL, p_baseline_value numeric DEFAULT NULL, p_target_value numeric DEFAULT NULL, p_means_of_verification text DEFAULT NULL, p_frequency text DEFAULT NULL, p_linked_level text DEFAULT NULL, p_linked_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.project_indicators WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Indicator not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  UPDATE merl.project_indicators SET name=btrim(p_name), unit=p_unit, baseline_value=p_baseline_value, target_value=p_target_value, means_of_verification=p_means_of_verification, frequency=p_frequency, linked_level=p_linked_level, linked_id=p_linked_id, updated_at=NOW() WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_project_indicator(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_project_id uuid;
BEGIN
  SELECT project_id INTO v_project_id FROM merl.project_indicators WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Indicator not found'; END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  DELETE FROM merl.project_indicators WHERE id=p_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_project_indicator(
  p_id uuid, p_project_id uuid, p_name text, p_unit text DEFAULT NULL,
  p_baseline_value numeric DEFAULT NULL, p_target_value numeric DEFAULT NULL,
  p_means_of_verification text DEFAULT NULL, p_frequency text DEFAULT NULL,
  p_indicator_level text DEFAULT NULL, p_definition text DEFAULT NULL,
  p_baseline_year integer DEFAULT NULL, p_target_date date DEFAULT NULL,
  p_data_source text DEFAULT NULL, p_collection_method text DEFAULT NULL,
  p_responsible_officer_id uuid DEFAULT NULL, p_disaggregation text DEFAULT NULL,
  p_verification_method text DEFAULT NULL, p_assumptions text DEFAULT NULL,
  p_objective_id uuid DEFAULT NULL, p_outcome_id uuid DEFAULT NULL, p_output_id uuid DEFAULT NULL,
  p_is_qualitative boolean DEFAULT false, p_higher_is_better boolean DEFAULT true,
  p_responsible_officer text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO merl, public
AS $function$
DECLARE v_id uuid; v_level text; v_linked uuid; v_project_id uuid;
BEGIN
  IF p_id IS NULL THEN v_project_id := p_project_id;
  ELSE
    SELECT project_id INTO v_project_id FROM merl.project_indicators WHERE id=p_id;
    IF v_project_id IS NULL THEN RAISE EXCEPTION 'Indicator not found'; END IF;
  END IF;
  PERFORM merl.require_results_framework_editor(v_project_id);
  IF p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'Indicator name is required'; END IF;
  v_level := CASE WHEN p_output_id IS NOT NULL THEN 'output' WHEN p_outcome_id IS NOT NULL THEN 'outcome' WHEN p_objective_id IS NOT NULL THEN 'objective' END;
  v_linked := COALESCE(p_output_id,p_outcome_id,p_objective_id);
  IF p_id IS NULL THEN
    INSERT INTO merl.project_indicators (project_id,code,name,unit,baseline_value,target_value,means_of_verification,frequency,linked_level,linked_id,indicator_level,definition,baseline_year,target_date,data_source,collection_method,responsible_officer_id,disaggregation,verification_method,assumptions,objective_id,outcome_id,output_id,is_qualitative,higher_is_better,responsible_officer)
    VALUES (p_project_id,merl.next_code_w(p_project_id,'indicator','IND',3),btrim(p_name),p_unit,p_baseline_value,p_target_value,p_means_of_verification,p_frequency,v_level,v_linked,p_indicator_level,p_definition,p_baseline_year,p_target_date,p_data_source,p_collection_method,p_responsible_officer_id,p_disaggregation,p_verification_method,p_assumptions,p_objective_id,p_outcome_id,p_output_id,COALESCE(p_is_qualitative,false),COALESCE(p_higher_is_better,true),NULLIF(btrim(p_responsible_officer),''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE merl.project_indicators SET name=btrim(p_name),unit=p_unit,baseline_value=p_baseline_value,target_value=p_target_value,means_of_verification=p_means_of_verification,frequency=p_frequency,linked_level=v_level,linked_id=v_linked,indicator_level=p_indicator_level,definition=p_definition,baseline_year=p_baseline_year,target_date=p_target_date,data_source=p_data_source,collection_method=p_collection_method,responsible_officer_id=p_responsible_officer_id,disaggregation=p_disaggregation,verification_method=p_verification_method,assumptions=p_assumptions,objective_id=p_objective_id,outcome_id=p_outcome_id,output_id=p_output_id,is_qualitative=COALESCE(p_is_qualitative,is_qualitative),higher_is_better=COALESCE(p_higher_is_better,higher_is_better),responsible_officer=NULLIF(btrim(p_responsible_officer),''),updated_at=NOW()
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;
