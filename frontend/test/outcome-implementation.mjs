import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcomeImplementation } from '../src/lib/docc/outcomeImplementation';
import { analyseProject } from '../src/lib/docc/projectAnalysis';
const nodes=[{id:'o1',node_type:'outcome',status:'approved'},{id:'o2',node_type:'outcome'},{id:'out',node_type:'output',parent_node_id:'o1'}];
const row=(id,node,actual,target=10)=>({indicator:{id,framework_node_id:node,target_value:target},progress:actual==null?null:{cumulative_actual:actual},status:'on_track'});
test('implementation counts achieved outcomes, not indicator averages or activities',()=>{
 const r=outcomeImplementation(nodes,[row('a','o1',10),row('b','o1',20),row('c','o2',9),row('output','out',0)]);
 assert.equal(r.pct,50);assert.equal(r.counted,1);assert.equal(r.total,2);
 assert.equal(outcomeImplementation(nodes,[row('a','o1',10),row('b','o1',9)]).counted,0,'Every outcome measure must meet its target');
});
test('missing measurements and absent outcomes stay distinct from zero achievement',()=>{
 assert.equal(outcomeImplementation([],[]).pct,null);
 assert.equal(outcomeImplementation(nodes,[]).pct,null);
 const r=outcomeImplementation(nodes,[row('a','o1',10)]);
 assert.equal(r.pct,50);assert.equal(r.unassessed,1);
 assert.equal(outcomeImplementation(nodes,[row('a','o1',0)]).pct,0);
 assert.equal(outcomeImplementation(nodes,[row('a','out',100)]).pct,null,'Completed outputs are not achieved outcomes');
});
test('completion uses final cumulative targets, including lower-is-better zero targets',()=>{
 const a=row('a','o1',5,10);a.progress.actual_this_period=5;a.progress.period_target=5;a.progress.achievement_pct=100;
 assert.equal(outcomeImplementation(nodes,[a]).counted,0,'A period target is not a completed final outcome');
 a.indicator.higher_is_better=false;a.indicator.target_value=0;a.progress.cumulative_actual=0;
 assert.equal(outcomeImplementation(nodes,[a]).counted,1);
 const q={indicator:{id:'q',framework_node_id:'o1',is_qualitative:true},progress:{performance_status:'target_achieved'}};
 assert.equal(outcomeImplementation(nodes,[q]).counted,1);
});
test('summary and comparison share outcome implementation without any activities',()=>{
 const d={project:{id:'p'},frameworkNodes:nodes,indicators:[{id:'i',framework_node_id:'o1',target_value:10}],progress:[{indicator_id:'i',cumulative_actual:10,review_status:'submitted'}],activities:[]};
 const a=analyseProject(d);assert.equal(a.implementation.pct,50);
 assert.equal(a.comparison.bars.find(b=>b.key==='implementation').pct,50);
});
