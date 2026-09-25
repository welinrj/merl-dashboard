import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const dashboard = read('../src/pages/PublicDashboard.jsx');
const component = read('../src/components/ui/feature-section-with-card-gradient.tsx');
const demo = read('../src/components/ui/feature-section-with-card-gradient-demo.tsx');

test('public project cards use the reusable gradient shell without replacing project data', () => {
  assert.match(dashboard, /import \{ FeatureCardGradient \}/);
  assert.match(dashboard, /<FeatureCardGradient className="pbd-project-card">/);
  for (const field of ['docc_image_url', 'project_manager', 'budget_vuv', 'published_beneficiaries', 'expected_primary_outcome']) {
    assert.match(dashboard, new RegExp(field));
  }
});

test('gradient component and demo live in the existing ui component directory', () => {
  assert.match(component, /export function FeatureCardGradient/);
  assert.match(component, /export function FeaturesSectionWithCardGradient/);
  assert.match(component, /export function GridPattern/);
  assert.match(demo, /@\/components\/ui\/feature-section-with-card-gradient/);
});
