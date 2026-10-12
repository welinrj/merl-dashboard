import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeProjectReport, initialReportType } from '../src/lib/projectReportScope';
const data={projects:[{id:'a'},{id:'b'}],financial:[{project_id:'a',amount:10},{project_id:'b',amount:90}],progress:[{project_id:'b'}],reporting:[{project_id:'a',period_label:'Q3'}],narratives:[{project_id:'b'}]};
test('selected project reports cannot include another project money or results',()=>{
 const d=scopeProjectReport(data,'a');assert.deepEqual(d.projects,[{id:'a'}]);assert.equal(d.financial[0].amount,10);assert.equal(d.progress.length,0);assert.equal(d.narratives.length,0);assert.equal(d.reporting.length,1);
});
test('all projects is unchanged and an unavailable project fails closed',()=>{
 assert.equal(scopeProjectReport(data,''),data);assert.equal(scopeProjectReport(data,'missing').projects.length,0);assert.equal(scopeProjectReport(data,'missing').financial.length,0);
});

test('portfolio links select the requested report type and project',()=>{
 const types=['project','financial','indicator','full_me'];
 assert.equal(initialReportType(new URLSearchParams('project=a'),types),'project');
 assert.equal(initialReportType(new URLSearchParams('project=a&type=financial'),types),'financial');
 assert.equal(initialReportType(new URLSearchParams('type=invalid'),types),'full_me');
});
