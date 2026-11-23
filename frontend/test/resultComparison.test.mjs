import test from 'node:test';
import assert from 'node:assert/strict';
import { resultComparison, resultNumber } from '../src/lib/resultComparison';

test('a real zero stays reported; missing, blank and invalid results do not become zero',()=>{
  const zero=resultComparison({actual:0,target:500,achievement:0,reviewStatus:'published'});
  assert.equal(zero.reported,true);assert.equal(zero.width,0);assert.equal(zero.tone,'reported');
  for(const actual of [null,undefined,'',' ',false,'invalid',Infinity]){
    const m=resultComparison({actual,target:500,achievement:0,reviewStatus:'approved'});
    assert.equal(m.reported,false);assert.equal(m.width,null);assert.equal(m.tone,'unreported');
  }
});
test('display uses the engine percentage rather than a misleading actual / target ratio',()=>{
  // Reduction/qualitative/baseline-adjusted indicators can differ from a ratio.
  const m=resultComparison({actual:20,target:10,achievement:75,reviewStatus:'approved'});
  assert.equal(m.width,75);assert.equal(m.percentage,75);
  assert.equal(resultComparison({actual:20,target:10}).width,null);
  assert.equal(resultComparison({actual:20,target:null,achievement:75}).width,null);
});
test('draft delivery cannot be presented as approved completion and bars remain bounded',()=>{
  assert.equal(resultComparison({actual:120,target:100,achievement:120,reviewStatus:'draft'}).tone,'pending');
  const above=resultComparison({actual:120,target:100,achievement:120,reviewStatus:'approved'});
  assert.equal(above.width,100);assert.equal(above.percentage,120);assert.equal(above.tone,'completed');
  assert.equal(resultComparison({actual:-10,target:100,achievement:-10,reviewStatus:'approved'}).width,0);
  assert.equal(resultNumber('2.5'),2.5);
});
