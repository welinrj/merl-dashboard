// 2026 population and household estimates per 2025 Area Council (static,
// non-sensitive reference data shipped with the app; no tile or API fetch).
// Built by scripts/build-area-council-population.py from the VNSO 2020 census.

const POPULATION_URL = `${import.meta.env.BASE_URL}data/vanuatu-area-councils-population-2026.json`;

export const normArea = v => String(v || '').toLowerCase().replace(/\b(area council|council)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const AREA_ALIASES = new Map(Object.entries({
  'vanua lava': 'east vanualava',
  'west vanua lava': 'west vanualava',
  'merelava merig': 'merelava merig',
  'north west santo': 'northwest santo',
  'south east santo': 'southeast santo',
  'south santo 1': 'south santo one 1',
  'south santo 2': 'south santo two 2',
  'central pentecost 1': 'central pentecost one cp1',
  'central pentecost 2': 'central pentecost two cp2',
  'north east malekula': 'northeast malekula',
  'north west malekula': 'northwest malekula',
  'south east malekula': 'southeast malekula',
  'south west malekula': 'southwest malekula',
  'south east ambrym': 'southeast ambrym',
  'north west efate': 'northwest efate',
  'nguna pele': 'nguna pele',
  'makira mataso': 'makira mataso',
  'tongariki buninga': 'tongariki buninga',
  'south east tanna': 'southeast tanna',
  'south west tanna': 'southwest tanna',
}));
export const canonicalArea = v => AREA_ALIASES.get(normArea(v)) || normArea(v);
export const areaKey = (province, area) => `${normArea(province)}|${canonicalArea(area)}`;

let populationPromise;
export function loadAreaPopulation() {
  if (!populationPromise) populationPromise = fetch(POPULATION_URL).then(async r => {
    if (!r.ok) throw new Error('Population estimates unavailable');
    const data = await r.json();
    const byKey = new Map(Object.values(data.councils || {}).map(row => [areaKey(row.province, row.area_council), row]));
    return { ...data, byKey };
  }).catch(e => { populationPromise = null; throw e; });
  return populationPromise;
}

// Sequential classes for the 2026 population layer (persons per council).
export const POPULATION_BREAKS = [1000, 2500, 5000, 10000];
export const POPULATION_COLOURS = ['#f4eedb', '#e6cf98', '#d5a45f', '#b87436', '#83461d'];
export const populationColour = value => POPULATION_COLOURS[POPULATION_BREAKS.filter(b => value >= b).length];

/**
 * People and households living in the Area Councils where each item is
 * recorded. Councils are counted once per group, so a project working in
 * the same council through several activities is not double-counted.
 */
export function reachAnalysis(areas = [], population, { category = '' } = {}) {
  const byKey = population?.byKey || new Map();
  const groups = new Map();
  const add = (gkey, base, aKey, row) => {
    if (!groups.has(gkey)) groups.set(gkey, { ...base, councils: new Map() });
    groups.get(gkey).councils.set(aKey, row);
  };
  const projectsReached = new Map();
  for (const area of areas) {
    const aKey = areaKey(area.province, area.area_council);
    const row = byKey.get(aKey) || null;
    const council = { province: area.province, area_council: area.area_council, pop2026: row?.pop2026 ?? null, hh2026: row?.hh2026 ?? null, matched: Boolean(row) };
    const entries = (Array.isArray(area.implementation_details) ? area.implementation_details : []).filter(e => !category || e.category_key === category);
    for (const e of entries) {
      add(`item|${e.project_id}|${e.kind}|${e.item_id || e.label}`, { type: 'item', kind: e.kind, label: e.label, project_id: String(e.project_id), category_key: e.category_key }, aKey, council);
    }
    const ids = category ? [...new Set(entries.map(e => String(e.project_id)))] : (Array.isArray(area.project_ids) ? area.project_ids.map(String) : []);
    for (const id of ids) {
      if (!projectsReached.has(id)) projectsReached.set(id, new Map());
      projectsReached.get(id).set(aKey, council);
    }
  }
  const summarise = councils => {
    const list = [...councils.values()];
    const sum = f => list.reduce((s, c) => s + (Number(c[f]) || 0), 0);
    return { councilCount: list.length, pop2026: sum('pop2026'), hh2026: sum('hh2026'), unmatched: list.filter(c => !c.matched).length, councils: list.sort((a, b) => (b.pop2026 || 0) - (a.pop2026 || 0)) };
  };
  const items = [...groups.values()].map(g => ({ ...g, ...summarise(g.councils) })).sort((a, b) => b.pop2026 - a.pop2026);
  const projects = [...projectsReached.entries()].map(([id, councils]) => ({ project_id: id, ...summarise(councils) })).sort((a, b) => b.pop2026 - a.pop2026);
  const all = new Map();
  projectsReached.forEach(c => c.forEach((v, k) => all.set(k, v)));
  const total = summarise(all);
  const national = population?.totals?.pop2026 || null;
  return { items, projects, total, nationalPop: national, nationalHh: population?.totals?.hh2026 || null, share: national ? total.pop2026 / national : null };
}
