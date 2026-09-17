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

test('the full M&E report offers preview plus Word and PDF downloads', () => {
  assert.match(reports, /Preview report/);
  assert.match(reports, /Generated report preview/);
  assert.match(reports, /View full report/);
  assert.match(reports, /Download Word/);
  assert.match(reports, /Download PDF/);
  assert.match(reports, /id="report-preview"/);
});

test('the full report excludes the non-production audit project and includes evidence', () => {
  assert.match(reports, /project\?\.code !== 'AUDIT-2026'/);
  assert.match(reports, /q\('v_evidence', '\*'\)/);
  assert.match(reports, /Supporting evidence/);
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

test('the full report is project-focused rather than a dashboard or data-readiness audit', () => {
  assert.doesNotMatch(reports, /title="M&E Data Readiness"/);
  assert.doesNotMatch(reports, /title="Data Source and Assurance"/);
  assert.doesNotMatch(reports, /title="Portfolio Status and Registration"/);
  assert.match(reports, /title="Complete Project Reports"/);
  assert.match(reports, /Project objective and expected results/);
  assert.match(reports, /Activity implementation/);
  assert.match(reports, /Achievements and major results/);
  assert.match(reports, /Next-period priorities and recommendations/);
});

test('the full report downloads genuine Word and PDF files', () => {
  assert.match(reports, /Packer\.toBlob\(documentFile\)/);
  assert.match(reports, /reportFilename\('docx'\)/);
  assert.match(reports, /new jsPDF/);
  assert.match(reports, /reportFilename\('pdf'\)/);
});

test('exports avoid action-time chunks and Safari object URLs are revoked after a delay', () => {
  assert.match(reports, /from 'docx'/);
  assert.match(reports, /from 'jspdf'/);
  assert.doesNotMatch(reports, /await import\('docx'\)/);
  assert.doesNotMatch(reports, /await import\('jspdf'\)/);
  assert.match(reports, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 1500\)/);
  assert.match(reports, /document\.getElementById\('report-preview'\)/);
});

test('report run logging failures cannot take down a successful export', () => {
  assert.match(reports, /Export success must not depend on the optional audit log request/);
  assert.match(reports, /void logGeneration\('docx'\)/);
  assert.match(reports, /void logGeneration\('pdf'\)/);
});
