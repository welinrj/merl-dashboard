import test from 'node:test';
import assert from 'node:assert/strict';
import { withReportingDates, latestReportedBy, portfolioProgress, reportedAchievement } from '../src/lib/docc/progressSelection.js';
import { indicatorStatus, analyseProject } from '../src/lib/docc/projectAnalysis.js';
import { indicatorReportValue } from '../src/lib/docc/reportSnapshot.js';
import { enrichPublishedProject } from '../src/lib/publicSnapshot.js';

test('backfilled older reports cannot replace a newer reporting period', () => {
  const rows = withReportingDates([
    { id: 'new', project_id: 'p', indicator_id: 'i', reporting_period: 'Q3', created_at: '2026-09-01', achievement_pct: 90 },
    { id: 'backfill', project_id: 'p', indicator_id: 'i', reporting_period: 'Year 1', created_at: '2026-10-08', achievement_pct: 50 },
  ], [
    { project_id: 'p', period_label: 'Q3', period_end: '2026-09-30' },
    { project_id: 'p', period_label: 'Year 1', period_end: '2026-06-30' },
  ]);
  assert.equal(latestReportedBy(rows).get('i').id, 'new');
});

test('same-period revisions use the latest edit and do not count twice', () => {
  const rows = [
    { id: 'a', project_id: 'p', indicator_id: 'i', period_end: '2026-06-30', updated_at: '2026-10-01', achievement_pct: 10 },
    { id: 'b', project_id: 'p', indicator_id: 'i', period_end: '2026-06-30', updated_at: '2026-10-08', achievement_pct: 50 },
  ];
  assert.equal(latestReportedBy(rows).size, 1);
  assert.equal(portfolioProgress(rows), 50);
});

test('unsubmitted edits do not replace submitted results in headline totals', () => {
  const rows = [
    { id: 'a', indicator_id: 'i', created_at: '2026-09-01', review_status: 'submitted' },
    { id: 'b', indicator_id: 'i', created_at: '2026-10-08', review_status: 'draft' },
  ];
  assert.equal(latestReportedBy(rows).get('i').id, 'a');
  assert.equal(latestReportedBy(rows, 'indicator_id', { includeDraft: true }).get('i').id, 'b');
});

test('portfolio uses equal project weights and overachievement cannot mask shortfalls', () => {
  assert.equal(portfolioProgress([
    { project_id: 'a', indicator_id: 'a1', achievement_pct: 200 },
    { project_id: 'a', indicator_id: 'a2', achievement_pct: 100 },
    { project_id: 'b', indicator_id: 'b1', achievement_pct: 0 },
  ]), 50);
  assert.equal(portfolioProgress([{ project_id: 'a', indicator_id: 'a1', achievement_pct: null }]), null);
});

test('L&D partial-document progress stays 50% in analysis and reports without inventing report counts', () => {
  const indicator = { is_qualitative: false, higher_is_better: true, target_value: 1, progress_method: 'manual' };
  const progress = { cumulative_actual: null, achievement_pct: 50, performance_status: 'on_track' };
  assert.equal(reportedAchievement(indicator, progress), 50);
  assert.deepEqual(indicatorStatus(indicator, progress), { status: 'on_track', pct: 50 });
  assert.equal(indicatorReportValue(indicator, progress).percentage, 50);
  assert.equal(indicatorReportValue(indicator, progress).cumulative, null);
});

test('year-one procurement completion does not get recalculated against the two-year target', () => {
  assert.equal(indicatorReportValue({ target_value: 2 }, { cumulative_actual: 1, period_target: 1, achievement_pct: 100 }).percentage, 100);
});

test('L&D recruitment discrepancy retains recorded attention at 7 of 8', () => {
  assert.deepEqual(indicatorStatus({ target_value: 8 }, { cumulative_actual: 7, achievement_pct: 87.5, performance_status: 'attention_required' }), { status: 'below_target', pct: 87.5 });
});

test('missing L&D achievements stay unknown and reported zeros remain zero', () => {
  assert.equal(reportedAchievement({ target_value: 1 }, { cumulative_actual: null, achievement_pct: null }), null);
  assert.equal(reportedAchievement({ target_value: 1 }, { cumulative_actual: 0, achievement_pct: 0 }), 0);
});

test('selecting a reporting period scopes finance as well as results', () => {
  const analysis = analyseProject({
    project: { budget_vuv: 100 }, periods: [{ period_label: 'Q1', period_end: '2026-03-31' }, { period_label: 'Q3', period_end: '2026-09-30' }],
    financial: [{ reporting_period: 'Q1', cumulative_expenditure: 20, created_at: '2026-10-08' }, { reporting_period: 'Q3', cumulative_expenditure: 60, created_at: '2026-09-30' }],
  }, 'Q1');
  assert.equal(analysis.financial.spent, 20);
});

test('published project updates take precedence over old hardcoded profile values', () => {
  const project = { code: '24B298', budget_vuv: 300000000, currency: 'VUV', project_manager: 'Updated manager', primary_climate_theme: 'Updated theme' };
  assert.deepEqual(enrichPublishedProject(project), { ...project, coverage_type: 'national' });
});

import { toVuv, sumReported, recordedExpenditure } from '../src/lib/docc/currency.js';

test('mixed-currency investment is converted before aggregation', () => {
  assert.equal(sumReported([toVuv(100, 'USD'), toVuv(100, 'VUV')]), 11858);
  assert.equal(toVuv(100, 'UNKNOWN'), null);
});

test('absent expenditure remains missing while explicit reported zero is retained', () => {
  assert.equal(recordedExpenditure({ spent_vuv: 0 }, null), null);
  assert.equal(recordedExpenditure({ spent_vuv: 20 }, { cumulative_expenditure: 0 }), 0);
  assert.equal(sumReported([null, null]), null);
});
