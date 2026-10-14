import test from 'node:test';
import assert from 'node:assert/strict';
import { fundingCoverage, beneficiaryPublicationState, comparableFinancialUtilisation } from '../src/lib/dataCoverage';
test('funding coverage excludes unknown legacy zeros and includes a confirmed zero', () => {
  assert.deepEqual(fundingCoverage([{budget_vuv:400},{budget_vuv:0},{budget_vuv:null},{budget_vuv:0,approved_budget_confirmed:true}]), {known:2,total:4});
});
test('beneficiary publication joins the period to the same project and flags unchecked records', () => {
  const rows=[{project_id:'a',reporting_period:'PIR',double_counting_check:false},{project_id:'b',reporting_period:'PIR',double_counting_check:true}];
  assert.deepEqual(beneficiaryPublicationState(rows,[{project_id:'a',period_label:'PIR',submission_status:'draft'},{project_id:'b',period_label:'PIR',submission_status:'approved'}]), {approved:1,unpublished:1,unchecked:1,periods:['PIR']});
});

test('zero approved expenditure produces zero utilisation while missing expenditure stays unknown', () => {
  assert.equal(comparableFinancialUtilisation([{budget_vuv:100,cumulative_expenditure_vuv:0,currency:'VUV'}]),0);
  assert.equal(comparableFinancialUtilisation([{budget_vuv:100,cumulative_expenditure_vuv:null,currency:'VUV'}]),null);
  assert.equal(comparableFinancialUtilisation([{budget_vuv:100,cumulative_expenditure_vuv:25,currency:'USD'}]),25);
});
