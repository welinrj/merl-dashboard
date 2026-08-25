// protect.js — decide what may be translated, and shield the parts inside it
// that must survive word for word.
//
// This runs over government project records. A project's registered name, its
// code, the provinces it works in and the donor funding it all print into
// official reports, and a translation engine will happily turn "Water Security
// Torba" into "Sécurité de l'eau à Torba" — correct — and "TORBA" into
// "TROUBLE" if it is feeling creative. Two defences:
//
//   1. Whole strings that are not prose (a code, an acronym, a URL, a number)
//      are never sent at all.
//   2. Inside prose, protected tokens are wrapped in an ignore tag the engine
//      is told to leave alone, then unwrapped afterwards.

// The six provinces, the national wordmark, and the department's own initials.
// These appear inside otherwise translatable sentences constantly.
export const PROTECTED_TERMS = [
  'Vanuatu', 'TORBA', 'Torba', 'SANMA', 'Sanma', 'PENAMA', 'Penama',
  'MALAMPA', 'Malampa', 'SHEFA', 'Shefa', 'TAFEA', 'Tafea',
  'DoCC', 'MERL', 'GEDSI', 'VUV', 'SRF', 'MFAT', 'GCF', 'GEF', 'UNDP',
  'SPC', 'ADB', 'NDC', 'NAP',
];

// A string that is a bare code, acronym, identifier, number, URL or path is not
// prose and gains nothing from translation — it only risks being mangled.
const CODE_LIKE      = /^[A-Z0-9][A-Z0-9._\-/]*$/;          // VCRP-001, DEMO-0012, Q2
const URL_LIKE       = /^(https?:\/\/|www\.|\/|[a-z]:\\)/i; // links and file paths
const NUMERIC_LIKE   = /^[\d\s.,%+\-/()]*$/;                // 350 000 000, 68.6%
const HAS_LETTERS    = /\p{L}{2,}/u;

/**
 * Should this value be sent to the translation engine at all?
 * @param {string} value
 */
export function isTranslatable(value) {
  const text = (value ?? '').trim();
  if (text.length < 2) return false;
  if (!HAS_LETTERS.test(text)) return false;
  if (URL_LIKE.test(text)) return false;
  if (NUMERIC_LIKE.test(text)) return false;
  if (CODE_LIKE.test(text)) return false;
  // A single protected term on its own is a name, not a sentence.
  if (PROTECTED_TERMS.includes(text)) return false;
  return true;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest first, so "Vanuatu" inside a longer protected term is not matched
// before the term itself.
const TERM_RE = new RegExp(
  `\\b(${[...PROTECTED_TERMS].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})\\b`,
  'g',
);

// Project codes and similar identifiers embedded in a sentence.
const INLINE_CODE_RE = /\b[A-Z]{2,}[-_]\d{1,6}\b/g;

/**
 * Wrap the spans an engine must not touch. The tag is the one we ask the
 * provider to ignore; it is stripped again by `unprotect`.
 * @param {string} text
 */
export function protectText(text) {
  return String(text)
    .replace(INLINE_CODE_RE, (m) => `<x>${m}</x>`)
    .replace(TERM_RE, (m) => `<x>${m}</x>`);
}

/** Remove the ignore tags, including any the engine moved or duplicated. */
export function unprotect(text) {
  return String(text).replace(/<\/?x>/g, '');
}
