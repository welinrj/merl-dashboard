import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapLabelPoint} from '../src/lib/publicMapLabels.js';
import {featureContains} from '../src/lib/coverageMapCore.js';
const data=JSON.parse(readFileSync(new URL('../public/data/vanuatu-area-councils-map.geojson',import.meta.url)));
test('every council label is inside its council polygon',()=>{
 for(const feature of data.features){
  const [lat,lng]=mapLabelPoint(feature);
  assert.ok(featureContains(feature,lng,lat),feature.properties.ADM2_EN);
 }
});
test('label anchors avoid holes and choose the largest polygon part',()=>{
 const ring=(x,y,size)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
 const feature={geometry:{type:'MultiPolygon',coordinates:[[ring(0,0,1)],[ring(5,5,10),ring(8,8,4)]]}};
 const [lat,lng]=mapLabelPoint(feature);
 assert.ok(lng>5&&lat>5);
 assert.ok(featureContains(feature,lng,lat));
});
