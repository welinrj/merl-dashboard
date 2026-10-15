import { currentProjects } from './docc/projectScope';
const editors = new Set(['ROLE_ADMIN','ROLE_DOCC_MEO','ROLE_PROJ_MANAGER']);
const reviewers = new Set(['ROLE_ADMIN','ROLE_DOCC_MEO']);
export const taskToday = () => new Intl.DateTimeFormat('en-CA', { timeZone:'Pacific/Efate', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
export function reportingTasks(projects = [], periods = [], role, today = taskToday()) {
  if (!editors.has(role)) return [];
  const byId = new Map(currentProjects(projects).map(project => [project.id, project]));
  const latest = new Map();
  for (const row of periods) {
    if (!byId.has(row.project_id) || !row.period_label) continue;
    const key = JSON.stringify([row.project_id,row.period_label]);
    if (!latest.has(key) || String(row.updated_at || '') > String(latest.get(key).updated_at || '')) latest.set(key,row);
  }
  return [...latest.values()].flatMap(row => {
    const status = row.submission_status;
    const started = row.period_start ? row.period_start.slice(0,10) <= today : !row.period_end || row.period_end.slice(0,10) <= today;
    const kind = status === 'returned' ? 'correct' : reviewers.has(role) && ['submitted','reviewed'].includes(status) ? 'review' : status === 'draft' && started ? 'finish' : null;
    if (!kind) return [];
    const params = new URLSearchParams({project:row.project_id, period:row.period_label});
    if (kind === 'review' && row.id) params.set('submission',row.id);
    return [{ key:JSON.stringify([row.project_id,row.period_label]),kind,project:byId.get(row.project_id),period:row,
      href:`#/${kind === 'review' ? 'review' : 'merl-reporting'}?${params}` }];
  }).sort((a,b) => ({correct:0,review:1,finish:2}[a.kind]-{correct:0,review:1,finish:2}[b.kind])
    || String(a.period.period_end || '').localeCompare(String(b.period.period_end || '')) || a.key.localeCompare(b.key));
}
