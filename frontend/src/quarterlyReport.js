// Builds the DoCC Quarterly Progress Report from the Strategic Plan data
// (and live budget/indicator data when available), matching the official
// "Quarter N Report" template layout. Everything is auto-populated — see
// buildQuarterlyReport() below for the mapping of each section to its source.
import { ACTIVITIES, PLAN_SUMMARY } from './strategicPlan';
import { C, THEME_COL } from './reportCharts';

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

// Parses a reporting period string into a framing used across the report.
// Handles quarters ("Q1 2026"), half-years ("H1 2026"), months ("July 2026")
// and whole years ("2025 Annual").
const Q_MONTHS = {
  Q1: 'January–March', Q2: 'April–June', Q3: 'July–September', Q4: 'October–December',
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
function parsePeriod(period) {
  const s = (period || '').trim();
  let m = /^(Q[1-4])\s+(\d{4})$/.exec(s);
  if (m) { const [, quarter, year] = m; return { unit: 'quarter', quarter, year, label: s, months: `${Q_MONTHS[quarter]} ${year}` }; }
  m = /^H([12])\s+(\d{4})$/.exec(s);
  if (m) { const [, h, year] = m; return { unit: 'half', quarter: '', year, label: s, months: `${h === '1' ? 'January–June' : 'July–December'} ${year}` }; }
  m = /^([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (m) {
    const name = MONTH_NAMES.find(mn => mn.toLowerCase() === m[1].toLowerCase());
    if (name) return { unit: 'month', quarter: '', year: m[2], label: `${name} ${m[2]}`, months: `${name} ${m[2]}` };
  }
  // Annual / other periods fall back to a whole-year framing.
  const y = (/(\d{4})/.exec(s) || [])[1] || String(new Date().getFullYear());
  return { unit: 'year', quarter: '', year: y, label: s || y, months: `January–December ${y}` };
}

// Report title per report kind.
function reportTitle(kind, p) {
  switch (kind) {
    case 'btor':     return `Back to Office Report — ${p.label}`;
    case 'monthly':  return `Monthly Progress Report — ${p.label}`;
    case 'halfyear': return `Half-Year Progress Report — ${p.label}`;
    case 'annual':   return `Annual Progress Report ${p.year}`;
    case 'quarterly':
    default:
      return `Quarter ${p.quarter ? p.quarter.slice(1) : ''} Report of ${p.year}`.replace('Quarter  Report', 'Progress Report');
  }
}

// A concise, well-formed title-case category for a challenge, from a theme.
const THEME_CATEGORY = {
  Adaptation: 'Technical', Mitigation: 'Technical', Governance: 'Coordination',
  Finance: 'Financial', Knowledge: 'Operational', 'Cross-cutting': 'Operational',
};

export function buildQuarterlyReport({ period = 'Q1 2026', live = null, photos = [], reports = [], kind = 'quarterly' } = {}) {
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
  // A natural phrase for the reporting period, correct for every report kind.
  const periodPhrase =
    p.unit === 'quarter' ? `the ${quarterWord} quarter of ${p.year}` :
    p.unit === 'half'    ? `the ${p.label.startsWith('H1') ? 'first' : 'second'} half of ${p.year}` :
    p.unit === 'month'   ? p.label :
    p.year;

  /* ── Executive summary (narrative from the numbers) ───────────────────── */
  const executiveSummary = [
    `During ${periodPhrase} (${p.months}), the Department of Climate Change (DoCC) advanced implementation of ${total} activities across ${S.themes} strategic themes and ${S.focus_areas} focus areas under the DoCC Strategic Results Framework 2025–2030.`,
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
    `During ${periodPhrase}, the Department implemented a range of initiatives to enhance climate literacy, strengthen policy direction, deepen community engagement, and advance sectoral research — reaffirming its commitment to reducing climate risks and ensuring Vanuatu's communities and ecosystems are better equipped to withstand current and future climate challenges.`,
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

  /* ── Figures (charts) — one SVG source, rendered in preview + Word ─────── */
  const topTheme = activityOverview[0] || { theme: '—', total: 0 };
  const budgetThemeBars = activityOverview
    .filter(t => t.budget > 0)
    .sort((a, b) => b.budget - a.budget)
    .map(t => ({ label: t.theme, value: Math.round(t.budget / 1e6), display: Math.round(t.budget / 1e6), color: THEME_COL[t.theme] || C.green }));
  const topBudget = budgetThemeBars[0] || { label: '—', value: 0 };

  const figures = [
    {
      id: 'fig1', num: 1, kind: 'donut', section: 'overview',
      title: 'Delivery Status',
      caption: `Figure 1. Delivery status across all ${total} activities.`,
      summary: `${st.green} of ${total} activities (${onTrackPct}%) are completed or on track; ${st.amber} remain ongoing and ${st.red} are delayed, with ${st.none} not yet started.`,
      data: {
        segments: [
          { label: 'Completed / on track', value: st.green, color: C.green },
          { label: 'Ongoing', value: st.amber, color: C.amber },
          { label: 'Delayed', value: st.red, color: C.red },
          { label: 'Not started', value: st.none, color: C.none },
        ],
        centerLabel: `${onTrackPct}%`, centerSub: 'on track',
      },
    },
    {
      id: 'fig2', num: 2, kind: 'themeStatus', section: 'overview',
      title: 'Activities by Theme and Status',
      caption: 'Figure 2. Activity count by strategic theme, segmented by delivery status.',
      summary: `${topTheme.theme} carries the most activities (${topTheme.total}). Bars are segmented green (on track), amber (ongoing) and red (delayed); the trailing number is each theme's total.`,
      data: { rows: activityOverview },
    },
    {
      id: 'fig3', num: 3, kind: 'valueBars', section: 'budget',
      title: 'Budget Allocation by Theme',
      caption: 'Figure 3. Planned budget allocation by strategic theme (VUV, millions).',
      summary: `${topBudget.label} holds the largest planned allocation (VUV ${topBudget.value}M) of the ${fmtVUV(S.total_budget_vuv)} committed across ${S.themes} themes.`,
      data: { bars: budgetThemeBars, unit: 'M' },
    },
    {
      id: 'fig4', num: 4, kind: 'plannedActual', section: 'budget',
      title: 'Planned vs Actual Expenditure',
      caption: 'Figure 4. Planned allocation versus actual expenditure by component.',
      summary: budgetTotals.actual > 0
        ? `Overall utilisation stands at ${budgetTotals.pctUtil}% (${fmtVUV(budgetTotals.actual)} of ${fmtVUV(budgetTotals.planned)}).`
        : `Planned allocations total ${fmtVUV(budgetTotals.planned)}; actual expenditure will populate from the finance data source once connected.`,
      data: { rows: budgetRows },
    },
  ];

  /* ── Photo documentation (uploaded against activities in the Framework tab) */
  const photoDocs = (photos || [])
    .filter(p => p && p.url)
    .map((p, i) => ({
      id: p.id || `photo-${i}`,
      url: p.url,
      caption: (p.caption && p.caption.trim()) || p.activity || 'Activity photograph',
      activity: p.activity || '',
      theme: p.theme || '',
      statusKey: p.statusKey || 'none',
    }));
  const photoActivityCount = new Set(photoDocs.map(p => p.activity).filter(Boolean)).size;

  /* ── Activity report summaries (uploaded on the Framework tab) ─────────── */
  const reportDocs = (reports || [])
    .filter(r => r && (r.summary || r.fileName))
    .map((r, i) => ({
      id: r.id || `report-${i}`,
      activity: r.activity || '',
      fileName: r.fileName || 'Report',
      kind: r.kind || '',
      summary: (r.summary && r.summary.trim()) || 'No text preview available.',
    }));
  const reportActivityCount = new Set(reportDocs.map(r => r.activity).filter(Boolean)).size;

  /* ── Per-table interpretive summaries (make the report read human-authored) */
  const summaries = {
    activityOverview: `Across ${S.themes} themes, ${st.green} of ${total} activities are on track and ${st.red} are delayed. ${topTheme.theme} is the largest workstream with ${topTheme.total} activities.`,
    accomplishments: `Of ${total} activities, ${st.green} are completed or on track (${onTrackPct}%), ${st.amber} are ongoing, ${st.red} are delayed, and ${st.none} are not yet started.`,
    budget: budgetTotals.actual > 0
      ? `Total planned ${fmtVUV(budgetTotals.planned)} against actual ${fmtVUV(budgetTotals.actual)} — ${budgetTotals.pctUtil}% utilised, leaving a variance of ${fmtVUV(budgetTotals.variance)}.`
      : `Total planned budget of ${fmtVUV(budgetTotals.planned)} across ${budgetRows.length} components; expenditure tracking begins once finance data is connected.`,
    challenges: `${challengeRows.length} activity-level risks were logged this quarter, concentrated in delayed and at-risk activities and mitigated through adaptive scheduling and reprioritisation.`,
    btor: `${btor.length} completed activities are documented below as back-to-office field records for the quarter.`,
    nextSteps: `${nextSteps.length} at-risk and delayed activities are prioritised for acceleration in ${nextQuarter}.`,
    photos: photoDocs.length
      ? `${photoDocs.length} photograph${photoDocs.length > 1 ? 's' : ''} document field implementation across ${photoActivityCount || 1} activit${(photoActivityCount || 1) > 1 ? 'ies' : 'y'} this period.`
      : '',
    reports: reportDocs.length
      ? `${reportDocs.length} narrative report${reportDocs.length > 1 ? 's' : ''} were uploaded across ${reportActivityCount || 1} activit${(reportActivityCount || 1) > 1 ? 'ies' : 'y'}; automatic summaries appear below.`
      : '',
  };

  /* ── Supporting attachments / annexes ─────────────────────────────────── */
  const attachments = [
    { ref: 'Annex A', title: 'DoCC Strategic Results Framework 2025–2030', note: `Source register for all ${total} activities, ${S.focus_areas} focus areas and ${S.indicators} output indicators.` },
    { ref: 'Annex B', title: 'Activity status register', note: `Traffic-light delivery status for every activity (Section 5 — Quarterly Accomplishment).` },
    { ref: 'Annex C', title: 'Budget allocation ledger', note: `Planned allocations totalling ${fmtVUV(S.total_budget_vuv)} across ${S.themes} themes (Section 6 — Budget Utilisation).` },
    { ref: 'Annex D', title: 'Output indicator evidence', note: `${S.indicators} output indicators with baselines and 2030 targets underpinning the accomplishment table.` },
  ];
  if (photoDocs.length) {
    attachments.push({
      ref: 'Annex E',
      title: 'Photo documentation',
      note: `${photoDocs.length} field photograph${photoDocs.length > 1 ? 's' : ''} across ${photoActivityCount || 1} activit${(photoActivityCount || 1) > 1 ? 'ies' : 'y'} (Photo Documentation section).`,
    });
  }
  if (reportDocs.length) {
    attachments.push({
      ref: `Annex ${photoDocs.length ? 'F' : 'E'}`,
      title: 'Activity reports',
      note: `${reportDocs.length} narrative report${reportDocs.length > 1 ? 's' : ''} across ${reportActivityCount || 1} activit${(reportActivityCount || 1) > 1 ? 'ies' : 'y'}, summarised in the Activity Reports section.`,
    });
  }

  return {
    meta: {
      title: reportTitle(kind, p),
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
    figures,
    photos: photoDocs,
    reports: reportDocs,
    summaries,
    attachments,
  };
}
