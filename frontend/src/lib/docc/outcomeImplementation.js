const number = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;

// Only outcome-level measures establish an outcome. Output/activity completion
// and an "on track" judgement alone are not evidence of achieved outcomes.
function targetAchieved(indicator, progress) {
  if (!progress) return null;
  if (indicator.is_qualitative) {
    if (progress.performance_status === 'target_achieved') return true;
    const pct = number(progress.achievement_pct);
    if (pct !== null) return pct >= 100;
    if (progress.performance_status && progress.performance_status !== 'no_data') return false;
    return null;
  }
  const actual = number(progress.cumulative_actual);
  const target = number(progress.final_target ?? indicator.target_value);
  if (actual === null || target === null) return null;
  if (indicator.higher_is_better === false) return actual <= target;
  return target > 0 ? actual >= target : null;
}

export function outcomeImplementation(nodes = [], resultRows = []) {
  const outcomes = [...new Map(nodes.filter(node => node.node_type === 'outcome').map(node => [node.id,node])).values()];
  const rows = outcomes.map(outcome => {
    const indicators = resultRows.filter(row => (row.indicator.framework_node_id || (row.indicator.linked_level === 'outcome' ? row.indicator.linked_id : null)) === outcome.id);
    const measured = indicators.map(row => targetAchieved(row.indicator,row.progress));
    const status = measured.length && measured.every(value => value === true) ? 'achieved'
      : measured.some(value => value === false) ? 'in_progress' : 'not_assessed';
    return { outcome, status, indicators: indicators.length };
  });
  const counted = rows.filter(row => row.status === 'achieved').length;
  const assessed = rows.filter(row => row.status !== 'not_assessed').length;
  return { basis: 'outcomes', pct: outcomes.length && assessed ? Math.round(counted / outcomes.length * 1000) / 10 : null,
    counted, total: outcomes.length, assessed, unassessed: outcomes.length - assessed, rows };
}
