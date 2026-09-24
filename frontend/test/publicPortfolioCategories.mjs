import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateIndicatorCategories,
  thematicAreaCategory,
} from '../src/lib/publicPortfolioCategories.js';

test('Area Councils use official project themes, including a combined category', () => {
  assert.equal(thematicAreaCategory([{ docc_themes: ['Adaptation'] }]), 'adaptation');
  assert.equal(thematicAreaCategory([{ docc_themes: ['Mitigation'] }]), 'mitigation');
  assert.equal(thematicAreaCategory([
    { docc_themes: ['Adaptation'] },
    { docc_themes: ['Mitigation'] },
  ]), 'both');
  assert.equal(thematicAreaCategory([{ primary_climate_theme: 'Water Security' }]), 'not-recorded');
  assert.equal(thematicAreaCategory([]), 'none');
});

test('indicator category counts aggregate once and follow project filtering', () => {
  const rows = [
    { project_id: 'a', category_key: 'ecosystems', indicator_count: 3 },
    { project_id: 'b', category_key: 'ecosystems', indicator_count: 2 },
    { project_id: 'b', category_key: 'finance', indicator_count: 4 },
  ];
  assert.deepEqual(aggregateIndicatorCategories(rows), [
    { key: 'ecosystems', indicatorCount: 5, projectCount: 2 },
    { key: 'finance', indicatorCount: 4, projectCount: 1 },
  ]);
  assert.deepEqual(aggregateIndicatorCategories(rows, new Set(['a'])), [
    { key: 'ecosystems', indicatorCount: 3, projectCount: 1 },
  ]);
});
