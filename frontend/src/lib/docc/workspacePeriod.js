// Scope reported observations, preserving current project plans and reference records.
export const matchesWorkspacePeriod = (row, period) => !period || (row.reporting_period || row.period_label) === period;
export function scopeWorkspacePeriod(data, period) {
  if (!data || !period) return data;
  const reported = new Set(['financial', 'progress', 'beneficiaries', 'reporting', 'learning', 'evidence', 'periodProgress']);
  return Object.fromEntries(Object.entries(data).map(([key, rows]) => [key,
    reported.has(key) && Array.isArray(rows) ? rows.filter(row => matchesWorkspacePeriod(row, period)) : rows,
  ]));
}
export function visiblePeriodOptions(projects, rows) {
  const ids = new Set(projects.map(project => String(project.id)));
  return [...new Map(rows.filter(row => ids.has(String(row.project_id)) && row.period_label)
    .map(row => [row.period_label, row])).values()]
    .sort((a, b) => String(b.period_end || b.period_label).localeCompare(String(a.period_end || a.period_label)));
}
export const workspacePeriodKey = userId => `merl.workspace.period.${userId}`;

// An explicit selection stays explicit, including a missing period on a new project.
export function resolveReportingPeriod(requested, previous, periods = []) {
  return requested !== null ? requested : previous || periods[0]?.period_label || '';
}
