BEGIN;

ALTER TABLE merl.indicator_progress DISABLE TRIGGER USER;
ALTER TABLE merl.indicator_progress
  DROP CONSTRAINT IF EXISTS indicator_progress_performance_status_check;

UPDATE merl.indicator_progress
SET performance_status='at_risk'
WHERE performance_status='off_track';

ALTER TABLE merl.indicator_progress
  ADD CONSTRAINT indicator_progress_performance_status_check
  CHECK (
    performance_status IS NULL OR performance_status IN (
      'on_track','attention_required','at_risk','target_achieved','no_data'
    )
  );
ALTER TABLE merl.indicator_progress ENABLE TRIGGER USER;

CREATE OR REPLACE FUNCTION merl.derive_performance_status(
  p_pct numeric,p_target numeric,p_actual numeric
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_actual IS NULL THEN 'no_data'
    WHEN p_target IS NOT NULL AND p_actual=p_target THEN 'target_achieved'
    WHEN p_pct IS NULL THEN 'no_data'
    WHEN p_pct >= 100 THEN 'target_achieved'
    WHEN p_pct >= 90 THEN 'on_track'
    WHEN p_pct >= 70 THEN 'attention_required'
    ELSE 'at_risk'
  END;
$$;

CREATE OR REPLACE VIEW public.v_project_period_progress
WITH (security_invoker=true) AS
SELECT
  rp.project_id,rp.id reporting_period_id,rp.period_label,rp.period_type,
  rp.period_start,rp.period_end,rp.submission_status,
  round(avg(ip.achievement_pct) FILTER (WHERE ip.achievement_pct IS NOT NULL),2) progress_pct,
  count(ip.id) result_rows,
  count(ip.id) FILTER (WHERE ip.performance_status='on_track') on_track_results,
  count(ip.id) FILTER (WHERE ip.performance_status='attention_required') attention_results,
  count(ip.id) FILTER (WHERE ip.performance_status='at_risk') at_risk_results,
  count(ip.id) FILTER (WHERE ip.schedule_status='delayed') delayed_results,
  count(ip.id) FILTER (WHERE ip.review_status IN ('approved','published','locked')) approved_results,
  count(rn.id) FILTER (
    WHERE coalesce(rn.progress_summary,rn.key_achievements,rn.challenges,
                   rn.corrective_actions,rn.next_period_priorities) IS NOT NULL
  ) narrative_rows
FROM merl.reporting_periods rp
LEFT JOIN merl.indicator_progress ip
  ON ip.project_id=rp.project_id AND ip.reporting_period=rp.period_label
LEFT JOIN merl.result_narratives rn ON rn.indicator_progress_id=ip.id
GROUP BY rp.project_id,rp.id,rp.period_label,rp.period_type,
         rp.period_start,rp.period_end,rp.submission_status;

CREATE OR REPLACE VIEW public.v_portfolio_period_progress
WITH (security_invoker=true) AS
SELECT
  period_type,period_label,period_start,period_end,
  round(avg(progress_pct) FILTER (WHERE progress_pct IS NOT NULL),2) portfolio_progress_pct,
  count(*) projects_reporting,
  count(*) FILTER (WHERE submission_status='approved') projects_approved,
  sum(at_risk_results) at_risk_results,
  sum(delayed_results) delayed_results
FROM public.v_project_period_progress
GROUP BY period_type,period_label,period_start,period_end;

GRANT SELECT ON public.v_project_period_progress,public.v_portfolio_period_progress TO authenticated;

COMMIT;
