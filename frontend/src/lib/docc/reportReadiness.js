import { latestReportedBy } from './progressSelection';
const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const nonNegative = value => numeric(value) && Number(value) >= 0;
export function rowMatchesReportScope(row, reporting, period, frequency) {
  const label = row.reporting_period || row.period_label;
  if (period) return label === period;
  if (!frequency || !label) return true;
  return reporting.some(candidate => candidate.project_id === row.project_id && candidate.period_label === label && candidate.period_type === frequency);
}
// These checks describe recorded coverage; they never grant approval or infer missing values.
export function reportReadiness(data, { type, projectIds, period = '', frequency = '' }) {
  const ids = new Set([...projectIds].map(String));
  const projects = (data.projects || []).filter(project => ids.has(String(project.id)));
  const issues = [];
  const add = (key, project, count = 1, module = '') => issues.push({ key, projectId: project?.id, projectName: project ? `${project.code || ''} — ${project.name || ''}` : '', count, module });
  const within = rows => (rows || []).filter(row => ids.has(String(row.project_id)) && rowMatchesReportScope(row, data.reporting || [], period, frequency));
  const periods = within(data.reporting);
  const finance = latestReportedBy(within(data.financial), 'project_id');
  const progress = latestReportedBy(within(data.progress));
  const evidence = within(data.evidence);
  const resultsRequired = ['full_me', 'project', 'portfolio', 'indicator'].includes(type);
  const financeRequired = ['full_me', 'project', 'portfolio', 'financial', 'donor'].includes(type);
  const beneficiariesRequired = ['full_me', 'project', 'portfolio', 'donor'].includes(type);
  const geographicRequired = ['full_me', 'project', 'geographic'].includes(type);
  if (!projects.length) add('noProjects');
  for (const project of projects) {
    const own = rows => rows.filter(row => row.project_id === project.id);
    if (type !== 'geographic') {
      const configured = own(periods);
      if (!configured.length) add('noPeriod', project, 1, 'reporting_periods');
      const pending = configured.filter(row => row.submission_status !== 'approved');
      if (pending.length) add('pendingApproval', project, pending.length, 'reporting_periods');
    }
    if (financeRequired) {
      const row = finance.get(project.id);
      if (!row || !nonNegative(row.cumulative_expenditure)) add('missingFinance', project, 1, 'financial_progress');
      const budget = nonNegative(row?.approved_budget) ? row.approved_budget : project.budget_vuv;
      if (!nonNegative(budget) || (Number(budget) === 0 && project.approved_budget_confirmed !== true && !nonNegative(row?.approved_budget))) add('missingBudget', project, 1, 'financial_progress');
    }
    if (resultsRequired) {
      const indicators = own(data.indicators || []);
      if (!indicators.length) add('noIndicators', project);
      const missing = indicators.filter(indicator => {
        const row = progress.get(indicator.id);
        return !row || (!indicator.is_qualitative && !numeric(row.cumulative_actual) && !numeric(row.actual_this_period));
      });
      if (missing.length) add('missingResults', project, missing.length, 'indicator_progress');
      const unsupported = indicators.filter(indicator => {
        const row = progress.get(indicator.id);
        if (!row) return false;
        return !evidence.some(item => item.project_id === project.id && item.indicator_id === indicator.id
          && row.reporting_period && item.verification_status === 'verified' && (item.reporting_period || item.period_label) === row.reporting_period);
      });
      if (unsupported.length) add('unverifiedEvidence', project, unsupported.length, 'evidence');
      const unreviewed = indicators.filter(indicator => {
        const row = progress.get(indicator.id);
        return row && !['approved', 'published', 'locked'].includes(row.review_status);
      });
      if (unreviewed.length) add('unreviewedResults', project, unreviewed.length, 'indicator_progress');
    }
    if (beneficiariesRequired) {
      const rows = own(within(data.beneficiaries));
      if (!rows.some(row => nonNegative(row.total_direct))) add('missingBeneficiaries', project, 1, 'beneficiaries');
      const unchecked = rows.filter(row => row.double_counting_check !== true);
      if (unchecked.length) add('beneficiaryChecks', project, unchecked.length, 'beneficiaries');
      const mismatch = rows.filter(row => {
        const gender = ['female', 'male', 'other_gender'].filter(key => numeric(row[key]));
        return nonNegative(row.total_direct) && gender.reduce((sum, key) => sum + Number(row[key]), 0) > Number(row.total_direct);
      });
      if (mismatch.length) add('beneficiaryMismatch', project, mismatch.length, 'beneficiaries');
    }
    if (geographicRequired && !(project.provinces || []).length && !own(data.areaCouncils || []).length) add('missingLocations', project);
  }
  return { issues, projectCount: projects.length, empty: projects.length === 0, periodCount: periods.length,
    approvedCount: periods.filter(row => row.submission_status === 'approved').length };
}
export function readinessAction(issue, period = '') {
  const params = new URLSearchParams();
  if (issue.projectId) params.set('project', issue.projectId);
  if (period) params.set('period', period);
  if (issue.module && issue.module !== 'reporting_periods') params.set('module', issue.module);
  const path = issue.key === 'noIndicators' ? '/results-framework' : issue.module ? '/merl-reporting' : '/project-setup';
  return `#${path}${params.size ? `?${params}` : ''}`;
}
