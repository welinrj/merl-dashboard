import { latestReportedBy, withReportingDates, portfolioProgress, compareReportedRows } from './docc/progressSelection';
const known = value => value != null && typeof value !== 'boolean' && String(value).trim() !== '' && Number.isFinite(Number(value));
const approved = new Set(['approved','published','locked']);
export function projectResultsHref(id, period) {
  const params = new URLSearchParams({project:id});
  if (period) params.set('period',period);
  return `/analytics/project?${params}`;
}

export function projectProgressSummaries(projects = [], indicators = [], progress = [], periods = []) {
  const dated = withReportingDates(progress, periods);
  return projects.map(project => {
    const own = indicators.filter(i => i.project_id === project.id);
    const ids = new Set(own.map(i => i.id));
    const latest = [...latestReportedBy(dated.filter(r => r.project_id === project.id && ids.has(r.indicator_id))).values()];
    const measured = latest.filter(r => known(r.achievement_pct));
    const newest = [...measured].sort((a,b) => compareReportedRows(b,a))[0];
    const labels = [...new Set(measured.map(r => r.reporting_period).filter(Boolean))];
    return { project, total:own.length, reported:measured.length,
      progress:portfolioProgress(measured),
      achieved:measured.filter(r => Number(r.achievement_pct) >= 100).length,
      approved:measured.filter(r => approved.has(r.review_status)).length,
      pending:measured.filter(r => !approved.has(r.review_status)).length,
      period:labels.length === 1 ? labels[0] : null, periodCount:labels.length,
      date:newest?.period_end || newest?.date_reported || null,
    };
  });
}
