// =============================================================================
// reporting.js — Pure MERL calculation helpers for the DoCC forms.
// These mirror the server-side calculations (migration 0029) so the UI can show
// live previews before saving. They deliberately preserve the NULL ≠ 0
// distinction (Section 14): a missing input yields null, never 0.
// =============================================================================

// fmtAmount below is the one display-facing helper here, and its thousands
// separator has to follow the reader's language like every other number.
import { intlLocale } from '../locale';

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Achievement % = cumulative / final target × 100. Not applied to qualitative
 *  indicators or where lower values indicate improvement (Section 4/14). */
export function achievementPct(cumulative, finalTarget, { qualitative = false } = {}) {
  const c = num(cumulative), t = num(finalTarget);
  if (qualitative) return null;
  if (!isNum(c) || !isNum(t) || t === 0) return null;
  return Math.round((c / t) * 1000) / 10;
}

/** Variance = actual this period − period target. */
export function variance(actual, periodTarget) {
  const a = num(actual), t = num(periodTarget);
  if (!isNum(a) || !isNum(t)) return null;
  return a - t;
}

// Configurable performance thresholds (Section 4 — thresholds must be
// configurable). Applied to achievement % for quantitative "higher is better".
export const PERFORMANCE_THRESHOLDS = { onTrack: 90, attention: 60 };

/** Derive a performance status token from achievement % + data availability. */
export function performanceStatus(pct, { hasData = true, thresholds = PERFORMANCE_THRESHOLDS } = {}) {
  if (!hasData) return 'no_data';
  if (!isNum(pct)) return 'no_data';
  if (pct >= 100) return 'target_achieved';
  if (pct >= thresholds.onTrack) return 'on_track';
  if (pct >= thresholds.attention) return 'attention_required';
  return 'off_track';
}

/** Remaining balance = approved budget − cumulative expenditure. */
export function remainingBalance(approvedBudget, cumulativeExpenditure) {
  const b = num(approvedBudget), e = num(cumulativeExpenditure);
  if (!isNum(b) || !isNum(e)) return null;
  return b - e;
}

/** Budget utilisation % = cumulative expenditure / approved budget × 100. */
export function utilisationPct(approvedBudget, cumulativeExpenditure) {
  const b = num(approvedBudget), e = num(cumulativeExpenditure);
  if (!isNum(b) || !isNum(e) || b === 0) return null;
  return Math.round((e / b) * 1000) / 10;
}

/** Funds available = funds received − funds committed. */
export function fundsAvailable(fundsReceived, fundsCommitted) {
  const r = num(fundsReceived), c = num(fundsCommitted);
  if (!isNum(r)) return null;
  return r - (isNum(c) ? c : 0);
}

/** Risk rating from configurable Likelihood × Impact (1–5 each). */
export function riskRating(likelihood, impact) {
  const l = num(likelihood), i = num(impact);
  if (!isNum(l) || !isNum(i)) return null;
  const s = l * i;
  if (s >= 15) return 'Critical';
  if (s >= 9) return 'High';
  if (s >= 4) return 'Medium';
  return 'Low';
}

/** Format a number as a currency-ish amount (no symbol; thousands separators). */
export function fmtAmount(v) {
  const n = num(v);
  if (!isNum(n)) return '—';
  return n.toLocaleString(intlLocale(), { maximumFractionDigits: 2 });
}

/** Format a percentage for display, preserving the null/no-data distinction. */
export function fmtPct(v) {
  const n = num(v);
  if (!isNum(n)) return '—';
  return `${n}%`;
}
