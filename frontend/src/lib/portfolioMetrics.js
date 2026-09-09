import { bucketOf } from './dashboardFilters.jsx';

export const sum = (rows, getter) => rows.reduce((total, row) => total + (Number(getter(row)) || 0), 0);

export function latestByProject(rows, rank = (row) => row.created_at ?? row.updated_at ?? '') {
  const map = new Map();
  for (const row of rows || []) {
    const previous = map.get(row.project_id);
    if (!previous || String(rank(row)) > String(rank(previous))) map.set(row.project_id, row);
  }
  return map;
}

export function latestByIndicator(rows, rank = (row) => row.created_at ?? row.reporting_period ?? '') {
  const map = new Map();
  for (const row of rows || []) {
    const previous = map.get(row.indicator_id);
    if (!previous || String(rank(row)) > String(rank(previous))) map.set(row.indicator_id, row);
  }
  return map;
}

export function projectStatusSummary(projects = []) {
  const summary = { total: projects.length, on_track: 0, at_risk: 0, not_started: 0, completed: 0, cancelled: 0, unknown: 0 };
  for (const project of projects) {
    const bucket = bucketOf(project.status);
    summary[bucket in summary ? bucket : 'unknown'] += 1;
  }
  summary.active = summary.on_track + summary.at_risk + summary.not_started;
  return summary;
}

export function indicatorSummary(indicators = [], progress = []) {
  const latest = latestByIndicator(progress);
  const statuses = { on_track: 0, target_achieved: 0, attention_required: 0, off_track: 0, no_data: 0, unknown: 0 };
  const achievements = [];
  for (const indicator of indicators) {
    const row = latest.get(indicator.id);
    const status = row?.performance_status || 'no_data';
    statuses[status in statuses ? status : 'unknown'] += 1;
    if (row?.achievement_pct != null && Number.isFinite(Number(row.achievement_pct))) achievements.push(Number(row.achievement_pct));
  }
  return {
    latest,
    statuses,
    reported: achievements.length,
    total: indicators.length,
    averageAchievementPct: achievements.length ? achievements.reduce((a, b) => a + b, 0) / achievements.length : null,
  };
}

export function financialSummary(projects = [], financial = []) {
  const latest = latestByProject(financial);
  const approvedBudget = sum(projects, (project) => project.budget_vuv);
  const reportedExpenditure = [...latest.values()].reduce((total, row) => total + (Number(row.cumulative_expenditure) || 0), 0);
  const projectFallbackExpenditure = sum(projects, (project) => project.spent_vuv);
  const expenditure = reportedExpenditure || projectFallbackExpenditure;
  const fundsReceived = [...latest.values()].reduce((total, row) => total + (Number(row.funds_received) || 0), 0);
  const fundsCommitted = [...latest.values()].reduce((total, row) => total + (Number(row.funds_committed) || 0), 0);
  return {
    latest,
    approvedBudget,
    expenditure,
    fundsReceived,
    fundsCommitted,
    remainingBalance: Math.max(0, approvedBudget - expenditure),
    utilisationPct: approvedBudget ? expenditure / approvedBudget * 100 : null,
  };
}

export function reportingSummary(reporting = [], now = new Date()) {
  const today = now instanceof Date ? now : new Date(now);
  const result = { total: reporting.length, draft: 0, submitted: 0, reviewed: 0, returned: 0, approved: 0, overdue: 0, pendingApproval: 0 };
  for (const row of reporting) {
    if (row.submission_status in result) result[row.submission_status] += 1;
    if (['submitted', 'reviewed'].includes(row.submission_status)) result.pendingApproval += 1;
    if (row.period_end && row.submission_status !== 'approved' && new Date(`${String(row.period_end).slice(0, 10)}T23:59:59`) < today) result.overdue += 1;
  }
  return result;
}

export function riskSummary(risks = [], now = new Date()) {
  const today = now instanceof Date ? now : new Date(now);
  const result = { total: risks.length, open: 0, high: 0, critical: 0, overdue: 0 };
  for (const row of risks) {
    const closed = ['closed', 'resolved'].includes(row.status);
    if (!closed) result.open += 1;
    const rating = String(row.risk_rating || '').toLowerCase();
    if (!closed && rating === 'high') result.high += 1;
    if (!closed && rating === 'critical') result.critical += 1;
    if (!closed && row.due_date && new Date(`${String(row.due_date).slice(0, 10)}T23:59:59`) < today) result.overdue += 1;
  }
  return result;
}

export function physicalProgress(activities = []) {
  const values = activities.map((a) => Number(a.physical_progress_pct)).filter(Number.isFinite);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function physicalFinancialVariance(projects = [], activities = [], financial = []) {
  const finance = financialSummary(projects, financial).utilisationPct;
  const physical = physicalProgress(activities);
  return {
    physicalPct: physical,
    financialPct: finance,
    variancePctPoints: physical == null || finance == null ? null : physical - finance,
  };
}
