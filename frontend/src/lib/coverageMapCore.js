// Shared, deterministic helpers for the MERL coverage map.
// Colours identify councils; they are not a numerical progress scale.
export const AREA_COLORS = ['#4b80b6', '#c67954', '#4b9975', '#8465b2', '#c39b43', '#438e9a', '#b86686', '#788a48', '#ad7153', '#5974a5', '#957744', '#6c9b83'];
export const VANUATU_BOUNDS = [[-20.5, 166.4], [-13.0, 170.5]];
export const PROVINCES = { TO: 'Torba', SA: 'Sanma', PE: 'Penama', MA: 'Malampa', SH: 'Shefa', TA: 'Tafea' };

export function normalise(value) {
  return String(value ?? '').toLowerCase().replace(/\b(area council|council|municipality|municipal)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export function provinceName(value) {
  const key = String(value ?? '').trim();
  return PROVINCES[key.toUpperCase()] || Object.values(PROVINCES).find(name => normalise(name) === normalise(key)) || key;
}
export function coordinate(value, axis) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (axis === 'lat' && (number < -21.5 || number > -12.5)) return null;
  if (axis === 'lng' && (number < 166 || number > 171.5)) return null;
  return number;
}
export function areaKey(feature) {
  const p = feature.properties || {};
  return normalise(provinceName(p.province)) + ':' + normalise(p.name);
}
export function areaColor(feature, count = 1) {
  if (!count) return '#e5e7eb';
  let hash = 2166136261;
  for (const char of areaKey(feature)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return AREA_COLORS[hash % AREA_COLORS.length];
}
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i]; const [px, py] = ring[j];
    if ((y > lat) !== (py > lat) && lng < (px - x) * (lat - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}
export function featureContains(feature, lng, lat) {
  const geometry = feature?.geometry;
  if (!geometry || !Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(polygon => polygon.length && inRing(lng, lat, polygon[0]) && !polygon.slice(1).some(hole => inRing(lng, lat, hole)));
}
export function deriveCoverage(areas, locations) {
  const features = areas?.features || [];
  const byName = new Map();
  for (const feature of features) {
    const key = normalise(feature.properties.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(feature);
  }
  const projectsByArea = new Map();
  const rowsByArea = new Map();
  const assignedProjects = new Set();
  const mappedRows = [];
  const unassignedRows = [];
  for (const row of locations || []) {
    if (!row.project_id) continue;
    const lat = coordinate(row.latitude, 'lat');
    const lng = coordinate(row.longitude, 'lng');
    const hasPoint = lat !== null && lng !== null;
    // Coordinates take precedence. A council name is used only when it is
    // unambiguous (and agrees with the supplied province, if there is one).
    let feature = hasPoint ? features.find(candidate => featureContains(candidate, lng, lat)) : null;
    if (!feature && !hasPoint) {
      const candidates = byName.get(normalise(row.area_council)) || [];
      const province = normalise(provinceName(row.province));
      const matches = province ? candidates.filter(candidate => normalise(provinceName(candidate.properties.province)) === province) : candidates;
      if (matches.length === 1) feature = matches[0];
    }
    if (feature) {
      const key = areaKey(feature);
      if (!projectsByArea.has(key)) projectsByArea.set(key, new Set());
      if (!rowsByArea.has(key)) rowsByArea.set(key, []);
      projectsByArea.get(key).add(row.project_id);
      rowsByArea.get(key).push(row);
      assignedProjects.add(row.project_id);
    } else unassignedRows.push(row);
    if (hasPoint) mappedRows.push({ ...row, latitude: lat, longitude: lng, _area: feature?.properties?.name || '', _areaKey: feature ? areaKey(feature) : '' });
  }
  return { projectsByArea, rowsByArea, assignedProjects, mappedRows, unassignedRows };
}
export function projectName(project) {
  if (!project) return 'Project';
  return project.code && project.name ? `${project.code} — ${project.name}` : project.name || project.code || 'Project';
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
