// A failed query is not an empty dataset. Keep the previous successful snapshot
// until every required source has loaded successfully.
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
  if (failed.length) throw new PortfolioReadError(failed);
  const data = Object.fromEntries(results.map((result, index) => [entries[index][0], result.value.data ?? []]));
  return { data, loadedAt: now(), stale: false };
}

export function latestApprovedPeriod(rows) {
  return rows.filter(r => r.submission_status === 'approved' && r.period_end)
    .reduce((latest, r) => !latest || r.period_end > latest ? r.period_end : latest, null);
}
