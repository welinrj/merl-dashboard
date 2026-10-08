// The audit fixture remains available for administration, never official reporting.
export const isOfficialProject = project => String(project.code || '').trim().toUpperCase() !== 'AUDIT-2026';
export const officialProjects = projects => projects.filter(isOfficialProject);
export const isCompletedProject = project => ['completed', 'closed'].includes(String(project.lifecycle_status || project.status || '').trim().toLowerCase());
export const hasResultsFramework = project => project.has_results_framework === true;
// Dashboard scope follows available framework records, including completed projects.
export const currentProjects = projects => officialProjects(projects).filter(hasResultsFramework);
export function officialPortfolioData(data, includeCompleted = false) {
  const projects = includeCompleted ? officialProjects(data.projects || []) : currentProjects(data.projects || []);
  const ids = new Set(projects.map(project => String(project.id)));
  return Object.fromEntries(Object.entries({ ...data, projects }).map(([key, value]) => [key,
    key === 'projects' || !Array.isArray(value) ? value : value.filter(row => row.project_id == null || ids.has(String(row.project_id))),
  ]));
}
