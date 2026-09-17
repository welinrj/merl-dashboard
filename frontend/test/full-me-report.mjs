import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const reports = readFileSync(new URL('../src/pages/Reports.jsx', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');

test('the reporting page defaults to the full portfolio M&E report', () => {
  assert.match(reports, /useState\('full_me'\)/);
  assert.match(reports, /<FullMEReport\b/);
  assert.match(reports, /Generate report above/);
});

test('the former print control is labelled as full M&E report generation', () => {
  assert.match(reports, /type === 'full_me' \? t\('rpt\.generateFullMe'\)/);
  assert.match(i18n, /generateFullMe: 'Generate Full M&E Report'/);
});

test('the full report excludes the non-production audit project and includes evidence', () => {
  assert.match(reports, /project\?\.code !== 'AUDIT-2026'/);
  assert.match(reports, /q\('v_evidence', '\*'\)/);
  assert.match(reports, /Evidence records/);
});

test('failed live-data requests block report generation instead of becoming empty data', () => {
  assert.match(reports, /const failures = results/);
  assert.match(reports, /No report has been generated/);
  assert.match(reports, /if \(dataError\) return/);
});

test('approval checks use the selected report project and period scope', () => {
  assert.match(reports, /const reportProjectIds =/);
  assert.match(reports, /reportProjectIds\.has\(row\.project_id\)/);
  assert.match(reports, /periodMatches\(row, period\)/);
  assert.match(reports, /row\.period_type === periodType/);
});
