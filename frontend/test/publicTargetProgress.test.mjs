import test from 'node:test';
import assert from 'node:assert/strict';
import { publicTargetProgress, publicTargetTotals, publicTargetSummary } from '../src/lib/publicTargetProgress';
const row=(total,assessed,achieved)=>({progress_basis:'final_targets',total_target_count:total,assessed_target_count:assessed,achieved_target_count:achieved});
test('VCAP uses all 23 targets even when its only featured public KPI is 100%',()=>{
 const r=publicTargetProgress({...row(23,19,5),progress_pct:100,published_indicator_count:1});
 assert.equal(r.pct,21.7);assert.equal(r.assessed,19);assert.equal(r.total,23);
 assert.equal(publicTargetProgress({...row(31,28,2),published_indicator_count:0}).pct,6.5);
});
test('missing assessments remain distinct from assessed zero achievement',()=>{
 assert.equal(publicTargetProgress(row(23,0,0)).pct,null);
 assert.equal(publicTargetProgress(row(23,19,0)).pct,0);
 assert.equal(publicTargetProgress(row(0,0,0)).kind,'no_framework');
 assert.equal(publicTargetProgress({progress_pct:100,published_indicator_count:1}).pct,null);
});
test('invalid and contradictory published counts fail closed',()=>{
 for(const x of [row(2,3,1),row(3,1,2),row(-1,0,0),row(2,1.5,1),{...row(2,1,1),achieved_target_count:null}]) assert.equal(publicTargetProgress(x).kind,'unavailable');
});
test('portfolio target achievement is weighted by all targets including unassessed projects',()=>{
 assert.equal(publicTargetTotals([row(23,19,5),row(31,28,2)]).pct,13);
 assert.equal(publicTargetTotals([row(10,10,10),row(90,0,0)]).pct,10);
 assert.equal(publicTargetTotals([row(10,10,10),{}]).pct,null);
});

test('public contributions reconcile with all published targets', async()=>{
 const {targetContributions}=await import('../src/lib/targetContributions');
 const projects=[{id:'vcap',code:'23A398',...row(23,19,5)},{id:'vccrp',code:'VCCRP-001',...row(31,28,2)},{id:'naps',...row(192,0,0)}];
 const s=publicTargetSummary(projects),m=targetContributions(s);
 assert.equal(s.targets.total,246); assert.equal(s.targets.achieved,7);
 assert.equal(m.valid,true); assert.equal(m.rows[0].share,5/7*100);
 assert.equal(m.rows[0].points,5/246*100);
 assert.equal(targetContributions(publicTargetSummary([...projects,{id:'missing'}])).valid,false);
 assert.equal(publicTargetSummary([{id:'zero',...row(10,5,0)}]).targets.percentage,0);
 assert.equal(publicTargetSummary([{id:'unknown',...row(10,0,0)}]).targets.percentage,null);
});
