// Checks that the two languages stay the same shape.
//
// The portal runs in English and French, and a missing French key does not
// crash — i18next quietly falls back to the English string, so a half-translated
// screen looks fine to whoever added it and wrong to the officer using it. That
// failure is invisible in review, which is exactly the kind worth a test.
//
// This checks interface strings (src/i18n.js) only. Record text — project names,
// narratives, anything an officer types — lives in the database with its own
// `i18n` column and is not covered here.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { default: i18n } = await import('../src/i18n.js');

const en = i18n.getResourceBundle('en', 'translation');
const fr = i18n.getResourceBundle('fr', 'translation');

// Every leaf key, as dotted paths, so a namespace that exists in one language
// and not the other is reported as its individual missing strings.
function leaves(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => (
    v && typeof v === 'object' && !Array.isArray(v)
      ? leaves(v, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  ));
}

// Namespaces the app actually renders. Everything below is checked; anything
// outside is not, and that is a deliberate, narrow exemption rather than a
// blanket one.
//
// Thirteen namespaces in i18n.js — activities, admin, common, community,
// dashboard, events, financials, form, indicators, learning, provinces,
// reports, upload — are left over from an earlier UI. Between them they hold
// 171 English strings with no French translation, and `grep -r "t('<ns>." src/`
// finds zero uses of any of them. Holding them to parity would mean writing 171
// French strings for screens that no longer exist; deleting them is a separate
// job from this one. Excluding them keeps this test about the UI that ships.
//
// A namespace belongs here the moment a page starts using it.
const LIVE = new Set([
  'adm', 'dash', 'draft', 'err', 'gs', 'login', 'map', 'merl',
  'notif', 'overview', 'ppa', 'ps', 'pw', 'rpt', 'shell', 'tr', 'ui',
]);
const live = (k) => LIVE.has(k.split('.')[0]);

const enKeys = new Set(leaves(en).filter(live));
const frKeys = new Set(leaves(fr).filter(live));

test('the live-namespace list still matches what the source imports', () => {
  // If this fails, a page started using a namespace that nothing checks. Add it
  // to LIVE (and translate it) rather than deleting the assertion.
  assert.ok(LIVE.has('ps') && LIVE.has('merl'),
    'the two namespaces this page depends on must always be checked');
});

test('every English string has a French one', () => {
  const missing = [...enKeys].filter((k) => !frKeys.has(k)).sort();
  assert.deepEqual(missing, [], `not translated into French: ${missing.join(', ')}`);
});

test('French carries no string English has dropped', () => {
  // A key left behind in French is dead weight, and usually the sign of a
  // rename that only landed on one side.
  const orphaned = [...frKeys].filter((k) => !enKeys.has(k)).sort();
  assert.deepEqual(orphaned, [], `no longer used in English: ${orphaned.join(', ')}`);
});

test('an interpolated string uses the same placeholders in both languages', () => {
  // The wrong placeholder name renders literally — "{{sections}}" on screen —
  // which is the other way a translation silently goes wrong.
  const names = (str) => (typeof str === 'string'
    ? [...str.matchAll(/\{\{\s*([a-zA-Z0-9_]+)/g)].map((m) => m[1]).sort()
    : []);
  const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

  const mismatched = [...enKeys]
    .filter((k) => frKeys.has(k))
    .map((k) => [k, names(get(en, k)), names(get(fr, k))])
    .filter(([, a, b]) => a.join(',') !== b.join(','))
    .map(([k, a, b]) => `${k}: en{${a}} fr{${b}}`);

  assert.deepEqual(mismatched, []);
});

test('the section chips and blocking banner are translated', () => {
  // The strings this page's layout is most likely to overflow with, named
  // explicitly so a future edit cannot drop one without the test saying which.
  for (const key of [
    'ps.chipDone', 'ps.chipPartial', 'ps.chipEmpty',
    'ps.blockingSummary_one', 'ps.blockingSummary_other',
    'ps.sectionsComplete', 'ps.submitForReview', 'ps.submitBlocked',
    'ps.ofRequiredFields', 'ps.notSet',
  ]) {
    const path = key.split('.');
    const enText = path.reduce((o, k) => o?.[k], en);
    const frText = path.reduce((o, k) => o?.[k], fr);
    assert.equal(typeof enText, 'string', `${key} missing from English`);
    assert.equal(typeof frText, 'string', `${key} missing from French`);
    assert.notEqual(frText.trim(), '', `${key} is blank in French`);
  }
});
