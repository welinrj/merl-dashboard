import test from 'node:test';
import assert from 'node:assert/strict';
import { average, total, publicTotals, PUBLIC_SNAPSHOT_KEY } from '../src/lib/publicSnapshot.js';
import { PROVINCES, normalizeProvince, normalizeProvinces, normalizePublishedProjects } from '../src/lib/publicProvinces.js';

test('public snapshot has an independent cache key', () => {
  assert.deepEqual(PUBLIC_SNAPSHOT_KEY, ['merl', 'approved-public-snapshot']);
});

test('missing results remain unavailable instead of becoming zero', () => {
  assert.equal(average([null, undefined]), null);
  assert.equal(total([null, undefined]), null);
  assert.equal(total([0, null]), 0);
  assert.equal(average([40, 100, null]), 70);
});

test('unfiltered totals use the approved publication summary', () => {
  const projects = [{ progress_pct: 40, budget_vuv: 100, published_beneficiaries: 50 }];
  assert.deepEqual(publicTotals(projects, { overall_progress_pct: 70, total_investment_vuv: 300, published_beneficiaries: 120 }, true), { progress: 70, investment: 300, beneficiaries: 120 });
});

test('filtered totals reconcile to the selected published projects', () => {
  assert.deepEqual(publicTotals([{ progress_pct: 40, budget_vuv: 100, published_beneficiaries: 50 }, { progress_pct: 100, budget_vuv: 200, published_beneficiaries: 70 }], null, false), { progress: 70, investment: 300, beneficiaries: 120 });
  assert.deepEqual(publicTotals([{ progress_pct: null, budget_vuv: null, published_beneficiaries: null }], null, false), { progress: null, investment: null, beneficiaries: null });
});

test('all six published province names match regardless of case or whitespace', () => {
  for (const name of PROVINCES) {
    assert.equal(normalizeProvince(name.toUpperCase()), name);
    assert.equal(normalizeProvince(`  ${name.toLowerCase()}  `), name);
  }
  assert.equal(normalizeProvince('Unmapped location'), 'Unmapped location');
  assert.deepEqual(normalizeProvinces(['SANMA', 'Sanma', ' sanma ', null, 'TORBA']), ['Sanma', 'Torba']);
});

test('a multi-province project counts once per province and filters correctly', () => {
  const projects = normalizePublishedProjects([
    {id:'a', provinces:['SANMA', 'TORBA', 'SANMA']},
    {id:'b', provinces:['sanma', 'PENAMA']},
    {id:'c', provinces:['TAFEA']},
  ]);
  const counts = PROVINCES.map(name => projects.filter(project => project.provinces.includes(name)).length);
  assert.deepEqual(counts, [1, 2, 1, 0, 0, 1]);
  assert.deepEqual(projects.filter(project => project.provinces.includes('Sanma')).map(project => project.id), ['a', 'b']);
  assert.deepEqual(projects[0].provinces, ['Sanma', 'Torba']);
  assert.equal(projects.length, 3);
});
