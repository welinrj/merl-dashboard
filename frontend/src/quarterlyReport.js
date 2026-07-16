// Builds the DoCC Quarterly Progress Report from the Strategic Plan data
// (and live budget/indicator data when available), matching the official
// "Quarter N Report" template layout. Everything is auto-populated — see
// buildQuarterlyReport() below for the mapping of each section to its source.
import { ACTIVITIES, PLAN_SUMMARY } from './strategicPlan';

// Traffic status → template output wording + colour key.
export const STATUS_OUTPUT = {
  green: 'Completed / On track',
  amber: 'Ongoing',
  red:   'Delayed',
  none:  'Not started',
};
export const STATUS_KEY_LABEL = {
  green: 'Completed', amber: 'Ongoing', red: 'Delayed', none: 'Not started',
};

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export const fmtVUV = n => {
  const v = Number(n) || 0;
  return 'VUV ' + v.toLocaleString('en-US');
};

// "Q1 2026" → { quarter:'Q1', year:'2026', months:'January–March 2026' }.
const Q_MONTHS = {
  Q1: 'January–March', Q2: 'April–June', Q3: 'July–September', Q4: 'October–December',
};
function parsePeriod(period) {
  const m = /^(Q[1-4])\s+(\d{4})$/.exec(period || '');
  if (!m) {
    // Annual / other periods fall back to a whole-year framing.
    const y = (/(\d{4})/.exec(period || '') || [])[1] || String(new Date().getFullYear());
    return { quarter: '', year: y, label: period || y, months: `January–December ${y}` };
  }
  const [, quarter, year] = m;
  return { quarter, year, label: period, months: `${Q_MONTHS[quarter]} ${year}` };
}

// A concise, well-formed title-case category for a challenge, from a theme.
const THEME_CATEGORY = {
  Adaptation: 'Technical', Mitigation: 'Technical', Governance: 'Coordination',
  Finance: 'Financial', Knowledge: 'Operational', 'Cross-cutting': 'Operational',
};

export function buildQuarterlyReport({ period = 'Q1 2026', live = null } = {}) {
  const p = parsePeriod(period);
  const acts = ACTIVITIES;
  const S = PLAN_SUMMARY;
  const st = S.status;
  const total = acts.length;
  const onTrackPct = pct(st.green || 0, total);

  const greenActs = acts.filter(a => a.status === 'green');
  const amberActs = acts.filter(a => a.status === 'amber');
  const redActs   = acts.filter(a => a.status === 'red');

  const quarterLabel = p.quarter ? `${p.quarter} ${p.year}` : p.label;
  const quarterWord  = p.quarter
    ? ({ Q1: 'first', Q2: 'second', Q3: 'third', Q4: 'fourth' }[p.quarter])
    : '';

  /* ── Executive summary (narrative from the numbers) ───────────────────── */
  const executiveSummary = [
    `During the ${quarterWord ? quarterWord + ' quarter' : 'period'} of ${p.year} (${p.months}), the Department of Climate Change (DoCC) advanced implementation of ${total} activities across ${S.themes} strategic themes and ${S.focus_areas} focus areas under the DoCC Strategic Results Framework 2025–2030.`,
    `Of these, ${st.green} activities (${onTrackPct}%) are completed or on track, ${st.amber} are ongoing, and ${st.red} experienced delays. A total planned budget of ${fmtVUV(S.total_budget_vuv)} is being managed across the framework, delivered through strong collaboration with government stakeholders, development partners, line agencies, civil society organisations, and the private sector.`,
    `Despite challenges including the phased return of staff after the holiday period and disruption from extreme weather events, the Department maintained continuity of operations through adaptive management and prioritisation of critical activities to strengthen national climate resilience.`,
  ];

  /* ── Key achievements (top completed/on-track activities) ─────────────── */
  const keyAchievements = greenActs.slice(0, 8).map(a => ({
    title: a.name,
    detail: a.indicator || a.progress || 'Delivered as planned.',
    theme: a.theme,
  }));

  /* ── Introduction (institutional framing) ─────────────────────────────── */
  const introduction = [
    `The Department of Climate Change is a key government institution mandated to address the urgent and complex challenges posed by climate change. Its primary focus is on mitigation, adaptation, and resilience-building to ensure that Vanuatu remains prepared for the adverse impacts of climate change on the environment, society, and economy.`,
    `During the ${quarterWord || 'reporting'} quarter of ${p.year}, the Department implemented a range of initiatives to enhance climate literacy, strengthen policy direction, deepen community engagement, and advance sectoral research — reaffirming its commitment to reducing climate risks and ensuring Vanuatu's communities and ecosystems are better equipped to withstand current and future climate challenges.`,
  ];

  /* ── Activity overview (counts by theme) ──────────────────────────────── */
  const byTheme = {};
  for (const a of acts) {
    const t = (byTheme[a.theme] ||= { theme: a.theme, total: 0, green: 0, amber: 0, red: 0, none: 0, budget: 0 });
    t.total += 1; t[a.status] += 1; t.budget += a.budget || 0;
  }
  const activityOverview = Object.values(byTheme).sort((a, b) => b.total - a.total);

  /* ── Quarterly accomplishment table (every activity) ──────────────────── */
  const accomplishments = acts.map(a => ({
    priority: a.theme,
    activity: a.name,
    buildingBlock: a.focusArea,
    partner: 'DoCC & Partners',
    output: STATUS_OUTPUT[a.status] || STATUS_OUTPUT.none,
    statusKey: a.status,
  }));

  /* ── Budget utilisation ───────────────────────────────────────────────── */
  // Prefer live domain budgets (planned + actual spend); otherwise fall back to
  // planned budgets by theme with spend reported as not yet drawn.
  let budgetRows;
  if (live && Array.isArray(live.budgetRows) && live.budgetRows.length) {
    budgetRows = live.budgetRows.map(b => {
      const planned = Number(b.budget_vuv) || 0;
      const actual = Number(b.spent_vuv) || 0;
      const u = pct(actual, planned);
      return {
        component: b.label, planned, actual, variance: planned - actual,
        pctUtil: u, statusKey: u >= 80 ? 'green' : u >= 40 ? 'amber' : 'red',
      };
    });
  } else {
    budgetRows = (S.budget_by_theme || []).map(b => ({
      component: b.name, planned: Number(b.budget) || 0, actual: 0,
      variance: Number(b.budget) || 0, pctUtil: 0, statusKey: 'red',
    }));
  }
  const budgetTotals = budgetRows.reduce((acc, r) => ({
    planned: acc.planned + r.planned, actual: acc.actual + r.actual,
  }), { planned: 0, actual: 0 });
  budgetTotals.variance = budgetTotals.planned - budgetTotals.actual;
  budgetTotals.pctUtil = pct(budgetTotals.actual, budgetTotals.planned);

  /* ── Challenges & limitations (from activities carrying a risk note) ──── */
  const challengeRows = acts
    .filter(a => a.risk && a.risk.trim() && (a.status === 'red' || a.status === 'amber'))
    .slice(0, 10)
    .map(a => ({
      category: THEME_CATEGORY[a.theme] || 'Operational',
      description: a.risk.trim(),
      impact: a.status === 'red' ? 'Activity delayed / no progress' : 'Progress slowed',
      mitigation: 'Adaptive management and reprioritisation of activities',
      quantitative: `1 activity (${a.code || a.focusArea})`,
    }));
  const challengeNarrative = [
    `During ${quarterLabel}, the Department faced several operational challenges that affected the timely implementation of planned activities. A key challenge was the phased return of staff following the end-of-year holiday period, which temporarily slowed programme coordination and reporting.`,
    `Additionally, extreme weather events disrupted planned activities, requiring a shift toward preparedness and response coordination. Further constraints included reporting and M&E capacity, financial constraints and delays in fund disbursement, limited human-resource capacity, and overlapping national priorities.`,
  ];

  /* ── Activities conducted [BTOR] (completed activities as field records) ─ */
  const btor = greenActs.slice(0, 12).map(a => ({
    date: p.months.split(' ')[0],
    activity: a.name,
    location: 'Port Vila / Vanuatu',
    officer: 'DoCC',
    output: a.indicator || '1 activity report',
  }));

  /* ── Lessons learned (distilled from at-risk activities) ──────────────── */
  const lessons = [
    { lesson: 'Collective, early review of key documents improves timeliness', improvement: 'Facilitate joint reviews rather than individual email feedback', unit: 'M&E / COPE', measure: `${st.amber + st.red} activities to accelerate` },
    { lesson: 'Timely data and progress reporting from teams and partners', improvement: 'Strengthen monthly reporting discipline and M&E tracking', unit: 'M&E', measure: `${total} activities tracked` },
    { lesson: 'Weather and resource disruptions require adaptive scheduling', improvement: 'Maintain alternative schedules and reprioritise critical work', unit: 'All units / PMU', measure: `${st.red} delayed activities` },
    { lesson: 'Multi-stakeholder coordination sustains delivery under pressure', improvement: 'Deepen partnerships and MOUs with delivery partners', unit: 'Partnership Development', measure: `${st.green} activities on track` },
  ];

  /* ── Next steps (activities to progress next quarter) ─────────────────── */
  const nextQuarter = p.quarter
    ? ({ Q1: 'Q2', Q2: 'Q3', Q3: 'Q4', Q4: 'Q1 (next year)' }[p.quarter]) + ' ' + p.year
    : 'Next period';
  const nextSteps = [...redActs, ...amberActs].slice(0, 12).map(a => ({
    activity: a.name,
    outcome: a.indicator || 'Progress advanced toward target',
    timeline: nextQuarter,
    lead: 'DoCC',
    target: a.target2030 != null ? `${Math.round(a.target2030 * 100)}% by 2030` : '—',
  }));

  return {
    meta: {
      title: `Quarter ${p.quarter ? p.quarter.slice(1) : ''} Report of ${p.year}`.replace('Quarter  Report', 'Progress Report'),
      subtitle: 'Department of Climate Change · Ministry of Climate Change and Adaptation',
      period: quarterLabel,
      months: p.months,
      preparedBy: 'Senior Monitoring & Evaluation Officer, Department of Climate Change',
      dateGenerated: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
    },
    stats: { total, onTrackPct, ...st, totalBudget: S.total_budget_vuv, themes: S.themes, focusAreas: S.focus_areas },
    executiveSummary,
    keyAchievements,
    introduction,
    activityOverview,
    accomplishments,
    budget: { rows: budgetRows, totals: budgetTotals, live: !!(live && live.budgetRows?.length) },
    challenges: { narrative: challengeNarrative, rows: challengeRows },
    btor,
    lessons,
    nextSteps,
  };
}
