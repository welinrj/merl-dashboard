// =============================================================================
// Overview.jsx — MERL Project Portfolio Dashboard (Executive Overview).
// Rebuilt to the approved sample layout: global filter bar, six KPI cards, two
// four-panel analytics rows (Projects by Status / Theme / Province / Budget, and
// Results / Trend / Beneficiaries / Risks), a Recent Project Updates table and
// an Upcoming Milestones panel. Every widget is derived from the standardised
// DoCC dataset (public.v_* views) and responds to the shared global filters;
// several charts also cross-filter on click. Empty and loading states included.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, LineChart, Line, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts';
import {
  FolderKanban, CheckCircle2, AlertTriangle, CircleDashed, Ban, Flag, Wallet,
  Printer, MapPin, ArrowRight, ClipboardCheck, Send, RotateCcw, Clock, Eye,
  Users, Venus, Mars, PersonStanding, Accessibility, AlertCircle, ShieldCheck, Archive, CircleDollarSign, ListChecks,
  Target, FileCheck, CalendarClock, FileText, FolderOpen, RefreshCw, TrendingUp, Activity,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST } from '../constants/vanuatuGeo';
import { VanuatuMapMini } from '../components/VanuatuMap';
import {
  useDashboardFilters, projectMatches, STATUS_BUCKETS, bucketOf,
} from '../lib/dashboardFilters';
import KpiCard from '../components/ui/KpiCard';

// ── Semantic colours (matched to the approved sample) ─────────────────────────
const BLUE = '#2f6df0';
const C = {
  onTrack: '#22a565', atRisk: '#e0a12a', notStarted: '#dc2626', completed: '#7c3aed',
  high: '#dc2626', medium: '#e0a12a', low: '#22a565', closed: '#94a3b8',
  offTrack: '#dc2626', attention: '#e0a12a', noData: '#94a3b8',
};
const STATUS_COLOR = { on_track: C.onTrack, at_risk: C.atRisk, not_started: C.notStarted, completed: C.completed };
const KPI_ACCENT = { total: BLUE, on_track: C.onTrack, at_risk: C.atRisk, not_started: C.notStarted, completed: C.completed, budget: BLUE };

// Funding-partner → category grouping for the Budget Overview (Section 7).
const FUND_CATS = ['DoCC / Govt', 'Multilateral', 'Bilateral', 'Other / Private'];
const FUND_COLOR = { 'DoCC / Govt': BLUE, 'Multilateral': '#22a565', 'Bilateral': '#e0a12a', 'Other / Private': '#7c3aed' };
function fundingCategory(donor) {
  const s = (donor || '').toLowerCase();
  if (!donor) return 'Other / Private';
  if (s.includes('vanuatu') || s.includes('govern') || s.includes('docc')) return 'DoCC / Govt';
  if (['gcf', 'gef', 'undp', 'world bank', 'adb', 'spc', 'eu', 'unicef', 'fao'].some((k) => s.includes(k))) return 'Multilateral';
  if (['mfat', 'australia', 'japan', 'new zealand', 'dfat', 'usaid', 'bilateral'].some((k) => s.includes(k))) return 'Bilateral';
  return 'Other / Private';
}
const BADGE = {
  on_track: ['#dcfce7', '#166534'], at_risk: ['#fef3c7', '#92400e'], delayed: ['#fee2e2', '#991b1b'],
  completed: ['#ede9fe', '#5b21b6'], closed: ['#ede9fe', '#5b21b6'], not_started: ['#f1f5f9', '#475569'],
  pipeline: ['#f1f5f9', '#475569'], approved: ['#e0f2fe', '#075985'], suspended: ['#fee2e2', '#991b1b'],
};

const today = () => new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const sum = (rows, f) => rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);
function fmtVUV(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `VUV ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `VUV ${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `VUV ${(n / 1e3).toFixed(1)}K`;
  return `VUV ${n.toLocaleString()}`;
}
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const pct1 = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '0%');
function fmtCompact(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}
const countBy = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) for (const k of [].concat(keyFn(r)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export default function Overview({ user }) {
  const nav = useNavigate();
  const { filters, setFilter, reset, active } = useDashboardFilters();
  const [d, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const q = (v, c) => supabase.from(v).select(c);
      const [proj, fin, risk, ben, act, ind, prog, rep, loc] = await Promise.all([
        q('v_projects', 'id, code, name, status, budget_vuv, spent_vuv, provinces, donor, category, start_date, end_date, updated_at'),
        q('v_financial_progress', 'project_id, approved_budget, cumulative_expenditure, created_at'),
        q('v_risks_issues', 'project_id, risk_rating, status, due_date'),
        q('v_beneficiaries', 'project_id, total_direct, female, male, other_gender, youth, persons_with_disability'),
        q('v_project_activities', 'project_id, name, status, planned_end_date, next_action, next_action_due'),
        q('v_project_indicators', 'project_id, id'),
        q('v_indicator_progress', 'project_id, indicator_id, achievement_pct, performance_status, reporting_period, created_at'),
        q('v_reporting_periods', 'project_id, period_label, period_end, submission_status, approved_at, reporting_officer_name, updated_at'),
        q('v_project_locations', 'project_id, province'),
      ]);
      setD({
        projects: proj.data ?? [], financial: fin.data ?? [], risks: risk.data ?? [], beneficiaries: ben.data ?? [],
        activities: act.data ?? [], indicators: ind.data ?? [], progress: prog.data ?? [], reporting: rep.data ?? [], locations: loc.data ?? [],
      });
    })();
  }, []);

  if (!d) return <OverviewSkeleton />;

  // ── Filter options + filtered data ─────────────────────────────────────────
  const years = [...new Set(d.projects.flatMap((p) => [p.start_date, p.end_date].filter(Boolean).map((x) => new Date(x).getFullYear())))].sort((a, b) => b - a);
  const donors = [...new Set(d.projects.map((p) => p.donor).filter(Boolean))].sort();
  const themes = [...new Set(d.projects.map((p) => p.category).filter(Boolean))].sort();

  const projects = d.projects.filter((p) => projectMatches(p, filters));
  const ids = new Set(projects.map((p) => p.id));
  const inScope = (rows) => rows.filter((r) => ids.has(r.project_id));
  const risks = inScope(d.risks), bens = inScope(d.beneficiaries), acts = inScope(d.activities),
        prog = inScope(d.progress), reps = inScope(d.reporting), fin = inScope(d.financial);

  // Data-as-at: latest approved reporting date from the DB (never hard-coded).
  const approvedDates = d.reporting.filter((r) => r.submission_status === 'approved').map((r) => r.approved_at || r.period_end).filter(Boolean);
  const dataAsAt = approvedDates.length ? approvedDates.sort().slice(-1)[0].slice(0, 10) : '—';

  if (d.projects.length === 0) return <EmptyPortfolio />;

  // ── KPI metrics ─────────────────────────────────────────────────────────────
  const total = projects.length;
  const byBucket = { on_track: 0, at_risk: 0, not_started: 0, completed: 0 };
  for (const p of projects) byBucket[bucketOf(p.status)] += 1;
  const latestFin = (() => { const m = new Map(); for (const f of fin) { const prev = m.get(f.project_id); if (!prev || (f.created_at ?? '') > (prev.created_at ?? '')) m.set(f.project_id, f); } return m; })();
  const totalBudget = sum(projects, (p) => p.budget_vuv);

  // ── Chart datasets ──────────────────────────────────────────────────────────
  const statusData = Object.keys(byBucket).map((k) => ({ key: k, name: STATUS_BUCKETS_LABEL(k), value: byBucket[k], color: STATUS_COLOR[k] }));
  const themeData = countBy(projects, (p) => p.category).map(([name, value]) => ({ name, value }));
  const provinceCounts = {}; for (const p of projects) for (const pv of (p.provinces || [])) provinceCounts[pv] = (provinceCounts[pv] || 0) + 1;
  const nationalCount = projects.filter((p) => !(p.provinces || []).length).length;
  const budgetByCategory = (() => {
    const m = new Map(FUND_CATS.map((c) => [c, 0]));
    for (const p of projects) m.set(fundingCategory(p.donor), (m.get(fundingCategory(p.donor)) || 0) + (Number(p.budget_vuv) || 0));
    return FUND_CATS.map((name) => ({ name, value: m.get(name) || 0, color: FUND_COLOR[name] })).filter((x) => x.value > 0);
  })();
  const projInds = inScope(d.indicators);
  const totalIndicators = projInds.length;
  const perfData = (() => {
    const order = [['on_track', C.onTrack], ['attention_required', C.attention], ['off_track', C.offTrack], ['no_data', C.noData]];
    // Latest progress status per indicator (indicators with no progress = No Data).
    const latest = new Map();
    for (const r of prog) { const prev = latest.get(r.indicator_id); if (!prev || (r.created_at ?? '') > (prev.created_at ?? '')) latest.set(r.indicator_id, r); }
    const counts = { on_track: 0, attention_required: 0, off_track: 0, no_data: 0 };
    for (const ind of projInds) { const s = latest.get(ind.id)?.performance_status || 'no_data'; counts[s in counts ? s : 'no_data'] += 1; }
    return order.map(([k, color]) => ({ name: OPT.labelOf(OPT.PERFORMANCE_STATUS, k), value: counts[k] || 0, color }));
  })();
  const trendData = (() => {
    const m = new Map(); for (const r of prog) { if (!r.reporting_period || r.achievement_pct == null) continue; const e = m.get(r.reporting_period) || { s: 0, n: 0 }; e.s += Number(r.achievement_pct); e.n += 1; m.set(r.reporting_period, e); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, e]) => ({ period, pct: Math.round(e.s / e.n) }));
  })();
  const risksData = (() => {
    const buckets = { High: 0, Medium: 0, Low: 0, Closed: 0 };
    for (const r of risks) {
      if (['resolved', 'closed'].includes(r.status)) buckets.Closed += 1;
      else if (r.risk_rating === 'Critical' || r.risk_rating === 'High') buckets.High += 1;
      else if (r.risk_rating === 'Medium') buckets.Medium += 1;
      else buckets.Low += 1;
    }
    return [
      { name: 'High', value: buckets.High, color: C.high }, { name: 'Medium', value: buckets.Medium, color: C.medium },
      { name: 'Low', value: buckets.Low, color: C.low }, { name: 'Closed', value: buckets.Closed, color: C.closed },
    ];
  })();
  const totalRisks = risks.length;
  const totalBen = sum(bens, (b) => b.total_direct);
  // Beneficiary disaggregation (§38): 0 is a real value — only null means "no data".
  const bAny = (f) => bens.some((b) => b[f] != null);
  const bSum = (f) => (bAny(f) ? bens.reduce((a, b) => a + (b[f] != null ? Number(b[f]) : 0), 0) : null);
  const gedsi = [
    { key: 'female', label: 'Female', icon: Venus, value: bSum('female'), color: '#7c3aed' },
    { key: 'male', label: 'Male', icon: Mars, value: bSum('male'), color: BLUE },
    { key: 'youth', label: 'Youth', icon: PersonStanding, value: bSum('youth'), color: '#e0a12a' },
    { key: 'persons_with_disability', label: 'Persons w/ disability', icon: Accessibility, value: bSum('persons_with_disability'), color: '#22a565' },
    { key: 'other_gender', label: 'Other / N.R.', icon: Users, value: bSum('other_gender'), color: '#0e8f8a' },
  ];
  const hasGedsi = gedsi.some((g) => g.value != null);

  // Recent updates (latest 6) + milestones (next 30 days)
  const updatedByOf = (pid) => {
    const rows = reps.filter((r) => r.project_id === pid && r.reporting_officer_name)
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    return rows[0]?.reporting_officer_name || '—';
  };
  const recent = [...projects].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, 6).map((p) => {
    const progAvg = (() => { const withPct = prog.filter((x) => x.project_id === p.id && x.achievement_pct != null); return withPct.length ? Math.round(sum(withPct, (x) => x.achievement_pct) / withPct.length) : null; })();
    return { ...p, progress: progAvg, updatedBy: updatedByOf(p.id) };
  });
  const projName = (id) => d.projects.find((p) => p.id === id)?.name || '';
  const milestones = (() => {
    const out = [];
    const now = today(); const in30 = new Date(now.getTime() + 30 * 864e5);
    const push = (date, title, subtitle) => { if (!date) return; const dt = new Date(date); if (dt >= new Date(iso(now)) && dt <= in30) out.push({ date: dt, title, subtitle }); };
    for (const r of reps) if (r.submission_status !== 'approved') push(r.period_end, `Report due — ${r.period_label}`, projName(r.project_id));
    for (const a of acts) { if (a.status !== 'completed') push(a.planned_end_date, a.name, projName(a.project_id)); push(a.next_action_due, a.next_action || 'Next action', projName(a.project_id)); }
    for (const r of risks) if (!['resolved', 'closed'].includes(r.status)) push(r.due_date, 'Risk action due', projName(r.project_id));
    return out.sort((a, b) => a.date - b.date).slice(0, 6);
  })();

  const exportPrint = () => window.print();

  // ── Derived headline + performance metrics (all from existing calcs) ────────
  const completed = byBucket.completed;
  const activeProjects = total - completed;
  const totalExp = [...latestFin.values()].reduce((a, f) => a + (Number(f.cumulative_expenditure) || 0), 0);
  const util = totalBudget ? Math.round((totalExp / totalBudget) * 100) : 0;
  const provincesReached = Object.keys(provinceCounts).length;
  const provincesTotal = PROVINCE_LIST.length;

  const onTrackInd = perfData[0].value, offTrackInd = perfData[2].value;
  const actsDone = acts.filter((a) => a.status === 'completed').length;
  const now2 = iso(today());
  const overdueActs = acts.filter((a) => a.status !== 'completed' && a.planned_end_date && a.planned_end_date.slice(0, 10) < now2).length;
  const repsApproved = reps.filter((r) => r.submission_status === 'approved').length;
  const repsOverdue = reps.filter((r) => r.submission_status !== 'approved' && r.period_end && r.period_end.slice(0, 10) < now2).length;
  const repsAwaiting = reps.filter((r) => ['submitted', 'reviewed'].includes(r.submission_status)).length;
  const pctOf = (n, dv) => (dv ? Math.round((n / dv) * 100) : 0);

  const perf = [
    { key: 'ind', icon: Target, label: 'Indicators on track', frac: `${onTrackInd}/${totalIndicators}`, pct: pctOf(onTrackInd, totalIndicators), color: '#22a565' },
    { key: 'act', icon: ListChecks, label: 'Activities completed', frac: `${actsDone}/${acts.length}`, pct: pctOf(actsDone, acts.length), color: BLUE },
    { key: 'bud', icon: Wallet, label: 'Budget utilisation', frac: fmtVUV(totalExp).replace('VUV ', ''), pct: util, color: '#7c3aed' },
    { key: 'rep', icon: FileCheck, label: 'Reporting compliance', frac: `${repsApproved}/${reps.length}`, pct: pctOf(repsApproved, reps.length), color: '#0e8f8a' },
  ];
  const toneColor = { crit: '#b3402f', warn: '#d97706', ok: '#22a565' };
  const attn = [
    { key: 'ovr', icon: Clock, label: 'Overdue reports', value: repsOverdue, to: '/merl-reporting', tone: repsOverdue ? 'crit' : 'ok' },
    { key: 'off', icon: AlertTriangle, label: 'Indicators off track', value: offTrackInd, to: '/analytics/results', tone: offTrackInd ? 'warn' : 'ok' },
    { key: 'del', icon: CalendarClock, label: 'Delayed activities', value: overdueActs, to: '/merl-reporting', tone: overdueActs ? 'warn' : 'ok' },
    { key: 'rev', icon: Eye, label: 'Awaiting review', value: repsAwaiting, to: '/review', tone: repsAwaiting ? 'warn' : 'ok' },
  ];
  const genderSplit = (() => {
    const f = gedsi[0].value, m = gedsi[1].value;
    if (f == null && m == null) return null;
    const fv = f || 0, mv = m || 0, s = fv + mv;
    return { f: fv, m: mv, fp: s ? Math.round((fv / s) * 100) : 0, mp: s ? Math.round((mv / s) * 100) : 0 };
  })();

  // Overall implementation progress = mean of the latest indicator achievement %.
  const achVals = prog.filter((r) => r.achievement_pct != null).map((r) => Number(r.achievement_pct));
  const overallProgress = achVals.length ? Math.round(achVals.reduce((a, b) => a + b, 0) / achVals.length) : null;
  // Compact beneficiary breakdown (only categories that actually have data).
  const beneMini = [
    { key: 'female', icon: Venus, label: 'Female', value: gedsi[0].value, color: '#db2777' },
    { key: 'male', icon: Mars, label: 'Male', value: gedsi[1].value, color: BLUE },
    { key: 'youth', icon: PersonStanding, label: 'Youth', value: gedsi[2].value, color: '#e0a12a' },
    { key: 'pwd', icon: Accessibility, label: 'Disability', value: gedsi[3].value, color: '#22a565' },
  ].filter((x) => x.value != null);

  // Beneficiaries reached per province (project → provinces → direct beneficiaries).
  const provById = new Map(d.projects.map((p) => [p.id, p.provinces || []]));
  const provBen = {};
  for (const b of bens) { const v = Number(b.total_direct) || 0; for (const pv of (provById.get(b.project_id) || [])) provBen[pv] = (provBen[pv] || 0) + v; }

  // Recent & upcoming reporting periods → status-badged table rows (all real data).
  const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
  const daysUntil = (s) => Math.round((new Date(s.slice(0, 10)) - new Date(now2)) / 864e5);
  const reportStatus = (r) => {
    if (r.submission_status === 'approved') return { label: 'Approved', tone: 'ok' };
    if (['submitted', 'reviewed'].includes(r.submission_status)) return { label: 'Submitted', tone: 'info' };
    if (!r.period_end) return { label: 'Pending', tone: 'warn' };
    const dleft = daysUntil(r.period_end);
    if (dleft < 0) return { label: 'Overdue', tone: 'crit' };
    return { label: `Due in ${dleft} day${dleft === 1 ? '' : 's'}`, tone: dleft <= 7 ? 'crit' : 'warn' };
  };
  const reportRows = [...reps]
    .filter((r) => r.period_end && daysUntil(r.period_end) >= -60)
    .sort((a, b) => (a.period_end || '').localeCompare(b.period_end || ''))
    .slice(0, 5)
    .map((r) => ({ id: `${r.project_id}-${r.period_label}`, item: r.period_label || 'Reporting period', project: projName(r.project_id), due: r.period_end, status: reportStatus(r) }));

  return (
    <div className="ovx">
      {/* Header — title + filters */}
      <div className="ovx-head rp-noprint">
        <div className="ovx-title">
          <h1>Dashboard Overview</h1>
          <p>Portfolio monitoring, evaluation &amp; reporting · Data as at <b>{dataAsAt}</b></p>
        </div>
        <div className="ovx-filters">
          <FilterSelect label="Financial Year" value={filters.fy} onChange={(v) => setFilter('fy', v)} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
          <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={Object.keys(STATUS_BUCKETS).map((k) => ({ value: k, label: STATUS_BUCKETS_LABEL(k) }))} />
          <FilterSelect label="Theme" value={filters.theme} onChange={(v) => setFilter('theme', v)} options={themes.map((t) => ({ value: t, label: t }))} />
          <FilterSelect label="Province" value={filters.province} onChange={(v) => setFilter('province', v)} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} />
          <FilterSelect label="Partner" value={filters.partner} onChange={(v) => setFilter('partner', v)} options={donors.map((x) => ({ value: x, label: x }))} />
          <button className="ov-btn-ghost" onClick={reset} disabled={!active}>Reset</button>
          <button className="ov-btn" onClick={exportPrint}><Printer size={14} /> Export</button>
        </div>
      </div>

      {/* Level 1 — primary executive KPIs: Projects · Total Funding · Disbursed · Beneficiaries */}
      <div className="ovx-kpis">
        <KpiCard icon={FolderOpen} label="Projects" value={total} accent="var(--green-600)"
          sub={`${activeProjects} active · ${completed} completed`} linkLabel="View projects" onClick={() => nav('/analytics/portfolio')} />
        <KpiCard icon={CircleDollarSign} label="Total Funding" value={fmtVUV(totalBudget).replace('VUV', 'VT')} accent={BLUE}
          sub={donors.length ? `${donors.length} funding partner${donors.length === 1 ? '' : 's'}` : 'Committed budget'} linkLabel="View financials" onClick={() => nav('/analytics/financial')} />
        <KpiCard icon={Wallet} label="Disbursed" value={fmtVUV(totalExp).replace('VUV', 'VT')} accent="#7c3aed"
          sub={`${util}% of total funding`} progress={util} progressColor="#7c3aed" linkLabel="View financials" onClick={() => nav('/analytics/financial')} />
        <KpiCard icon={Users} label="Beneficiaries" value={totalBen ? totalBen.toLocaleString() : '0'} accent="var(--green-600)" solid
          linkLabel="View beneficiaries" onClick={() => nav('/analytics/geographic')}>
          {beneMini.length > 0 && (
            <div className="flex items-start justify-between gap-2">
              {beneMini.map((b) => (
                <span key={b.key} className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1" style={{ color: b.color }}>
                    <b.icon size={14} aria-hidden="true" />
                    <b className="text-[1rem] font-extrabold leading-none text-[var(--navy-900)]" style={{ fontFamily: 'var(--font-display)' }}>{b.value.toLocaleString()}</b>
                  </span>
                  <i className="whitespace-nowrap text-[0.64rem] not-italic text-[var(--text-3)]">{b.label}</i>
                </span>
              ))}
            </div>
          )}
        </KpiCard>
      </div>

      {/* Level 2 — geographic footprint + implementation performance */}
      <div className="ovx-mapperf">
        <ProjectLocations counts={provinceCounts} provBen={provBen} nationalCount={nationalCount}
          selected={filters.province} onSelect={(pv) => setFilter('province', pv)} onView={() => nav('/analytics/geographic')} />
        <div className="ovx-card">
          <div className="ovx-card-h"><Activity size={16} /> Implementation Performance</div>
          <div className="ovx-impl">
            <Donut size={128} data={statusData} center={[total, 'Total']} onSlice={(s) => setFilter('status', s.key)} />
            <div className="ovx-status-legend">
              {statusData.map((s) => (
                <button key={s.key} className="ovx-leg-row" onClick={() => setFilter('status', s.key)}>
                  <span className="ovx-leg-dot" style={{ background: s.color }} />
                  <span className="ovx-leg-name">{s.name}</span>
                  <b className="ovx-leg-val">{s.value}</b>
                  <span className="ovx-leg-pct">{pct(s.value, total)}%</span>
                </button>
              ))}
            </div>
          </div>
          {overallProgress != null && (
            <div className="ovx-impl-prog">
              <div className="ovx-impl-prog-h"><span>Overall Progress</span><b>{overallProgress}%</b></div>
              <div className="ovx-perf-bar"><div style={{ width: `${Math.min(100, overallProgress)}%`, background: '#22a565' }} /></div>
            </div>
          )}
          <button className="ovx-cardlink" onClick={() => nav('/analytics/results')}>View performance details <ArrowRight size={13} /></button>
        </div>
      </div>

      {/* Level 3 — supporting analytics */}
      <div className="ovx-2">
        <div className="ovx-card">
          <div className="ovx-card-h"><TrendingUp size={16} /> Portfolio Performance</div>
          <div className="ovx-perf">
            {perf.map((p) => (
              <div key={p.key} className="ovx-perf-row">
                <span className="ovx-perf-ic" style={{ color: p.color }}><p.icon size={16} /></span>
                <span className="ovx-perf-lbl">{p.label}</span>
                <div className="ovx-perf-bar"><div style={{ width: `${Math.min(100, p.pct)}%`, background: p.color }} /></div>
                <span className="ovx-perf-val">{p.pct}%</span>
              </div>
            ))}
          </div>
          <button className="ovx-cardlink" onClick={() => nav('/analytics/results')}>View performance details <ArrowRight size={13} /></button>
        </div>
        <div className="ovx-card">
          <div className="ovx-card-h"><AlertTriangle size={16} style={{ color: '#d97706' }} /> Needs Attention</div>
          <div className="ovx-attn">
            {attn.map((a) => (
              <button key={a.key} className="ovx-attn-row" onClick={() => nav(a.to)}>
                <span className="ovx-attn-ic" style={{ color: a.value ? toneColor[a.tone] : 'var(--text-3)', background: a.value ? `color-mix(in srgb, ${toneColor[a.tone]} 12%, #fff)` : 'var(--surface-1)' }}><a.icon size={16} /></span>
                <span className="ovx-attn-val" style={{ color: a.value ? toneColor[a.tone] : 'var(--text-3)' }}>{a.value}</span>
                <span className="ovx-attn-lbl">{a.label}</span>
                <span className="ovx-attn-link" style={{ color: a.value ? toneColor[a.tone] : 'var(--text-3)' }}>View all <ArrowRight size={12} /></span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ovx-card">
        <div className="ovx-card-h"><FileText size={16} /> Recent Activity &amp; Upcoming Reports</div>
        {reportRows.length === 0 ? <NoData label="Nothing due soon" height={120} /> : (
          <div className="ovx-rtbl-wrap">
            <table className="ovx-rtbl">
              <thead><tr><th>Item</th><th>Project</th><th>Due date</th><th>Status</th></tr></thead>
              <tbody>
                {reportRows.map((r) => (
                  <tr key={r.id} onClick={() => nav('/analytics/reporting')}>
                    <td className="ovx-rt-item"><FileText size={13} /> <span>{r.item}</span></td>
                    <td className="ovx-rt-proj">{r.project || '—'}</td>
                    <td className="ovx-rt-due">{fmtDate(r.due)}</td>
                    <td><span className={`ovx-badge tone-${r.status.tone}`}>{r.status.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button className="ovx-cardlink" onClick={() => nav('/analytics/reporting')}>View all reports <ArrowRight size={13} /></button>
      </div>

      <div className="ovx-updated"><RefreshCw size={12} /> Last updated: {dataAsAt}</div>
    </div>
  );
}

// Project Locations card: large Vanuatu map (≈40%) beside a compact province
// table (≈60%). Hover is linked both ways; clicking drives the shared province
// filter. Local hover state keeps map/list highlighting off the page re-render.
function ProjectLocations({ counts, provBen, nationalCount, selected, onSelect, onView }) {
  const [hover, setHover] = useState(null);
  return (
    <div className="ovx-card ovx-loc">
      <div className="ovx-card-h"><MapPin size={16} /> Project Locations</div>
      <div className="ovx-locwrap">
        <div className="ovx-locmap">
          <VanuatuMapMini counts={counts} selected={selected} hovered={hover} onHover={setHover}
            onSelect={onSelect} />
        </div>
        <table className="ovx-provtbl">
          <thead><tr><th>Province</th><th>Projects</th><th>Beneficiaries</th></tr></thead>
          <tbody>
            {PROVINCE_LIST.map((pv) => (
              <tr key={pv} className={`${selected === pv ? 'sel' : ''}${hover === pv ? ' hov' : ''}`}
                onClick={() => onSelect(pv)} onMouseEnter={() => setHover(pv)} onMouseLeave={() => setHover(null)}>
                <td className="ovx-provtbl-name"><span className="ovx-prov-dot" style={{ background: fillDot(counts[pv] || 0, counts) }} /><span className="ovx-provtbl-nm">{pv}</span></td>
                <td className="ovx-provtbl-num">{counts[pv] || 0}</td>
                <td className="ovx-provtbl-num">{(provBen[pv] || 0).toLocaleString()}</td>
              </tr>
            ))}
            {nationalCount > 0 && (
              <tr className="nat">
                <td className="ovx-provtbl-name"><span className="ovx-prov-dot" style={{ background: 'var(--text-3)' }} /><span className="ovx-provtbl-nm">National / multi-province</span></td>
                <td className="ovx-provtbl-num">{nationalCount}</td>
                <td className="ovx-provtbl-num">—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button className="ovx-cardlink" onClick={onView}>View coverage <ArrowRight size={13} /></button>
    </div>
  );
}

function STATUS_BUCKETS_LABEL(k) {
  return { on_track: 'On Track', at_risk: 'At Risk / Delayed', not_started: 'Not Started', completed: 'Completed' }[k] || k;
}

// Province dot colour — matches the map choropleth shading (green by project count).
function fillDot(c, counts) {
  if (!c) return 'color-mix(in srgb, var(--green-700) 22%, #ffffff)';
  const max = Math.max(1, ...Object.values(counts));
  const t = 0.55 + 0.45 * (c / max);
  return `color-mix(in srgb, var(--green-600) ${Math.round(t * 100)}%, #ffffff)`;
}

// ── Presentational pieces ─────────────────────────────────────────────────────
function Kpi({ icon: Icon, label, value, sub, small }) {
  return (
    <div className="ov-kpi">
      <div style={{ minWidth: 0 }}>
        <div className="ov-kpi-label">{label}</div>
        <div className="ov-kpi-value" style={{ fontSize: small ? '1.35rem' : '1.7rem' }}>{value}</div>
        {sub && <div className="ov-kpi-sub">{sub}</div>}
      </div>
      <span className="ov-kpi-ic" aria-hidden="true"><Icon size={18} /></span>
    </div>
  );
}

// Compact icon KPI tile used for the beneficiary + risk breakdowns. `pct` may be
// a number (rendered as N%) or a preformatted string (e.g. "12.5%"); null → "—".
function KpiTile({ icon: Icon, value, label, pct, accent }) {
  const pctText = pct == null ? '—' : (typeof pct === 'number' ? `${pct}%` : pct);
  const barW = pct == null ? 0 : Math.min(100, Math.max(0, parseFloat(pct) || 0));
  return (
    <div className="ov-tile" style={{ background: `color-mix(in srgb, ${accent} 4%, #fff)`, borderColor: `color-mix(in srgb, ${accent} 28%, var(--border))` }}>
      <span className="ov-tile-ic" style={{ color: accent }} aria-hidden="true"><Icon size={20} /></span>
      <span className="ov-tile-val">{value == null ? '—' : (typeof value === 'number' ? value.toLocaleString() : value)}</span>
      <span className="ov-tile-lbl">{label}</span>
      <span className="ov-tile-pct" style={{ color: pct == null ? 'var(--text-3)' : accent }}>{pctText}</span>
      <div className="ov-tile-bar"><div style={{ width: `${barW}%`, background: accent }} /></div>
    </div>
  );
}
function Panel({ title, subtitle, children, footer }) {
  return (
    <div className="ov-panel">
      <div className="ov-panel-h">
        <div><div className="ov-panel-title">{title}</div>{subtitle && <div className="ov-panel-sub">{subtitle}</div>}</div>
      </div>
      <div className="ov-panel-body">{children}</div>
      {footer && <div className="ov-panel-f">{footer}</div>}
    </div>
  );
}
function FooterLink({ label, onClick, icon: Icon }) {
  return <button className="ov-flink" onClick={onClick}>{Icon && <Icon size={13} />}{label} <ArrowRight size={13} /></button>;
}
function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="ov-fsel">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">All</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
function Donut({ data, center, onSlice, valueFmt, size = 180 }) {
  const totalVal = data.reduce((a, s) => a + s.value, 0);
  const outer = Math.round(size * 0.43), inner = Math.round(size * 0.3);
  return (
    <div style={{ position: 'relative', height: size }}>
      {totalVal === 0 ? <NoData height={size} /> : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={inner} outerRadius={outer} paddingAngle={2}
              onClick={(e) => { if (onSlice && e) onSlice(e.payload ?? e); }} cursor={onSlice ? 'pointer' : 'default'}>
              {data.map((s, i) => <Cell key={i} fill={s.color || '#0e6e6e'} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [valueFmt ? valueFmt(v) : v, n]} />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: size < 150 ? '1.15rem' : '1.35rem', fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{center[0]}</div>
        <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{center[1]}</div>
      </div>
    </div>
  );
}
function Legend({ items, total, valueFmt }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem' }}>
      {items.map((s, i) => (
        <button key={i} onClick={s.onClick} disabled={!s.onClick}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', padding: '0.1rem 0', cursor: s.onClick ? 'pointer' : 'default', textAlign: 'left' }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color || '#0e6e6e', flexShrink: 0 }} />
          <span style={{ fontSize: '0.76rem', color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
          <span style={{ fontSize: '0.76rem', fontWeight: 700 }}>{valueFmt ? valueFmt(s.value) : s.value}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', width: 46, textAlign: 'right' }}>({pct1(s.value, total)})</span>
        </button>
      ))}
    </div>
  );
}
function StatusBadge({ status }) {
  const [bg, fg] = BADGE[status] || BADGE.not_started;
  return <span style={{ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 9999, fontSize: '0.68rem', fontWeight: 700, background: bg, color: fg, whiteSpace: 'nowrap' }}>{OPT.labelOf(OPT.DOCC_PROJECT_STATUS, status)}</span>;
}
function Progress({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 120 }}>
      <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, value)}%`, height: '100%', background: value >= 90 ? C.onTrack : value >= 60 ? C.atRisk : C.offTrack }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, width: 34 }}>{value}%</span>
    </div>
  );
}
function NoData({ label = 'No data', height = 180 }) {
  return <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', gap: '0.3rem' }}><CircleDashed size={20} /><span style={{ fontSize: '0.8rem' }}>{label}</span></div>;
}

function EmptyPortfolio() {
  const nav = useNavigate();
  return (
    <div className="ov" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <span style={{ display: 'inline-flex', width: 64, height: 64, borderRadius: 16, background: 'var(--green-50)', color: 'var(--green-700)', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}><FolderKanban size={30} /></span>
        <h2 style={{ margin: '0 0 0.4rem' }}>No project data available</h2>
        <p style={{ color: 'var(--text-2)', margin: '0 0 1.2rem' }}>Add your first project to begin monitoring MERL performance.</p>
        <button className="ov-btn" onClick={() => nav('/project-setup')}>Add a project</button>
      </div>
    </div>
  );
}
function OverviewSkeleton() {
  const sk = (h) => <div className="ov-skel" style={{ height: h }} />;
  return (
    <div className="ov">
      <div className="ov-filters rp-noprint">{sk(34)}</div>
      <div className="ov-kpis">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="ov-kpi">{sk(48)}</div>)}</div>
      <div className="ov-grid4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="ov-panel">{sk(240)}</div>)}</div>
      <div className="ov-grid4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="ov-panel">{sk(240)}</div>)}</div>
    </div>
  );
}
