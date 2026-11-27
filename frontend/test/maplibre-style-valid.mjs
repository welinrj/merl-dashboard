import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { mapStyle } from '../src/lib/maplibreCoverage.js';
import { populationColour, POPULATION_COLOURS, reachAnalysis, areaKey } from '../src/lib/areaCouncilPopulation.js';

const data = JSON.parse(readFileSync(new URL('../public/data/vanuatu-area-councils-map.geojson', import.meta.url)));

// An invalid paint expression makes MapLibre reject the whole style and the
// public map silently renders nothing, so check it against the spec.
test('coverage map style passes the MapLibre style specification', () => {
  for (const base of [null, { sources: { imagery: { type: 'raster', tiles: ['https://example.org/{z}/{x}/{y}.png'], tileSize: 256 } }, layers: [{ id: 'imagery', type: 'raster', source: 'imagery' }] }]) {
    const errors = validateStyleMin(mapStyle(base, data)).map(e => e.message);
    assert.deepEqual(errors, []);
  }
});

test('2026 population estimates cover every mapped council and match the national total', () => {
  const pop = JSON.parse(readFileSync(new URL('../public/data/vanuatu-area-councils-population-2026.json', import.meta.url)));
  const byKey = new Map(Object.values(pop.councils).map(r => [areaKey(r.province, r.area_council), r]));
  for (const f of data.features) assert.ok(byKey.has(areaKey(f.properties.ADM1_EN, f.properties.ADM2_EN)), f.properties.ADM2_EN);
  const sum = [...Object.values(pop.councils), ...Object.values(pop.municipalities)].reduce((s, r) => s + r.pop2026, 0);
  assert.equal(sum, pop.totals.pop2026);
  assert.equal(populationColour(0), POPULATION_COLOURS[0]);
  assert.equal(populationColour(50000), POPULATION_COLOURS.at(-1));
  const [a, b] = Object.values(pop.councils);
  const areas = [a, b].map(r => ({ province: r.province, area_council: r.area_council, project_ids: ['p1'], implementation_details: [{ project_id: 'p1', kind: 'activity', item_id: 'x', label: 'X', category_key: 'ecosystems' }] }));
  const r = reachAnalysis(areas, { ...pop, byKey });
  assert.equal(r.total.pop2026, a.pop2026 + b.pop2026);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].councilCount, 2);
  assert.equal(r.projects[0].hh2026, a.hh2026 + b.hh2026);
});
