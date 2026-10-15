import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scopeWorkspacePeriod, visiblePeriodOptions, workspacePeriodKey } from '../src/lib/docc/workspacePeriod';
import { analyseProject } from '../src/lib/docc/projectAnalysis';
test('period selection never substitutes newer financial or result records', () => {
  const plans = [{ id: 'p', budget_vuv: 100, spent_vuv: 90 }];
  const data = { projects: plans, financial: [{ project_id: 'p', reporting_period: 'Q3', cumulative_expenditure: 90 }],
    progress: [{ project_id: 'p', reporting_period: 'Q3', cumulative_actual: 12 }],
    reporting: [{ project_id: 'p', period_label: 'Q2', submission_status: 'draft' }, { project_id: 'p', period_label: 'Q3', submission_status: 'approved' }] };
  const scoped = scopeWorkspacePeriod(data, 'Q2');
  assert.deepEqual(scoped.financial, []); assert.deepEqual(scoped.progress, []);
  assert.equal(scoped.reporting.length, 1); assert.equal(scoped.projects, plans);
  assert.equal(scopeWorkspacePeriod(data, ''), data);
  const analysis = analyseProject({ project: plans[0], financial: data.financial, periods: data.reporting }, 'Q2');
  assert.equal(analysis.financial.spent, null); assert.equal(analysis.reporting.approved.length, 0);
  assert.equal(analysis.reporting.expected, 1);
});
test('period choices use only projects visible in the account framework scope', () => {
  const rows = [{ project_id: 'p', period_label: 'Q2', period_end: '2026-06-30' },
    { project_id: 'p', period_label: 'Q3', period_end: '2026-09-30' }, { project_id: 'hidden', period_label: 'Private period' }];
  assert.deepEqual(visiblePeriodOptions([{id:'p'}], rows).map(row => row.period_label), ['Q3', 'Q2']);
  assert.deepEqual(visiblePeriodOptions([], rows), []);
  assert.notEqual(workspacePeriodKey('manager'), workspacePeriodKey('admin'));
});

import { resolveReportingPeriod } from '../src/lib/docc/workspacePeriod.js';
test('reporting deep links preserve missing periods rather than switching context', () => {
  const periods = [{period_label:'Q2 2026'}];
  assert.equal(resolveReportingPeriod('Q1 2026','',periods),'Q1 2026');
  assert.equal(resolveReportingPeriod(null,'Q1 2026',periods),'Q1 2026');
  assert.equal(resolveReportingPeriod('', 'Q1 2026',periods),'');
  assert.equal(resolveReportingPeriod(null,'',periods),'Q2 2026');
});
