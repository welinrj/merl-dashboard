export const hasRecordedBudget = project => project.budget_vuv != null && project.budget_vuv !== '' && Number.isFinite(Number(project.budget_vuv)) && (Number(project.budget_vuv) > 0 || project.approved_budget_confirmed === true);
export function fundingCoverage(projects) {
  return { known: projects.filter(hasRecordedBudget).length, total: projects.length };
}
export function beneficiaryPublicationState(rows, periods) {
  const approved = rows.filter(row => periods.some(period => period.project_id === row.project_id && period.period_label === row.reporting_period && period.submission_status === 'approved')).length;
  return { approved, unpublished: rows.length - approved, unchecked: rows.filter(row => row.double_counting_check !== true).length, periods: [...new Set(rows.map(row => row.reporting_period).filter(Boolean))] };
}
