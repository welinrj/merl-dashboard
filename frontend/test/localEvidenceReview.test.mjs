import test from 'node:test';
import assert from 'node:assert/strict';
import { matchEvidenceToIndicator, readableText, summarizeEvidenceText } from '../src/lib/localEvidenceText.js';

test('marks blank or scan-only evidence for manual review without claiming it was analysed', () => {
  const result = summarizeEvidenceText('     ', { method: 'pdf-text', ocrAvailable: false });
  assert.equal(result.status, 'insufficient_text');
  assert.match(result.message, /No external OCR service/);
});

test('extracts numeric candidates with their source context for a human to verify', () => {
  const result = summarizeEvidenceText('Indicator IND-01: 240 households received support in Q2 2026.\nThe cumulative total is 830.', { method: 'local-text' });
  assert.equal(result.status, 'reviewable');
  assert.ok(result.numericCandidates.some((item) => item.value === '240' && item.context.includes('households')));
  assert.ok(result.numericCandidates.some((item) => item.value === '830'));
});

test('indicator match requires a code or name in locally extracted text', () => {
  const result = summarizeEvidenceText('The IND-01 indicator reports 240 households for the second quarter.', { method: 'local-text' });
  assert.equal(matchEvidenceToIndicator(result, { code: 'IND-01', name: 'Households reached' }).matched, true);
  assert.equal(matchEvidenceToIndicator(result, { code: 'IND-99', name: 'Forest hectares' }).matched, false);
});

test('normalizes empty lines and hidden null bytes before review', () => {
  assert.equal(readableText(`Line one${String.fromCharCode(0)}\n\n\n Line two  `), 'Line one\nLine two');
});
