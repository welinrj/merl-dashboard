// Reliable portfolio reads for dashboards and reports.
// A failed query is never converted into an empty dataset. When a previous
// successful snapshot is supplied it remains visible and is explicitly marked
// stale, including the sources that failed, until a complete refresh succeeds.
export class PortfolioReadError extends Error {
  constructor(sources) {
    super(`Could not load ${sources.join(', ')}. Previously loaded data has been preserved.`);
    this.name = 'PortfolioReadError';
    this.sources = sources;
  }
}

export async function readPortfolio(sources, previous = null, now = () => new Date().toISOString()) {
  const entries = Object.entries(sources);
  const results = await Promise.allSettled(entries.map(([, read]) => read()));
  const failed = results.flatMap((result, index) =>
    result.status === 'rejected' || result.value?.error ? [entries[index][0]] : []);

  if (failed.length) {
    const error = new PortfolioReadError(failed);
    if (previous?.data) {
      return {
        ...previous,
        stale: true,
        error,
        failedSources: failed,
      };
    }
    throw error;
  }

  const data = Object.fromEntries(
    results.map((result, index) => [entries[index][0], result.value.data ?? []]),
  );
  return {
    data,
    loadedAt: now(),
    stale: false,
    error: null,
    failedSources: [],
  };
}

export function latestApprovedPeriod(rows) {
  return rows
    .filter((r) => r.submission_status === 'approved' && r.period_end)
    .reduce((latest, r) => (!latest || r.period_end > latest ? r.period_end : latest), null);
}

export function approvedPeriodKeys(rows) {
  return new Set(
    rows
      .filter((r) => r.submission_status === 'approved' && r.project_id && r.period_label)
      .map((r) => `${r.project_id}::${r.period_label}`),
  );
}

export function restrictToApprovedPeriods(rows, reportingPeriods, periodField = 'reporting_period') {
  const approved = approvedPeriodKeys(reportingPeriods);
  return rows.filter((row) => {
    const period = row?.[periodField];
    if (!period) return true;
    return approved.has(`${row.project_id}::${period}`);
  });
}
