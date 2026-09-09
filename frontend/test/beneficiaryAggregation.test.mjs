import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateBeneficiaries } from '../src/lib/beneficiaryAggregation.js';

test('uses reconciled direct reach while retaining reported demographic breakdowns', () => {
  const result = aggregateBeneficiaries([
    { project_id:'a', total_direct:10, female:6, male:4, youth:3, double_counting_check:true },
    { project_id:'a', total_direct:20, female:11, male:9, persons_with_disability:2, double_counting_check:false },
    { project_id:'b', total_direct:0, female:0, male:0, indirect:5 },
  ]);
  assert.equal(result.total_direct,20);
  assert.equal(result.female,17);
  assert.equal(result.male,13);
  assert.equal(result.youth,3);
  assert.equal(result.persons_with_disability,2);
  assert.equal(result.indirect,5);
  assert.equal(result.projects,2);
  assert.equal(result.records,3);
  assert.equal(result.checked,1);
});

test('distinguishes zero from missing values and does not infer missing gender', () => {
  const result = aggregateBeneficiaries([{project_id:'a',total_direct:0,female:0,male:null}]);
  assert.equal(result.total_direct,0);
  assert.equal(result.female,0);
  assert.equal(result.male,null);
  assert.equal(result.other_gender,null);
  assert.equal(aggregateBeneficiaries([]).total_direct,null);
});

test('ignores invalid numeric values without corrupting totals', () => {
  const result = aggregateBeneficiaries([{total_direct:'bad',female:4},{total_direct:7,female:-1}]);
  assert.equal(result.total_direct,7);
  assert.equal(result.female,4);
});
