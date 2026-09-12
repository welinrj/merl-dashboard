-- Make delete operations reliable and project-scoped.
-- Admin project deletion clears the two RESTRICT children and unlocks periods
-- before cascading. Period deletion removes period-scoped data so no orphaned
-- records remain.

CREATE OR REPLACE FUNCTION public.admin_delete_project(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=merl,public,pg_temp
AS $$
DECLARE v_exists boolean;
BEGIN
  IF NOT merl.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501';
  END IF;

  SELECT true INTO v_exists FROM merl.projects WHERE id=p_id;
  IF NOT coalesce(v_exists,false) THEN
    RAISE EXCEPTION 'Project not found';
  END IF;

  -- Locked-period triggers protect normal reporting edits. An administrator
  -- explicitly deleting the whole project is a different operation, so make
  -- those periods deletable before the cascade.
  UPDATE merl.reporting_periods
  SET submission_status='draft',
      approved_at=NULL,
      locked_at=NULL,
      reviewer_id=NULL,
      review_comments=NULL,
      updated_at=now()
  WHERE project_id=p_id;

  DELETE FROM merl.project_budget_allocations WHERE project_id=p_id;
  DELETE FROM merl.project_source_register WHERE project_id=p_id;
  DELETE FROM merl.projects WHERE id=p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_reporting_period(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=merl,public,pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_label text;
  v_status text;
  v_admin boolean;
BEGIN
  PERFORM merl.require_editor();

  SELECT project_id,period_label,submission_status
  INTO v_project_id,v_label,v_status
  FROM merl.reporting_periods
  WHERE id=p_id;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'Reporting period not found';
  END IF;
  IF NOT merl.can_access_project(v_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;

  v_admin := merl.is_admin();
  IF v_status='approved' AND NOT v_admin THEN
    RAISE EXCEPTION 'Approved periods must be reopened before they can be deleted';
  END IF;

  IF v_status='approved' THEN
    UPDATE merl.reporting_periods
    SET submission_status='draft',approved_at=NULL,locked_at=NULL,reviewer_id=NULL,
        review_comments=NULL,updated_at=now()
    WHERE id=p_id;
  END IF;

  -- Delete the data represented by the period before deleting the period itself.
  DELETE FROM merl.indicator_progress
    WHERE project_id=v_project_id AND reporting_period=v_label;
  DELETE FROM merl.financial_progress
    WHERE project_id=v_project_id AND reporting_period=v_label;
  DELETE FROM merl.beneficiaries
    WHERE project_id=v_project_id AND reporting_period=v_label;
  DELETE FROM merl.learning_updates
    WHERE project_id=v_project_id AND reporting_period=v_label;
  DELETE FROM merl.evidence
    WHERE project_id=v_project_id AND reporting_period=v_label;

  DELETE FROM merl.reporting_periods WHERE id=p_id;
END;
$$;

-- All ordinary record deletes must enforce project scope because these are
-- SECURITY DEFINER functions and therefore must not rely on table RLS.
CREATE OR REPLACE FUNCTION public.delete_financial_progress(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor();
  SELECT project_id INTO v_project_id FROM merl.financial_progress WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Financial progress not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501'; END IF;
  DELETE FROM merl.financial_progress WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_beneficiaries(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor('beneficiaries.enter');
  SELECT project_id INTO v_project_id FROM merl.beneficiaries WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Beneficiary record not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501'; END IF;
  DELETE FROM merl.beneficiaries WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_indicator_progress(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor('indicator_progress.enter');
  SELECT project_id INTO v_project_id FROM merl.indicator_progress WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Indicator progress not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501'; END IF;
  DELETE FROM merl.indicator_progress WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_learning_update(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor();
  SELECT project_id INTO v_project_id FROM merl.learning_updates WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Learning update not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501'; END IF;
  DELETE FROM merl.learning_updates WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_evidence(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor('evidence.upload');
  SELECT project_id INTO v_project_id FROM merl.evidence WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Evidence not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501'; END IF;
  DELETE FROM merl.evidence WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_risk_issue(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor('risks.edit');
  SELECT project_id INTO v_project_id FROM merl.risks_issues WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Risk/issue not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501'; END IF;
  DELETE FROM merl.risks_issues WHERE id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.delete_project_activity(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=merl,public,pg_temp AS $$
DECLARE v_project_id uuid;
BEGIN
  PERFORM merl.require_editor('activities.edit');
  SELECT project_id INTO v_project_id FROM merl.project_activities WHERE id=p_id;
  IF v_project_id IS NULL THEN RAISE EXCEPTION 'Activity not found'; END IF;
  IF NOT merl.can_access_project(v_project_id) THEN RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501'; END IF;
  DELETE FROM merl.project_activities WHERE id=p_id;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_delete_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_reporting_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_financial_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_beneficiaries(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_indicator_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_learning_update(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_evidence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_risk_issue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_activity(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_delete_project(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_reporting_period(uuid) FROM anon;
