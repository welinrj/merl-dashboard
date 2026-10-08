// Patch only the content the user opened; retain every other field in the row.
export function cellChanges(editor) {
  const {field,value,row} = editor;
  if (field === 'indicator') return {indicator:{name:value,code:editor.code,unit:editor.unit || null}};
  if (field === 'reporting') return {indicator:{official_reporting_frequency:value || null}};
  if (['baseline','mid_term','final'].includes(field)) {
    const existing = row.targets[field];
    const raw = String(value).trim();
    const numeric = raw !== '' && Number.isFinite(Number(raw));
    const ordinal = existing?.ordinal_value != null && raw.match(/^(?:Scale\s+)?(-?\d+)$/i);
    return {targets:[{...(existing ? {id:existing.id} : {target_type:field,period_label:{baseline:'Baseline',mid_term:'Mid-term',final:'Final'}[field]}),numeric_value:ordinal ? null : numeric ? Number(raw) : null,text_value:ordinal || numeric || raw === '' ? null : value,ordinal_value:ordinal ? Number(ordinal[1]) : null}]};
  }
  if (!row.progress && !editor.period) throw new Error('Choose a reporting period.');
  const progress = row.progress ? {} : {reporting_period:editor.period};
  if (field === 'narrative') return {...(!row.progress ? {progress} : {}),narrative:{progress_summary:value}};
  if (field === 'status') Object.assign(progress,{performance_status:editor.performance,schedule_status:editor.schedule});
  else {
    const raw = String(value).trim();
    if (raw !== '' && !Number.isFinite(Number(raw))) throw new Error('Enter a number.');
    progress[field === 'progress' ? 'achievement_pct' : row.progress?.cumulative_actual != null ? 'cumulative_actual' : 'actual_this_period'] = raw === '' ? null : Number(raw);
  }
  return {progress};
}
