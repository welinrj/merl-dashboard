// locale.js — dates and numbers in the reader's language.
//
// The portal is used in English and French, and a date rendered as "4 Jul 2026"
// inside an otherwise French page is as much a translation gap as an untranslated
// heading. Everything display-facing goes through here so the format follows the
// active language, and so the intl locale lives in one place rather than being
// re-picked ('en-VU', 'en-GB', 'en-US', the browser default) file by file.
//
// Vanuatu is the regional variant for both languages; the browser falls back to
// the base language when it doesn't carry a fr-VU dataset, which is what we want.
import i18n from '../i18n';

const INTL_LOCALE = { en: 'en-VU', fr: 'fr-VU' };

/** BCP-47 locale for the active language. */
export const intlLocale = () => INTL_LOCALE[i18n.resolvedLanguage] ?? INTL_LOCALE.en;

/** "4 Jul 2026" / "4 juil. 2026" — the portal's standard date. */
export const fmtDate = (value) => (value
  ? new Date(value).toLocaleDateString(intlLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
  : '—');

/** Date plus 24-hour time, for audit trails and generated-report headers. */
export const fmtDateTime = (value) => (value
  ? new Date(value).toLocaleString(intlLocale(), {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  : '—');

/** Time of day only — "14:03" — for things that happened during this sitting. */
export const fmtTime = (value) => (value
  ? new Date(value).toLocaleTimeString(intlLocale(), { hour: '2-digit', minute: '2-digit' })
  : '—');

/** Thousands-separated count — "1,680" in English, "1 680" in French. */
export const fmtNum = (value, dash = '—') => (value == null || value === ''
  ? dash
  : Number(value).toLocaleString(intlLocale()));
