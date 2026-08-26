// =============================================================================
// projectAnalysis.js — every number the Project Portfolio Analysis page shows.
//
// One project, one set of records, one place the formulas live. The page and
// its export both read from here, so a KPI at the top of the screen and the
// detailed section below it can never disagree — they are the same call.
//
// Two rules run through the whole file:
//
//   1. Missing data is not zero performance. Every function returns null (or a
//      status of 'unknown') when the records needed to answer honestly are not
//      there. `reporting.js` established that convention for the forms; this
//      module keeps it for the analysis. A project that has entered no
//      expenditure is not a project that has spent nothing.
//   2. Nothing here is generative. Every status and every sentence the page
//      shows comes from a rule written down in this file, so an officer who
//      asks "why is Schedule amber?" gets an answer with numbers in it.
//
// The health thresholds are the ones specified for the module and are grouped
// in HEALTH_RULES so they can be changed in one place.
// =============================================================================
import {
  achievementPct, utilisationPct, remainingBalance,
  PERFORMANCE_THRESHOLDS,
} from './reporting';

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clampPct = (v) => (isNum(v) ? Math.max(0, Math.min(100, v)) : null);
const round1 = (v) => (isNum(v) ? Math.round(v * 10) / 10 : null);

/** Midnight today, so a date-only due date is not "overdue" for its own day. */
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const asDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

// A status carries its own explanation. `detail` is an i18n key plus values, so
// the reason travels with the status instead of being re-derived at the render
// site in whichever language happens to be active.
const verdict = (status, detail, values) => ({ status, detail, values: values ?? {} });
export const UNKNOWN = 'unknown';

// ── Thresholds ───────────────────────────────────────────────────────────────
// Written down once, in one shape, so "why amber" is answerable from this file.
export const HEALTH_RULES = {
  // Share of activities neither delayed nor past their planned end date.
  schedule:    { green: 80, amber: 60 },
  // Share of indicators due this period that are achieved or on track.
  results:     { green: 80, amber: 60 },
  // Share of the project's core records that have been entered.
  dataQuality: { green: 90, amber: 70 },
  // Percentage-point gap between budget used and time elapsed. A project
  // spending broadly in step with its calendar is green; the further apart the
  // two run, in either direction, the more it wants explaining.
  financialGap: { green: 15, amber: 30 },
  // Below this much time elapsed, a low spend says nothing yet — a project that
  // started last month has not "underspent". Financial health is green unless
  // the budget is already exceeded.
  financialGraceTimePct: 20,
};

// =============================================================================
// Time
// =============================================================================

/**
 * Percentage of the implementation period that has passed.
 * Null without both dates — the one figure that must never be guessed, because
 * three other comparisons on the page are measured against it.
 */
export function timeElapsedPct(startDate, endDate, asOf = new Date()) {
  const s = asDate(startDate), e = asDate(endDate);
  if (!s || !e) return null;
  const span = e.getTime() - s.getTime();
  if (span <= 0) return null;
  return round1(clampPct(((asOf.getTime() - s.getTime()) / span) * 100));
}

/** Whole months between two dates, for burn rate. Null if either is missing. */
export function monthsElapsed(startDate, asOf = new Date()) {
  const s = asDate(startDate);
  if (!s || asOf < s) return null;
  const months = (asOf.getFullYear() - s.getFullYear()) * 12
    + (asOf.getMonth() - s.getMonth())
    + (asOf.getDate() >= s.getDate() ? 0 : -1);
  return months > 0 ? months : null;
}

// =============================================================================
// Implementation — activities
// =============================================================================

/** Activity statuses that mean the activity is no longer being worked on. */
const CLOSED_ACTIVITY = new Set(['completed', 'cancelled']);

/**
 * Count activities into the buckets the module asks for.
 *
 * `delayed` is the status an officer recorded; `overdue` is derived from the
 * planned end date having passed while the activity is still open. They are
 * counted separately and deliberately overlap — an activity can be both, and
 * collapsing them would hide either the officer's judgement or the calendar's.
 */
export function activityBuckets(activities = [], asOf = startOfToday()) {
  const b = {
    total: activities.length,
    completed: 0, in_progress: 0, not_started: 0, delayed: 0, on_hold: 0, cancelled: 0,
    overdue: 0, overdueRows: [],
  };
  for (const a of activities) {
    if (a.status && b[a.status] !== undefined) b[a.status] += 1;
    const due = asDate(a.planned_end_date);
    if (due && due < asOf && !CLOSED_ACTIVITY.has(a.status)) {
      b.overdue += 1;
      b.overdueRows.push(a);
    }
  }
  // Cancelled work is not outstanding work; it leaves the denominator.
  b.active = b.total - b.cancelled;
  return b;
}

/**
 * Implementation progress for the project.
 *
 * Preferred basis is the physical progress officers record per activity. Where
 * no activity carries one, the share of activities completed is used instead —
 * a cruder measure, so the basis is returned alongside the number and the page
 * says which one it is showing.
 */
export function implementationProgress(activities = []) {
  const live = activities.filter((a) => a.status !== 'cancelled');
  if (live.length === 0) return { pct: null, basis: 'none', counted: 0, total: 0 };

  const withPct = live.filter((a) => isNum(num(a.physical_progress_pct)));
  if (withPct.length > 0) {
    const mean = withPct.reduce((s, a) => s + Number(a.physical_progress_pct), 0) / withPct.length;
    return { pct: round1(clampPct(mean)), basis: 'physical', counted: withPct.length, total: live.length };
  }

  const done = live.filter((a) => a.status === 'completed').length;
  return {
    pct: round1(clampPct((done / live.length) * 100)),
    basis: 'status', counted: done, total: live.length,
  };
}

/**
 * Dated commitments for the project, most urgent first.
 *
 * The schema has no project-scoped milestone table — `merl.activity_milestones`
 * belongs to the legacy L&D activities register, which carries no project_id —
 * so rather than invent milestones this reads the dated commitments activities
 * actually hold: the planned end date, and the next action an officer recorded
 * against the activity. Each row says which of the two it came from so the page
 * can label it truthfully.
 */
export function activityCommitments(activities = [], asOf = startOfToday()) {
  const rows = [];
  for (const a of activities) {
    const closed = CLOSED_ACTIVITY.has(a.status);
    const end = asDate(a.planned_end_date);
    if (end) {
      rows.push({
        id: `${a.id}:end`, activityId: a.id, code: a.code, kind: 'plannedEnd',
        label: a.name, due: a.planned_end_date,
        status: a.status === 'completed' ? 'completed'
          : a.status === 'cancelled' ? 'cancelled'
          : end < asOf ? 'overdue' : a.status === 'delayed' ? 'delayed' : 'upcoming',
      });
    }
    const next = asDate(a.next_action_due);
    if (next && a.next_action && !closed) {
      rows.push({
        id: `${a.id}:next`, activityId: a.id, code: a.code, kind: 'nextAction',
        label: a.next_action, due: a.next_action_due,
        status: next < asOf ? 'overdue' : 'upcoming',
      });
    }
  }
  const rank = { overdue: 0, delayed: 1, upcoming: 2, completed: 3, cancelled: 4 };
  return rows.sort((x, y) => (rank[x.status] - rank[y.status])
    || (new Date(x.due) - new Date(y.due)));
}

// =============================================================================
// Results — indicators
// =============================================================================

export const INDICATOR_STATUS = ['achieved', 'on_track', 'below_target', 'not_yet_due', 'no_data'];

/**
 * Status of one indicator against the reporting context.
 *
 * Where a period target was set, the indicator is judged on the period — the
 * module is explicit that a project should not be measured against its final
 * target every time. Otherwise the cumulative actual is compared with the final
 * target.
 *
 * Qualitative indicators and those where a lower value is the improvement are
 * not put through the percentage formula at all: the status an officer recorded
 * stands, and where none was recorded the indicator reads as no data rather
 * than as failure.
 */
export function indicatorStatus(indicator, progressRow, asOf = startOfToday()) {
  const qualitative = Boolean(indicator?.is_qualitative);
  const inverse = indicator?.higher_is_better === false;

  if (!progressRow) {
    // Nothing reported yet. A target date still in the future means the
    // indicator is not late — it is not due.
    const targetDate = asDate(indicator?.target_date);
    if (targetDate && targetDate >= asOf) return { status: 'not_yet_due', pct: null };
    return { status: 'no_data', pct: null };
  }

  if (qualitative || inverse) {
    const recorded = progressRow.performance_status;
    if (recorded === 'target_achieved') return { status: 'achieved', pct: null };
    if (recorded === 'on_track') return { status: 'on_track', pct: null };
    if (recorded === 'attention_required' || recorded === 'off_track') {
      return { status: 'below_target', pct: null };
    }
    return { status: 'no_data', pct: null };
  }

  const periodTarget = num(progressRow.period_target);
  const actualThis = num(progressRow.actual_this_period);
  const cumulative = num(progressRow.cumulative_actual);
  const finalTarget = num(progressRow.final_target) ?? num(indicator?.target_value);

  // Period target first: judge the period that was reported on.
  let pct = null;
  if (isNum(periodTarget) && periodTarget !== 0 && isNum(actualThis)) {
    pct = achievementPct(actualThis, periodTarget);
  } else if (isNum(cumulative) && isNum(finalTarget) && finalTarget !== 0) {
    pct = achievementPct(cumulative, finalTarget);
  } else if (isNum(num(progressRow.achievement_pct))) {
    pct = num(progressRow.achievement_pct);
  }

  if (!isNum(pct)) return { status: 'no_data', pct: null };
  if (pct >= 100) return { status: 'achieved', pct };
  if (pct >= PERFORMANCE_THRESHOLDS.onTrack) return { status: 'on_track', pct };
  return { status: 'below_target', pct };
}

/**
 * Pair each indicator with the progress row that should judge it, and count the
 * result. `period` narrows to one reporting period; without it the most recent
 * progress row for each indicator is used.
 */
export function resultsPerformance(indicators = [], progress = [], period = '', asOf = startOfToday()) {
  const byIndicator = new Map();
  for (const p of progress) {
    if (period && p.reporting_period !== period) continue;
    const prev = byIndicator.get(p.indicator_id);
    // Newest wins when no period is pinned; created_at is the only ordering the
    // rows reliably carry.
    if (!prev || new Date(p.created_at ?? 0) > new Date(prev.created_at ?? 0)) {
      byIndicator.set(p.indicator_id, p);
    }
  }

  const rows = indicators.map((ind) => {
    const row = byIndicator.get(ind.id) ?? null;
    const { status, pct } = indicatorStatus(ind, row, asOf);
    return { indicator: ind, progress: row, status, pct };
  });

  const counts = { achieved: 0, on_track: 0, below_target: 0, not_yet_due: 0, no_data: 0 };
  for (const r of rows) counts[r.status] += 1;

  // "Due" excludes indicators not yet due and those never reported on: a
  // percentage built on indicators nobody has measured would be an opinion, not
  // a measurement.
  const due = counts.achieved + counts.on_track + counts.below_target;
  const meeting = counts.achieved + counts.on_track;

  return {
    rows, counts, due, meeting,
    total: indicators.length,
    achievementPct: due > 0 ? round1((meeting / due) * 100) : null,
  };
}

// =============================================================================
// Financial
// =============================================================================

/** Financial rows in reporting order — created_at is the only reliable one. */
export const orderedFinancial = (financial = []) =>
  [...financial].sort((a, b) => new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0));

/**
 * The project's financial position.
 *
 * The approved budget and expenditure come from the latest financial progress
 * record where one exists, falling back to the project profile's own budget.
 * `hasRecords` is returned separately so the page can say "nothing has been
 * submitted" rather than showing a confident zero.
 */
export function financialSummary(project, financial = [], asOf = new Date()) {
  const rows = orderedFinancial(financial);
  const latest = rows.length ? rows[rows.length - 1] : null;

  const approved = num(latest?.approved_budget) ?? num(project?.budget_vuv);
  const spent = num(latest?.cumulative_expenditure) ?? (rows.length ? null : num(project?.spent_vuv));
  const pct = utilisationPct(approved, spent);

  const months = monthsElapsed(project?.start_date, asOf);
  const burnRate = isNum(spent) && isNum(months) && months > 0 ? Math.round(spent / months) : null;

  const elapsed = timeElapsedPct(project?.start_date, project?.end_date, asOf);
  // Expected spend if the budget were drawn evenly across the calendar. A
  // straight line is a rough expectation, so the page presents the gap as an
  // observation to explain rather than as a verdict.
  const expected = isNum(approved) && isNum(elapsed) ? (approved * elapsed) / 100 : null;
  const variance = isNum(spent) && isNum(expected) ? spent - expected : null;
  const gapPoints = isNum(pct) && isNum(elapsed) ? round1(pct - elapsed) : null;

  return {
    hasRecords: rows.length > 0,
    rows,
    approved,
    spent,
    remaining: remainingBalance(approved, spent),
    utilisationPct: pct,
    fundsReceived: num(latest?.funds_received),
    fundsAvailable: num(latest?.funds_available),
    burnRate,
    expected,
    variance,
    gapPoints,
    timeElapsedPct: elapsed,
  };
}

// =============================================================================
// Beneficiaries
// =============================================================================

/**
 * Beneficiaries reached against the profile's estimate.
 *
 * Two things this deliberately does not do. It does not add the disaggregated
 * categories together to produce a total: youth and persons with disability
 * overlap with female and male, so their sum is not a headcount. And it does
 * not sum every reporting record blindly — where a record is flagged as not
 * having been checked for double counting, the sum would double-count the same
 * population across periods, so the largest single record is used instead and
 * the basis is reported.
 */
export function beneficiarySummary(project, beneficiaries = [], period = '') {
  const rows = period
    ? beneficiaries.filter((b) => b.reporting_period === period)
    : beneficiaries;

  if (rows.length === 0) {
    return {
      hasRecords: false, reached: null, target: num(project?.est_direct_beneficiaries),
      basis: 'none', categories: [], indirect: null, achievementPct: null, periodCount: 0,
    };
  }

  const totals = rows.map((r) => num(r.total_direct)).filter(isNum);
  // Every record confirmed free of double counting can be added up. Otherwise
  // the safest honest figure is the largest single report.
  const allChecked = rows.every((r) => r.double_counting_check === true);
  const summed = totals.reduce((s, v) => s + v, 0);
  const largest = totals.length ? Math.max(...totals) : null;

  const reached = totals.length === 0 ? null
    : (allChecked || rows.length === 1) ? summed : largest;
  const basis = totals.length === 0 ? 'none'
    : (allChecked || rows.length === 1) ? 'summed' : 'largest';

  const sumOf = (key) => {
    const vals = rows.map((r) => num(r[key])).filter(isNum);
    return vals.length ? vals.reduce((s, v) => s + v, 0) : null;
  };
  // Only the categories the forms actually collect, and only where a figure was
  // entered. A category nobody filled in is absent, not zero.
  const categories = [
    { key: 'female', value: sumOf('female') },
    { key: 'male', value: sumOf('male') },
    { key: 'other_gender', value: sumOf('other_gender') },
    { key: 'youth', value: sumOf('youth') },
    { key: 'persons_with_disability', value: sumOf('persons_with_disability') },
  ].filter((c) => isNum(c.value));

  const target = num(project?.est_direct_beneficiaries);
  return {
    hasRecords: true,
    reached,
    target,
    basis,
    categories,
    indirect: sumOf('indirect'),
    achievementPct: isNum(reached) && isNum(target) && target > 0
      ? round1((reached / target) * 100) : null,
    periodCount: rows.length,
  };
}

// =============================================================================
// Risks
// =============================================================================

const UNRESOLVED_RISK = new Set(['open', 'monitoring', 'escalated']);
const rated = (r, name) => String(r.risk_rating ?? '').toLowerCase() === name;

/** Unresolved first: a closed risk is history, not an active exposure. */
export function riskSummary(risks = [], asOf = startOfToday()) {
  const unresolved = risks.filter((r) => UNRESOLVED_RISK.has(r.status));
  const overdueMitigation = unresolved.filter((r) => {
    const due = asDate(r.due_date);
    return due && due < asOf;
  });
  return {
    total: risks.length,
    unresolved,
    resolved: risks.filter((r) => !UNRESOLVED_RISK.has(r.status)),
    critical: unresolved.filter((r) => rated(r, 'critical')),
    high: unresolved.filter((r) => rated(r, 'high')),
    medium: unresolved.filter((r) => rated(r, 'medium')),
    openIssues: unresolved.filter((r) => r.type === 'issue'),
    overdueMitigation,
  };
}

// =============================================================================
// Reporting compliance
// =============================================================================

const SUBMITTED = new Set(['submitted', 'reviewed', 'approved']);
const AWAITING = new Set(['submitted', 'reviewed']);

/**
 * Compliance against the portal's own reporting workflow. A reporting period
 * row is the expected report; its submission_status is the workflow's answer.
 * Nothing here creates a second approval process.
 */
export function reportingCompliance(periods = [], asOf = startOfToday()) {
  const expected = periods.length;
  const submitted = periods.filter((p) => SUBMITTED.has(p.submission_status));
  const approved = periods.filter((p) => p.submission_status === 'approved');
  const awaiting = periods.filter((p) => AWAITING.has(p.submission_status));
  const returned = periods.filter((p) => p.submission_status === 'returned');
  const overdue = periods.filter((p) => {
    const end = asDate(p.period_end);
    return end && end < asOf && !SUBMITTED.has(p.submission_status);
  });
  return {
    expected, submitted, approved, awaiting, returned, overdue,
    submittedPct: expected > 0 ? round1((submitted.length / expected) * 100) : null,
  };
}

// =============================================================================
// Data completeness
// =============================================================================

/**
 * Which of the project's core records exist.
 *
 * This is the basis for the Data Quality health dimension, and it is a plain
 * checklist on purpose: an officer can read the list, see which line is
 * missing, and go and enter it.
 */
export function dataCompleteness(d) {
  const checks = [
    { key: 'dates', ok: Boolean(d.project?.start_date && d.project?.end_date) },
    { key: 'budget', ok: isNum(num(d.project?.budget_vuv)) && num(d.project.budget_vuv) > 0 },
    { key: 'objectives', ok: (d.objectives ?? []).length > 0 },
    { key: 'outcomes', ok: (d.outcomes ?? []).length > 0 },
    { key: 'outputs', ok: (d.outputs ?? []).length > 0 },
    { key: 'activities', ok: (d.activities ?? []).length > 0 },
    { key: 'indicators', ok: (d.indicators ?? []).length > 0 },
    { key: 'indicatorProgress', ok: (d.progress ?? []).length > 0 },
    { key: 'financial', ok: (d.financial ?? []).length > 0 },
    { key: 'beneficiaries', ok: (d.beneficiaries ?? []).length > 0 },
    { key: 'locations', ok: (d.locations ?? []).length > 0 },
    { key: 'periods', ok: (d.periods ?? []).length > 0 },
  ];
  const done = checks.filter((c) => c.ok).length;
  return { checks, done, total: checks.length, pct: round1((done / checks.length) * 100) };
}

// =============================================================================
// Health — five dimensions, then the overall status
// =============================================================================

const band = (pct, rules) => (pct >= rules.green ? 'green' : pct >= rules.amber ? 'amber' : 'red');

/**
 * Schedule: the share of activities that are neither recorded as delayed nor
 * past their planned end date. Overdue work is what makes this amber or red, so
 * the count of it travels with the status.
 */
export function scheduleHealth(activities = [], asOf = startOfToday()) {
  const b = activityBuckets(activities, asOf);
  if (b.active === 0) return verdict(UNKNOWN, 'health.scheduleNoActivities');

  // An activity in trouble is one its officer marked delayed or one the
  // calendar has overtaken; counted once either way.
  const troubled = new Set();
  for (const a of activities) {
    if (a.status === 'cancelled') continue;
    if (a.status === 'delayed') troubled.add(a.id);
  }
  for (const a of b.overdueRows) troubled.add(a.id);

  const onTrackPct = round1(((b.active - troubled.size) / b.active) * 100);
  return verdict(band(onTrackPct, HEALTH_RULES.schedule), 'health.scheduleDetail', {
    troubled: troubled.size, active: b.active, pct: onTrackPct,
  });
}

/** Results: the share of indicators due this period that are achieved or on track. */
export function resultsHealth(results) {
  if (!results || results.due === 0) return verdict(UNKNOWN, 'health.resultsNoDue');
  const pct = results.achievementPct;
  if (!isNum(pct)) return verdict(UNKNOWN, 'health.resultsNoDue');
  return verdict(band(pct, HEALTH_RULES.results), 'health.resultsDetail', {
    meeting: results.meeting, due: results.due, pct,
  });
}

/** Risk: unresolved exposure only. Closed risks do not colour this. */
export function riskHealth(summary) {
  if (!summary || summary.total === 0) return verdict(UNKNOWN, 'health.riskNone');
  const { critical, high, medium, overdueMitigation, openIssues } = summary;

  if (critical.length > 0) {
    return verdict('red', 'health.riskCritical', { count: critical.length });
  }
  if (high.length > 1) return verdict('red', 'health.riskManyHigh', { count: high.length });
  if (high.length === 1) return verdict('amber', 'health.riskOneHigh', { count: 1 });
  if (overdueMitigation.length > 0) {
    return verdict('amber', 'health.riskOverdueMitigation', { count: overdueMitigation.length });
  }
  if (medium.length > 0 || openIssues.length > 0) {
    return verdict('amber', 'health.riskModerate', {
      count: medium.length + openIssues.length,
    });
  }
  return verdict('green', 'health.riskClear', { total: summary.total });
}

/** Data quality: the share of the core record checklist that has been entered. */
export function dataQualityHealth(completeness) {
  if (!completeness) return verdict(UNKNOWN, 'health.dataUnknown');
  return verdict(band(completeness.pct, HEALTH_RULES.dataQuality), 'health.dataDetail', {
    done: completeness.done, total: completeness.total, pct: completeness.pct,
  });
}

/**
 * Financial: expenditure judged against the budget *and* the calendar.
 *
 * A project two months into five years has not underspent, so below the grace
 * threshold the only thing that can turn this amber or red is spending more
 * than the budget. After that, the further budget used runs from time elapsed —
 * in either direction — the more it wants an explanation.
 */
export function financialHealth(fin) {
  if (!fin || !fin.hasRecords) return verdict(UNKNOWN, 'health.financialNoRecords');
  if (!isNum(fin.utilisationPct)) return verdict(UNKNOWN, 'health.financialNoBudget');

  if (fin.utilisationPct > 100) {
    return verdict('red', 'health.financialOverspent', { pct: fin.utilisationPct });
  }
  if (!isNum(fin.timeElapsedPct)) {
    return verdict(UNKNOWN, 'health.financialNoDates', { pct: fin.utilisationPct });
  }
  if (fin.timeElapsedPct < HEALTH_RULES.financialGraceTimePct) {
    return verdict('green', 'health.financialEarly', {
      used: fin.utilisationPct, elapsed: fin.timeElapsedPct,
    });
  }

  const gap = Math.abs(fin.gapPoints ?? 0);
  const status = gap <= HEALTH_RULES.financialGap.green ? 'green'
    : gap <= HEALTH_RULES.financialGap.amber ? 'amber' : 'red';
  return verdict(status, fin.gapPoints < 0 ? 'health.financialBehind' : 'health.financialAhead', {
    gap: round1(gap), used: fin.utilisationPct, elapsed: fin.timeElapsedPct,
  });
}

/**
 * Overall health from its parts: the worst assessed dimension carries the
 * project. Dimensions that could not be assessed are left out of the verdict
 * rather than counted against it, and if nothing could be assessed the overall
 * status is unknown too — an unmeasured project is not a healthy one.
 */
export function overallHealth(dimensions) {
  const assessed = Object.values(dimensions).filter((d) => d.status !== UNKNOWN);
  if (assessed.length === 0) return verdict(UNKNOWN, 'health.overallUnknown');
  if (assessed.some((d) => d.status === 'red')) {
    return verdict('red', 'health.overallFrom', { count: assessed.length });
  }
  if (assessed.some((d) => d.status === 'amber')) {
    return verdict('amber', 'health.overallFrom', { count: assessed.length });
  }
  return verdict('green', 'health.overallFrom', { count: assessed.length });
}

// =============================================================================
// The whole analysis
// =============================================================================

/**
 * Every figure the page shows, from one call over one project's records.
 *
 * @param {object} d   the project's records, as fetched
 * @param {string} [period] reporting period to narrow period-sensitive figures
 * @returns the analysis; `null` fields mean "not reported", never zero
 */
export function analyseProject(d, period = '', asOf = new Date()) {
  const today = startOfToday();
  const project = d.project ?? null;

  const activities = d.activities ?? [];
  const indicators = d.indicators ?? [];

  const buckets = activityBuckets(activities, today);
  const implementation = implementationProgress(activities);
  const results = resultsPerformance(indicators, d.progress ?? [], period, today);
  const financial = financialSummary(project, d.financial ?? [], asOf);
  const beneficiaries = beneficiarySummary(project, d.beneficiaries ?? [], period);
  const risks = riskSummary(d.risks ?? [], today);
  const reporting = reportingCompliance(d.periods ?? [], today);
  const completeness = dataCompleteness(d);
  const commitments = activityCommitments(activities, today);

  const elapsed = timeElapsedPct(project?.start_date, project?.end_date, asOf);

  const dimensions = {
    financial: financialHealth(financial),
    schedule: scheduleHealth(activities, today),
    results: resultsHealth(results),
    risk: riskHealth(risks),
    dataQuality: dataQualityHealth(completeness),
  };

  return {
    project, period,
    timeElapsedPct: elapsed,
    buckets, implementation, results, financial, beneficiaries,
    risks, reporting, completeness, commitments,
    dimensions,
    health: overallHealth(dimensions),
    comparison: comparisonBars(elapsed, financial, implementation, results),
    attention: managementAttention({
      buckets, commitments, results, financial, risks, reporting, completeness, today,
    }),
  };
}

// =============================================================================
// Time vs Money vs Results
// =============================================================================

/**
 * The four headline measures on one scale, plus a plain reading of them.
 *
 * The interpretation is a rule, not a paragraph: the widest gap between time
 * elapsed and the three progress measures decides which sentence the page
 * shows, and only when all the parts of that comparison are actually known.
 */
export function comparisonBars(elapsed, financial, implementation, results) {
  const bars = [
    { key: 'time', pct: elapsed },
    { key: 'budget', pct: financial?.utilisationPct ?? null },
    { key: 'implementation', pct: implementation?.pct ?? null },
    { key: 'results', pct: results?.achievementPct ?? null },
  ];

  const known = bars.filter((b) => b !== bars[0] && isNum(b.pct));
  if (!isNum(elapsed) || known.length === 0) {
    return { bars, reading: null, values: {} };
  }

  // The measure furthest from the calendar is the one worth naming.
  let widest = known[0];
  for (const b of known) {
    if (Math.abs(b.pct - elapsed) > Math.abs(widest.pct - elapsed)) widest = b;
  }
  const gap = round1(widest.pct - elapsed);
  const size = Math.abs(gap);

  // Under ten points apart is "broadly aligned" — a straight-line expectation
  // is not precise enough to call anything closer a divergence.
  if (size < 10) return { bars, reading: 'aligned', values: { elapsed } };
  return {
    bars,
    reading: gap < 0 ? 'behind' : 'ahead',
    values: { measure: widest.key, gap: size, elapsed, pct: widest.pct },
  };
}

// =============================================================================
// Requires Management Attention
// =============================================================================

/**
 * Only what needs acting on.
 *
 * Every item is derived from a record that is currently in an exceptional
 * state, so when the record is fixed the item stops being produced — there is
 * no list to maintain and nothing to dismiss. Each carries the section it came
 * from so the page can send the reader there.
 */
export function managementAttention({
  buckets, commitments, results, financial, risks, reporting, completeness, today = startOfToday(),
}) {
  const items = [];
  const add = (severity, key, values, section) =>
    items.push({ severity, key, values, section });

  // Risks first: an unresolved critical risk outranks everything else here.
  if (risks?.critical.length) {
    add('red', 'attn.criticalRisk', { count: risks.critical.length }, 'risks');
  }
  if (risks?.high.length) {
    add(risks.high.length > 1 ? 'red' : 'amber', 'attn.highRisk', { count: risks.high.length }, 'risks');
  }
  if (risks?.overdueMitigation.length) {
    add('amber', 'attn.overdueMitigation', { count: risks.overdueMitigation.length }, 'risks');
  }

  if (reporting?.overdue.length) {
    add('red', 'attn.overdueReports', { count: reporting.overdue.length }, 'reporting');
  }
  if (reporting?.returned.length) {
    add('amber', 'attn.returnedReports', { count: reporting.returned.length }, 'reporting');
  }

  if (buckets?.overdue) {
    add('red', 'attn.overdueActivities', { count: buckets.overdue }, 'implementation');
  }
  if (buckets?.delayed) {
    add('amber', 'attn.delayedActivities', { count: buckets.delayed }, 'implementation');
  }

  const overdueCommitments = (commitments ?? [])
    .filter((c) => c.kind === 'nextAction' && c.status === 'overdue').length;
  if (overdueCommitments) {
    add('amber', 'attn.overdueNextActions', { count: overdueCommitments }, 'implementation');
  }

  if (results?.counts.below_target) {
    add('amber', 'attn.belowTarget', { count: results.counts.below_target }, 'results');
  }

  // Expenditure far from the calendar, in either direction, once the project is
  // far enough along for the comparison to mean anything.
  if (isNum(financial?.gapPoints) && isNum(financial?.timeElapsedPct)
      && financial.timeElapsedPct >= HEALTH_RULES.financialGraceTimePct
      && Math.abs(financial.gapPoints) > HEALTH_RULES.financialGap.amber) {
    add(financial.gapPoints < 0 ? 'amber' : 'red',
      financial.gapPoints < 0 ? 'attn.underspend' : 'attn.overspend',
      { gap: Math.abs(financial.gapPoints) }, 'financial');
  }
  if (isNum(financial?.utilisationPct) && financial.utilisationPct > 100) {
    add('red', 'attn.budgetExceeded', { pct: financial.utilisationPct }, 'financial');
  }

  if (completeness && completeness.pct < HEALTH_RULES.dataQuality.amber) {
    add('amber', 'attn.dataIncomplete',
      { done: completeness.done, total: completeness.total }, 'reporting');
  }

  const rank = { red: 0, amber: 1 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// =============================================================================
// Geographic
// =============================================================================

/**
 * Coverage for the selected project only, counted from its own location rows.
 * Activities are attributed to a province through the province an officer
 * recorded on the activity, which is the only geographic link activities carry.
 */
export function geographicSummary(locations = [], activities = []) {
  const byProvince = new Map();
  for (const l of locations) {
    if (!l.province) continue;
    const e = byProvince.get(l.province) ?? {
      province: l.province, sites: 0, beneficiaries: null, islands: new Set(),
      communities: new Set(), activities: 0,
    };
    e.sites += 1;
    if (l.island) e.islands.add(l.island);
    if (l.community) e.communities.add(l.community);
    const b = num(l.beneficiaries);
    if (isNum(b)) e.beneficiaries = (e.beneficiaries ?? 0) + b;
    byProvince.set(l.province, e);
  }
  for (const a of activities) {
    if (!a.province) continue;
    const e = byProvince.get(a.province);
    if (e) e.activities += 1;
  }

  const provinces = [...byProvince.values()].map((e) => ({
    ...e,
    islands: [...e.islands],
    communities: [...e.communities],
  }));

  return {
    provinces,
    counts: Object.fromEntries(provinces.map((p) => [p.province, p.sites])),
    provinceCount: provinces.length,
    islandCount: new Set(locations.map((l) => l.island).filter(Boolean)).size,
    communityCount: new Set(locations.map((l) => l.community).filter(Boolean)).size,
    siteCount: locations.length,
  };
}
