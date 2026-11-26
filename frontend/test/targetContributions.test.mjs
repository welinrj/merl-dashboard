import test from 'node:test';
import assert from 'node:assert/strict';
import { targetContributions } from '../src/lib/targetContributions';
import { executivePortfolio } from '../src/lib/executivePortfolio';
const own=(id,total,achieved,reported=total)=>({project:{id,code:id},total,achieved,reported});
test('project shares decompose 16 achieved targets and their 5.3% portfolio figure',()=>{
 const rows=[own('VCAP2',23,5,19),own('VCCRP',31,2,28),own('L&D',29,5,25),own('CBIT',24,4,14),own('NAPs',192,0,0),own('BOLD',2,0,0)];
 const m=targetContributions({rows,targets:{total:301,achieved:16}});
 assert.equal(m.valid,true);assert.equal(m.totalAchieved,16);
 assert.equal(m.rows.find(r=>r.project.id==='VCAP2').share,31.25);
 assert.equal(m.rows.find(r=>r.project.id==='VCCRP').share,12.5);
 assert.equal(m.rows.reduce((n,r)=>n+r.share,0),100);
 assert.ok(Math.abs(m.rows.reduce((n,r)=>n+r.points,0)-16/301*100)<1e-10);
 assert.equal(m.others.length,2);
});
test('chart follows the overview selection, including its latest eligible observations',()=>{
 const p={id:'v',code:'VCAP2'},i={id:'i',project_id:'v',target_value:10};
 const rows=[{id:'old',project_id:'v',indicator_id:'i',cumulative_actual:10,review_status:'approved',period_end:'2026-03-31'},{id:'draft',project_id:'v',indicator_id:'i',cumulative_actual:999,review_status:'draft',period_end:'2026-06-30'}];
 const summary=executivePortfolio([p],[i],rows);
 const model=targetContributions(summary);assert.equal(model.rows[0].share,100);assert.equal(model.rows[0].achieved,1);
 assert.deepEqual(targetContributions(executivePortfolio([],[],[])).rows,[]);
});
test('zero achievement has no fictitious pie and inconsistent or duplicate counts fail closed',()=>{
 assert.equal(targetContributions({rows:[own('a',3,0,0)],targets:{total:3,achieved:0}}).rows.length,0);
 for(const summary of [undefined,{rows:[own('a',3,1)],targets:{total:3,achieved:2}},{rows:[own('a',3,1),own('a',3,1)],targets:{total:6,achieved:2}}])assert.equal(targetContributions(summary).valid,false);
});
