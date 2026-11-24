import test from 'node:test';
import assert from 'node:assert/strict';
import { projectProgressSummaries, projectResultsHref } from '../src/lib/projectProgressSummary';
const projects=[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}];
const indicators=[{id:'i1',project_id:'a'},{id:'i2',project_id:'a'},{id:'i3',project_id:'a'},{id:'ib',project_id:'b'}];
test('project summaries distinguish missing reporting from a true zero and show the denominator',()=>{
 const rows=projectProgressSummaries(projects,indicators,[{indicator_id:'i1',project_id:'a',achievement_pct:0,review_status:'approved',reporting_period:'Q1'}]);
 assert.equal(rows[0].progress,0);assert.equal(rows[0].reported,1);assert.equal(rows[0].total,3);assert.equal(rows[0].approved,1);
 assert.equal(rows[1].progress,null);assert.equal(rows[1].total,1);assert.equal(rows[2].total,0);
});
test('latest operational results do not sum cumulative snapshots or accept draft and foreign rows',()=>{
 const progress=[
  {id:'old',indicator_id:'i1',project_id:'a',achievement_pct:10,review_status:'approved',reporting_period:'Q1',period_end:'2026-03-31'},
  {id:'new',indicator_id:'i1',project_id:'a',achievement_pct:100,review_status:'submitted',reporting_period:'Q2',period_end:'2026-06-30'},
  {indicator_id:'i1',project_id:'a',achievement_pct:99,review_status:'draft',period_end:'2026-09-30'},
  {indicator_id:'i2',project_id:'a',achievement_pct:50,review_status:'approved',reporting_period:'Q1',period_end:'2026-03-31'},
  {indicator_id:'ib',project_id:'a',achievement_pct:100,review_status:'approved'},
 ];
 const [r]=projectProgressSummaries(projects,indicators,progress);
 assert.equal(r.progress,75);assert.equal(r.reported,2);assert.equal(r.pending,1);assert.equal(r.achieved,1);assert.equal(r.period,null);assert.equal(r.periodCount,2);assert.equal(r.date,'2026-06-30');
});
test('summary scopes remain limited to visible projects and the selected-period rows',()=>{
 const result=projectProgressSummaries([projects[1]],indicators,[{project_id:'a',indicator_id:'i1',achievement_pct:100},{project_id:'b',indicator_id:'ib',achievement_pct:null}]);
 assert.equal(result.length,1);assert.equal(result[0].reported,0);assert.equal(result[0].progress,null);
 const invalid=projectProgressSummaries([projects[0]],indicators,[{project_id:'a',indicator_id:'i1',achievement_pct:false}]);assert.equal(invalid[0].reported,0);
});
test('project result links retain the selected reporting period',()=>{
 const href=projectResultsHref('a','Q4 2026');const params=new URLSearchParams(href.split('?')[1]);
 assert.equal(params.get('project'),'a');assert.equal(params.get('period'),'Q4 2026');
 assert.equal(projectResultsHref('a',null),'/analytics/project?project=a');
});
