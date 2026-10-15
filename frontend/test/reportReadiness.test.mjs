import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportReadiness, rowMatchesReportScope, readinessAction } from '../src/lib/docc/reportReadiness';
const data = () => ({projects:[{id:'a',code:'A',name:'Coastal project',budget_vuv:100,provinces:['SANMA']}],
  reporting:[{project_id:'a',period_label:'Q3',period_type:'quarterly',submission_status:'approved'}],
  indicators:[{id:'i',project_id:'a'}], progress:[{project_id:'a',indicator_id:'i',cumulative_actual:0,reporting_period:'Q3',review_status:'approved'}],
  financial:[{project_id:'a',approved_budget:100,cumulative_expenditure:0,reporting_period:'Q3'}],
  beneficiaries:[{project_id:'a',total_direct:0,female:0,male:0,double_counting_check:true,reporting_period:'Q3'}],
  evidence:[{project_id:'a',indicator_id:'i',verification_status:'verified',reporting_period:'Q3'}]});
const scope={type:'full_me',projectIds:new Set(['a']),period:'Q3'};
test('recorded zeroes are valid results, expenditure and beneficiary totals',()=>{
  assert.deepEqual(reportReadiness(data(),scope).issues,[]);
});
test('missing period results and finance are not supplied by newer records',()=>{
  const result=reportReadiness(data(),{...scope,period:'Q2'});
  for(const key of ['noPeriod','missingFinance','missingResults','missingBeneficiaries']) assert.ok(result.issues.some(issue=>issue.key===key),key);
  assert.equal(result.approvedCount,0);
});
test('unselected projects never alter readiness or reveal project names',()=>{
  const source=data();source.projects.push({id:'b',name:'Private unrelated project'});
  source.reporting.push({project_id:'b',period_label:'Q3',submission_status:'draft'});
  const result=reportReadiness(source,scope);assert.equal(result.projectCount,1);assert.deepEqual(result.issues,[]);
});
test('approval, evidence verification and beneficiary checks are independent',()=>{
  const source=data();source.reporting[0].submission_status='submitted';source.evidence[0].verification_status='pending';
  source.beneficiaries[0].double_counting_check=false;source.beneficiaries[0].female=1;
  const keys=reportReadiness(source,scope).issues.map(issue=>issue.key);
  for(const key of ['pendingApproval','unverifiedEvidence','beneficiaryChecks','beneficiaryMismatch']) assert.ok(keys.includes(key),key);
});
test('verified evidence from a different period cannot support the selected result',()=>{
  const source=data();source.evidence[0].reporting_period='Q2';
  assert.ok(reportReadiness(source,scope).issues.some(issue=>issue.key==='unverifiedEvidence'));
});
test('negative indicator observations remain valid; negative expenditure does not',()=>{
  const source=data();source.progress[0].cumulative_actual=-1;source.financial[0].cumulative_expenditure=-1;
  const keys=reportReadiness(source,scope).issues.map(issue=>issue.key);
  assert.ok(!keys.includes('missingResults'));assert.ok(keys.includes('missingFinance'));
});
test('financial and geographic reports do not require unrelated indicator data',()=>{
  const source=data();source.progress=[];source.evidence=[];source.beneficiaries=[];source.reporting=[];
  assert.deepEqual(reportReadiness(source,{...scope,type:'geographic'}).issues,[]);
  const keys=reportReadiness(source,{...scope,type:'financial'}).issues.map(issue=>issue.key);
  assert.ok(!keys.includes('missingResults'));assert.ok(!keys.includes('missingBeneficiaries'));
});
test('no accessible projects is an empty scope, rather than a ready report',()=>{
  const result=reportReadiness(data(),{...scope,projectIds:new Set()});assert.equal(result.empty,true);assert.equal(result.issues[0].key,'noProjects');
});
test('frequency selection joins reporting metadata on the same project',()=>{
  assert.equal(rowMatchesReportScope({project_id:'a',reporting_period:'Q3'},data().reporting,'','annual'),false);
  assert.equal(rowMatchesReportScope({project_id:'b',reporting_period:'Q3'},data().reporting,'','quarterly'),false);
});
test('actions preserve project and period without inventing a reporting module',()=>{
  const href=readinessAction({key:'pendingApproval',projectId:'a',module:'reporting_periods'},'Q3 2026');
  assert.ok(href.startsWith('#/merl-reporting?'));assert.ok(href.includes('project=a'));assert.ok(href.includes('period=Q3+2026'));assert.ok(!href.includes('module='));
});

test('read-only users receive accessible portfolio links instead of editing forms',()=>{
  const href=readinessAction({key:'missingFinance',projectId:'a',module:'financial_progress'},'Q3',true);
  assert.ok(href.startsWith('#/analytics/project-portfolio?'));assert.ok(href.includes('project=a'));assert.ok(href.includes('period=Q3'));assert.ok(!href.includes('module='));
});
