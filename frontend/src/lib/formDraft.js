// =============================================================================
// formDraft.js — "save as draft" for the data-entry forms.
//
// An officer filling Form 4 who has to jump to Form 6 for a figure, or who is
// halfway through a project profile when the browser is closed on a phone, must
// not lose what they typed. Every form value is therefore mirrored into
// localStorage as an unsubmitted **draft** and restored the next time the same
// form is opened.
//
// A draft is deliberately *local*: it has not passed validation, so it is not a
// record and never reaches the database. Submitting is unchanged — the required
// fields are still checked at save time and only a complete record is written
// through the RPCs. Clearing the draft is what a successful save does.
//
// Drafts are namespaced per user (a shared field laptop must not show one
// officer's half-finished entry to the next) and expire after 30 days so the
// store cannot grow without bound.
// =============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'merl.draft.v1:';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTOSAVE_MS = 600;

/** localStorage, or null where it is unavailable (private mode, blocked storage). */
function store() {
  try {
    const s = window.localStorage;
    // Safari in private mode exposes the object and throws on write.
    const probe = `${PREFIX}probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Build a stable key from its parts — user, form, and whatever scopes the row. */
export function draftKey(...parts) {
  return PREFIX + parts
    .map((p) => (p === null || p === undefined || p === '' ? '-' : String(p)))
    .join('|');
}

// Anything that re-renders when a draft appears or disappears subscribes here,
// so the "Draft" markers on the form tabs stay honest without polling.
const listeners = new Set();
const notify = () => { listeners.forEach((fn) => { try { fn(); } catch { /* listener's own problem */ } }); };

export function subscribeDrafts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The stored draft for a key: { values, savedAt } — or null when there is none. */
export function readDraft(key) {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.values) return null;
    if (!parsed.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) { s.removeItem(key); return null; }
    return { values: parsed.values, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function hasDraft(key) {
  return readDraft(key) !== null;
}

/** Write a draft. Returns the timestamp stored, or null if storage refused it. */
export function writeDraft(key, values) {
  const s = store();
  if (!s) return null;
  const savedAt = Date.now();
  try {
    s.setItem(key, JSON.stringify({ savedAt, values }));
  } catch {
    // Out of quota — drop the stale drafts and try once more before giving up.
    pruneDrafts(0);
    try { s.setItem(key, JSON.stringify({ savedAt, values })); } catch { return null; }
  }
  notify();
  return savedAt;
}

export function clearDraft(key) {
  const s = store();
  if (!s || !key) return;
  try { s.removeItem(key); } catch { /* nothing left to do */ }
  notify();
}

/** Drop drafts older than `maxAge` (default 30 days). Runs once on module load. */
export function pruneDrafts(maxAge = MAX_AGE_MS) {
  const s = store();
  if (!s) return;
  try {
    const doomed = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const parsed = JSON.parse(s.getItem(k));
        if (!parsed?.savedAt || Date.now() - parsed.savedAt > maxAge) doomed.push(k);
      } catch { doomed.push(k); }
    }
    doomed.forEach((k) => s.removeItem(k));
    if (doomed.length) notify();
  } catch { /* storage disappeared under us */ }
}
pruneDrafts();

/** Every stored draft key beginning with `prefix`. */
export function draftKeysUnder(prefix) {
  const s = store();
  if (!s) return [];
  const out = [];
  try {
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
  } catch { /* fall through to the empty list */ }
  return out;
}

/**
 * Which of `keys` currently hold a draft — a Set, recomputed whenever a draft is
 * written or discarded (in this tab or another one). Used to mark the forms that
 * have unfinished work waiting in them.
 */
export function useDraftPresence(keys) {
  const signature = keys.join(' ');
  const [present, setPresent] = useState(() => new Set());
  useEffect(() => {
    const recompute = () => setPresent(new Set(keys.filter((k) => k && hasDraft(k))));
    recompute();
    const unsubscribe = subscribeDrafts(recompute);
    window.addEventListener('storage', recompute);
    return () => { unsubscribe(); window.removeEventListener('storage', recompute); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return present;
}

/**
 * Which of `prefixes` have at least one draft stored beneath them — for a step
 * or a section that holds several forms, where the exact keys are not known
 * ahead of time. Recomputed on the same signals as `useDraftPresence`.
 */
export function useDraftPrefixes(prefixes) {
  const signature = prefixes.join(' ');
  const [present, setPresent] = useState(() => new Set());
  useEffect(() => {
    const recompute = () => setPresent(new Set(prefixes.filter((p) => p && draftKeysUnder(p).length > 0)));
    recompute();
    const unsubscribe = subscribeDrafts(recompute);
    window.addEventListener('storage', recompute);
    return () => { unsubscribe(); window.removeEventListener('storage', recompute); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return present;
}

/**
 * Mirror a form's values into a draft, and restore one when the form re-opens.
 *
 *   const draft = useFormDraft(key, v, { baseline: seed, onRestore: setV });
 *
 * `baseline` is the form's own starting point (blank for a new record, the saved
 * row when editing). Values equal to it are not a draft but an untouched form,
 * so the draft is cleared rather than written — undoing an edit by hand removes
 * the draft instead of leaving a phantom one behind.
 *
 * Returns { status, savedAt, restoredAt, flush, clear, discard, hasDraft },
 * where status is 'idle' | 'saving' | 'saved' | 'restored'.
 */
export function useFormDraft(key, values, { baseline, onRestore, enabled = true } = {}) {
  const [savedAt, setSavedAt] = useState(null);
  const [restoredAt, setRestoredAt] = useState(null);
  const [status, setStatus] = useState('idle');

  const baselineJson = JSON.stringify(baseline ?? null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  // Set while a restore is being applied, so the autosave effect does not
  // immediately write back the values it has just read.
  const skipNextRef = useRef(false);
  // What the stored draft already holds. Without it, restoring a draft would
  // immediately re-save the very same values under a new timestamp, and the
  // officer would be told their week-old draft was "saved just now".
  const lastWrittenRef = useRef(null);

  // Restore — once per key, and before any autosave for that key.
  useEffect(() => {
    setSavedAt(null); setRestoredAt(null); setStatus('idle');
    if (!enabled || !key) return;
    const found = readDraft(key);
    if (!found) return;
    skipNextRef.current = true;
    lastWrittenRef.current = JSON.stringify(found.values);
    onRestoreRef.current?.(found.values);
    setSavedAt(found.savedAt);
    setRestoredAt(found.savedAt);
    setStatus('restored');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  // Autosave — debounced, and only once the values differ from the baseline.
  const valuesJson = JSON.stringify(values ?? null);
  useEffect(() => {
    if (!enabled || !key) return undefined;
    if (skipNextRef.current) { skipNextRef.current = false; return undefined; }
    if (valuesJson === baselineJson) {
      // Back where it started — there is nothing left to keep.
      if (readDraft(key)) { clearDraft(key); setSavedAt(null); setRestoredAt(null); }
      lastWrittenRef.current = null;
      setStatus('idle');
      return undefined;
    }
    // Already stored, to the character — nothing to do, and nothing to say.
    if (valuesJson === lastWrittenRef.current) return undefined;
    setStatus('saving');
    const timer = setTimeout(() => {
      const at = writeDraft(key, values);
      if (at) { lastWrittenRef.current = valuesJson; setSavedAt(at); setStatus('saved'); } else { setStatus('idle'); }
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesJson, baselineJson, key, enabled]);

  // Write the draft out now rather than after the debounce — for closing a form.
  // Returns true when something was actually kept.
  const flush = useCallback(() => {
    if (!enabled || !key) return false;
    if (valuesJson === baselineJson) { clearDraft(key); lastWrittenRef.current = null; return false; }
    const at = writeDraft(key, values);
    if (at) { lastWrittenRef.current = valuesJson; setSavedAt(at); setStatus('saved'); }
    return at != null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesJson, baselineJson, key, enabled]);

  // Forget the draft without touching the form (what a successful save does).
  const clear = useCallback(() => {
    clearDraft(key);
    lastWrittenRef.current = null;
    setSavedAt(null); setRestoredAt(null); setStatus('idle');
  }, [key]);

  // Forget the draft *and* put the form back to its baseline.
  const discard = useCallback(() => {
    skipNextRef.current = true;
    clearDraft(key);
    lastWrittenRef.current = null;
    setSavedAt(null); setRestoredAt(null); setStatus('idle');
    if (baselineJson !== 'null') onRestoreRef.current?.(JSON.parse(baselineJson));
  }, [key, baselineJson]);

  return { status, savedAt, restoredAt, flush, clear, discard, hasDraft: savedAt != null };
}
