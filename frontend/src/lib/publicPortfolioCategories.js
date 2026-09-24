export const THEME_AREA_ORDER = ['adaptation', 'mitigation', 'both', 'not-recorded'];

export const THEME_AREA_COLOURS = {
  adaptation: '#2463c7',
  mitigation: '#17845f',
  both: '#7651b5',
  'not-recorded': '#9b6a22',
  none: '#e6ebf1',
};

export const INDICATOR_CATEGORY_ORDER = [
  'ecosystems',
  'livelihoods',
  'climate-risk',
  'infrastructure',
  'governance',
  'capacity',
  'finance',
  'learning-delivery',
  'beneficiaries',
  'other',
];

const list = (value) => Array.isArray(value) ? value : [];

export function projectThemes(project) {
  const official = list(project?.docc_themes)
    .map((theme) => String(theme || '').trim())
    .filter(Boolean);
  if (official.length) return [...new Set(official)];
  return [project?.primary_climate_theme].map((theme) => String(theme || '').trim()).filter(Boolean);
}

export function thematicAreaCategory(projects = []) {
  const themes = projects.flatMap(projectThemes).map((theme) => theme.toLowerCase());
  const adaptation = themes.some((theme) => theme.includes('adaptation'));
  const mitigation = themes.some((theme) => theme.includes('mitigation'));
  if (adaptation && mitigation) return 'both';
  if (adaptation) return 'adaptation';
  if (mitigation) return 'mitigation';
  return projects.length ? 'not-recorded' : 'none';
}

export function aggregateIndicatorCategories(rows = [], selectedProjectIds = null) {
  const selected = selectedProjectIds == null
    ? null
    : new Set([...selectedProjectIds].map(String));
  const grouped = new Map();

  for (const row of rows) {
    if (selected && !selected.has(String(row.project_id))) continue;
    const key = INDICATOR_CATEGORY_ORDER.includes(row.category_key) ? row.category_key : 'other';
    const count = Number(row.indicator_count);
    if (!Number.isFinite(count) || count <= 0) continue;
    if (!grouped.has(key)) grouped.set(key, { key, indicatorCount: 0, projectIds: new Set() });
    const category = grouped.get(key);
    category.indicatorCount += count;
    category.projectIds.add(String(row.project_id));
  }

  return INDICATOR_CATEGORY_ORDER
    .filter((key) => grouped.has(key))
    .map((key) => ({
      key,
      indicatorCount: grouped.get(key).indicatorCount,
      projectCount: grouped.get(key).projectIds.size,
    }));
}
