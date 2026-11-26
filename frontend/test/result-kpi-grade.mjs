import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resultKpiGrade } from '../src/lib/docc/resultKpiGrade';
test('target achievement grading includes zero and exact boundaries',()=>{
  for(const [pct,tone] of [[0,'low'],[59.9,'low'],[60,'attention'],[89.9,'attention'],[90,'on-track'],[99.9,'on-track'],[100,'achieved'],[125,'achieved']]) assert.equal(resultKpiGrade({pct,status:'on_track'}).tone,tone);
});
test('unreported is distinct from reported zero and qualitative completion',()=>{
  assert.equal(resultKpiGrade({pct:null,status:'no_data',progress:null}).tone,'neutral');
  assert.equal(resultKpiGrade({pct:0,status:'on_track'}).tone,'low');
  assert.equal(resultKpiGrade({pct:null,status:'achieved',progress:{}}).tone,'achieved');
  assert.equal(resultKpiGrade({pct:null,status:'not_yet_due'}).label,'notDue');
  assert.equal(resultKpiGrade({pct:null,status:'no_data',progress:{narrative:'Pending'}}).label,'notAssessed');
});
