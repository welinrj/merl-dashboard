// Keep the internal database's province codes unchanged. Public charts and
// filters use these display names, regardless of the source's letter case.
export const PROVINCES = ['Torba', 'Sanma', 'Penama', 'Malampa', 'Shefa', 'Tafea'];

const PROVINCE_NAMES = new Map(PROVINCES.map(name => [name.toUpperCase(), name]));

export function normalizeProvince(value) {
  const label = String(value ?? '').trim().replace(/\s+/g, ' ');
  return PROVINCE_NAMES.get(label.toUpperCase()) || label;
}

export function normalizeProvinces(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeProvince).filter(Boolean))];
}

export function normalizePublishedProjects(projects) {
  return projects.map(project => ({
    ...project,
    provinces: normalizeProvinces(project.provinces),
  }));
}
