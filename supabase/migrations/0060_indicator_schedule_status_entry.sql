BEGIN;

DROP FUNCTION IF EXISTS public.upsert_indicator_progress(
  uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,text,date
);

CREATE FUNCTION public.upsert_indicator_progress(
  p_id uuid,p_project_id uuid,p_indicator_id uuid,p_reporting_period text,
  p_period_target numeric DEFAULT NULL,p_actual_this_period numeric DEFAULT NULL,
  p_cumulative_actual numeric DEFAULT NULL,p_previous_value numeric DEFAULT NULL,
  p_achievement_pct numeric DEFAULT NULL,p_variance numeric DEFAULT NULL,
  p_performance_status text DEFAULT NULL,p_schedule_status text DEFAULT 'on_schedule',
  p_narrative text DEFAULT NULL,p_variance_reason text DEFAULT NULL,
  p_corrective_action text DEFAULT NULL,p_date_reported date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'merl','public'
AS $$
DECLARE
  v_user merl.users; v_id uuid; v_actual numeric; v_pct numeric;
  v_variance numeric; v_status text; v_schedule text;
BEGIN
  v_user:=merl.require_editor('indicator_progress.enter');
  IF NOT merl.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM merl.project_indicators WHERE id=p_indicator_id AND project_id=p_project_id
  ) THEN RAISE EXCEPTION 'Indicator does not belong to the selected project'; END IF;

  v_actual:=coalesce(p_cumulative_actual,p_actual_this_period);
  v_pct:=merl.calculate_indicator_achievement(p_indicator_id,v_actual,p_period_target);
  v_pct:=coalesce(v_pct,p_achievement_pct);
  v_variance:=coalesce(p_variance,
    CASE WHEN p_period_target IS NOT NULL AND v_actual IS NOT NULL
      THEN v_actual-p_period_target END);
  v_status:=coalesce(nullif(p_performance_status,''),
    merl.derive_performance_status(v_pct,p_period_target,v_actual));
  v_schedule:=coalesce(nullif(p_schedule_status,''),'on_schedule');

  IF v_schedule NOT IN ('on_schedule','delayed') THEN
    RAISE EXCEPTION 'Invalid schedule status';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO merl.indicator_progress(
      project_id,indicator_id,reporting_period,period_target,actual_this_period,
      cumulative_actual,previous_value,achievement_pct,variance,performance_status,
      schedule_status,narrative,variance_reason,corrective_action,reported_by,date_reported,
      created_by,updated_by,review_status
    ) VALUES (
      p_project_id,p_indicator_id,p_reporting_period,p_period_target,p_actual_this_period,
      p_cumulative_actual,p_previous_value,v_pct,v_variance,v_status,v_schedule,p_narrative,
      p_variance_reason,p_corrective_action,v_user.id,p_date_reported,v_user.id,v_user.id,'draft'
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE merl.indicator_progress SET
      reporting_period=p_reporting_period,period_target=p_period_target,
      actual_this_period=p_actual_this_period,cumulative_actual=p_cumulative_actual,
      previous_value=p_previous_value,achievement_pct=v_pct,variance=v_variance,
      performance_status=v_status,schedule_status=v_schedule,narrative=p_narrative,
      variance_reason=p_variance_reason,corrective_action=p_corrective_action,
      date_reported=p_date_reported,updated_by=v_user.id,
      review_status=CASE WHEN review_status IN ('returned','resubmitted')
        THEN 'resubmitted' ELSE 'draft' END
    WHERE id=p_id AND project_id=p_project_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Indicator progress not found'; END IF;
  END IF;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_indicator_progress(
  uuid,uuid,uuid,text,numeric,numeric,numeric,numeric,numeric,numeric,
  text,text,text,text,text,date
) TO authenticated;

COMMIT;
