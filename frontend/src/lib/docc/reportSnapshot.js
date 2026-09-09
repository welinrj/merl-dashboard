// Pure selectors for report previews. No database writes and no fabricated values.
const rows = (value) => Array.isArray(value) ? value : [];
const stamp = (r) => r.updated_at || r.created_at || '';
const byStamp = (a, b) => stamp(b).localeCompare(stamp(a)) || String(b.id || '').localeCompare(String(a.id || ''));
const scoped = (data, projectId) => rows(data).filter((r) => r.project_id === projectId);
const exact = (data, period) => rows(data).filter((r) => r.reporting_period === period);

export function latestRecord(data) {
  return [...rows(data)].sort(byStamp)[0] || null;
}

export function latestPerKey(data, key) {
  const result = new Map();
  for (const row of [...rows(data)].sort(byStamp)) {
    if (row[key] != null && !result.has(row[key])) result.set(row[key], row);
  }
  return result;
}

export function reportPeriodOptions(reporting, projectId) {
  const periods = new Map();
  for (const row of scoped(reporting, projectId).sort((a, b) =>
    String(b.period_end || b.period_start || '').localeCompare(String(a.period_end || a.period_start || '')) || byStamp(a, b))) {
    if (row.period_label && !periods.has(row.period_label)) periods.set(row.period_label, row);
  }
  return [...periods.values()];
}

export function selectProjectSnapshot(d, projectId, period) {
  const project = rows(d.projects).find((p) => p.id === projectId) || null;
  const reporting = reportPeriodOptions(d.reporting, projectId);
  const selected = reporting.find((r) => r.period_label === period) || null;
  const warnings = [];
  if (!selected) warnings.push('Select a registered reporting period. No period-specific results are shown.');
  const forPeriod = (name) => selected ? exact(scoped(d[name], projectId), period) : [];
  const indicators = scoped(d.indicators, projectId);
  const progress = latestPerKey(forPeriod('progress'), 'indicator_id');
  const financeRows = forPeriod('financial');
  if (financeRows.length > 1) warnings.push('Multiple financial records exist for this period; the latest updated record is shown, not their sum.');
  const financial = latestRecord(financeRows);
  const learning = latestRecord(forPeriod('learning'));
  const beneficiaries = forPeriod('beneficiaries');
  const evidence = forPeriod('evidence');
  const activities = scoped(d.activities, projectId);
  const periodActivities = latestPerKey(forPeriod('activityProgress'), 'activity_id');
  const risks = scoped(d.risks, projectId).filter((r) => !selected || !r.date_identified || !selected.period_end || r.date_identified <= selected.period_end);
  const locations = scoped(d.locations, projectId);
  const approved = selected?.submission_status === 'approved';
  if (selected && !approved) warnings.push('This reporting period is not approved. Results are a draft preview.');
  if (selected && !financial) warnings.push('No financial progress record exists for the selected period.');
  if (selected && !periodActivities.size) warnings.push('No period-specific activity progress records are available; activity definitions are not evidence of completion.');
  return { project, period: selected, approved, indicators, progress, financial, learning, beneficiaries, evidence, activities, periodActivities, risks, locations, warnings };
}

export function indicatorReportValue(indicator, progress) {
  if (!progress) return { actual: null, cumulative: null, percentage: null, status: 'no_data' };
  const actual = progress.actual_this_period ?? null;
  const cumulative = progress.cumulative_actual ?? null;
  const quantitative = indicator.is_qualitative === false && indicator.higher_is_better === true;
  const valid = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const percentage = quantitative && valid(cumulative) && valid(indicator.target_value) && Number(indicator.target_value) !== 0
    ? Math.round(Number(cumulative) / Number(indicator.target_value) * 1000) / 10 : null;
  return { actual, cumulative, percentage, status: progress.performance_status || 'no_data' };
}

export function sumReported(data, field) {
  const values = rows(data).map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)));
  return values.length ? values.reduce((sum, v) => sum + Number(v), 0) : null;
}

export function financialReportValues(project, financial) {
  const budget = financial?.approved_budget ?? project?.budget_vuv ?? null;
  const cumulative = financial?.cumulative_expenditure ?? null;
  const valid = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const remaining = valid(budget) && valid(cumulative) ? Number(budget) - Number(cumulative) : null;
  const utilisation = valid(budget) && Number(budget) !== 0 && valid(cumulative)
    ? Math.round(Number(cumulative) / Number(budget) * 1000) / 10 : null;
  return { budget, expenditurePeriod: financial?.expenditure_period ?? null, cumulative, remaining, utilisation };
}
