import i18n from '../../i18n';

// Accept explicitly grouped English numbers and French decimal/group separators.
// Ambiguous numeric input must never silently turn a numeric target into prose.
export function frameworkNumber(value, language = i18n.resolvedLanguage) {
  const raw = String(value).trim();
  if (!raw) return null;
  const fr = language?.startsWith('fr');
  let normal = raw;
  if (fr) {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)(?:[,.]\d+)?$/.test(raw)) return NaN;
    normal = raw.replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  } else {
    if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) return NaN;
    normal = raw.replaceAll(',', '');
  }
  return Number.isFinite(Number(normal)) ? Number(normal) : NaN;
}

// Patch only the content the user opened; retain every other field in the row.
export function cellChanges(editor) {
  const {field,value,row} = editor;
  if (field === 'indicator') return {indicator:{name:value,code:editor.code,unit:editor.unit || null}};
  if (field === 'reporting') return {indicator:{official_reporting_frequency:value || null}};
  if (['baseline','mid_term','final'].includes(field)) {
    const existing = row.targets[field];
    const raw = String(value).trim();
    const number = frameworkNumber(raw, editor.language);
    const numeric = raw !== '' && Number.isFinite(number);
    const ordinal = existing?.ordinal_value != null && raw.match(/^(?:Scale\s+)?(-?\d+)$/i);
    if (raw && !ordinal && !numeric && (existing?.numeric_value != null || existing?.ordinal_value != null || /^[\d+\-.,\s]+$/.test(raw))) throw new Error(i18n.t('rf.numberError'));
    return {targets:[{...(existing ? {id:existing.id} : {target_type:field,period_label:{baseline:'Baseline',mid_term:'Mid-term',final:'Final'}[field]}),numeric_value:ordinal ? null : numeric ? number : null,text_value:ordinal || numeric || raw === '' ? null : value,ordinal_value:ordinal ? Number(ordinal[1]) : null}]};
  }
  if (!row.progress && !editor.period) throw new Error(i18n.t('rf.choosePeriod'));
  const progress = row.progress ? {} : {reporting_period:editor.period};
  if (field === 'narrative') return {...(!row.progress ? {progress} : {}),narrative:{progress_summary:value}};
  if (field === 'status') Object.assign(progress,{performance_status:editor.performance,schedule_status:editor.schedule});
  else {
    const raw = String(value).trim();
    const number = frameworkNumber(raw, editor.language);
    if (raw !== '' && !Number.isFinite(number)) throw new Error(i18n.t('rf.numberError'));
    progress[field === 'progress' ? 'achievement_pct' : row.progress?.cumulative_actual != null ? 'cumulative_actual' : 'actual_this_period'] = number;
  }
  return {progress};
}
