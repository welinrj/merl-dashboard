import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/pages/PublicDashboard.jsx', import.meta.url), 'utf8');
const snapshot = readFileSync(new URL('../src/lib/publicSnapshot.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/0076_single_public_overview.sql', import.meta.url), 'utf8');

test('the anonymous portal exposes one public overview instead of separate pages', () => {
  assert.doesNotMatch(dashboard, /setTab|tab===|PublicProjectCatalogue|PublicProjectResults/);
  assert.match(dashboard, /<LayoutDashboard[^>]*\/>\{c\.overview\}/);
  assert.doesNotMatch(dashboard, /\[\['overview'.*'projects'.*'results'/s);
});

test('the public overview contains the requested portfolio information', () => {
  for (const field of ['project_manager', 'cumulative_expenditure_vuv', 'published_beneficiaries', 'budget_vuv']) {
    assert.match(dashboard, new RegExp(field));
  }
  assert.match(dashboard, /PublicCoverageMap/);
  assert.match(dashboard, /pbd-project-grid/);
});

test('anonymous reads stay within public snapshot tables', () => {
  assert.doesNotMatch(snapshot, /v_financial_progress|v_projects|service_role/);
  assert.match(snapshot, /public_portal_projects/);
  assert.match(snapshot, /public_portal_summary/);
  assert.match(snapshot, /public_portal_indicator_categories/);
});

test('financial and beneficiary publication requires approved reporting periods', () => {
  assert.match(migration, /submission_status='approved'/);
  assert.match(migration, /JOIN approved_periods ap[\s\S]*fp\.reporting_period/);
  assert.match(migration, /project_manager/);
  assert.match(migration, /total_utilised_vuv/);
  assert.match(migration, /financial_utilisation_pct/);
});
