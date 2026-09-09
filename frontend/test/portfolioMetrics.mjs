import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectStatusSummary, indicatorSummary, financialSummary,
  reportingSummary, riskSummary, physicalFinancialVariance,
} from '../src/lib/portfolioMetrics.js';

test('project status summary uses one operational classification', () => {
  const s = projectStatusSummary([
    { status: 'active' }, { status: 'on_track' }, { status: 'delayed' },
    { status: 'planning' }, { status: 'completed' }, { status: 'cancelled' }, { status: 'weird' },
  ]);
  assert.equal(s.total, 7);
  assert.equal(s.on_track, 2);
  assert.equal(s.at_risk, 1);
  assert.equal(s.not_started, 1);
  assert.equal(s.completed, 1);
  assert.equal(s.cancelled, 1);
  assert.equal(s.unknown, 1);
  assert.equal(s.active, 4);
});

test('indicator summary uses latest row once per indicator', () => {
  const indicators = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }];
  const progress = [
    { indicator_id: 'i1', created_at: '2026-01-01', achievement_pct: 20, performance_status: 'off_track' },
    { indicator_id: 'i1', created_at: '2026-07-01', achievement_pct: 80, performance_status: 'on_track' },
    { indicator_id: 'i2', created_at: '2026-07-01', achievement_pct: 100, performance_status: 'target_achieved' },
  ];
  const s = indicatorSummary(indicators, progress);
  assert.equal(s.reported, 2);
  assert.equal(s.total, 3);
  assert.equal(s.averageAchievementPct, 90);
  assert.equal(s.statuses.on_track, 1);
  assert.equal(s.statuses.target_achieved, 1);
  assert.equal(s.statuses.no_data, 1);
});

test('financial summary uses latest financial record per project and project budgets', () => {
  const projects = [{ id: 'p1', budget_vuv: 1000 }, { id: 'p2', budget_vuv: 2000 }];
  const rows = [
    { project_id: 'p1', created_at: '2026-01-01', cumulative_expenditure: 100 },
    { project_id: 'p1', created_at: '2026-06-01', cumulative_expenditure: 500, funds_received: 700 },
    { project_id: 'p2', created_at: '2026-06-01', cumulative_expenditure: 1000, funds_received: 1500 },
  ];
  const s = financialSummary(projects, rows);
  assert.equal(s.approvedBudget, 3000);
  assert.equal(s.expenditure, 1500);
  assert.equal(s.remainingBalance, 1500);
  assert.equal(s.utilisationPct, 50);
  assert.equal(s.fundsReceived, 2200);
});

test('reporting and risk summaries flag overdue actionable records', () => {
  const now = new Date('2026-09-10T00:00:00Z');
  const reporting = reportingSummary([
    { submission_status: 'submitted', period_end: '2026-09-01' },
    { submission_status: 'reviewed', period_end: '2026-09-20' },
    { submission_status: 'approved', period_end: '2026-06-30' },
  ], now);
  assert.equal(reporting.pendingApproval, 2);
  assert.equal(reporting.overdue, 1);
  const risks = riskSummary([
    { status: 'open', risk_rating: 'high', due_date: '2026-09-01' },
    { status: 'monitoring', risk_rating: 'critical', due_date: '2026-09-20' },
    { status: 'resolved', risk_rating: 'critical', due_date: '2026-01-01' },
  ], now);
  assert.equal(risks.open, 2);
  assert.equal(risks.high, 1);
  assert.equal(risks.critical, 1);
  assert.equal(risks.overdue, 1);
});

test('physical-financial variance keeps the two concepts separate', () => {
  const result = physicalFinancialVariance(
    [{ id: 'p1', budget_vuv: 1000 }],
    [{ physical_progress_pct: 60 }, { physical_progress_pct: 80 }],
    [{ project_id: 'p1', created_at: '2026-09-01', cumulative_expenditure: 500 }],
  );
  assert.equal(result.physicalPct, 70);
  assert.equal(result.financialPct, 50);
  assert.equal(result.variancePctPoints, 20);
});
