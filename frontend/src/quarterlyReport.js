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

// A plain-language word for the report cadence, used in the introduction.
const KIND_WORD = {
  btor: 'back-to-office', monthly: 'monthly', halfyear: 'half-year',
  annual: 'annual', quarterly: 'quarterly',
};

// Master acronym register for DoCC reports. A fixed, comprehensive glossary is
// standard front-matter for these documents; the report includes the full list
// so any acronym used in the narrative or tables is defined for the reader.
const REPORT_ACRONYMS = [
  ['CCA', 'Climate Change Adaptation'],
  ['CCDRR', 'Climate Change and Disaster Risk Reduction (Policy 2016–2030)'],
  ['CSO', 'Civil Society Organisation'],
  ['DoCC', 'Department of Climate Change'],
  ['DoE', 'Department of Energy'],
  ['DRM', 'Disaster Risk Management'],
  ['DRR', 'Disaster Risk Reduction'],
  ['GCF', 'Green Climate Fund'],
  ['GEDSI', 'Gender Equality, Disability and Social Inclusion'],
  ['GEF', 'Global Environment Facility'],
  ['GHG', 'Greenhouse Gas'],
  ['KPI', 'Key Performance Indicator'],
  ['L&D', 'Loss and Damage'],
  ['LDCF', 'Least Developed Countries Fund'],
  ['LDWG', 'Loss and Damage Working Group'],
  ['M&E', 'Monitoring and Evaluation'],
  ['MERL', 'Monitoring, Evaluation, Reporting and Learning'],
  ['MFAT', 'Ministry of Foreign Affairs and Trade (New Zealand)'],
  ['MoCC', 'Ministry of Climate Change'],
  ['MoV', 'Means of Verification'],
  ['MRV', 'Monitoring, Reporting and Verification'],
  ['NAB', 'National Advisory Board on Climate Change and Disaster Risk Reduction'],
  ['NAP', 'National Adaptation Plan'],
  ['NAPA', 'National Adaptation Programme of Action'],
  ['NDC', 'Nationally Determined Contribution'],
  ['NDMO', 'National Disaster Management Office'],
  ['NERM', 'National Energy Road Map'],
  ['NIE', 'National Implementing Entity'],
  ['NSDP', 'National Sustainable Development Plan (Vanuatu 2030)'],
  ['RBM', 'Results-Based Management'],
  ['REDD+', 'Reducing Emissions from Deforestation and Forest Degradation'],
  ['SRF', 'Strategic Results Framework'],
  ['UNFCCC', 'United Nations Framework Convention on Climate Change'],
  ['VCAP', 'Vanuatu Coastal Adaptation Project'],
  ['VMGD', 'Vanuatu Meteorology and Geo-Hazards Department'],
  ['VUV', 'Vanuatu Vatu (national currency)'],
].map(([abbr, full]) => ({ abbr, full }));

// A concise, well-formed title-case category for a challenge, from a theme.
const THEME_CATEGORY = {
  Adaptation: 'Technical', Mitigation: 'Technical', Governance: 'Coordination',
  Finance: 'Financial', Knowledge: 'Operational', 'Cross-cutting': 'Operational',
};

// Live SRF activity status → the report's green/amber/red/none coding.
const SRF_STATUS = { on_track: 'green', at_risk: 'amber', no_progress: 'red', unrated: 'none' };
const REPORT_DOC_LABEL = {
  annual_workplan: 'Annual Workplan', back_to_office: 'Back to Office', monthly_report: 'Monthly',
  quarterly_report: 'Quarterly', six_month_report: '6-Month', annual_report: 'Annual',
};
const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymShort = (ym) => {
  if (!ym || ym === 'unknown') return 'Undated';
  const [y, m] = ym.split('-').map(Number);
  return m ? `${SHORT_MONTH[m - 1]} ${y}` : ym;
};
const fmtDMY = (d) => { try { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return String(d); } };

// Normalise live v_srf_activities rows to the embedded activity shape so the
// whole report can be built from live data when it's available.
function normalizeLiveActivities(rows) {
  return (rows || []).filter(Boolean).map(r => ({
    code: r.code, name: r.name, theme: r.theme, focusArea: r.focus_area,
    indicator: r.indicator, budget: Number(r.budget_vuv || 0),
    status: SRF_STATUS[r.status] || 'none', progress: r.progress, risk: r.risk,
    target2030: r.target_2030 == null ? null : Number(r.target_2030),
  }));
}

// Derive the plan-summary figures (status split, themes, budget by theme) from a
// set of activities, so the report reflects live data rather than a static
// snapshot. Deriving from the embedded ACTIVITIES reproduces PLAN_SUMMARY.
function derivePlan(acts) {
  const status = { green: 0, amber: 0, red: 0, none: 0 };
  const themes = new Set(), focus = new Set(), themeBudget = {};
  let budget = 0, indicators = 0;
  for (const a of acts) {
    status[a.status] = (status[a.status] || 0) + 1;
    if (a.theme) themes.add(a.theme);
    if (a.focusArea) focus.add(a.focusArea);
    if (a.indicator && String(a.indicator).trim()) indicators += 1;
    const b = Number(a.budget) || 0;
    budget += b;
    if (a.theme) themeBudget[a.theme] = (themeBudget[a.theme] || 0) + b;
  }
  return {
    themes: themes.size, focus_areas: focus.size, activities: acts.length,
    indicators: indicators || PLAN_SUMMARY.indicators, total_budget_vuv: budget,
    status, budget_by_theme: Object.entries(themeBudget).map(([name, b]) => ({ name, budget: b })),
  };
}

// The set of 'YYYY-MM' months covered by a parsed reporting period, used to
// scope "activities conducted" to the period actually being reported on.
function monthsInPeriod(p) {
  const y = Number(p.year);
  const set = [];
  const add = (mm) => set.push(`${y}-${String(mm).padStart(2, '0')}`);
  if (p.unit === 'month') {
    const mi = MONTH_NAMES.findIndex(n => p.label.toLowerCase().startsWith(n.toLowerCase()));
    if (mi >= 0) add(mi + 1);
  } else if (p.unit === 'quarter') {
    const q = Number(p.quarter.slice(1)); const start = (q - 1) * 3 + 1;
    for (let m = start; m < start + 3; m++) add(m);
  } else if (p.unit === 'half') {
    const start = p.label.startsWith('H1') ? 1 : 7;
    for (let m = start; m < start + 6; m++) add(m);
  } else {
    for (let m = 1; m <= 12; m++) add(m);
  }
  return set;
}

export function buildQuarterlyReport({ period = 'Q1 2026', live = null, photos = [], reports = [], kind = 'quarterly', activities = null, reportActivities = [], project = '' } = {}) {
  const p = parsePeriod(period);
  // Prefer live SRF activities (what officers edit on the Framework tab); fall
  // back to the embedded plan snapshot when live data isn't available.
  const liveActs = normalizeLiveActivities(activities);
  const usingLive = liveActs.length > 0;
  const acts = usingLive ? liveActs : ACTIVITIES;
  const S = derivePlan(acts);
  const st = S.status;
  const total = acts.length;
  const onTrackPct = pct(st.green || 0, total);

  const greenActs = acts.filter(a => a.status === 'green');
  const amberActs = acts.filter(a => a.status === 'amber');
  const redActs   = acts.filter(a => a.status === 'red');

  /* ── Activities actually conducted in the reporting period ───────────────
     Scoped from the activities the portal extracted from submitted reports,
     which carry a month and the submitting officer — so monthly / BTOR /
     quarterly reports show what was done in the period, and by whom. */
  const allowedMonths = new Set(monthsInPeriod(p));
  const projSel = (project || '').trim().toLowerCase();
  const conducted = (reportActivities || [])
    .filter(Boolean)
    .filter(a => {
      const month = a.activity_month || (a.activity_date ? String(a.activity_date).slice(0, 7) : '');
      if (!month || !allowedMonths.has(month)) return false;
      if (projSel) {
        const pn = (a.project_name || '').toLowerCase();
        return pn === projSel || pn.includes(projSel) || projSel.includes(pn);
      }
      return true;
    })
    .sort((a, b) => String(b.activity_date || b.activity_month || '').localeCompare(String(a.activity_date || a.activity_month || '')));

  const byMonthMap = new Map(), byOfficerMap = new Map();
  conducted.forEach(a => {
    const m = a.activity_month || (a.activity_date ? String(a.activity_date).slice(0, 7) : 'unknown');
    byMonthMap.set(m, (byMonthMap.get(m) || 0) + 1);
    const o = a.submitted_by || '—';
    byOfficerMap.set(o, (byOfficerMap.get(o) || 0) + 1);
  });
  const conductedByMonth = [...byMonthMap.entries()].sort((x, y) => x[0].localeCompare(y[0])).map(([month, count]) => ({ month, count }));
  const conductedByOfficer = [...byOfficerMap.entries()].sort((x, y) => y[1] - x[1]).map(([officer, count]) => ({ officer, count }));

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

  /* ── Period-appropriate challenge framing ─────────────────────────────────
     The end-of-year holiday return only applies to Q1 / Jan–Feb reports, and
     extreme-weather disruption to the Nov–Apr cyclone season, so the narrative
     reflects the months actually being reported on rather than a fixed sentence. */
  const periodMonthNums = new Set(monthsInPeriod(p).map(m => Number(m.slice(5, 7))));
  const holidayReturn = periodMonthNums.has(1) || periodMonthNums.has(2);
  const cycloneSeason = [11, 12, 1, 2, 3, 4].some(m => periodMonthNums.has(m));
  const opsChallengePhrase = holidayReturn
    ? 'the phased return of staff following the end-of-year holiday period'
    : 'competing operational priorities and scheduling pressures across concurrent workstreams';
  const weatherClause = cycloneSeason ? ' and disruption from extreme weather events' : '';

  /* ── Executive summary (narrative from the numbers) ───────────────────── */
  const executiveSummary = [
    `During ${periodPhrase} (${p.months}), the Department of Climate Change (DoCC) advanced implementation of ${total} activities across ${S.themes} strategic themes and ${S.focus_areas} focus areas under the DoCC Strategic Results Framework 2025–2030.`,
    `Of these, ${st.green} activities (${onTrackPct}%) are completed or on track, ${st.amber} are ongoing, and ${st.red} experienced delays. A total planned budget of ${fmtVUV(S.total_budget_vuv)} is being managed across the framework, delivered through strong collaboration with government stakeholders, development partners, line agencies, civil society organisations, and the private sector.`,
    `Despite challenges including ${opsChallengePhrase}${weatherClause}, the Department maintained continuity of operations through adaptive management and prioritisation of critical activities to strengthen national climate resilience.`,
  ];
  if (conducted.length) {
    executiveSummary.push(
      `During this reporting period, ${conducted.length} activit${conducted.length > 1 ? 'ies were' : 'y was'} carried out and reported by ${conductedByOfficer.length} officer${conductedByOfficer.length > 1 ? 's' : ''}${conductedByMonth.length > 1 ? ` across ${conductedByMonth.length} months` : ''}, as detailed in the Activities Conducted section.`,
    );
  }

  /* ── Key achievements (top completed/on-track activities) ─────────────── */
  const keyAchievements = greenActs.slice(0, 8).map(a => ({
    title: a.name,
    detail: a.indicator || a.progress || 'Delivered as planned.',
    theme: a.theme,
  }));

  /* ── Introduction (institutional framing) ─────────────────────────────── */
  const kindWord = KIND_WORD[kind] || 'progress';
  const introduction = [
    `The Department of Climate Change (DoCC), under the Ministry of Climate Change (MoCC), is the Government of Vanuatu's mandated institution for the coordination and implementation of all climate change adaptation, mitigation and disaster risk management across the country, established under the Meteorology, Geological Hazards and Climate Change Act No. 25 of 2016.`,
    `Guided by its vision to build a sustainable and climate-resilient Vanuatu, the Department is the national focal point for climate change. It supports the National Advisory Board on Climate Change and Disaster Risk Reduction (NAB), mainstreams climate change across government in line with the National Sustainable Development Plan (NSDP) 2016–2030 — Vanuatu 2030: The People's Plan — operationalises the Climate Change and Disaster Risk Reduction (CCDRR) Policy 2016–2030, and coordinates Vanuatu's obligations under the UNFCCC and the Paris Agreement.`,
    `Vanuatu is among the most climate-vulnerable nations on Earth, yet contributes only 0.0016% of global greenhouse-gas emissions. Recurrent extreme events — including Cyclones Pam (2015), Harold (2020), and Kevin and Judy (2023) — have each caused economic losses exceeding USD 500 million, compounded by slow-onset impacts such as sea-level rise, coastal erosion and the salinisation of productive land. This context frames the Department's work programme and the results reported here.`,
    `This ${kindWord} report presents the Department's implementation progress for ${periodPhrase} against the DoCC Strategic Results Framework 2025–2030. It reports delivery across ${total} activities within ${S.themes} strategic themes — Adaptation, Mitigation, Governance, Finance, Knowledge and Cross-cutting — using a Results-Based Management (RBM) approach with traffic-light (red/amber/green) performance status, and consolidates key achievements, budget utilisation, challenges, lessons learned and priorities for the coming period.`,
    `The report is generated from the Department's Monitoring, Evaluation, Reporting and Learning (MERL) platform, drawing on live activity data, field evidence recorded as Means of Verification (MoV), and narrative reports submitted by responsible officers — reaffirming the Department's commitment to transparency, accountability and evidence-based decision-making in strengthening national climate resilience.`,
  ];

  /* ── Activity overview (counts by theme) ──────────────────────────────── */
  const byTheme = {};
  for (const a of acts) {
    const t = (byTheme[a.theme] ||= { theme: a.theme, total: 0, green: 0, amber: 0, red: 0, none: 0, budget: 0 });
    t.total += 1; t[a.status] += 1; t.budget += a.budget || 0;
  }
  const activityOverview = Object.values(byTheme).sort((a, b) => b.total - a.total);

  /* ── Quarterly accomplishment table (every activity) ──────────────────────
     Reports the output/result delivered (the activity's output indicator, or
     its progress note) and the means of verification (the evidence actually on
     file — uploaded activity reports / photographs — else the SRF register). */
  const evidence = {};
  (photos || []).forEach(pp => { const k = pp && pp.activity; if (!k) return; (evidence[k] ??= { photos: 0, reports: 0 }).photos += 1; });
  (reports || []).forEach(rr => { const k = rr && rr.activity; if (!k) return; (evidence[k] ??= { photos: 0, reports: 0 }).reports += 1; });
  const outputFor = (a) => {
    const ind = (a.indicator || '').trim();
    if (ind) return ind;
    const prog = (a.progress || '').trim();
    if (prog && !/^no\s+(progress|data)/i.test(prog)) return prog;
    return STATUS_OUTPUT[a.status] || STATUS_OUTPUT.none;
  };
  const movFor = (a) => {
    const ev = evidence[a.name];
    const parts = [];
    if (ev?.reports) parts.push(`${ev.reports} activity report${ev.reports > 1 ? 's' : ''}`);
    if (ev?.photos) parts.push(`${ev.photos} photograph${ev.photos > 1 ? 's' : ''}`);
    if (!parts.length) parts.push('SRF activity register / progress note');
    return parts.join('; ');
  };
  const accomplishments = acts.map(a => ({
    activity: a.name,
    theme: a.theme,
    focusArea: a.focusArea,
    output: outputFor(a),
    mov: movFor(a),
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
    `During ${quarterLabel}, the Department faced several operational challenges that affected the timely implementation of planned activities. A key challenge was ${opsChallengePhrase}, which temporarily slowed programme coordination and reporting.`,
    `${cycloneSeason ? 'Additionally, extreme weather events disrupted planned activities, requiring a shift toward preparedness and response coordination. ' : ''}Further constraints included reporting and M&E capacity, financial constraints and delays in fund disbursement, limited human-resource capacity, and overlapping national priorities.`,
  ];

  /* ── Activities conducted [BTOR] (completed activities as field records) ─ */
  // Prefer the real activities conducted in the period (with their dates and
  // officers); fall back to completed framework activities when no reports have
  // been submitted for the period yet.
  const btor = conducted.length
    ? conducted.slice(0, 60).map(a => ({
        date: a.activity_date ? fmtDMY(a.activity_date) : ymShort(a.activity_month),
        activity: a.description,
        location: a.project_name || '—',
        officer: a.submitted_by || 'DoCC',
        output: REPORT_DOC_LABEL[a.doc_type] || 'Activity report',
      }))
    : greenActs.slice(0, 12).map(a => ({
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

  /* ── Detailed activity reports (one full write-up per activity) ────────────
     A proper narrative section per activity, not a one-line summary. Built from
     the activities actually conducted in the period (their reported description,
     date, officer and project), enriched with the matching Strategic Results
     Framework record (theme, focus area, indicator, target, status, risk). When
     no field reports have been submitted, the in-progress framework activities
     are written up from their own register fields instead. */
  const titleFrom = (text) => {
    const t = (text || '').trim().replace(/\s+/g, ' ');
    if (!t) return 'Activity';
    const first = t.split('. ')[0];
    const words = first.split(' ');
    const s = words.length > 16 ? words.slice(0, 16).join(' ') + '…' : first.replace(/\.$/, '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const matchSrf = (text) => {
    const t = (text || '').toLowerCase();
    if (!t) return null;
    let best = null, bestScore = 0;
    for (const a of acts) {
      const nm = (a.name || '').toLowerCase();
      if (!nm) continue;
      let s = 0;
      for (const w of nm.split(/\W+/)) if (w.length > 4 && t.includes(w)) s += 1;
      if (s > bestScore) { bestScore = s; best = a; }
    }
    return bestScore >= 2 ? best : null;
  };
  const arSource = conducted.length ? conducted.slice(0, 40) : [...greenActs, ...amberActs].slice(0, 12);
  const activityReports = arSource.map((item, i) => {
    const isConducted = !!item.description;
    const srf = isConducted ? matchSrf(item.description) : item;
    const title = isConducted ? titleFrom(item.description) : (item.name || 'Activity');
    const theme = (srf && srf.theme) || item.theme || '—';
    const focusArea = (srf && srf.focusArea) || item.focusArea || '';
    const code = (srf && srf.code) || item.code || '';
    const indicator = (srf && srf.indicator) || item.indicator || '';
    const target = srf && srf.target2030 != null ? `${Math.round(srf.target2030 * 100)}% by 2030` : '';
    const activityBudget = (srf && srf.budget) || item.budget || 0;
    const risk = (srf && srf.risk) || item.risk || '';
    const statusKey = (srf && srf.status) || item.status || 'none';
    const date = isConducted ? (item.activity_date ? fmtDMY(item.activity_date) : ymShort(item.activity_month)) : p.months;
    const location = isConducted ? (item.project_name || '—') : (project || 'DoCC Strategic Results Framework 2025–2030');
    const officer = isConducted ? (item.submitted_by || 'Department of Climate Change') : 'Department of Climate Change';
    const source = isConducted ? (REPORT_DOC_LABEL[item.doc_type] || 'Activity report') : 'SRF activity register';
    const ev = evidence[title] || evidence[item.name] || null;

    const alignment = focusArea
      ? `This activity is delivered under the ${theme} theme of the DoCC Strategic Results Framework 2025–2030, within the focus area "${focusArea}"${code ? ` (activity ${code})` : ''}. It contributes to the Department's mandate to coordinate and implement climate change adaptation, mitigation and disaster risk management, in line with the National Sustainable Development Plan (Vanuatu 2030).`
      : `This activity was undertaken under ${location} during ${date} as part of the Department's climate change work programme under the Strategic Results Framework 2025–2030.`;
    const descText = isConducted
      ? item.description.trim()
      : ((item.progress && item.progress.trim() && !/^no\s+(progress|data)/i.test(item.progress))
          ? item.progress.trim()
          : `Implementation of this activity progressed during ${periodPhrase}. ${STATUS_OUTPUT[statusKey] || ''}`.trim());
    const outputs = indicator
      ? `The activity contributes to the output indicator: ${indicator}.${target ? ` Framework target: ${target}.` : ''}`
      : `Outputs are as documented in the source ${isConducted ? 'report' : 'register'} for this activity.`;
    const movParts = [];
    if (ev?.reports) movParts.push(`${ev.reports} narrative report${ev.reports > 1 ? 's' : ''}`);
    if (ev?.photos) movParts.push(`${ev.photos} field photograph${ev.photos > 1 ? 's' : ''}`);
    if (isConducted) movParts.push(`source document (${source}, submitted by ${officer})`);
    if (!movParts.length) movParts.push('Strategic Results Framework register and officer progress notes');
    const mov = movParts.join('; ') + '.';
    const challenges = risk
      ? risk.trim()
      : statusKey === 'red' ? 'Implementation was delayed during the reporting period. The activity is prioritised for acceleration in the next cycle.'
      : statusKey === 'amber' ? 'Implementation is ongoing; minor scheduling and coordination constraints were managed through adaptive planning.'
      : 'No significant challenges were reported for this activity during the period.';
    const remarks = statusKey === 'green' ? 'The activity was delivered as planned and its outputs are on track against the 2025–2030 framework targets.'
      : statusKey === 'amber' ? 'The activity remains in progress and will continue into the next reporting period.'
      : statusKey === 'red' ? 'The activity requires management attention and is carried forward as a priority for the next period.'
      : 'The activity is scheduled to commence in a forthcoming reporting period.';

    return {
      n: i + 1, title, date, period: quarterLabel, location, officer, source,
      theme, focusArea, code, statusKey, budget: activityBudget,
      facts: [
        ['Reporting period', quarterLabel],
        ['Date conducted', date],
        ['Project / location', location],
        ['Responsible officer', officer],
        ['Strategic theme', theme],
        ...(focusArea ? [['Focus area', focusArea]] : []),
        ...(code ? [['SRF activity code', code]] : []),
        ['Delivery status', STATUS_KEY_LABEL[statusKey]],
        ...(activityBudget ? [['Indicative budget (VUV)', activityBudget.toLocaleString('en-US')]] : []),
      ],
      alignment, description: descText, outputs, mov, challenges, remarks,
    };
  });

  /* ── Conclusion & recommendations ─────────────────────────────────────── */
  const conclusion = [
    `In summary, during ${periodPhrase} the Department of Climate Change advanced the implementation of ${total} activities across ${S.themes} strategic themes, with ${st.green} activities (${onTrackPct}%) completed or on track and ${st.red} experiencing delays. A total planned budget of ${fmtVUV(S.total_budget_vuv)} is being managed across the Strategic Results Framework 2025–2030.`,
    `The Department reaffirms its commitment to building a sustainable and climate-resilient Vanuatu. It will continue to strengthen coordination with government stakeholders, development partners, civil society organisations and communities to accelerate delivery and address the challenges identified in this report.`,
  ];
  const recommendations = [
    `Accelerate the ${st.red + st.amber} delayed and at-risk activities through focused work-planning and adaptive scheduling during ${nextQuarter}.`,
    `Strengthen monthly progress and M&E reporting discipline across all units and delivery partners to maintain a complete and verifiable evidence base.`,
    `Prioritise resource mobilisation and timely fund disbursement to sustain implementation momentum across the Framework.`,
    budgetTotals.actual > 0
      ? `Improve budget execution against the ${fmtVUV(budgetTotals.planned)} plan, currently at ${budgetTotals.pctUtil}% utilisation, and address variances by component.`
      : `Connect the finance data source so that budget utilisation can be tracked against the ${fmtVUV(budgetTotals.planned)} planned allocation.`,
    `Continue to deepen community engagement and gender-, disability- and social-inclusion (GEDSI) responsive approaches across adaptation activities.`,
  ];

  /* ── Back to Office Report — mission framing ──────────────────────────────
     A BTOR is a field/mission record, so it gets its own structure: who went,
     when, where, why, what was done, what was found and what follows. Auto-
     populated from the activities conducted in the period (officers, dates,
     destinations) and editable on the Reports page. */
  const btorDates = conducted.map(a => a.activity_date).filter(Boolean).sort();
  const btorMeta = {
    officers: conductedByOfficer.map(o => o.officer).filter(o => o && o !== '—'),
    designation: 'Department of Climate Change',
    dateFrom: btorDates.length ? fmtDMY(btorDates[0]) : p.months,
    dateTo: btorDates.length ? fmtDMY(btorDates[btorDates.length - 1]) : p.months,
    destinations: [...new Set(conducted.map(a => a.project_name).filter(Boolean))],
    purpose: `To carry out and document field activities under the DoCC Strategic Results Framework 2025–2030 during ${quarterLabel}, and to record outputs, findings and follow-up actions.`,
    findings: conducted.length
      ? `${conducted.length} activit${conducted.length > 1 ? 'ies were' : 'y was'} carried out and reported during the mission period across ${(new Set(conducted.map(a => a.project_name).filter(Boolean)).size) || 1} project/location(s). Delivery against the Strategic Results Framework stands at ${onTrackPct}% on track (${st.green} of ${total} activities).`
      : `No field activities were reported for ${quarterLabel}. Delivery against the Strategic Results Framework stands at ${onTrackPct}% on track (${st.green} of ${total} activities).`,
    stakeholders: 'Department of Climate Change, provincial and area council authorities, community stakeholders, line agencies and development partners.',
    followUp: nextSteps.slice(0, 8).map(n => n.activity),
  };

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
    btor: conducted.length
      ? `${conducted.length} activit${conducted.length > 1 ? 'ies were' : 'y was'} carried out and reported during ${quarterLabel}`
        + (conductedByMonth.length ? ` — by month: ${conductedByMonth.map(m => `${ymShort(m.month)} (${m.count})`).join(', ')}` : '')
        + (conductedByOfficer.length ? `; by officer: ${conductedByOfficer.slice(0, 8).map(o => `${o.officer} (${o.count})`).join(', ')}` : '')
        + '.'
      : `${btor.length} completed activities are documented below as back-to-office field records for the period (no period reports have been submitted yet).`,
    nextSteps: `${nextSteps.length} at-risk and delayed activities are prioritised for acceleration in ${nextQuarter}.`,
    activityReports: activityReports.length
      ? `${activityReports.length} activit${activityReports.length > 1 ? 'ies are' : 'y is'} reported in detail below, each with its strategic alignment, description, outputs, means of verification, challenges and status.`
      : '',
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
      dataSource: usingLive ? 'Live framework data' : 'Sample data (offline)',
      kind,
    },
    stats: { total, onTrackPct, ...st, totalBudget: S.total_budget_vuv, themes: S.themes, focusAreas: S.focus_areas, conductedCount: conducted.length },
    conducted,
    conductedByMonth,
    conductedByOfficer,
    btorMeta,
    acronyms: REPORT_ACRONYMS,
    executiveSummary,
    keyAchievements,
    introduction,
    activityOverview,
    accomplishments,
    budget: { rows: budgetRows, totals: budgetTotals, live: !!(live && live.budgetRows?.length) },
    challenges: { narrative: challengeNarrative, rows: challengeRows },
    btor,
    activityReports,
    lessons,
    nextSteps,
    conclusion,
    recommendations,
    figures,
    photos: photoDocs,
    reports: reportDocs,
    summaries,
    attachments,
  };
}
