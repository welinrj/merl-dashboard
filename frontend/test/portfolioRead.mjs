import test from 'node:test';
import assert from 'node:assert/strict';
import { readPortfolio, PortfolioReadError, latestApprovedPeriod } from '../src/lib/portfolioRead.js';

test('successful reads preserve genuine empty datasets and timestamp', async () => {
  const result = await readPortfolio({ projects: async () => ({ data: [] }) }, null, () => '2026-09-10T00:00:00Z');
  assert.deepEqual(result.data.projects, []);
  assert.equal(result.loadedAt, '2026-09-10T00:00:00Z');
});
test('a failed source never becomes a misleading zero', async () => {
  await assert.rejects(readPortfolio({ projects: async () => ({ data: [{ id: 1 }] }), results: async () => ({ data: null, error: new Error('offline') }) }), error => error instanceof PortfolioReadError && error.sources.includes('results'));
});
test('rejected requests are reported by source', async () => {
  await assert.rejects(readPortfolio({ projects: async () => { throw new Error('offline'); } }), PortfolioReadError);
});
test('freshness uses approved periods only', () => {
  assert.equal(latestApprovedPeriod([{ submission_status: 'approved', period_end: '2026-06-30' }, { submission_status: 'draft', period_end: '2026-12-31' }]), '2026-06-30');
  assert.equal(latestApprovedPeriod([]), null);
});
