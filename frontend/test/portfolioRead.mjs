import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readPortfolio, PortfolioReadError, latestApprovedPeriod,
  approvedPeriodKeys, restrictToApprovedPeriods,
} from '../src/lib/portfolioRead.js';

test('successful reads preserve genuine empty datasets and timestamp', async () => {
  const result = await readPortfolio({ projects: async () => ({ data: [] }) }, null, () => '2026-09-10T00:00:00Z');
  assert.deepEqual(result.data.projects, []);
  assert.equal(result.loadedAt, '2026-09-10T00:00:00Z');
  assert.equal(result.stale, false);
});

test('a failed source never becomes a misleading zero', async () => {
  await assert.rejects(
    readPortfolio({
      projects: async () => ({ data: [{ id: 1 }] }),
      results: async () => ({ data: null, error: new Error('offline') }),
    }),
    (error) => error instanceof PortfolioReadError && error.sources.includes('results'),
  );
});

test('a previous successful snapshot is retained and labelled stale on failure', async () => {
  const previous = {
    data: { projects: [{ id: 'p1' }], results: [{ id: 'r1' }] },
    loadedAt: '2026-09-09T10:00:00Z', stale: false, error: null, failedSources: [],
  };
  const result = await readPortfolio({
    projects: async () => ({ data: [{ id: 'new' }] }),
    results: async () => ({ data: null, error: new Error('offline') }),
  }, previous);
  assert.deepEqual(result.data, previous.data);
  assert.equal(result.loadedAt, previous.loadedAt);
  assert.equal(result.stale, true);
  assert.deepEqual(result.failedSources, ['results']);
  assert.ok(result.error instanceof PortfolioReadError);
});

test('rejected requests are reported by source', async () => {
  await assert.rejects(readPortfolio({ projects: async () => { throw new Error('offline'); } }), PortfolioReadError);
});

test('freshness uses approved periods only', () => {
  assert.equal(latestApprovedPeriod([
    { submission_status: 'approved', period_end: '2026-06-30' },
    { submission_status: 'draft', period_end: '2026-12-31' },
  ]), '2026-06-30');
  assert.equal(latestApprovedPeriod([]), null);
});

test('approved period helpers keep approved project-period pairs only', () => {
  const periods = [
    { project_id: 'p1', period_label: 'Q1', submission_status: 'approved' },
    { project_id: 'p1', period_label: 'Q2', submission_status: 'draft' },
    { project_id: 'p2', period_label: 'Q1', submission_status: 'approved' },
  ];
  assert.deepEqual([...approvedPeriodKeys(periods)].sort(), ['p1::Q1', 'p2::Q1']);
  const rows = [
    { id: 1, project_id: 'p1', reporting_period: 'Q1' },
    { id: 2, project_id: 'p1', reporting_period: 'Q2' },
    { id: 3, project_id: 'p2', reporting_period: 'Q1' },
    { id: 4, project_id: 'p2', reporting_period: null },
  ];
  assert.deepEqual(restrictToApprovedPeriods(rows, periods).map((r) => r.id), [1, 3, 4]);
});
