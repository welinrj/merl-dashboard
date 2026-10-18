import { latestReportedBy, withReportingDates } from './progressSelection';

// Private portfolio display only. Saved drafts must never become approved
// results, feed performance aggregates, or replace an operational result.
export function portfolioResultEntries(rows = [], progress = [], periods = [], period = '') {
  const drafts = latestReportedBy(withReportingDates(progress, periods).filter(row =>
    row.review_status === 'draft' && (!period || row.reporting_period === period)),
  'indicator_id', { includeDraft: true });
  return rows.map(entry => {
    if (entry.progress) return entry.progress.review_status === 'draft'
      ? { ...entry, awaitingReview: true, status: 'no_data', pct: null } : entry;
    const draft = drafts.get(entry.indicator.id);
    return draft ? { ...entry, progress: draft, awaitingReview: true, status: 'no_data', pct: null } : entry;
  });
}
