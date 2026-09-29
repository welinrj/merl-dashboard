import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/pages/PublicDashboard.jsx', import.meta.url), 'utf8');
const authenticatedOverview = readFileSync(new URL('../src/pages/Overview.jsx', import.meta.url), 'utf8');
const indicatorCard = readFileSync(new URL('../src/components/ui/indicator-progress-card.jsx', import.meta.url), 'utf8');
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

test('dashboard views exclude completed projects without deleting their records', () => {
  assert.match(dashboard, /const isCompletedProject = project/);
  assert.match(dashboard, /allProjects\.filter\(project => !isCompletedProject\(project\)\)/);
  assert.match(dashboard, /allScope && projects\.length === allProjects\.length/);
  assert.match(dashboard, /\['ongoing', 'upcoming', 'other'\]\.map/);
  assert.match(authenticatedOverview, /unfinishedProjects = data\.projects\.filter/);
  assert.match(authenticatedOverview, /key !== 'completed'/);
  assert.doesNotMatch(authenticatedOverview, /lifecycleCounts\.completed/);
});

test('every public indicator category has a distinct web-library icon', () => {
  for (const key of ['ecosystems', 'livelihoods', 'climate-risk', 'infrastructure', 'governance', 'capacity', 'finance', 'learning-delivery', 'beneficiaries', 'other']) {
    assert.match(dashboard, new RegExp(`['"]?${key}['"]?\\s*:`));
  }
  assert.match(dashboard, /@fortawesome\/react-fontawesome/);
  assert.match(dashboard, /@fortawesome\/free-solid-svg-icons/);
  assert.match(dashboard, /const categoryIcon = INDICATOR_CATEGORY_ICONS\[category\.key\]/);
  assert.match(dashboard, /<FontAwesomeIcon icon=\{categoryIcon\} \/>/);
  assert.match(indicatorCard, /pbd-activity-category-icon/);
});

test('indicator categories use the 21st.dev stats-card-with-progress composition', () => {
  assert.match(dashboard, /<IndicatorProgressCard/);
  assert.match(indicatorCard, /21st\.dev "Stats card with progress"/);
  assert.match(indicatorCard, /@radix-ui\/react-progress/);
  for (const slot of ['card', 'card-content', 'card-header', 'card-title', 'progress', 'progress-indicator', 'card-footer']) {
    assert.match(indicatorCard, new RegExp(`data-slot="${slot}"`));
  }
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
