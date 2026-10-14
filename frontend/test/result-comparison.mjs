import test from 'node:test';
import assert from 'node:assert/strict';
import { resultComparison, indicatorTargets } from '../src/lib/docc/resultComparison';
import { jsPDF } from 'jspdf';
import { renderReportPdf } from '../src/lib/reportPdf';

const indicator = { id: 'i', project_id: 'p', baseline_value: 0, target_value: 10, unit: 'people' };
const periods = ['Q1', 'Q2', 'Q3'].map((label, index) => ({ project_id: 'p', period_label: label, period_type: 'quarterly', period_end: `2026-0${index * 3 + 3}-30`, submission_status: index === 2 ? 'submitted' : 'approved' }));
const row = (period, actual, extra = {}) => ({ id: period, indicator_id: 'i', project_id: 'p', reporting_period: period, cumulative_actual: actual, period_end: periods.find(p => p.period_label === period)?.period_end, review_status: 'approved', ...extra });

test('cumulative comparisons select the previous comparable period and preserve overachievement', () => {
  const current = row('Q3', 12, { achievement_pct: 120 });
  const r = resultComparison(indicator, current, [row('Q1', 2), row('Q2', 7), row('Q2', 99, { id: 'draft', review_status: 'draft', updated_at: '2026-10-01' }), current], {}, periods);
  assert.equal(r.actual, 12); assert.equal(r.previousActual, 7);
  assert.equal(r.change, 5); assert.equal(r.gap, -2);
  assert.equal(r.achievement, 120); assert.equal(r.approval, 'submitted');
});
test('backfills, other projects, same-period revisions and other frequencies are excluded', () => {
  const current = row('Q3', 8);
  const history = [row('Q1', 2, { created_at: '2027-01-01' }), row('Q2', 99, { project_id: 'other' }), row('Q3', 6, { id: 'revision' }), row('August', 90, { period_end: '2026-08-31' })];
  const r = resultComparison(indicator, current, history, {}, [...periods, { project_id: 'p', period_label: 'August', period_type: 'monthly' }]);
  assert.equal(r.previousActual, 2);
});
test('period observations and cumulative snapshots never mix', () => {
  const r = resultComparison(indicator, row('Q3', null, { actual_this_period: 3, period_target: 5 }), [row('Q2', 7)], {}, periods);
  assert.equal(r.basis, 'period'); assert.equal(r.target, 5); assert.equal(r.actual, 3);
  assert.equal(r.change, null); assert.equal(r.gap, 2);
});
test('edited targets including zero override the original indicator values', () => {
  const targets = indicatorTargets([{ id: '1', indicator_id: 'i', target_type: 'final', numeric_value: 10, created_at: '2026-01-01' }, { id: '2', indicator_id: 'i', target_type: 'final', numeric_value: 0, created_at: '2026-02-01' }]);
  const r = resultComparison(indicator, row('Q3', 3), [], targets.get('i'), periods);
  assert.equal(r.finalTarget, 0); assert.equal(r.gap, -3); assert.equal(r.achievement, null);
});
test('missing, qualitative and baseline-change methods do not become invented percentages', () => {
  const r = resultComparison({ ...indicator, is_qualitative: true }, row('Q3', null), [], {}, periods);
  assert.equal(r.actual, null); assert.equal(r.change, null); assert.equal(r.gap, null); assert.equal(r.achievement, null);
  assert.equal(resultComparison({ ...indicator, progress_method: 'baseline_change' }, row('Q3', 8), [], {}, periods).achievement, null);
  assert.equal(resultComparison({ ...indicator, higher_is_better: false }, row('Q3', 8), [], {}, periods).achievement, null);
});
test('missing period metadata never silently produces a period comparison', () => {
  assert.equal(resultComparison(indicator, row('Q3', 8), [row('Q2', 4)], {}, []).change, null);
});
test('PDF paginates long table cells and narratives with bounded text and repeated headers', () => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  // Match the real generator's cover followed by body.
  pdf.addPage();
  const calls = [], text = pdf.text.bind(pdf);
  pdf.text = (value, x, y, ...rest) => { calls.push({ value, y }); return text(value, x, y, ...rest); };
  renderReportPdf(pdf, [{ type: 'heading1', text: 'Results' }, { type: 'table', rows: [['Indicator', 'Recorded result'], ['Long narrative', 'Detailed evidence '.repeat(1000)], ['Final row', '120%']] }, { type: 'paragraph', text: 'Project delivery narrative '.repeat(1500) }], { title: 'Delivery report', status: 'Draft' });
  assert.ok(pdf.internal.getNumberOfPages() > 4);
  assert.ok(calls.filter(call => String(call.value).includes('Indicator')).length > 1);
  assert.ok(calls.every(call => call.y >= 24 && call.y <= 820));
  assert.match(pdf.output(), /120%/);
});

// Text commands change PDF graphics state even inside BT/ET blocks.
test('PDF table cells reset their backgrounds after drawing text', () => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  renderReportPdf(pdf, [{ type: 'table', rows: [['Name', 'Actual'], ['Participants', '25']] }]);
  const stream = pdf.internal.pages[1].join('\n');
  const rectangles = stream.match(/(?:1\. g|0\.92 0\.95 0\.96 rg)\n[^\n]+ re\nB/g) || [];
  assert.equal(rectangles.length, 4, 'All four cells have their own light fill before drawing');
});
