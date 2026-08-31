// Checks for lib/formDraft.js — the store behind "save as draft".
//
// Only the storage half is exercised here: the hook needs React to run, but the
// rules that decide whether an officer's half-filled form comes back are all in
// these functions. A stub localStorage stands in for the browser's, and the
// module reads `window` at call time, so it is enough to define it here.
import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';

function fakeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: (i) => Array.from(map.keys())[i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, val) => { map.set(k, String(val)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

globalThis.window = {
  localStorage: fakeStorage(),
  addEventListener() {},
  removeEventListener() {},
};

const {
  draftKey, readDraft, writeDraft, clearDraft, hasDraft, pruneDrafts, draftKeysUnder, subscribeDrafts,
} = await import('../src/lib/formDraft.js');

beforeEach(() => { globalThis.window.localStorage = fakeStorage(); });

// ── Keys ─────────────────────────────────────────────────────────────────────
test('a key is stable and scoped by every part it is given', () => {
  assert.equal(draftKey('merl', 'u1', 'p1', '2026Q1', 'evidence', 'new'),
    draftKey('merl', 'u1', 'p1', '2026Q1', 'evidence', 'new'));
  // Two officers on the same shared laptop must not share a draft.
  assert.notEqual(draftKey('merl', 'u1', 'p1', 'x'), draftKey('merl', 'u2', 'p1', 'x'));
  // Nor two periods, projects or modules of the same officer.
  assert.notEqual(draftKey('merl', 'u1', 'p1', '2026Q1'), draftKey('merl', 'u1', 'p1', '2026Q2'));
});

test('an empty or missing part still occupies its position', () => {
  // Otherwise ('a', '', 'b') and ('a', 'b') would collide.
  assert.notEqual(draftKey('a', '', 'b'), draftKey('a', 'b'));
  assert.equal(draftKey('a', null, 'b'), draftKey('a', undefined, 'b'));
});

// ── Round trip ───────────────────────────────────────────────────────────────
test('what was written is what comes back', () => {
  const key = draftKey('t', 'u1', 'form');
  const values = { name: 'Coastal resilience', budget_vuv: '', provinces: ['SANMA'], done: false };
  assert.ok(writeDraft(key, values));
  assert.deepEqual(readDraft(key).values, values);
  assert.equal(hasDraft(key), true);
});

test('there is no draft until one is written, and none after it is cleared', () => {
  const key = draftKey('t', 'u1', 'form');
  assert.equal(readDraft(key), null);
  assert.equal(hasDraft(key), false);
  writeDraft(key, { a: 1 });
  clearDraft(key);
  assert.equal(readDraft(key), null);
});

test('a draft carries the time it was saved', () => {
  const key = draftKey('t', 'u1', 'form');
  const before = Date.now();
  const at = writeDraft(key, { a: 1 });
  assert.ok(at >= before);
  assert.equal(readDraft(key).savedAt, at);
});

test('corrupt stored text is treated as no draft rather than thrown', () => {
  const key = draftKey('t', 'u1', 'form');
  window.localStorage.setItem(key, 'not json');
  assert.equal(readDraft(key), null);
});

// ── Expiry and housekeeping ──────────────────────────────────────────────────
test('a draft older than thirty days is not restored', () => {
  const key = draftKey('t', 'u1', 'old');
  const ancient = Date.now() - 31 * 24 * 60 * 60 * 1000;
  window.localStorage.setItem(key, JSON.stringify({ savedAt: ancient, values: { a: 1 } }));
  assert.equal(readDraft(key), null);
  // and reading it is what removes it, so the store does not grow for ever.
  assert.equal(window.localStorage.getItem(key), null);
});

test('pruning drops the expired drafts and keeps the current ones', () => {
  const fresh = draftKey('t', 'u1', 'fresh');
  const stale = draftKey('t', 'u1', 'stale');
  writeDraft(fresh, { a: 1 });
  window.localStorage.setItem(stale, JSON.stringify({
    savedAt: Date.now() - 40 * 24 * 60 * 60 * 1000, values: { a: 1 },
  }));
  pruneDrafts();
  assert.equal(hasDraft(fresh), true);
  assert.equal(window.localStorage.getItem(stale), null);
});

test('pruning leaves keys that are not drafts alone', () => {
  window.localStorage.setItem('sb-access-token', 'keep me');
  writeDraft(draftKey('t', 'u1', 'f'), { a: 1 });
  pruneDrafts(0);
  assert.equal(window.localStorage.getItem('sb-access-token'), 'keep me');
});

// ── Finding drafts again ─────────────────────────────────────────────────────
test('drafts can be found by the prefix their forms share', () => {
  const mine = draftKey('ps', 'u1', 'p1', 'indicator', 'new');
  const alsoMine = draftKey('ps', 'u1', 'p1', 'indicator', 'i-42');
  const otherStep = draftKey('ps', 'u1', 'p1', 'location', 'new');
  [mine, alsoMine, otherStep].forEach((k) => writeDraft(k, { a: 1 }));
  const prefix = draftKey('ps', 'u1', 'p1', 'indicator');
  assert.deepEqual(draftKeysUnder(prefix).sort(), [mine, alsoMine].sort());
});

test('subscribers hear about a draft appearing and disappearing', () => {
  let calls = 0;
  const stop = subscribeDrafts(() => { calls += 1; });
  const key = draftKey('t', 'u1', 'form');
  writeDraft(key, { a: 1 });
  clearDraft(key);
  stop();
  writeDraft(key, { a: 2 });
  assert.equal(calls, 2); // the two before unsubscribing, and nothing after
});

// ── Storage that refuses to play ─────────────────────────────────────────────
test('a blocked localStorage degrades to no drafts instead of crashing', () => {
  globalThis.window.localStorage = {
    get length() { return 0; },
    key: () => null,
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  const key = draftKey('t', 'u1', 'form');
  assert.equal(writeDraft(key, { a: 1 }), null);
  assert.equal(readDraft(key), null);
  assert.equal(hasDraft(key), false);
  assert.doesNotThrow(() => clearDraft(key));
  assert.doesNotThrow(() => pruneDrafts());
  assert.deepEqual(draftKeysUnder('anything'), []);
});
