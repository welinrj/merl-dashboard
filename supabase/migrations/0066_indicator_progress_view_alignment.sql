-- Keep the public indicator-progress view aligned with the rebuilt results engine.
-- The table gained schedule/review/publication fields after the original i18n view
-- was created; analytics pages need those fields without querying merl.* directly.

CREATE OR REPLACE VIEW public.v_indicator_progress
WITH (security_invoker=true) AS
SELECT
  ip.id,
  ip.project_id,
  ip.indicator_id,
  ip.reporting_period,
  ip.period_target,
  ip.actual_this_period,
  ip.cumulative_actual,
  ip.previous_value,
  ip.achievement_pct,
  ip.variance,
  ip.performance_status,
  ip.schedule_status,
  ip.narrative,
  ip.variance_reason,
  ip.corrective_action,
  ip.key_achievements,
  ip.next_period_priorities,
  ip.area_council_name,
  ip.review_status,
  ip.approved_by,
  ip.approved_at,
  ip.published_at,
  ip.reported_by,
  ip.date_reported,
  ip.created_by,
  ip.created_at,
  ip.updated_by,
  ip.updated_at,
  i.code AS indicator_code,
  i.name AS indicator_name,
  i.unit,
  i.target_value AS final_target,
  i.is_qualitative,
  i.higher_is_better,
  ru.full_name AS reported_by_name,
  coalesce(ip.i18n,'{}'::jsonb) AS i18n
FROM merl.indicator_progress ip
JOIN merl.project_indicators i ON i.id=ip.indicator_id
LEFT JOIN merl.users ru ON ru.id=ip.reported_by;

GRANT SELECT ON public.v_indicator_progress TO authenticated;
REVOKE SELECT ON public.v_indicator_progress FROM anon;
