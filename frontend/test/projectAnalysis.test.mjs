// Checks for lib/docc/projectAnalysis.js — run with: node test-projectAnalysis.mjs
// Written against the rules the module is specified to follow, with the
// missing-data cases first because those are the ones that quietly turn into
// "0% performance" if a formula is careless.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  timeElapsedPct, monthsElapsed, activityBuckets, implementationProgress,
  activityCommitments, indicatorStatus, resultsPerformance, financialSummary,
  beneficiarySummary, riskSummary, reportingCompliance, dataCompleteness,
  scheduleHealth, resultsHealth, riskHealth, dataQualityHealth, financialHealth,
  overallHealth, comparisonBars, managementAttention, geographicSummary,
  analyseProject, HEALTH_RULES,
} from '../src/lib/docc/projectAnalysis.js';

const check = (name, fn) => test(name, fn);

const AT = new Date('2026-08-26T00:00:00Z');   // fixed "today" for every case

// ── Time ─────────────────────────────────────────────────────────────────────
check('time elapsed is null without both dates', () => {
  assert.equal(timeElapsedPct(null, '2027-01-01', AT), null);
  assert.equal(timeElapsedPct('2025-01-01', null, AT), null);
});
check('time elapsed is a clamped percentage', () => {
  assert.equal(timeElapsedPct('2026-01-01', '2026-12-31', AT), 65.1); // 237 of 364 days
  assert.equal(timeElapsedPct('2020-01-01', '2021-01-01', AT), 100); // past end, clamped
  assert.equal(timeElapsedPct('2030-01-01', '2031-01-01', AT), 0);   // not started, clamped
});
check('zero-length project has no elapsed percentage', () => {
  assert.equal(timeElapsedPct('2026-01-01', '2026-01-01', AT), null);
});
check('months elapsed is null before the start', () => {
  assert.equal(monthsElapsed('2027-01-01', AT), null);
  assert.equal(monthsElapsed('2026-06-26', AT), 2);
});

// ── Activities ───────────────────────────────────────────────────────────────
const acts = [
  { id: 'a1', code: 'ACT-01', name: 'One',   status: 'completed',   planned_end_date: '2026-03-01', physical_progress_pct: 100 },
  { id: 'a2', code: 'ACT-02', name: 'Two',   status: 'in_progress', planned_end_date: '2026-06-01', physical_progress_pct: 40 },
  { id: 'a3', code: 'ACT-03', name: 'Three', status: 'delayed',     planned_end_date: '2027-01-01', physical_progress_pct: 10 },
  { id: 'a4', code: 'ACT-04', name: 'Four',  status: 'not_started', planned_end_date: '2027-06-01' },
  { id: 'a5', code: 'ACT-05', name: 'Five',  status: 'cancelled',   planned_end_date: '2026-01-01' },
];
check('overdue counts only open activities past their planned end', () => {
  const b = activityBuckets(acts, AT);
  assert.equal(b.overdue, 1, 'a2 only: a1 completed, a5 cancelled, a3/a4 future');
  assert.equal(b.overdueRows[0].id, 'a2');
});
check('cancelled work leaves the active denominator', () => {
  const b = activityBuckets(acts, AT);
  assert.equal(b.total, 5);
  assert.equal(b.active, 4);
  assert.equal(b.cancelled, 1);
});
check('implementation prefers recorded physical progress', () => {
  const r = implementationProgress(acts);
  assert.equal(r.basis, 'physical');
  assert.equal(r.counted, 3);            // a4 has none, a5 cancelled
  assert.equal(r.pct, 50);               // (100+40+10)/3
});
check('implementation falls back to completion share, and says so', () => {
  const r = implementationProgress([
    { id: 'x', status: 'completed' }, { id: 'y', status: 'in_progress' },
  ]);
  assert.equal(r.basis, 'status');
  assert.equal(r.pct, 50);
});
check('no activities means no implementation figure, not zero', () => {
  assert.equal(implementationProgress([]).pct, null);
  assert.equal(implementationProgress([{ id: 'z', status: 'cancelled' }]).pct, null);
});
check('commitments come from real dates and sort overdue first', () => {
  const c = activityCommitments([
    ...acts,
    { id: 'a6', code: 'ACT-06', name: 'Six', status: 'in_progress',
      next_action: 'Sign contract', next_action_due: '2026-05-01' },
  ], AT);
  assert.equal(c[0].status, 'overdue');
  assert.ok(c.some((r) => r.kind === 'nextAction' && r.label === 'Sign contract'));
  // A cancelled activity contributes no next action.
  assert.ok(!c.some((r) => r.kind === 'nextAction' && r.activityId === 'a5'));
});

// ── Indicators ───────────────────────────────────────────────────────────────
check('an unreported indicator with a future target is not yet due', () => {
  const r = indicatorStatus({ target_date: '2027-01-01' }, null, AT);
  assert.equal(r.status, 'not_yet_due');
});
check('an unreported indicator past its target date is no data, not failure', () => {
  const r = indicatorStatus({ target_date: '2026-01-01' }, null, AT);
  assert.equal(r.status, 'no_data');
});
check('period target is judged before the final target', () => {
  const r = indicatorStatus({}, {
    period_target: 100, actual_this_period: 95,
    cumulative_actual: 10, final_target: 1000,
  }, AT);
  assert.equal(r.status, 'on_track');   // 95% of the period, not 1% of the final
  assert.equal(r.pct, 95);
});
check('qualitative indicators are never put through the percentage formula', () => {
  const r = indicatorStatus({ is_qualitative: true },
    { performance_status: 'on_track', period_target: 100, actual_this_period: 1 }, AT);
  assert.equal(r.status, 'on_track');
  assert.equal(r.pct, null);
});
check('an inverse indicator uses the recorded status, not the ratio', () => {
  const r = indicatorStatus({ higher_is_better: false },
    { performance_status: 'target_achieved', period_target: 10, actual_this_period: 2 }, AT);
  assert.equal(r.status, 'achieved');
});
check('a qualitative indicator with no recorded status reads as no data', () => {
  assert.equal(indicatorStatus({ is_qualitative: true }, { narrative: 'x' }, AT).status, 'no_data');
});
check('results achievement counts only indicators actually due', () => {
  const inds = [
    { id: 'i1' }, { id: 'i2' }, { id: 'i3' }, { id: 'i4', target_date: '2027-01-01' },
  ];
  const prog = [
    { indicator_id: 'i1', period_target: 10, actual_this_period: 10, created_at: '2026-01-01' },
    { indicator_id: 'i2', period_target: 10, actual_this_period: 9,  created_at: '2026-01-01' },
    { indicator_id: 'i3', period_target: 10, actual_this_period: 1,  created_at: '2026-01-01' },
  ];
  const r = resultsPerformance(inds, prog, '', AT);
  assert.equal(r.due, 3);                       // i4 is not yet due
  assert.equal(r.meeting, 2);                   // achieved + on track
  assert.equal(r.achievementPct, 66.7);
  assert.equal(r.counts.not_yet_due, 1);
});
check('results achievement is null when nothing is due', () => {
  const r = resultsPerformance([{ id: 'i1', target_date: '2027-01-01' }], [], '', AT);
  assert.equal(r.achievementPct, null);
});
check('the newest progress row wins when no period is pinned', () => {
  const r = resultsPerformance([{ id: 'i1' }], [
    { indicator_id: 'i1', period_target: 10, actual_this_period: 1,  created_at: '2026-01-01' },
    { indicator_id: 'i1', period_target: 10, actual_this_period: 10, created_at: '2026-06-01' },
  ], '', AT);
  assert.equal(r.rows[0].status, 'achieved');
});
check('pinning a period selects that period', () => {
  const r = resultsPerformance([{ id: 'i1' }], [
    { indicator_id: 'i1', reporting_period: 'Q1', period_target: 10, actual_this_period: 1,  created_at: '2026-01-01' },
    { indicator_id: 'i1', reporting_period: 'Q2', period_target: 10, actual_this_period: 10, created_at: '2026-06-01' },
  ], 'Q1', AT);
  assert.equal(r.rows[0].status, 'below_target');
});

// ── Financial ────────────────────────────────────────────────────────────────
const proj = { budget_vuv: 1000, spent_vuv: 0, start_date: '2026-01-01', end_date: '2026-12-31' };
check('no financial records means no expenditure figure, not zero', () => {
  const f = financialSummary({ ...proj, spent_vuv: 0 }, [], AT);
  assert.equal(f.hasRecords, false);
  assert.equal(f.spent, 0);        // the profile's own figure is still shown
  assert.equal(f.approved, 1000);
});
check('the latest financial record supplies the position', () => {
  const f = financialSummary(proj, [
    { approved_budget: 1000, cumulative_expenditure: 200, created_at: '2026-03-01' },
    { approved_budget: 1000, cumulative_expenditure: 500, created_at: '2026-06-01' },
  ], AT);
  assert.equal(f.spent, 500);
  assert.equal(f.utilisationPct, 50);
  assert.equal(f.remaining, 500);
});
check('the spend gap is measured in points against time elapsed', () => {
  const f = financialSummary(proj, [{ approved_budget: 1000, cumulative_expenditure: 500, created_at: '2026-06-01' }], AT);
  assert.equal(f.timeElapsedPct, 65.1);
  assert.equal(f.gapPoints, -15.1);   // 50% used against 65.1% elapsed
});

// ── Beneficiaries ────────────────────────────────────────────────────────────
check('no beneficiary records means no reach figure', () => {
  const b = beneficiarySummary({ est_direct_beneficiaries: 500 }, []);
  assert.equal(b.hasRecords, false);
  assert.equal(b.reached, null);
  assert.equal(b.target, 500);
});
check('unchecked records are not summed — the largest is used', () => {
  const b = beneficiarySummary({ est_direct_beneficiaries: 500 }, [
    { total_direct: 100, double_counting_check: false },
    { total_direct: 120, double_counting_check: null },
  ]);
  assert.equal(b.basis, 'largest');
  assert.equal(b.reached, 120, 'summing would double-count the same population');
});
check('records confirmed free of double counting are summed', () => {
  const b = beneficiarySummary({ est_direct_beneficiaries: 500 }, [
    { total_direct: 100, double_counting_check: true },
    { total_direct: 120, double_counting_check: true },
  ]);
  assert.equal(b.basis, 'summed');
  assert.equal(b.reached, 220);
  assert.equal(b.achievementPct, 44);
});
check('categories are never assumed to add up to the total', () => {
  const b = beneficiarySummary({}, [
    { total_direct: 100, female: 60, male: 40, youth: 30, double_counting_check: true },
  ]);
  const sum = b.categories.reduce((s, c) => s + c.value, 0);
  assert.equal(sum, 130, 'youth overlaps female/male by design');
  assert.equal(b.reached, 100, 'the total stays the recorded total');
});
check('a category nobody filled in is absent, not zero', () => {
  const b = beneficiarySummary({}, [{ total_direct: 10, female: 6, double_counting_check: true }]);
  assert.deepEqual(b.categories.map((c) => c.key), ['female']);
});

// ── Risks ────────────────────────────────────────────────────────────────────
const risks = [
  { id: 'r1', risk_rating: 'Critical', status: 'open',      type: 'risk' },
  { id: 'r2', risk_rating: 'High',     status: 'closed',    type: 'risk' },
  { id: 'r3', risk_rating: 'Medium',   status: 'monitoring', type: 'issue', due_date: '2026-01-01' },
];
check('closed risks do not inflate the active count', () => {
  const s = riskSummary(risks, AT);
  assert.equal(s.unresolved.length, 2);
  assert.equal(s.high.length, 0, 'the only High is closed');
  assert.equal(s.critical.length, 1);
});
check('overdue mitigation is counted from unresolved rows only', () => {
  const s = riskSummary(risks, AT);
  assert.equal(s.overdueMitigation.length, 1);
});

// ── Reporting ────────────────────────────────────────────────────────────────
check('a period past its end and unsubmitted is overdue', () => {
  const c = reportingCompliance([
    { period_end: '2026-03-31', submission_status: 'approved' },
    { period_end: '2026-06-30', submission_status: 'draft' },
    { period_end: '2027-06-30', submission_status: 'draft' },
    { period_end: '2026-06-30', submission_status: 'submitted' },
  ], AT);
  assert.equal(c.expected, 4);
  assert.equal(c.overdue.length, 1);
  assert.equal(c.submitted.length, 2);
  assert.equal(c.awaiting.length, 1);
  assert.equal(c.approved.length, 1);
});

// ── Health ───────────────────────────────────────────────────────────────────
check('schedule is unknown without activities, never red', () => {
  assert.equal(scheduleHealth([], AT).status, 'unknown');
});
check('an activity both delayed and overdue is counted once', () => {
  const h = scheduleHealth([
    { id: 'a', status: 'delayed', planned_end_date: '2026-01-01' },
    { id: 'b', status: 'in_progress', planned_end_date: '2027-01-01' },
  ], AT);
  assert.equal(h.values.troubled, 1);
  assert.equal(h.values.pct, 50);
  assert.equal(h.status, 'red');
});
check('results health is unknown when nothing is due', () => {
  assert.equal(resultsHealth({ due: 0, achievementPct: null }).status, 'unknown');
});
check('risk health is unknown with no risks, green with only resolved ones', () => {
  assert.equal(riskHealth(riskSummary([], AT)).status, 'unknown');
  assert.equal(riskHealth(riskSummary([{ risk_rating: 'High', status: 'closed' }], AT)).status, 'green');
});
check('one unresolved critical risk is red', () => {
  assert.equal(riskHealth(riskSummary([{ risk_rating: 'Critical', status: 'open' }], AT)).status, 'red');
});
check('two unresolved high risks are red, one is amber', () => {
  const two = [{ risk_rating: 'High', status: 'open' }, { risk_rating: 'High', status: 'open' }];
  assert.equal(riskHealth(riskSummary(two, AT)).status, 'red');
  assert.equal(riskHealth(riskSummary(two.slice(0, 1), AT)).status, 'amber');
});
check('a new project is not marked red for spending little', () => {
  const early = financialSummary(
    { budget_vuv: 1000, start_date: '2026-08-01', end_date: '2031-08-01' },
    [{ approved_budget: 1000, cumulative_expenditure: 5, created_at: '2026-08-10' }], AT);
  assert.ok(early.timeElapsedPct < HEALTH_RULES.financialGraceTimePct);
  assert.equal(financialHealth(early).status, 'green');
});
check('spending beyond the budget is red whatever the calendar says', () => {
  const over = financialSummary(
    { budget_vuv: 1000, start_date: '2026-08-01', end_date: '2031-08-01' },
    [{ approved_budget: 1000, cumulative_expenditure: 1100, created_at: '2026-08-10' }], AT);
  assert.equal(financialHealth(over).status, 'red');
});
check('financial health is unknown without records', () => {
  assert.equal(financialHealth(financialSummary(proj, [], AT)).status, 'unknown');
});
check('overall health takes the worst assessed dimension', () => {
  const d = {
    financial: { status: 'green' }, schedule: { status: 'amber' },
    results: { status: 'unknown' }, risk: { status: 'red' }, dataQuality: { status: 'green' },
  };
  assert.equal(overallHealth(d).status, 'red');
});
check('unassessable dimensions are not counted against the project', () => {
  const d = {
    financial: { status: 'unknown' }, schedule: { status: 'green' },
    results: { status: 'unknown' }, risk: { status: 'unknown' }, dataQuality: { status: 'green' },
  };
  assert.equal(overallHealth(d).status, 'green');
});
check('a project with nothing assessable is unknown, not green', () => {
  const d = {
    financial: { status: 'unknown' }, schedule: { status: 'unknown' },
    results: { status: 'unknown' }, risk: { status: 'unknown' }, dataQuality: { status: 'unknown' },
  };
  assert.equal(overallHealth(d).status, 'unknown');
});

// ── Time vs Money vs Results ─────────────────────────────────────────────────
check('the widest gap decides the reading', () => {
  const c = comparisonBars(75,
    { utilisationPct: 40 }, { pct: 45 }, { achievementPct: 38 });
  assert.equal(c.reading, 'behind');
  assert.equal(c.values.measure, 'results');   // 38 is furthest from 75
  assert.equal(c.values.gap, 37);
});
check('measures close to the calendar read as aligned', () => {
  const c = comparisonBars(60, { utilisationPct: 58 }, { pct: 62 }, { achievementPct: 55 });
  assert.equal(c.reading, 'aligned');
});
check('no reading without time elapsed', () => {
  const c = comparisonBars(null, { utilisationPct: 58 }, { pct: 62 }, { achievementPct: 55 });
  assert.equal(c.reading, null);
  assert.equal(c.bars.length, 4);
});
check('no reading when only the calendar is known', () => {
  const c = comparisonBars(60, { utilisationPct: null }, { pct: null }, { achievementPct: null });
  assert.equal(c.reading, null);
});

// ── Management attention ─────────────────────────────────────────────────────
check('a clean project raises nothing', () => {
  const items = managementAttention({
    buckets: activityBuckets([{ id: 'a', status: 'completed', planned_end_date: '2026-01-01' }], AT),
    commitments: [], results: { counts: { below_target: 0 } },
    financial: financialSummary(proj, [{ approved_budget: 1000, cumulative_expenditure: 650, created_at: '2026-06-01' }], AT),
    risks: riskSummary([], AT),
    reporting: reportingCompliance([], AT),
    completeness: { pct: 100, done: 12, total: 12 },
    today: AT,
  });
  assert.deepEqual(items, []);
});
check('exceptions surface, most severe first', () => {
  const items = managementAttention({
    buckets: activityBuckets(acts, AT),
    commitments: [],
    results: { counts: { below_target: 2 } },
    financial: financialSummary(proj, [{ approved_budget: 1000, cumulative_expenditure: 50, created_at: '2026-06-01' }], AT),
    risks: riskSummary(risks, AT),
    reporting: reportingCompliance([{ period_end: '2026-01-01', submission_status: 'draft' }], AT),
    completeness: { pct: 50, done: 6, total: 12 },
    today: AT,
  });
  assert.equal(items[0].severity, 'red');
  const keys = items.map((i) => i.key);
  assert.ok(keys.includes('attn.criticalRisk'));
  assert.ok(keys.includes('attn.overdueReports'));
  assert.ok(keys.includes('attn.overdueActivities'));
  assert.ok(keys.includes('attn.belowTarget'));
  assert.ok(keys.includes('attn.underspend'));
  assert.ok(keys.includes('attn.dataIncomplete'));
});
check('an early project is not flagged for underspending', () => {
  const items = managementAttention({
    buckets: activityBuckets([], AT), commitments: [], results: { counts: { below_target: 0 } },
    financial: financialSummary(
      { budget_vuv: 1000, start_date: '2026-08-01', end_date: '2031-08-01' },
      [{ approved_budget: 1000, cumulative_expenditure: 1, created_at: '2026-08-10' }], AT),
    risks: riskSummary([], AT), reporting: reportingCompliance([], AT),
    completeness: { pct: 100, done: 12, total: 12 }, today: AT,
  });
  assert.deepEqual(items, []);
});

// ── Geography ────────────────────────────────────────────────────────────────
check('coverage counts distinct places from the project rows only', () => {
  const g = geographicSummary([
    { province: 'SANMA', island: 'Espiritu Santo', community: 'Matantas' },
    { province: 'SANMA', island: 'Espiritu Santo', community: 'Port Olry' },
    { province: 'TORBA', island: 'Vanua Lava', community: 'Sola' },
  ], [{ province: 'SANMA' }, { province: 'SHEFA' }]);
  assert.equal(g.provinceCount, 2);
  assert.equal(g.islandCount, 2);
  assert.equal(g.communityCount, 3);
  assert.equal(g.counts.SANMA, 2);
  assert.equal(g.provinces.find((p) => p.province === 'SANMA').activities, 1);
  assert.ok(!g.counts.SHEFA, 'an activity province with no location row adds no coverage');
});

// ── Whole analysis ───────────────────────────────────────────────────────────
check('a project with no records at all analyses without throwing', () => {
  const a = analyseProject({ project: { id: 'p', code: 'X', name: 'Y' } }, '', AT);
  // Four dimensions cannot be assessed and correctly say so. Data quality can:
  // nothing has been entered, which is a fact about the records rather than a
  // judgement about performance, so it reads red and carries the whole verdict.
  assert.equal(a.dimensions.financial.status, 'unknown');
  assert.equal(a.dimensions.schedule.status, 'unknown');
  assert.equal(a.dimensions.results.status, 'unknown');
  assert.equal(a.dimensions.risk.status, 'unknown');
  assert.equal(a.dimensions.dataQuality.status, 'red');
  assert.equal(a.health.status, 'red');
  assert.equal(a.timeElapsedPct, null);
  assert.equal(a.implementation.pct, null);
  assert.equal(a.results.achievementPct, null);
  assert.equal(a.beneficiaries.reached, null);
  assert.deepEqual(a.attention.filter((i) => i.key !== 'attn.dataIncomplete'), []);
});
check('KPI figures are the same objects the sections read', () => {
  const a = analyseProject({
    project: proj, activities: acts,
    financial: [{ approved_budget: 1000, cumulative_expenditure: 500, created_at: '2026-06-01' }],
  }, '', AT);
  // The comparison bars must quote the same numbers as the sections beneath.
  const byKey = Object.fromEntries(a.comparison.bars.map((b) => [b.key, b.pct]));
  assert.equal(byKey.budget, a.financial.utilisationPct);
  assert.equal(byKey.implementation, a.implementation.pct);
  assert.equal(byKey.time, a.timeElapsedPct);
  assert.equal(byKey.results, a.results.achievementPct);
});
