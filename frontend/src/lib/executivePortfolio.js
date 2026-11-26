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

export function executivePortfolio(projects = [], indicators = [], progress = [], periods = [], { activities = [], period = '', portfolioStatus = [] } = {}) {
  const counts = { total: projects.length, on_track: 0, attention: 0, critical: 0, unassessed: 0 };
  const targets = { total: 0, achieved: 0, reported: 0, pending: 0, approvedAchieved: 0, percentage: null };
  let draftUpdates = 0;
  const rows = projects.map(project => {
    const own = [...new Map(indicators.filter(i => i.project_id === project.id).map(i => [i.id, i])).values()];
    const ids = new Set(own.map(i => i.id));
    const dated = withReportingDates(progress.filter(r => r.project_id === project.id && ids.has(r.indicator_id)), periods);
    const latest = [...latestReportedBy(dated).values()];
    draftUpdates += [...latestReportedBy(dated, 'indicator_id', {includeDraft:true}).values()].filter(r=>r.review_status==='draft').length;
    const byId = new Map(own.map(i => [i.id, i]));
    const measured = latest.filter(r => finalTargetAttained(byId.get(r.indicator_id), r) !== null);
    const achieved = measured.filter(r => finalTargetAttained(byId.get(r.indicator_id), r) === true);
    const pending = measured.filter(r => !approved.has(r.review_status)).length;
    // Global register/activity status is not evidence for a selected past period.
    const register = period ? '' : project.registered_status ?? project.status;
    const assessment = period ? null : portfolioStatus.find(r=>r.project_id===project.id);
    const delayed = latest.some(r => r.schedule_status === 'delayed') || assessment?.schedule_status==='delayed' || (!period && activities.some(a => a.project_id === project.id && a.status === 'delayed'));
    const hasUpdate = latest.some(r => resultNumber(r.cumulative_actual) !== null
      || resultNumber(r.actual_this_period) !== null || resultNumber(r.achievement_pct) !== null
      || positive.has(r.performance_status) || critical.has(r.performance_status) || attention.has(r.performance_status)
      || (typeof r.narrative === 'string' && r.narrative.trim()));
    const fullyPositive = own.length > 0 && latest.length === own.length
      && latest.every(r => positive.has(r.performance_status) || finalTargetAttained(byId.get(r.indicator_id),r) === true);
    const recordedPositive = assessment?.performance_status==='on_track'
      && (hasUpdate || resultNumber(assessment.progress_pct)!==null);
    const health = latest.some(r => critical.has(r.performance_status)) || critical.has(assessment?.performance_status) || ['at_risk','off_track','suspended'].includes(register) ? 'critical'
      : delayed || latest.some(r => attention.has(r.performance_status)) || attention.has(assessment?.performance_status) || ['attention','attention_required','on_hold','delayed'].includes(register) ? 'attention'
      : fullyPositive || recordedPositive ? 'on_track'
      : hasUpdate ? 'attention' : 'unassessed';
    const healthBasis = health === 'attention' && !delayed && !attention.has(assessment?.performance_status) && !latest.some(r => attention.has(r.performance_status))
      && !['attention','attention_required','on_hold','delayed'].includes(register) ? 'assessment_gaps' : health;
    counts[health]++;
    targets.total += own.length;
    targets.reported += measured.length;
    targets.achieved += achieved.length;
    targets.pending += pending;
    targets.approvedAchieved += achieved.filter(r => approved.has(r.review_status)).length;
    return { project, health, healthBasis, total: own.length, achieved: achieved.length, reported: measured.length };
  });
  targets.percentage = targets.total && targets.reported ? Math.round(targets.achieved / targets.total * 1000) / 10 : null;
  return { counts, targets, rows, draftUpdates, frameworks: projects.filter(p => p.has_results_framework !== false).length,
    assessmentGaps: rows.filter(row => row.healthBasis === 'assessment_gaps').length };
}

// The executive overview is a current snapshot. A saved historical period is
// used by detailed views, never to erase the latest portfolio assessments.
export function latestExecutivePortfolio(projects=[],data={}) {
  const ids=new Set(projects.map(p=>p.id));
  const rows=key=>(data[key]||[]).filter(r=>ids.has(r.project_id));
  const progress=rows('progress'),reporting=rows('reporting');
  const summary=executivePortfolio(projects,rows('indicators'),progress,reporting,
    {activities:rows('activities'),portfolioStatus:rows('portfolioStatus')});
  const dates=[...latestReportedBy(withReportingDates(progress,reporting)).values()]
    .map(r=>r.period_end||r.date_reported).filter(Boolean).sort();
  return {...summary,scope:'latest',asAt:dates.at(-1)?.slice(0,10)||null};
}
