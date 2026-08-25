// contentLocale.js — show a record in the reader's language.
//
// The interface is translated through i18n.js; the records inside it are not,
// because a project's name is a row in the database. Migration 0036 gives each
// such row an `i18n` column holding its translations, and the public.v_* views
// hand it back with the rest of the row:
//
//   { id: '…', name: 'Water Security Torba', …,
//     i18n: { fr: { name: 'Sécurité de l’eau à Torba' },
//             _src:    { fr: { name: 'Water Security Torba' } },
//             _origin: { fr: { name: 'machine' } } } }
//
// So localising is a swap on data already in hand — no second request, no id
// list to correlate, and nothing to keep in sync with the fetch.
//
// It happens once, where rows arrive, rather than at each of the hundred-odd
// places a name is rendered. Every downstream table, dropdown, chart label,
// printed report and CSV export is then in the right language without knowing
// this file exists.
import i18n from '../i18n';

// Marks the untranslated original on a localised copy.
const SOURCE = Symbol('sourceRow');

/**
 * English is the language records are entered in, so it is the source: its
 * "translation" is the column itself. Anything else reads from `i18n`.
 */
const isSourceLanguage = (lang) => !lang || lang === 'en';

/**
 * A single row, localised. Returns the row untouched when there is nothing to
 * swap, so callers can pass anything through without checking first.
 *
 * @param {object|null} row
 * @param {string} [lang] defaults to the active language
 */
export function localiseRow(row, lang = i18n.resolvedLanguage) {
  if (!row || typeof row !== 'object' || isSourceLanguage(lang)) return row;

  const translations = row.i18n?.[lang];
  if (!translations) return row;

  let out = null;
  for (const [column, text] of Object.entries(translations)) {
    // Only swap a field the row actually carries, and only when there is
    // something to show — a blank translation must not erase the English.
    if (!(column in row)) continue;
    if (typeof text !== 'string' || text.trim() === '') continue;
    if (out === null) out = { ...row };
    out[column] = text;
  }
  if (out === null) return row;

  // The copy keeps a link back to what it was made from. Forms edit the record
  // the officer entered, not the translation being displayed beside it, and a
  // row reaches a form through the same list that rendered the table — so
  // without this the French would be saved over the English on the next save.
  // Non-enumerable so it never reaches a spread, a JSON body or an export.
  Object.defineProperty(out, SOURCE, { value: row, enumerable: false });
  return out;
}

/**
 * The record as it was entered, given a row that may have been localised for
 * display. Safe to call on any row.
 */
export const sourceRow = (row) => row?.[SOURCE] ?? row;

/** The same, for a result set. */
export function localiseRows(rows, lang = i18n.resolvedLanguage) {
  if (!Array.isArray(rows) || isSourceLanguage(lang)) return rows;
  return rows.map((row) => localiseRow(row, lang));
}

/**
 * Localise a PostgREST result in place of awaiting it directly:
 *
 *   const { data, error } = await localised(supabase.from('v_projects').select('*'));
 *
 * `error` and every other field pass through untouched, so this is a drop-in
 * around an existing call rather than a different way of fetching.
 */
export async function localised(query, lang = i18n.resolvedLanguage) {
  const result = await query;
  if (!result || result.error || !result.data) return result;
  return {
    ...result,
    data: Array.isArray(result.data)
      ? localiseRows(result.data, lang)
      : localiseRow(result.data, lang),
  };
}

/**
 * The English a translation was made from, or null when the field is not
 * translated. The form uses it to show an officer what they are correcting.
 */
export function sourceText(row, column, lang = i18n.resolvedLanguage) {
  if (isSourceLanguage(lang)) return null;
  return row?.i18n?._src?.[lang]?.[column] ?? null;
}

/**
 * 'human' when an officer wrote this translation, 'machine' when the worker
 * did, null when there is no translation for the field.
 */
export function translationOrigin(row, column, lang = i18n.resolvedLanguage) {
  if (isSourceLanguage(lang)) return null;
  if (typeof row?.i18n?.[lang]?.[column] !== 'string') return null;
  return row?.i18n?._origin?.[lang]?.[column] ?? 'machine';
}

/** True when the record is being read in a language it was not written in. */
export const isTranslatedView = (lang = i18n.resolvedLanguage) => !isSourceLanguage(lang);
