import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioResultEntries} from '../src/lib/docc/portfolioResultDisplay.js';
import {resultsPerformance} from '../src/lib/docc/projectAnalysis.js';
const ind={id:'i',project_id:'p',target_value:1000};
const drafts=[{id:'old',indicator_id:'i',review_status:'draft',reporting_period:'PIR',date_reported:'2026-06-30',cumulative_actual:null},{id:'q3',indicator_id:'i',review_status:'draft',reporting_period:'Q3',date_reported:'2026-09-30',cumulative_actual:2345.67}];
test('portfolio shows the latest saved draft without promoting it into performance aggregates',()=>{
 const official=resultsPerformance([ind],drafts);
 assert.equal(official.rows[0].progress,null);
 const display=portfolioResultEntries(official.rows,drafts);
 assert.equal(display[0].progress.cumulative_actual,2345.67);
 assert.equal(display[0].awaitingReview,true);
 assert.equal(display[0].pct,null);
 assert.equal(display[0].status,'no_data');
 assert.equal(official.achievementPct,null);
 assert.equal(official.rows[0].progress,null);
});
test('approved results are not overwritten by draft or rejected figures',()=>{
 const approved={indicator_id:'i',review_status:'approved',cumulative_actual:900,date_reported:'2026-06-30'};
 const all=[approved,...drafts,{indicator_id:'i',review_status:'rejected',cumulative_actual:999999,date_reported:'2026-12-31'}];
 const entries=portfolioResultEntries(resultsPerformance([ind],all).rows,all);
 assert.equal(entries[0].progress,approved);
 assert.equal(entries[0].awaitingReview,undefined);
});
test('period selection, zero, missing numbers and unmatched indicators retain their meaning',()=>{
 const rows=[{indicator:ind,progress:null},{indicator:{id:'other'},progress:null}];
 const missing=portfolioResultEntries(rows,drafts,[],'PIR');
 assert.equal(missing[0].progress.cumulative_actual,null);
 assert.equal(missing[1].progress,null);
 assert.equal(portfolioResultEntries(rows,drafts,[],'unknown')[0].progress,null);
 assert.equal(portfolioResultEntries(rows,[{...drafts[0],cumulative_actual:0}])[0].progress.cumulative_actual,0);
});

test('selected-period drafts remain labelled and do not get a performance badge',()=>{
 const entries=portfolioResultEntries(resultsPerformance([ind],drafts,'Q3').rows,drafts,[],'Q3');
 assert.equal(entries[0].awaitingReview,true);assert.equal(entries[0].pct,null);assert.equal(entries[0].status,'no_data');
});
