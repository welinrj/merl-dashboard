import test from 'node:test';
import assert from 'node:assert/strict';
import { publishedMapResult } from '../src/lib/publishedMapResult';

test('map result preserves an approved zero and never substitutes its target', () => {
  assert.deepEqual(publishedMapResult({public_kpis:[{label:'Trees planted',actual_value:0,target_value:500,unit:'trees',period_label:'Q1 2026'}]}), {kind:'indicator',label:'Trees planted',value:0,unit:'trees',period:'Q1 2026'});
  assert.equal(publishedMapResult({public_kpis:[{label:'Planned trees',target_value:500}],expected_primary_outcome:'Restore forest'}),null);
});
test('map result chooses the newest published actual and retains its own period', () => {
  const result=publishedMapResult({last_published_period:'Q4',public_kpis:[{label:'Earlier',actual_value:30,published_at:'2026-01-01',period_label:'Q1'},{label:'Latest',actual_value:40,published_at:'2026-06-01',period_label:'Q2'}]});
  assert.equal(result.value,40);assert.equal(result.period,'Q2');assert.equal(result.label,'Latest');
});
test('map fallback distinguishes missing reporting from an explicitly published zero', () => {
  assert.equal(publishedMapResult({published_beneficiaries:0}).value,0);
  assert.equal(publishedMapResult({published_beneficiaries:null,progress_pct:null}),null);
  assert.equal(publishedMapResult({progress_pct:0}).kind,'progress');
});
