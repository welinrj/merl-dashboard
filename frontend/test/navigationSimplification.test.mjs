import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
const projectRegister = readFileSync(new URL('../src/pages/ProjectSetup.jsx', import.meta.url), 'utf8');
const resultsFramework = readFileSync(new URL('../src/pages/ResultsWorkspace.jsx', import.meta.url), 'utf8');

const navBlock = app.match(/const NAV_ITEMS[\s\S]*?\n\];/)?.[0] || '';

test('sidebar has one task-based entry per destination', () => {
  for (const key of ['overview', 'projects', 'results', 'activities', 'review', 'reports', 'admin']) {
    assert.match(navBlock, new RegExp(`key: '${key}'`));
  }
  for (const duplicate of ['finances', 'projectAnalysis', 'locations', 'risks', 'documents']) {
    assert.doesNotMatch(navBlock, new RegExp(`key: '${duplicate}'`));
  }
  assert.match(navBlock, /key: 'results', path: '\/results-framework'/);
});

test('analysis keeps legacy deep links without expanding role access', () => {
  assert.match(app, /portfolio: 'results'/);
  assert.match(app, /project: 'projectAnalysis'/);
  assert.match(app, /financial: 'finances'/);
  assert.match(app, /geographic: 'locations'/);
  assert.match(app, /risks: 'risks'/);
  assert.match(app, /allowedTabs=\{allowedTabs\}/);
  assert.doesNotMatch(app, /lens === 'results'[\s\S]{0,100}ResultsWorkspace/);
});

test('visible labels describe user tasks without purpose subtitles', () => {
  for (const label of ['Executive Overview', 'Project Register', 'Results Framework', 'Update Progress', 'Review Queue', 'Reports & Exports']) {
    assert.match(i18n, new RegExp(label.replace(/[&]/g, '\\&')));
  }
  assert.doesNotMatch(navBlock, /hasSub: true/);
});

test('results framework remains available from the selected project', () => {
  assert.match(app, /path="\/results-framework"/);
  assert.match(projectRegister, /Results framework<\/a>/);
  assert.match(projectRegister, /results-framework\?project=/);
  assert.match(resultsFramework, /new URLSearchParams\(window\.location\.hash\.split\('\?'\)\[1\]/);
});
