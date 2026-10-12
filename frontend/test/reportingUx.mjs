import test from 'node:test';
import assert from 'node:assert/strict';
import { isMainReportField, reportingStatus, needsReportingAction } from '../src/lib/reportingUx';
test('a required field can never be hidden under optional details',()=>{
 assert.equal(isMainReportField({key:'indicator_progress'},{name:'any_new_required_field',required:true}),true);
 assert.equal(isMainReportField({key:'indicator_progress'},{name:'cumulative_actual'}),true);
 assert.equal(isMainReportField({key:'indicator_progress'},{name:'previous_value'}),false);
});
test('missing status stays neutral and pending review stays amber',()=>{
 assert.equal(reportingStatus(undefined).tone,'neutral');
 assert.equal(reportingStatus('reviewed').tone,'warning');
 assert.equal(reportingStatus('approved').tone,'success');
});
test('future draft periods do not generate reminders and viewer cannot receive review actions',()=>{
 assert.equal(needsReportingAction({submission_status:'draft',period_end:'2027-01-01'},true,'2026-10-13'),false);
 assert.equal(needsReportingAction({submission_status:'draft',period_end:'2026-09-30'},false,'2026-10-13'),true);
 assert.equal(needsReportingAction({submission_status:'submitted'},false,'2026-10-13'),false);
 assert.equal(needsReportingAction({submission_status:'approved'},true,'2026-10-13'),false);
});
