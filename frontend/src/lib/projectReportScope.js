// Apply the selected project to every report dataset, including money and results.
export function scopeProjectReport(data, projectId) {
  if (!data || !projectId) return data;
  return Object.fromEntries(Object.entries(data).map(([key,rows])=>[key,
    Array.isArray(rows) ? rows.filter(row => key === 'projects' ? row.id === projectId : row.project_id === projectId) : rows]));
}

export function initialReportType(params, available) {
  const requested = params.get('type');
  return available.includes(requested) ? requested : params.get('project') ? 'project' : 'full_me';
}
