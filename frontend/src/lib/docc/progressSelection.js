// Reporting chronology is independent of when an officer uploads/backfills it.
const finite = value => value != null && value !== '' && Number.isFinite(Number(value));
const operational = new Set(['submitted', 'under_review', 'resubmitted', 'approved', 'published', 'locked']);

export function withReportingDates(rows = [], periods = []) {
  return rows.map(row => {
    const period = periods.find(p => p.period_label === row.reporting_period
      && (row.project_id == null || p.project_id === row.project_id));
    return { ...row, period_end: period?.period_end ?? row.period_end ?? null };
  });
}

export function compareReportedRows(a, b) {
  const effective = r => r.period_end || r.date_reported || r.created_at || '';
  return String(effective(a)).localeCompare(String(effective(b)))
    || String(a.updated_at || a.created_at || '').localeCompare(String(b.updated_at || b.created_at || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));
}

export function latestReportedBy(rows = [], key = 'indicator_id', { includeDraft = false } = {}) {
  const out = new Map();
  for (const row of rows) {
    if (!includeDraft && row.review_status && !operational.has(row.review_status)) continue;
    if (row[key] == null) continue;
    const previous = out.get(row[key]);
    if (!previous || compareReportedRows(row, previous) > 0) out.set(row[key], row);
  }
  return out;
}

// Equal indicator weights within a project; equal project weights in portfolio.
// Cap contribution at 100 so overachievement cannot offset missing delivery.
export function portfolioProgress(rows = []) {
  const projects = new Map();
  for (const row of latestReportedBy(rows).values()) {
    if (!finite(row.achievement_pct)) continue;
    const values = projects.get(row.project_id) || [];
    values.push(Math.max(0, Math.min(100, Number(row.achievement_pct))));
    projects.set(row.project_id, values);
  }
  const means = [...projects.values()].map(values => values.reduce((a, b) => a + b, 0) / values.length);
  return means.length ? Math.round(means.reduce((a, b) => a + b, 0) / means.length * 10) / 10 : null;
}

export function reportedAchievement(indicator, progress) {
  if (!progress) return null;
  // A stored percentage is the period's reported/calculated result. It may
  // describe partial delivery without claiming a completed document count.
  if (finite(progress.achievement_pct)) return Number(progress.achievement_pct);
  const target = finite(progress.period_target) && finite(progress.actual_this_period)
    ? Number(progress.period_target) : Number(progress.final_target ?? indicator?.target_value);
  const actual = finite(progress.period_target) && finite(progress.actual_this_period)
    ? progress.actual_this_period : progress.cumulative_actual;
  if (!finite(actual) || !Number.isFinite(target) || target === 0 || indicator?.is_qualitative || indicator?.higher_is_better === false) return null;
  return Math.round(Number(actual) / target * 1000) / 10;
}
