import { resultNumber } from './resultComparison';

// Public progress is a count ratio across the complete framework. A legacy mean
// of a few public KPIs must never be presented as whole-project achievement.
export function publicTargetProgress(project = {}) {
  const total = resultNumber(project.total_target_count);
  const assessed = resultNumber(project.assessed_target_count);
  const achieved = resultNumber(project.achieved_target_count);
  const valid = project.progress_basis === 'final_targets'
    && [total,assessed,achieved].every(n => n !== null && Number.isInteger(n) && n >= 0)
    && achieved <= assessed && assessed <= total;
  if (!valid) return { pct:null,total:null,assessed:null,achieved:null,kind:'unavailable' };
  return { total,assessed,achieved,pct:total>0 && assessed>0 ? Math.round(achieved/total*1000)/10 : null,
    kind:!total?'no_framework':!assessed?'unassessed':'measured' };
}
export function publicTargetTotals(projects = []) {
  const rows=projects.map(publicTargetProgress);
  if(rows.some(row=>row.total===null))return {pct:null,total:null,assessed:null,achieved:null};
  const total=rows.reduce((sum,row)=>sum+row.total,0),assessed=rows.reduce((sum,row)=>sum+row.assessed,0),
    achieved=rows.reduce((sum,row)=>sum+row.achieved,0);
  return {total,assessed,achieved,pct:total>0 && assessed>0?Math.round(achieved/total*1000)/10:null};
}

// Adapt only published counts to the shared contribution chart contract.
export function publicTargetSummary(projects = []) {
  const totals = publicTargetTotals(projects);
  return {
    targets: { total: totals.total, reported: totals.assessed, achieved: totals.achieved, percentage: totals.pct },
    rows: projects.map(project => {
      const progress = publicTargetProgress(project);
      return { project, total: progress.total, reported: progress.assessed, achieved: progress.achieved };
    }),
  };
}
