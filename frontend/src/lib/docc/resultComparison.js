import { compareReportedRows, latestReportedBy, reportedAchievement } from './progressSelection';
import { frameworkTargetValue } from './frameworkTarget';

const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));
export function indicatorTargets(rows = []) {
  const result = new Map();
  for (const row of [...rows].sort(compareTargetVersions)) {
    const bag = result.get(row.indicator_id) || {};
    bag[row.target_type] = row;
    result.set(row.indicator_id, bag);
  }
  return result;
}

// Same ordering as the target-save RPC, including effective dates and revisions.
export function compareTargetVersions(a, b) {
  const time = value => Date.parse(value || '') || 0;
  return time(a.period_end || a.created_at) - time(b.period_end || b.created_at)
    || time(a.updated_at || a.created_at) - time(b.updated_at || b.created_at)
    || String(a.id).localeCompare(String(b.id));
}

// Compare recorded observations, never sum successive cumulative snapshots.
// Missing/qualitative/ordinal values do not become numeric zero or a new score.
export function resultComparison(indicator, current, history = [], targets = {}, periods = []) {
  const baseline = frameworkTargetValue(targets.baseline, indicator?.baseline_value);
  const finalTarget = frameworkTargetValue(targets.final, indicator?.target_value);
  const isPeriod = current?.cumulative_actual == null && current?.actual_this_period != null;
  const actualKey = isPeriod ? 'actual_this_period' : 'cumulative_actual';
  const actual = current?.[actualKey] ?? null;
  const periodRecord = row => periods.find(p => p.project_id === row?.project_id && p.period_label === row?.reporting_period);
  const currentPeriod = periodRecord(current);
  const previous = current ? latestReportedBy(history.filter(row => row.indicator_id === indicator.id
    && row.project_id === current.project_id && row.reporting_period !== current.reporting_period
    && compareReportedRows(row, current) < 0
    && currentPeriod?.period_type && periodRecord(row)?.period_type === currentPeriod.period_type)).get(indicator.id) : null;
  const previousActual = previous?.[actualKey] ?? null;
  const target = isPeriod ? current?.period_target : current?.final_target ?? finalTarget;
  const arithmetic = !indicator?.is_qualitative && !targets.final?.ordinal_value;
  const change = arithmetic && numeric(actual) && numeric(previousActual) ? Number(actual) - Number(previousActual) : null;
  const gap = arithmetic && numeric(actual) && numeric(target) ? Number(target) - Number(actual) : null;
  const method = indicator?.progress_method;
  const canInfer = !method || ['ratio', 'target_ratio'].includes(method);
  const achievement = numeric(current?.achievement_pct) ? Number(current.achievement_pct)
    : canInfer && indicator?.direction !== 'decrease' && indicator?.direction !== 'maintain'
      ? reportedAchievement({ ...indicator, target_value: finalTarget }, current) : null;
  return { baseline, finalTarget, target, actual, actualKey, previous, previousActual, change, gap, achievement,
    period: current?.reporting_period || null, approval: currentPeriod?.submission_status || null,
    basis: isPeriod ? 'period' : 'cumulative', direction: indicator?.direction || (indicator?.higher_is_better === false ? 'decrease' : 'increase') };
}
