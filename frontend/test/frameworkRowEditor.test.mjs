import test from 'node:test';
import assert from 'node:assert/strict';
import {createRowEditor,rowEditorChanges} from '../src/lib/docc/frameworkRowEditor.js';
const row={project:{id:'p'},indicator:{id:'i',code:'I1',name:'Indicator',baseline_value:10,target_value:90,frequency:'quarterly'},progress:{id:'g',reporting_period:'Q1',cumulative_actual:20,narrative:'Existing narrative'}};
test('metadata edit does not rewrite target or reported records',()=>{
 const editor=createRowEditor(row,[{id:'t',indicator_id:'i',target_type:'final',period_label:'Final',text_value:'Policy adopted',notes:'Do not erase'}],[]);
 editor.indicator.name='New name';
 assert.deepEqual(rowEditorChanges(editor),{indicator:{name:'New name'}});
});
test('target edits preserve zero and update only the chosen value',()=>{
 const editor=createRowEditor(row,[{id:'t',indicator_id:'i',target_type:'mid_term',period_label:'Mid-term',numeric_value:55,notes:'Retained'}],[]);
 editor.targets[0].numeric_value='0';
 assert.deepEqual(rowEditorChanges(editor),{targets:[{id:'t',numeric_value:0}]});
});
test('numeric, ordinal and text targets retain their formats without modifications',()=>{
 const editor=createRowEditor(row,[{id:'a',indicator_id:'i',target_type:'baseline',period_label:'Baseline',ordinal_value:0},{id:'b',indicator_id:'i',target_type:'final',period_label:'Final',text_value:'Approved policy'}],[]);
 assert.equal(editor.targets[0].valueFormat,'ordinal'); assert.equal(editor.targets[1].valueFormat,'text');
 assert.deepEqual(rowEditorChanges(editor),{});
});
test('new targets and progress include required context without wiping existing narrative',()=>{
 const editor=createRowEditor({...row,progress:null},[],[{project_id:'p',period_label:'Q2'}]);
 editor.targets.find(t=>t.target_type==='mid_term').numeric_value='50';
 editor.progress.reporting_period='Q2';editor.progress.cumulative_actual='0';
 editor.narrative.progress_summary='Reported progress';
 const patch=rowEditorChanges(editor);
 assert.equal(patch.targets[0].target_type,'mid_term');assert.equal(patch.targets[0].numeric_value,50);
 assert.deepEqual(patch.progress,{reporting_period:'Q2',cumulative_actual:0});
 assert.deepEqual(patch.narrative,{progress_summary:'Reported progress'});
});
