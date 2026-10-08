export const INDICATOR_FIELDS = ['code','name','unit','definition','framework_node_id','direction','aggregation_method','progress_method','official_reporting_frequency','means_of_verification','data_source','collection_method','disaggregation','assumptions','responsible_officer','is_qualitative','higher_is_better','baseline_year','target_date'];
export const TARGET_FIELDS = ['target_type','period_label','period_start','period_end','numeric_value','text_value','ordinal_value','female_value','male_value','notes'];
export const PROGRESS_FIELDS = ['reporting_period','period_target','actual_this_period','cumulative_actual','previous_value','achievement_pct','variance','performance_status','schedule_status','date_reported','variance_reason','corrective_action','area_council_name'];
export const NARRATIVE_FIELDS = ['progress_summary','key_achievements','variance_explanation','challenges','corrective_actions','next_period_priorities','public_summary'];
const numbers = new Set(['baseline_year','numeric_value','ordinal_value','female_value','male_value','period_target','actual_this_period','cumulative_actual','previous_value','achievement_pct','variance']);
const pick = (record, fields) => Object.fromEntries(fields.map(key => [key, record?.[key] ?? '']));
const normalise = (key, value) => value === '' || value == null ? null : numbers.has(key) ? Number(value) : value;
const diff = (next, previous, fields) => Object.fromEntries(fields.filter(key => normalise(key,next[key]) !== normalise(key,previous[key])).map(key => [key,normalise(key,next[key])]));
export function createRowEditor(row, targets, periods) {
  const indicator = pick(row.indicator, INDICATOR_FIELDS);
  indicator.official_reporting_frequency ||= row.indicator.frequency || '';
  indicator.direction ||= 'increase'; indicator.aggregation_method ||= 'latest'; indicator.progress_method ||= 'auto';
  indicator.is_qualitative = Boolean(row.indicator.is_qualitative); indicator.higher_is_better = row.indicator.higher_is_better !== false;
  const allTargets = targets.filter(t => t.indicator_id === row.indicator.id).map(t => ({ id: t.id, ...pick(t,TARGET_FIELDS), valueFormat:t.text_value!=null?'text':t.ordinal_value!=null?'ordinal':'numeric' }));
  for (const [type,label,fallback] of [['baseline','Baseline',row.indicator.baseline_value],['mid_term','Mid-term',null],['final','Final',row.indicator.target_value]]) {
    if (!allTargets.some(t => t.target_type === type)) allTargets.push({ id:null,valueFormat:'numeric',...pick({},TARGET_FIELDS),target_type:type,period_label:label,numeric_value:fallback ?? '' });
  }
  const progress = pick(row.progress,PROGRESS_FIELDS);
  progress.schedule_status ||= 'on_schedule';
  const narrative = pick(row.narrative,NARRATIVE_FIELDS);
  narrative.progress_summary ||= row.progress?.narrative || '';
  narrative.key_achievements ||= row.progress?.key_achievements || '';
  narrative.variance_explanation ||= row.progress?.variance_reason || '';
  narrative.corrective_actions ||= row.progress?.corrective_action || '';
  narrative.next_period_priorities ||= row.progress?.next_period_priorities || '';
  const original = { indicator, targets:allTargets, progress, narrative };
  return { mode:'row',id:row.indicator.id,projectId:row.project.id,progressId:row.progress?.id || null,
    ...structuredClone(original),original,periods:periods.filter(p=>p.project_id===row.project.id) };
}
export function rowEditorChanges(editor) {
  const changes = {};
  for (const [section,fields] of [['indicator',INDICATOR_FIELDS],['progress',PROGRESS_FIELDS],['narrative',NARRATIVE_FIELDS]]) {
    const patch = diff(editor[section],editor.original[section],fields);
    if (Object.keys(patch).length) changes[section]=patch;
  }
  const targets = editor.targets.flatMap((t,index) => {
    const original = editor.original.targets[index] || {};
    const patch = diff(t,original,TARGET_FIELDS);
    if (!Object.keys(patch).length) return [];
    return [t.id ? {id:t.id,...patch} : {id:null,...Object.fromEntries(TARGET_FIELDS.map(k=>[k,normalise(k,t[k])])),period_label:t.period_label || ''}];
  });
  if(targets.length) changes.targets=targets;
  if(!editor.progressId && (changes.progress || changes.narrative)) changes.progress={...changes.progress,reporting_period:editor.progress.reporting_period};
  return changes;
}
