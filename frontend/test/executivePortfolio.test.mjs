import test from 'node:test';
import assert from 'node:assert/strict';
import { executivePortfolio, finalTargetAttained } from '../src/lib/executivePortfolio';
const projects = ['a','b','c','d','e'].map(id => ({ id, status: 'active' }));
const indicators = projects.flatMap(p => [1,2].map(n => ({ project_id:p.id,id:`${p.id}${n}` })));
const row = (id,pct,status='on_track',extra={}) => ({ id,project_id:id[0],indicator_id:id,achievement_pct:pct,cumulative_actual:pct,final_target:100,performance_status:status,review_status:'approved',period_end:'2026-06-30',...extra });
test('combined achievement counts targets once, not averages of percentages or units',()=>{
 const data=executivePortfolio(projects,indicators,[row('a1',120,'target_achieved'),row('a2',50),row('b1',0),row('c1',100,'target_achieved',{review_status:'submitted'})]);
 assert.deepEqual(data.targets,{total:10,achieved:2,reported:4,pending:1,approvedAchieved:1,percentage:20});
});
test('health buckets are exclusive, warnings take precedence and missing statuses cannot turn green',()=>{
 const data=executivePortfolio(projects,indicators,[row('a1',10),row('a2',30),row('b1',30,'attention_required'),row('b2',70,'at_risk'),row('c1',0,'attention_required'),row('d1',100),row('e1',90,'')]);
 assert.deepEqual(data.counts,{total:5,on_track:1,attention:1,critical:1,unassessed:2});
 assert.equal(data.rows.find(r=>r.project.id==='b').health,'critical');
});
test('chronology, drafts, returned reports, duplicate targets and foreign rows do not inflate totals',()=>{
 const rows=[row('a1',100,'target_achieved',{period_end:'2026-03-31'}),row('a1',0,'off_track'),row('a1',100,'target_achieved',{period_end:'2026-09-30',review_status:'draft'}),row('a2',100,'target_achieved',{review_status:'returned'}),row('b1',100,'target_achieved',{project_id:'a'})];
 const data=executivePortfolio([projects[0]],[...indicators,indicators[0]],rows);
 assert.equal(data.targets.total,2);assert.equal(data.targets.achieved,0);assert.equal(data.targets.reported,1);assert.equal(data.counts.critical,1);
});
test('true zero is reported, missing percentages are not; empty denominator is unknown',()=>{
 const data=executivePortfolio([projects[0]],indicators,[row('a1',0),row('a2',false)]);
 assert.equal(data.targets.reported,1);assert.equal(data.targets.percentage,0);
 assert.equal(executivePortfolio([],[],[]).targets.percentage,null);
});
test('current operational warnings never leak into a selected historical period',()=>{
 const project={id:'a',registered_status:'suspended'};
 const opts={activities:[{project_id:'a',status:'delayed'}]};
 assert.equal(executivePortfolio([project],indicators,[],[],opts).counts.critical,1);
 assert.equal(executivePortfolio([project],indicators,[],[],{...opts,period:'Q1'}).counts.unassessed,1);
 const delayed=executivePortfolio([projects[0]],indicators,[],[],opts);assert.equal(delayed.counts.attention,1);
});

test('final targets cannot be inflated by achieved interim targets; direction and qualitative data stay explicit',()=>{
 assert.equal(finalTargetAttained({}, {achievement_pct:100, period_target:10, cumulative_actual:10, final_target:100}), false);
 assert.equal(finalTargetAttained({higher_is_better:false,target_value:5}, {cumulative_actual:3}), true);
 assert.equal(finalTargetAttained({target_value:0}, {cumulative_actual:0}), true);
 assert.equal(finalTargetAttained({}, {achievement_pct:100, actual_this_period:20}), null);
 assert.equal(finalTargetAttained({is_qualitative:true}, {achievement_pct:100,period_target:10}), null);
 assert.equal(finalTargetAttained({is_qualitative:true}, {achievement_pct:100}), true);
});
