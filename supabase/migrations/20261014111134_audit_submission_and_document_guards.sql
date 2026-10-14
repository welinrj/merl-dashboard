-- Enforce the reporting contract on every submission path, including direct RPCs.
CREATE OR REPLACE FUNCTION public.submit_reporting_period(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user merl.users;
  v_period merl.reporting_periods;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  v_user := merl.require_editor();
  SELECT * INTO v_period FROM merl.reporting_periods WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
  PERFORM merl.require_project_access(v_period.project_id);
  IF v_period.submission_status NOT IN ('draft','returned') THEN
    RAISE EXCEPTION 'Reporting period is not in a submittable state';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM merl.indicator_progress WHERE project_id=v_period.project_id AND reporting_period=v_period.period_label) THEN
    v_missing := array_append(v_missing, 'Indicator progress');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM merl.financial_progress WHERE project_id=v_period.project_id AND reporting_period=v_period.period_label) THEN
    v_missing := array_append(v_missing, 'Financial progress');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM merl.learning_updates WHERE project_id=v_period.project_id AND reporting_period=v_period.period_label) THEN
    v_missing := array_append(v_missing, 'Achievements and learning');
  END IF;
  IF cardinality(v_missing)>0 THEN
    RAISE EXCEPTION 'Complete the required reporting sections before submitting: %', array_to_string(v_missing, ', ') USING ERRCODE='23514';
  END IF;
  UPDATE merl.reporting_periods SET submission_status='submitted', submitted_at=now(), updated_by=v_user.id WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_reporting_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_reporting_period(uuid) TO authenticated;

-- This legacy metadata-only endpoint is unused by the current evidence workspace.
-- Retain it for a controlled service migration, but remove it from the client API.
REVOKE ALL ON FUNCTION public.add_project_document(text,text,text,text,text,text,bigint,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_project_document(text,text,text,text,text,text,bigint,text,integer) TO service_role;
COMMENT ON FUNCTION public.add_project_document(text,text,text,text,text,text,bigint,text,integer)
IS 'Retired client endpoint. Use project-scoped evidence APIs; service migration only.';
