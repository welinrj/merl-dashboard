// Checks for lib/completion.js — the shared "how complete is this record"
// arithmetic behind the MERL Reporting period header and the Project Setup
// completeness ring.
//
// The point of these is that both pages keep agreeing. The binary case (a
// module is filled once it holds a record) and the counted case (a form is
// filled once every check passes) have to come out of the same function, so
// the two pages can never disagree about whether the same project is ready.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  sectionState, summarise, recordCountSections, checkSection,
  SECTION_DONE, SECTION_PARTIAL, SECTION_EMPTY,
} = await import('../src/lib/completion.js');

// ── A single section ─────────────────────────────────────────────────────────
test('a section is done only when every check passes', () => {
  assert.equal(sectionState({ filled: 3, total: 3 }), SECTION_DONE);
  assert.equal(sectionState({ filled: 2, total: 3 }), SECTION_PARTIAL);
  assert.equal(sectionState({ filled: 0, total: 3 }), SECTION_EMPTY);
});

test('a section with nothing to check is empty, not done', () => {
  // "0 of 0" is not an achievement: counting it as complete would let an
  // unconfigured section inflate the percentage and hide that it measures
  // nothing.
  assert.equal(sectionState({ filled: 0, total: 0 }), SECTION_EMPTY);
  assert.equal(sectionState({}), SECTION_EMPTY);
  assert.equal(sectionState(undefined), SECTION_EMPTY);
});

test('over-filling does not become a third state', () => {
  assert.equal(sectionState({ filled: 5, total: 3 }), SECTION_DONE);
});

// ── Rolling up ───────────────────────────────────────────────────────────────
test('pct counts whole sections; requiredPct counts checks inside them', () => {
  // Deliberately different numbers: one section of two is done (50%), but 4 of
  // the 6 required checks are satisfied (67%). A page that showed one number
  // for both questions would be wrong about one of them.
  const s = summarise([
    { key: 'a', filled: 3, total: 3, required: true },
    { key: 'b', filled: 1, total: 3, required: true },
  ]);
  assert.equal(s.done, 1);
  assert.equal(s.total, 2);
  assert.equal(s.pct, 50);
  assert.equal(s.checksFilled, 4);
  assert.equal(s.checksTotal, 6);
  assert.equal(s.requiredPct, 67);
});

test('only required sections gate submission', () => {
  const s = summarise([
    { key: 'a', filled: 0, total: 2, required: true },
    { key: 'b', filled: 0, total: 2, required: false },
    { key: 'c', filled: 2, total: 2, required: true },
  ]);
  assert.deepEqual(s.missingRequired.map((m) => m.key), ['a']);
  assert.equal(s.requiredDone, 1);
  assert.equal(s.requiredTotal, 2);
  // The optional section still counts towards "sections complete".
  assert.equal(s.done, 1);
  assert.equal(s.total, 3);
  // ...but never towards the required ring.
  assert.equal(s.checksTotal, 4);
});

test('a filled count above its total cannot push the ring past 100', () => {
  const s = summarise([{ key: 'a', filled: 9, total: 3, required: true }]);
  assert.equal(s.requiredPct, 100);
  assert.equal(s.checksFilled, 3);
});

test('an empty list is 0%, not a division by zero', () => {
  const s = summarise([]);
  assert.equal(s.pct, 0);
  assert.equal(s.requiredPct, 0);
  assert.deepEqual(s.missingRequired, []);
  assert.deepEqual(summarise().missingRequired, []);
});

// ── The binary case (MERL Reporting) ─────────────────────────────────────────
test('a module is filled once it holds at least one record', () => {
  const modules = [
    { key: 'indicator_progress', requiredForSubmission: true },
    { key: 'evidence', requiredForSubmission: false },
  ];
  const sections = recordCountSections(modules, { indicator_progress: 4, evidence: 0 });
  assert.deepEqual(sections.map((s) => [s.key, s.filled, s.total, s.required]), [
    ['indicator_progress', 1, 1, true],
    ['evidence', 0, 1, false],
  ]);
  const s = summarise(sections);
  assert.equal(s.done, 1);
  assert.equal(s.pct, 50);
  assert.deepEqual(s.missingRequired, []);
});

test('a required module with no records blocks, and is named', () => {
  const modules = [{ key: 'financial_progress', requiredForSubmission: true }];
  const s = summarise(recordCountSections(modules, {}));
  assert.deepEqual(s.missingRequired.map((m) => m.key), ['financial_progress']);
  assert.equal(s.pct, 0);
});

test('a missing count is absent, not zero-by-accident', () => {
  // The counts map is filled asynchronously; before it lands every module must
  // read as empty rather than throwing.
  const sections = recordCountSections([{ key: 'a' }], undefined);
  assert.equal(sections[0].filled, 0);
  assert.equal(summarise(recordCountSections(undefined, {})).total, 0);
});

// ── The counted case (Project Setup) ─────────────────────────────────────────
test('a section built from checks carries what is still missing', () => {
  const sec = checkSection('profile', [
    { ok: true, label: 'ps.projectTitle' },
    { ok: false, label: 'ps.startDate' },
    { ok: false, label: 'ps.approvedBudget' },
  ], { label: 'ps.projectProfile' });

  assert.equal(sec.filled, 2 - 1); // one of three
  assert.equal(sec.total, 3);
  assert.equal(sec.required, true);
  assert.equal(sec.label, 'ps.projectProfile');
  assert.deepEqual(sec.issues.map((i) => i.label), ['ps.startDate', 'ps.approvedBudget']);
  assert.equal(sectionState(sec), SECTION_PARTIAL);
});

test('checks can be conditionally absent without becoming failures', () => {
  // Callers build the list with `cond && {...}`, so falsy entries are holes in
  // the list rather than unmet checks — counting them as failures would block
  // submission on a check that does not apply.
  const sec = checkSection('indicators', [
    { ok: true, label: 'a' },
    false,
    null,
    undefined,
  ]);
  assert.equal(sec.total, 1);
  assert.equal(sec.filled, 1);
  assert.equal(sectionState(sec), SECTION_DONE);
});

test('a section can be marked optional', () => {
  const sec = checkSection('extras', [{ ok: false, label: 'x' }], { required: false });
  assert.equal(sec.required, false);
  assert.deepEqual(summarise([sec]).missingRequired, []);
});

test('the two pages agree on a project that is entirely empty', () => {
  const setup = summarise([
    checkSection('profile', [{ ok: false }, { ok: false }]),
    checkSection('results', [{ ok: false }]),
  ]);
  const reporting = summarise(recordCountSections(
    [{ key: 'profile', requiredForSubmission: true }, { key: 'results', requiredForSubmission: true }], {}));
  assert.equal(setup.pct, reporting.pct);
  assert.equal(setup.requiredPct, reporting.requiredPct);
  assert.equal(setup.missingRequired.length, reporting.missingRequired.length);
});
