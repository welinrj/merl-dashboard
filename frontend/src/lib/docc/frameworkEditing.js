import { sourceRow } from '../contentLocale';
import { latestReportedBy } from './progressSelection';

export function sourceFrameworkRow(row) {
  return { ...row, indicator: sourceRow(row.indicator), progress: sourceRow(row.progress), narrative: sourceRow(row.narrative) };
}

// Working copies never enter reported totals or replace the reported observation.
export function workingFrameworkProgress(rows) {
  return latestReportedBy(rows.filter(row => ['draft', 'returned', 'rejected'].includes(row.review_status)), 'indicator_id', { includeDraft: true });
}

export const editorValues = editor => Object.fromEntries(['value','code','unit','description','performance','schedule','period'].map(key => [key, editor?.[key] ?? '']));
