import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coverageFeatures, geometryBounds, mapStyle } from '../src/lib/maplibreCoverage.js';
const data=JSON.parse(readFileSync(new URL('../public/data/vanuatu-area-councils-map.geojson',import.meta.url)));
const key=(p,a)=>`${p}|${a}`;
test('MapLibre retains every council, counts councils rather than projects and highlights only the selected area',()=>{
 const f=data.features.find(f=>f.properties.ADM2_EN==='Big Bay Inland');
 const selected=key(f.properties.ADM1_EN,f.properties.ADM2_EN);
 const {collection,counts}=coverageFeatures(data,[{province:f.properties.ADM1_EN,area_council:f.properties.ADM2_EN,project_count:3,theme_category:'adaptation'}],selected,key);
 assert.equal(collection.features.length,71);
 assert.equal(counts.adaptation,1);assert.equal(counts.none,70);
 assert.equal(collection.features.filter(f=>f.properties.selected).length,1);
 assert.equal(collection.features.find(f=>f.properties.selected).properties.projectCount,3);
 assert.equal(data.features.some(f=>'selected' in f.properties),false);
});
test('unknown theme remains recorded without inventing a category',()=>{
 const f=data.features[0];
 const {counts}=coverageFeatures(data,[{province:f.properties.ADM1_EN,area_council:f.properties.ADM2_EN,project_count:1,theme_category:'unknown'}],'',key);
 assert.equal(counts['not-recorded'],1);assert.equal(counts.none,70);
});
test('local fallback has shared borders and hides simplified polygons above council scale',()=>{
 const style=mapStyle(null,data);
 assert.equal(style.sources.councils.data.features.length,71);
 assert.equal(style.layers.filter(l=>l.source==='shared-borders').length,1);
 assert.equal(style.layers.find(l=>l.id==='council-borders').layout.visibility,'none');
 assert.equal(style.layers.find(l=>l.id==='council-fill').maxzoom,11.01);
 assert.ok(style.layers.some(l=>l.id==='fallback-land'));
});
test('thematic layers sit below geographic labels and national bounds include all islands',()=>{
 const style=mapStyle({version:8,sources:{base:{type:'vector',url:'https://example.com/tiles.json'}},glyphs:'https://example.com/fonts/{fontstack}/{range}.pbf',layers:[{id:'water',type:'background'},{id:'places',type:'symbol',source:'base','source-layer':'place'}]},data);
 assert.ok(style.layers.findIndex(l=>l.id==='council-fill')<style.layers.findIndex(l=>l.id==='places'));
 assert.ok(style.layers.some(l=>l.id==='council-names'));
 const bounds=geometryBounds(data);
 assert.ok(bounds[0][0]<167&&bounds[1][0]>170);
 assert.ok(bounds[0][1]<-20&&bounds[1][1]>-14);
});
