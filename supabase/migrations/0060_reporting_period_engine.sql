-- MERL Dashboard – standard reporting-period engine and period progress rollups.
-- Supports internal Monthly, Quarterly, Six-monthly and Annual reporting without
-- changing a project's official donor reporting frequency.

CREATE UNIQUE INDEX IF NOT EXISTS reporting_periods_project_label_uidx
  ON merl.reporting_periods(project_id, period_label);

CREATE OR REPLACE FUNCTION public.ensure_standard_reporting_periods(
  p_project_id uuid,
  p_year integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = merl, public, pg_temp
AS $$
DECLARE
  v_user merl.users;
  v_count integer := 0;
  m integer;
  q integer;
  h integer;
  v_start date;
  v_end date;
BEGIN
  v_user := merl.require_editor();
  IF NOT merl.can_access_project(p_project_id) THEN
    RAISE EXCEPTION 'You do not have access to this project' USING ERRCODE='42501';
  END IF;
  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'Reporting year is outside the supported range';
  END IF;

  FOR m IN 1..12 LOOP
    v_start := make_date(p_year,m,1);
    v_end := (v_start + interval '1 month - 1 day')::date;
    INSERT INTO merl.reporting_periods(
      project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
    ) VALUES (
      p_project_id,format('%s-M%s',p_year,lpad(m::text,2,'0')),'monthly',v_start,v_end,v_user.id,v_user.id,v_user.id
    )
    ON CONFLICT (project_id,period_label) DO NOTHING;
    GET DIAGNOSTICS m = ROW_COUNT;
    v_count := v_count + m;
  END LOOP;

  FOR q IN 1..4 LOOP
    v_start := make_date(p_year,((q-1)*3)+1,1);
    v_end := (v_start + interval '3 months - 1 day')::date;
    INSERT INTO merl.reporting_periods(
      project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
    ) VALUES (
      p_project_id,format('%s-Q%s',p_year,q),'quarterly',v_start,v_end,v_user.id,v_user.id,v_user.id
    )
    ON CONFLICT (project_id,period_label) DO NOTHING;
    GET DIAGNOSTICS q = ROW_COUNT;
    v_count := v_count + q;
  END LOOP;

  FOR h IN 1..2 LOOP
    v_start := make_date(p_year,((h-1)*6)+1,1);
    v_end := (v_start + interval '6 months - 1 day')::date;
    INSERT INTO merl.reporting_periods(
      project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
    ) VALUES (
      p_project_id,format('%s-H%s',p_year,h),'six_monthly',v_start,v_end,v_user.id,v_user.id,v_user.id
    )
    ON CONFLICT (project_id,period_label) DO NOTHING;
    GET DIAGNOSTICS h = ROW_COUNT;
    v_count := v_count + h;
  END LOOP;

  v_start := make_date(p_year,1,1);
  v_end := make_date(p_year,12,31);
  INSERT INTO merl.reporting_periods(
    project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
  ) VALUES (
    p_project_id,p_year::text,'annual',v_start,v_end,v_user.id,v_user.id,v_user.id
  )
  ON CONFLICT (project_id,period_label) DO NOTHING;
  GET DIAGNOSTICS m = ROW_COUNT;
  v_count := v_count + m;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_standard_reporting_periods(uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_standard_reporting_periods(uuid,integer) TO authenticated;

CREATE OR REPLACE VIEW public.v_project_period_progress
WITH (security_invoker=true) AS
SELECT
  rp.id AS reporting_period_id,
  rp.project_id,
  rp.period_label,
  rp.period_type,
  rp.period_start,
  rp.period_end,
  rp.submission_status,
  rp.submitted_at,
  rp.approved_at,
  count(pi.id) AS indicator_count,
  count(ip.id) FILTER (WHERE ip.achievement_pct IS NOT NULL) AS indicators_reported,
  round(avg(ip.achievement_pct) FILTER (WHERE ip.achievement_pct IS NOT NULL),1) AS progress_pct,
  count(ip.id) FILTER (WHERE ip.performance_status IN ('off_track','at_risk')) AS at_risk_results,
  count(ip.id) FILTER (WHERE ip.schedule_status='delayed') AS delayed_results
FROM merl.reporting_periods rp
LEFT JOIN merl.project_indicators pi ON pi.project_id=rp.project_id
LEFT JOIN merl.indicator_progress ip
  ON ip.project_id=rp.project_id
 AND ip.indicator_id=pi.id
 AND ip.reporting_period=rp.period_label
GROUP BY rp.id,rp.project_id,rp.period_label,rp.period_type,rp.period_start,rp.period_end,
         rp.submission_status,rp.submitted_at,rp.approved_at;

CREATE OR REPLACE VIEW public.v_portfolio_period_progress
WITH (security_invoker=true) AS
SELECT
  period_label,
  period_type,
  min(period_start) AS period_start,
  max(period_end) AS period_end,
  count(*) AS project_periods,
  count(*) FILTER (WHERE submission_status='approved') AS approved_project_periods,
  round(avg(progress_pct) FILTER (WHERE progress_pct IS NOT NULL),1) AS portfolio_progress_pct,
  sum(at_risk_results) AS at_risk_results,
  sum(delayed_results) AS delayed_results
FROM public.v_project_period_progress
GROUP BY period_label,period_type;

GRANT SELECT ON public.v_project_period_progress, public.v_portfolio_period_progress TO authenticated;
