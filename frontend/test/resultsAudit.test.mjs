import test from 'node:test';
import assert from 'node:assert/strict';
import { localiseRow } from '../src/lib/contentLocale';
import { sourceFrameworkRow, workingFrameworkProgress, editorValues } from '../src/lib/docc/frameworkEditing';
import { latestReportedBy } from '../src/lib/docc/progressSelection';
import { cellChanges, frameworkNumber } from '../src/lib/docc/frameworkCellEditor';
import { indicatorTargets } from '../src/lib/docc/resultComparison';
import i18n from '../src/i18n';

test('French indicator and narrative editing retain original source text', () => {
  const indicator = { code:'I', name:'Restore reefs', unit:'ha', i18n:{fr:{name:'Restaurer les récifs'}} };
  const narrative = { progress_summary:'Five sites mapped', i18n:{fr:{progress_summary:'Cinq sites cartographiés'}} };
  const row = sourceFrameworkRow({indicator:localiseRow(indicator,'fr'),narrative:localiseRow(narrative,'fr')});
  const patch = cellChanges({row,field:'indicator',value:row.indicator.name,code:'I',unit:'sites'});
  assert.equal(patch.indicator.name,'Restore reefs');
  assert.equal(row.narrative.progress_summary,'Five sites mapped');
});

test('saved working drafts remain resumable without entering reported selection', () => {
  const old={id:'old',indicator_id:'i',reporting_period:'Q1',period_end:'2026-03-31',review_status:'approved',cumulative_actual:10};
  const draft={...old,id:'current',reporting_period:'Q2',period_end:'2026-06-30',review_status:'draft',cumulative_actual:20};
  assert.equal(latestReportedBy([old,draft]).get('i').id,'old');
  assert.equal(workingFrameworkProgress([old,draft]).get('i').id,'current');
  assert.equal(workingFrameworkProgress([draft]).get('i').cumulative_actual,20);
  const patch=cellChanges({row:{progress:draft},field:'actual',value:'25',language:'en'});
  assert.deepEqual(patch,{progress:{cumulative_actual:25}});
});

test('English and French numeric target and observation edits parse grouping and decimals', () => {
  for(const [value,language,expected] of [['1,000','en',1000],['1,000.5','en',1000.5],['1 000,5','fr',1000.5],['1\u202f000,5','fr',1000.5],['1,5','fr',1.5],['0','fr',0],['','en',null]]) {
    assert.equal(frameworkNumber(value,language),expected);
    const row={targets:{final:{id:'t',numeric_value:10}},progress:{id:'p',cumulative_actual:1}};
    assert.equal(cellChanges({row,field:'final',value,language}).targets[0].numeric_value,expected);
    assert.equal(cellChanges({row,field:'actual',value,language}).progress.cumulative_actual,expected);
  }
  for(const value of ['1,5','1,00','1..5','abc']) assert.throws(()=>cellChanges({row:{targets:{final:{id:'t',numeric_value:1}}},field:'final',value,language:'en'}));
});

test('target effective date and revision ordering match the save routine', () => {
  const base={indicator_id:'i',target_type:'final'};
  const rows=[{...base,id:'a',period_end:'2026-12-31',created_at:'2026-01-01',updated_at:'2026-02-01',numeric_value:100},{...base,id:'b',period_end:'2026-12-31',created_at:'2026-01-01',updated_at:'2026-03-01',numeric_value:200},{...base,id:'c',period_end:'2026-06-30',created_at:'2026-09-01',numeric_value:999}];
  assert.equal(indicatorTargets(rows).get('i').final.numeric_value,200);
  assert.equal(indicatorTargets(rows.reverse()).get('i').final.numeric_value,200);
});

test('local form drafts exclude record snapshots and both languages expose matching interface keys', () => {
  const values=editorValues({value:'Editing',row:{private:'not a form value'},id:'x',period:'Q2'});
  assert.equal(values.row,undefined);assert.equal(values.id,undefined);assert.equal(values.period,'Q2');
  const keys=value=>Object.entries(value).flatMap(([k,v])=>typeof v==='object'?keys(v).map(child=>k+'.'+child):[k]).sort();
  assert.deepEqual(keys(i18n.getResourceBundle('en','translation').rf),keys(i18n.getResourceBundle('fr','translation').rf));
});
