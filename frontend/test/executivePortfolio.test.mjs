import test from 'node:test';
import assert from 'node:assert/strict';
import { executivePortfolio, finalTargetAttained, latestExecutivePortfolio } from '../src/lib/executivePortfolio';
const projects = ['a','b','c','d','e'].map(id => ({ id, status: 'active' }));
const indicators = projects.flatMap(p => [1,2].map(n => ({ project_id:p.id,id:`${p.id}${n}` })));
const row = (id,pct,status='on_track',extra={}) => ({ id,project_id:id[0],indicator_id:id,achievement_pct:pct,cumulative_actual:pct,final_target:100,performance_status:status,review_status:'approved',period_end:'2026-06-30',...extra });
test('combined achievement counts targets once, not averages of percentages or units',()=>{
 const data=executivePortfolio(projects,indicators,[row('a1',120,'target_achieved'),row('a2',50),row('b1',0),row('c1',100,'target_achieved',{review_status:'submitted'})]);
 assert.deepEqual(data.targets,{total:10,achieved:2,reported:4,pending:1,approvedAchieved:1,percentage:20});
});
test('health buckets are exclusive, warnings take precedence and missing statuses cannot turn green',()=>{
 const data=executivePortfolio(projects,indicators,[row('a1',10),row('a2',30),row('b1',30,'attention_required'),row('b2',70,'at_risk'),row('c1',0,'attention_required'),row('d1',100),row('e1',90,'')]);
 assert.deepEqual(data.counts,{total:5,on_track:1,attention:3,critical:1,unassessed:0});
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

test('a draft-only historical period stays unassessed rather than becoming zero achievement',()=>{
 const project={id:'a',code:'VCAP2',has_results_framework:true};
 const own=[{id:'a1',project_id:'a',target_value:10},{id:'a2',project_id:'a',target_value:20}];
 const draft=row('a1',100,'target_achieved',{review_status:'draft',reporting_period:'2025 PIR'});
 const s=executivePortfolio([project],own,[draft],[],{period:'2025 PIR'});
 assert.equal(s.draftUpdates,1);assert.equal(s.targets.total,2);
 assert.equal(s.targets.reported,0);assert.equal(s.targets.achieved,0);assert.equal(s.targets.percentage,null);
 assert.equal(s.counts.unassessed,1);
 const actualZero=executivePortfolio([project],own,[{...draft,cumulative_actual:0,review_status:'submitted'}]);
 assert.equal(actualZero.targets.percentage,0);assert.equal(actualZero.targets.reported,1);
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

test('received partial and narrative updates need assessment rather than counting as no updates',()=>{
 const partial=executivePortfolio(projects,indicators,[row('a1',30,''),row('b1',null,'',{cumulative_actual:null,narrative:'Pending completion'}),row('c1',100,'target_achieved')]);
 assert.equal(partial.counts.attention,3);assert.equal(partial.counts.unassessed,2);
 assert.equal(partial.assessmentGaps,3);
 assert.equal(Object.entries(partial.counts).filter(([key])=>key!=='total').reduce((sum,[,n])=>sum+n,0),partial.counts.total);
});
test('current projects without frameworks remain in project count, not target denominator',()=>{
 const p=[{id:'a',has_results_framework:true},{id:'missing',has_results_framework:false}];
 const s=executivePortfolio(p,[{id:'a1',project_id:'a',target_value:10}],[row('a1',100,'target_achieved')]);
 assert.equal(s.counts.total,2);assert.equal(s.frameworks,1);assert.equal(s.targets.total,1);assert.equal(s.counts.unassessed,1);
});

test('latest executive snapshot preserves current assessments despite an empty historical detail period',()=>{
 const p=[{id:'a',code:'VCAP2'},{id:'b',code:'VCCRP'}];
 const own=[{id:'a1',project_id:'a',target_value:100},{id:'b1',project_id:'b',target_value:100}];
 const progress=[row('a1',100,'target_achieved',{reporting_period:'Current'}),row('b1',0,'on_track',{reporting_period:'Current'}),row('a1',999,'off_track',{review_status:'draft',reporting_period:'2025 PIR',period_end:'2025-06-30'})];
 const data={indicators:own,progress,reporting:[],portfolioStatus:[{project_id:'b',performance_status:'on_track',progress_pct:0}]};
 const summary=latestExecutivePortfolio(p,data);
 assert.equal(summary.scope,'latest');assert.equal(summary.targets.achieved,1);assert.equal(summary.targets.percentage,50);
 assert.equal(summary.counts.on_track,2);assert.equal(summary.counts.unassessed,0);
 assert.equal(summary.asAt,'2026-06-30');
 assert.equal(latestExecutivePortfolio([p[0]],data).targets.total,1);
});
test('recorded project assessments do not imply target achievement and cannot suppress warnings',()=>{
 const p=[{id:'a'}],own=[{id:'a1',project_id:'a',target_value:100},{id:'a2',project_id:'a',target_value:100}];
 const source={indicators:own,progress:[row('a1',10,'no_data')],portfolioStatus:[{project_id:'a',performance_status:'on_track',progress_pct:10}]};
 const s=latestExecutivePortfolio(p,source);assert.equal(s.counts.on_track,1);assert.equal(s.targets.achieved,0);
 const risk=latestExecutivePortfolio(p,{...source,progress:[row('a1',10,'at_risk')]});assert.equal(risk.counts.critical,1);
 const missing=latestExecutivePortfolio(p,{indicators:own,portfolioStatus:[{project_id:'a',performance_status:'no_data',schedule_status:'on_schedule'}]});
 assert.equal(missing.counts.on_track,0);assert.equal(missing.targets.percentage,null);
});
