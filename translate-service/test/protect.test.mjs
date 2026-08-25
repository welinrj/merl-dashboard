// The protection rules are the part of this service that can quietly corrupt
// official records, so they get the tests. Everything else is a poll loop.

import test from 'node:test';
import assert from 'node:assert/strict';
import { isTranslatable, protectText, unprotect } from '../protect.js';

test('prose is translatable', () => {
  for (const s of [
    'Water Security Torba',
    'Rainwater harvesting and borehole rehabilitation across Torba province.',
    'Cyclone season delays coastal works',
    'Households with a climate plan',
  ]) assert.equal(isTranslatable(s), true, s);
});

test('identifiers, numbers, links and paths are never sent', () => {
  for (const s of [
    'VCRP-001', 'DEMO-0012', 'DCC-2026-002', 'IND-01',   // project and record codes
    'VUV', 'GCF', 'MFAT',                                 // bare acronyms
    '350000000', '68.6%', '2026-09-30', '1 680',          // figures and dates
    'https://docc.gov.vu/report.pdf', 'www.docc.gov.vu',
    '/uploads/evidence/photo.jpg', 'C:\\reports\\q2.docx',
    '', ' ', '—',
  ]) assert.equal(isTranslatable(s), false, s);
});

test('a lone province name is a name, not a sentence', () => {
  assert.equal(isTranslatable('TORBA'), false);
  assert.equal(isTranslatable('Vanuatu'), false);
});

test('protected terms inside a sentence are wrapped', () => {
  const out = protectText('Water Security Torba, delivered with MFAT in Vanuatu');
  assert.match(out, /<x>Torba<\/x>/);
  assert.match(out, /<x>MFAT<\/x>/);
  assert.match(out, /<x>Vanuatu<\/x>/);
  assert.match(out, /^Water Security /);   // the translatable part is untouched
});

test('embedded record codes are wrapped', () => {
  assert.equal(protectText('See RSK-01 for detail'), 'See <x>RSK-01</x> for detail');
  assert.equal(protectText('Activity ACT-0012 is delayed'), 'Activity <x>ACT-0012</x> is delayed');
});

test('a word merely containing a protected term is left alone', () => {
  // \b anchoring: "Vanuatu" must not match inside "Vanuatuan"
  assert.equal(protectText('Vanuatuan officers'), 'Vanuatuan officers');
});

test('unprotect removes the tags wherever the engine moved them', () => {
  assert.equal(unprotect('Sécurité de l’eau à <x>Torba</x>'), 'Sécurité de l’eau à Torba');
  assert.equal(unprotect('<x>Torba</x> — <x>MFAT</x>'), 'Torba — MFAT');
  // engines sometimes drop the closing tag or split the pair
  assert.equal(unprotect('<x>Torba province'), 'Torba province');
});

test('protect then unprotect is the identity on the source', () => {
  const samples = [
    'Water Security Torba',
    'See RSK-01 for detail',
    'Delivered with MFAT across SHEFA and TAFEA',
    'No protected terms at all here',
  ];
  for (const s of samples) assert.equal(unprotect(protectText(s)), s, s);
});
