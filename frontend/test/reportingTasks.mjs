import test from 'node:test';
import assert from 'node:assert/strict';
import { reportingTasks } from '../src/lib/reportingTasks.js';
const projects=[{id:'p',name:'Project',has_results_framework:true},{id:'raw',has_results_framework:false},{id:'audit',code:'AUDIT-2026',has_results_framework:true}];
const row=(status,extra={})=>({id:'r',project_id:'p',period_label:'Q3 / 2026',period_start:'2026-07-01',period_end:'2026-09-30',submission_status:status,...extra});
const tasks=(rows,role='ROLE_PROJ_MANAGER')=>reportingTasks(projects,rows,role,'2026-10-15');
test('tasks retain only accessible framework projects and valid editor roles',()=>{
 const rows=['p','raw','audit','unassigned'].map(project_id=>row('returned',{project_id}));
 assert.deepEqual(tasks(rows).map(t=>t.project.id),['p']);
 for(const role of ['ROLE_VIEWER',undefined,'unknown'])assert.deepEqual(reportingTasks(projects,rows,role,'2026-10-15'),[]);
});
test('review actions belong to reviewers and route to the exact submission',()=>{
 assert.equal(tasks([row('submitted')]).length,0);
 for(const role of ['ROLE_ADMIN','ROLE_DOCC_MEO']){
  const [task]=tasks([row('reviewed')],role);
  const url=new URL(task.href.slice(1),'https://example.test');
  assert.equal(url.pathname,'/review');assert.equal(url.searchParams.get('project'),'p');
  assert.equal(url.searchParams.get('period'),'Q3 / 2026');assert.equal(url.searchParams.get('submission'),'r');
 }
});
test('started drafts are actionable; future drafts and approved reports are not',()=>{
 assert.equal(tasks([row('draft')]).length,1);
 assert.equal(tasks([row('draft',{period_start:'2027-01-01'})]).length,0);
 assert.equal(tasks([row('draft',{period_start:null,period_end:'2027-03-31'})]).length,0);
 assert.equal(tasks([row('returned',{period_start:'2027-01-01'})]).length,1);
 assert.equal(tasks([row('approved')]).length,0);
});
test('latest state supersedes stale tasks and requested corrections come first',()=>{
 assert.equal(tasks([row('returned',{updated_at:'2026-10-01'}),row('approved',{updated_at:'2026-10-02'})]).length,0);
 assert.deepEqual(tasks([row('draft'),row('returned',{period_label:'Q2'})]).map(t=>t.kind),['correct','finish']);
});
