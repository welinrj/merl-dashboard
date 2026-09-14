import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const path = new URL('../public/data/vanuatu-area-councils-2025.geojson', import.meta.url);
const boundaries = JSON.parse(readFileSync(path, 'utf8'));
const sanmaNames = boundaries.features
  .filter((feature) => feature.properties.ADM1_EN === 'SANMA')
  .map((feature) => feature.properties.ADM2_EN);

test('bundled Area Council boundaries are complete and uniquely named', () => {
  assert.equal(boundaries.type, 'FeatureCollection');
  assert.equal(boundaries.features.length, 71);
  assert.equal(
    new Set(boundaries.features.map((feature) => `${feature.properties.ADM1_EN}|${feature.properties.ADM2_EN}`)).size,
    boundaries.features.length,
  );
  assert.ok(boundaries.features.every((feature) => feature.properties.ADM1_EN && feature.properties.ADM2_EN));
  assert.ok(boundaries.features.every((feature) => ['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)));
});

test('updated SANMA boundaries distinguish the current Santo Area Councils', () => {
  for (const name of ['Big Bay Coast', 'Big Bay Inland', 'South Santo 1', 'South Santo 2']) {
    assert.ok(sanmaNames.includes(name), `${name} is missing from the SANMA boundary layer`);
  }
  assert.ok(!sanmaNames.includes('South Santo'));
  assert.ok(!sanmaNames.includes('North Santo'));
});
