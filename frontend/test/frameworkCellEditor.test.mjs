import test from 'node:test';
import assert from 'node:assert/strict';
import {cellChanges} from '../src/lib/docc/frameworkCellEditor.js';
const row={targets:{baseline:{id:'b',notes:'Keep'}},progress:{id:'p',cumulative_actual:20}};
test('cell edits patch only the selected content and preserve zero',()=>{
  assert.deepEqual(cellChanges({row,field:'baseline',value:'0'}),{targets:[{id:'b',numeric_value:0,text_value:null,ordinal_value:null}]});
  assert.deepEqual(cellChanges({row,field:'actual',value:'0'}),{progress:{cumulative_actual:0}});
  assert.deepEqual(cellChanges({row,field:'narrative',value:'Changed'}),{narrative:{progress_summary:'Changed'}});
});
test('target edits support text and retain ordinal targets',()=>{
  assert.equal(cellChanges({row,field:'baseline',value:'Not established'}).targets[0].text_value,'Not established');
  assert.equal(cellChanges({row:{...row,targets:{baseline:{id:'b',ordinal_value:2}}},field:'baseline',value:'Scale 3'}).targets[0].ordinal_value,3);
});
test('new progress needs a reporting period; invalid numeric content cannot save',()=>{
  assert.throws(()=>cellChanges({row:{targets:{}},field:'actual',value:'1'}),/period/);
  assert.throws(()=>cellChanges({row,field:'actual',value:'abc'}),/number/);
  assert.deepEqual(cellChanges({row:{targets:{}},field:'narrative',value:'First',period:'Q2'}),{progress:{reporting_period:'Q2'},narrative:{progress_summary:'First'}});
});
