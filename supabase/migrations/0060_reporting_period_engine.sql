-- MERL Dashboard – standard reporting-period engine.
-- Supports internal Monthly, Quarterly, Six-monthly and Annual reporting without
-- changing a project's official donor reporting frequency.
-- Period progress rollup views already exist in the rebuilt results engine and
-- are intentionally left unchanged here.

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
  v_rows integer := 0;
  i integer;
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

  FOR i IN 1..12 LOOP
    v_start := make_date(p_year,i,1);
    v_end := (v_start + interval '1 month - 1 day')::date;
    INSERT INTO merl.reporting_periods(
      project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
    ) VALUES (
      p_project_id,format('%s-M%s',p_year,lpad(i::text,2,'0')),'monthly',v_start,v_end,v_user.id,v_user.id,v_user.id
    )
    ON CONFLICT (project_id,period_label) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END LOOP;

  FOR i IN 1..4 LOOP
    v_start := make_date(p_year,((i-1)*3)+1,1);
    v_end := (v_start + interval '3 months - 1 day')::date;
    INSERT INTO merl.reporting_periods(
      project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
    ) VALUES (
      p_project_id,format('%s-Q%s',p_year,i),'quarterly',v_start,v_end,v_user.id,v_user.id,v_user.id
    )
    ON CONFLICT (project_id,period_label) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END LOOP;

  FOR i IN 1..2 LOOP
    v_start := make_date(p_year,((i-1)*6)+1,1);
    v_end := (v_start + interval '6 months - 1 day')::date;
    INSERT INTO merl.reporting_periods(
      project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
    ) VALUES (
      p_project_id,format('%s-H%s',p_year,i),'six_monthly',v_start,v_end,v_user.id,v_user.id,v_user.id
    )
    ON CONFLICT (project_id,period_label) DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_count := v_count + v_rows;
  END LOOP;

  INSERT INTO merl.reporting_periods(
    project_id,period_label,period_type,period_start,period_end,reporting_officer_id,created_by,updated_by
  ) VALUES (
    p_project_id,p_year::text,'annual',make_date(p_year,1,1),make_date(p_year,12,31),
    v_user.id,v_user.id,v_user.id
  )
  ON CONFLICT (project_id,period_label) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_count := v_count + v_rows;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_standard_reporting_periods(uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_standard_reporting_periods(uuid,integer) TO authenticated;

GRANT SELECT ON public.v_project_period_progress, public.v_portfolio_period_progress TO authenticated;
