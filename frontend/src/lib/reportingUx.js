export const MAIN_REPORT_FIELDS = {
  indicator_progress: ['indicator_id','actual_this_period','cumulative_actual','narrative','date_reported'],
  financial_progress: ['approved_budget','expenditure_period','cumulative_expenditure','narrative'],
  beneficiaries: ['activity_id','location','total_direct','female','male','other_gender','youth','persons_with_disability','data_source','double_counting_check'],
  risks_issues: ['type','description','likelihood','impact','status','mitigation','responsible_person'],
  learning_updates: ['key_achievements','major_results','challenges','lessons_learned'],
};
export function isMainReportField(module, field) {
  return field.required || !MAIN_REPORT_FIELDS[module.key] || MAIN_REPORT_FIELDS[module.key].includes(field.name);
}
export function reportingStatus(status, fr = false) {
  const labels = {
    draft: ['Draft · not submitted','Brouillon · non soumis','neutral'],
    returned: ['Changes requested','Modifications demandées','warning'],
    submitted: ['Waiting for review','En attente d’examen','warning'],
    reviewed: ['Waiting for approval','En attente d’approbation','warning'],
    approved: ['Approved','Approuvé','success'],
  };
  const row = labels[status];
  return row ? {label:row[fr ? 1 : 0],tone:row[2]} : {label:fr ? 'Statut non indiqué' : 'Status not reported',tone:'neutral'};
}

export function needsReportingAction(period, reviewer, today) {
  if (period.submission_status === 'draft') return !period.period_end || period.period_end <= today;
  return period.submission_status === 'returned' || reviewer && ['submitted','reviewed'].includes(period.submission_status);
}
