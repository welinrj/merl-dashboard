import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinate, areaColor, areaKey, deriveCoverage, featureContains } from '../src/lib/coverageMapCore.js';

const square = (name, province, west, south, east, north) => ({
  type: 'Feature', properties: { name, province },
  geometry: { type: 'Polygon', coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] },
});
const north = square('North Test', 'Shefa', 167, -18, 168, -17);
const south = square('South Test', 'Tafea', 169, -20, 170, -19);
const ambiguous = square('North Test', 'Sanma', 166, -16, 167, -15);
const areas = { type: 'FeatureCollection', features: [north, south, ambiguous] };

test('missing and invalid coordinates are not converted into real map points', () => {
  assert.equal(coordinate(null, 'lat'), null);
  assert.equal(coordinate('', 'lng'), null);
  assert.equal(coordinate('0', 'lat'), null);
  assert.equal(coordinate('not a number', 'lng'), null);
  assert.equal(coordinate(-17.5, 'lat'), -17.5);
  assert.equal(coordinate(167.5, 'lng'), 167.5);
});

test('council colours are stable and zero records have a neutral colour', () => {
  assert.equal(areaColor(north, 2), areaColor(north, 2));
  assert.equal(areaColor(north, 0), '#e5e7eb');
  assert.notEqual(areaKey(north), areaKey(ambiguous));
});

test('spatial allocation counts distinct projects rather than location rows', () => {
  const result = deriveCoverage(areas, [
    { id: 1, project_id: 'p1', latitude: -17.5, longitude: 167.5, area_council: 'South Test' },
    { id: 2, project_id: 'p1', latitude: -17.6, longitude: 167.6 },
    { id: 3, project_id: 'p2', latitude: -19.5, longitude: 169.5 },
  ]);
  assert.equal(result.projectsByArea.get(areaKey(north)).size, 1);
  assert.equal(result.rowsByArea.get(areaKey(north)).length, 2);
  assert.equal(result.projectsByArea.get(areaKey(south)).size, 1);
  assert.equal(result.assignedProjects.size, 2);
  assert.equal(result.mappedRows.length, 3);
});

test('an unambiguous named council can allocate a row without coordinates', () => {
  const result = deriveCoverage(areas, [{ project_id: 'p1', area_council: 'North Test', province: 'Shefa', latitude: null, longitude: null }]);
  assert.equal(result.projectsByArea.get(areaKey(north)).size, 1);
  assert.equal(result.mappedRows.length, 0);
});

test('ambiguous names and out-of-bound coordinates are not silently allocated', () => {
  const result = deriveCoverage(areas, [
    { project_id: 'p1', area_council: 'North Test' },
    { project_id: 'p2', area_council: 'North Test', province: 'Shefa', latitude: -14, longitude: 170 },
  ]);
  assert.equal(result.assignedProjects.size, 0);
  assert.equal(result.unassignedRows.length, 2);
  assert.equal(result.mappedRows.length, 1);
});

test('polygon holes are excluded from spatial matching', () => {
  const donut = { ...north, geometry: { type: 'Polygon', coordinates: [north.geometry.coordinates[0], [[167.3, -17.7], [167.7, -17.7], [167.7, -17.3], [167.3, -17.3], [167.3, -17.7]]] } };
  assert.equal(featureContains(donut, 167.5, -17.5), false);
  assert.equal(featureContains(donut, 167.1, -17.5), true);
});
