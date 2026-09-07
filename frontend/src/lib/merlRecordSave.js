import { supabase } from '../supabaseClient';
import { achievementPct, variance } from './docc/reporting';

const toNull = (value) => value === '' || value === undefined ? null : value;
const toNum = (value) => value === '' || value == null ? null : Number(value);

/** The same validated RPC writer is used by reporting and the results workspace. */
export async function saveModuleRecord({ module, values, id = null, projectId, reportingPeriod, indicators = [] }) {
  const missing = module.fields.filter((field) => field.required && (values[field.name] === '' || values[field.name] == null));
  if (missing.length) throw new Error(`Required: ${missing.map((field) => field.label).join(', ')}`);
  const problem = module.validate?.(values);
  if (problem) throw new Error(problem);
  if (module.periodScoped && !reportingPeriod) throw new Error('Select a reporting period first.');
  const params = { p_id: id, p_project_id: projectId };
  if (module.periodScoped) params.p_reporting_period = reportingPeriod;
  for (const field of module.fields) {
    const raw = values[field.name];
    params[`p_${field.name}`] = field.type === 'number' ? toNum(raw)
      : field.type === 'checkbox' ? !!raw : toNull(raw);
  }
  if (module.key === 'indicator_progress') {
    const indicator = indicators.find((item) => item.id === values.indicator_id);
    params.p_achievement_pct = achievementPct(values.cumulative_actual, indicator?.target_value);
    params.p_variance = variance(values.actual_this_period, values.period_target);
  }
  const { error } = await supabase.rpc(module.rpc, params);
  if (error) throw error;
}
