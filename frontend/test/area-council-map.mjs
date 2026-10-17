import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const raw=readFileSync(new URL('../public/data/vanuatu-area-councils-2025.geojson',import.meta.url));
const source=JSON.parse(raw), map=JSON.parse(readFileSync(new URL('../public/data/vanuatu-area-councils-map.geojson',import.meta.url)));
test('display pack preserves reviewed council names and fingerprints its unchanged source',()=>{
 assert.equal(map.features.length,71);
 assert.deepEqual(map.features.map(f=>f.properties),source.features.map(f=>f.properties));
 assert.equal(map.provenance.source_sha256,createHash('sha256').update(raw).digest('hex'));
 assert.equal(map.provenance.source_sha256,'8e00e7562c53472b11b178765735c8747a02b80d5aa2f99a5ce299550d9d8b03');
 assert.ok(map.features.every(f=>['Polygon','MultiPolygon'].includes(f.geometry.type)));
});
test('overview contains shared linework, land, and all six province labels',()=>{
 assert.equal(map.display.land.geometry.type,'MultiPolygon');
 assert.equal(map.display.boundaries.geometry.type,'MultiLineString');
 assert.equal(map.display.provinceLabels.length,6);
 assert.equal(new Set(map.display.provinceLabels.map(f=>f.properties.name)).size,6);
 const check=coords=>{if(typeof coords[0]==='number'){assert.ok(coords.every(Number.isFinite));assert.ok(coords[0]>=166&&coords[0]<=171);assert.ok(coords[1]>=-21&&coords[1]<=-13);}else coords.forEach(check);};
 map.features.forEach(f=>check(f.geometry.coordinates));
 Object.values(map.display).flat().forEach(f=>check(f.geometry.coordinates));
});
test('display repairs and original overlap slivers remain within documented limits',()=>{
 assert.equal(map.provenance.repairs.length,2);
 assert.ok(map.provenance.repairs.every(r=>r.absolute_area_change_m2<1));
 assert.equal(map.provenance.residual_source_slivers.length,3);
 assert.ok(map.provenance.residual_source_slivers.every(r=>r.area_m2<100));
});
