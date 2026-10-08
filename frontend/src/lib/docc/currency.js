// Shared snapshot rates already used by the public portal: RBV, 25 September 2026.
export const VUV_RATES = Object.freeze({ VUV:1, USD:117.58, AUD:82.46, NZD:66.56, EUR:133.80, GBP:155.38, JPY:0.7404 });
export function toVuv(value, currency = 'VUV') {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return null;
  const rate = VUV_RATES[String(currency || 'VUV').trim().toUpperCase()];
  return rate == null ? null : Number(value) * rate;
}
export function sumReported(values) {
  const known = values.filter(value => value != null && Number.isFinite(Number(value)));
  return known.length ? known.reduce((total, value) => total + Number(value), 0) : null;
}
export function recordedExpenditure(project, financial) {
  return financial?.cumulative_expenditure ?? (Number(project?.spent_vuv) > 0 ? project.spent_vuv : null);
}
