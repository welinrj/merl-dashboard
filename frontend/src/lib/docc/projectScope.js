// The audit fixture remains available for administration, never official reporting.
export const isOfficialProject = project => String(project.code || '').trim().toUpperCase() !== 'AUDIT-2026';
export const officialProjects = projects => projects.filter(isOfficialProject);
export const isCompletedProject = project => ['completed', 'closed'].includes(String(project.lifecycle_status || project.status || '').trim().toLowerCase());
export const hasResultsFramework = project => project.has_results_framework === true;
// The full register remains available for historical records and administration.
export const isCurrentPortfolioProject = project => isOfficialProject(project)
  && project.excluded_from_current_portfolio !== true && !isCompletedProject(project)
  && String(project.status || '').trim().toLowerCase() !== 'cancelled';
export const isDashboardProject = project => isCurrentPortfolioProject(project) && hasResultsFramework(project);
export const currentProjects = projects => projects.filter(isDashboardProject);
export function officialPortfolioData(data) {
  const projects = currentProjects(data.projects || []);
  const ids = new Set(projects.map(project => String(project.id)));
  return Object.fromEntries(Object.entries({ ...data, projects }).map(([key, value]) => [key,
    key === 'projects' || !Array.isArray(value) ? value : value.filter(row => row.project_id == null || ids.has(String(row.project_id))),
  ]));
}
