import { latestReportedBy, withReportingDates } from './docc/progressSelection';
import { resultNumber } from './resultComparison';

const approved = new Set(['approved', 'published', 'locked']);
const critical = new Set(['at_risk', 'off_track']);
const attention = new Set(['attention_required', 'attention']);
const positive = new Set(['on_track', 'target_achieved']);

// Count each registered indicator target once, using its latest operational
// observation. Never sum units (people, hectares, documents) or cumulative rows.
export function finalTargetAttained(indicator, row) {
  if (!row) return null;
  // A completed quarterly target is not a completed framework target.
  if (indicator?.is_qualitative) {
    return resultNumber(row.period_target) === null && resultNumber(row.achievement_pct) !== null
      ? Number(row.achievement_pct) >= 100 : null;
  }
  const actual = resultNumber(row.cumulative_actual);
  const target = resultNumber(row.final_target) ?? resultNumber(indicator?.target_value);
  if (actual === null || target === null) return null;
  return indicator?.higher_is_better === false ? actual <= target : actual >= target;
}

export function executivePortfolio(projects = [], indicators = [], progress = [], periods = [], { activities = [], period = '' } = {}) {
  const counts = { total: projects.length, on_track: 0, attention: 0, critical: 0, unassessed: 0 };
  const targets = { total: 0, achieved: 0, reported: 0, pending: 0, approvedAchieved: 0, percentage: null };
  const rows = projects.map(project => {
    const own = [...new Map(indicators.filter(i => i.project_id === project.id).map(i => [i.id, i])).values()];
    const ids = new Set(own.map(i => i.id));
    const latest = [...latestReportedBy(withReportingDates(progress.filter(r => r.project_id === project.id && ids.has(r.indicator_id)), periods)).values()];
    const byId = new Map(own.map(i => [i.id, i]));
    const measured = latest.filter(r => finalTargetAttained(byId.get(r.indicator_id), r) !== null);
    const achieved = measured.filter(r => finalTargetAttained(byId.get(r.indicator_id), r) === true);
    const pending = measured.filter(r => !approved.has(r.review_status)).length;
    // Global register/activity status is not evidence for a selected past period.
    const register = period ? '' : project.registered_status ?? project.status;
    const delayed = latest.some(r => r.schedule_status === 'delayed') || (!period && activities.some(a => a.project_id === project.id && a.status === 'delayed'));
    const health = latest.some(r => critical.has(r.performance_status)) || ['at_risk','off_track','suspended'].includes(register) ? 'critical'
      : delayed || latest.some(r => attention.has(r.performance_status)) || ['attention','attention_required','on_hold','delayed'].includes(register) ? 'attention'
      : own.length > 0 && latest.length === own.length && latest.every(r => positive.has(r.performance_status)) ? 'on_track'
      : 'unassessed';
    counts[health]++;
    targets.total += own.length;
    targets.reported += measured.length;
    targets.achieved += achieved.length;
    targets.pending += pending;
    targets.approvedAchieved += achieved.filter(r => approved.has(r.review_status)).length;
    return { project, health, total: own.length, achieved: achieved.length, reported: measured.length };
  });
  targets.percentage = targets.total ? Math.round(targets.achieved / targets.total * 1000) / 10 : null;
  return { counts, targets, rows };
}
