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
  Users, Printer, MapPin, ArrowRight,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST } from '../constants/vanuatuGeo';
import VanuatuMap from '../components/VanuatuMap';
import {
  useDashboardFilters, projectMatches, STATUS_BUCKETS, bucketOf,
} from '../lib/dashboardFilters';

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

export default function Overview() {
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
        q('v_beneficiaries', 'project_id, total_direct, female'),
        q('v_project_activities', 'project_id, name, status, planned_end_date, next_action, next_action_due'),
        q('v_project_indicators', 'project_id, id'),
        q('v_indicator_progress', 'project_id, achievement_pct, performance_status, reporting_period'),
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
  const perfData = (() => {
    const order = [['on_track', C.onTrack], ['attention_required', C.attention], ['off_track', C.offTrack], ['no_data', C.noData]];
    const m = new Map(); for (const r of prog) { const s = r.performance_status || 'no_data'; m.set(s, (m.get(s) || 0) + 1); }
    return order.map(([k, color]) => ({ name: OPT.labelOf(OPT.PERFORMANCE_STATUS, k), value: m.get(k) || 0, color }));
  })();
  const totalIndicators = inScope(d.indicators).length;
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
  const femaleBen = sum(bens, (b) => b.female);
  const femalePct = bens.some((b) => b.female != null) && totalBen ? pct(femaleBen, totalBen) : null;

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

  return (
    <div className="ov">
      {/* Global filter bar */}
      <div className="ov-filters rp-noprint">
        <FilterSelect label="Financial Year" value={filters.fy} onChange={(v) => setFilter('fy', v)} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <FilterSelect label="Project Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={Object.keys(STATUS_BUCKETS).map((k) => ({ value: k, label: STATUS_BUCKETS_LABEL(k) }))} />
        <FilterSelect label="Theme / Sector" value={filters.theme} onChange={(v) => setFilter('theme', v)} options={themes.map((t) => ({ value: t, label: t }))} />
        <FilterSelect label="Province" value={filters.province} onChange={(v) => setFilter('province', v)} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} />
        <FilterSelect label="Funding Partner" value={filters.partner} onChange={(v) => setFilter('partner', v)} options={donors.map((x) => ({ value: x, label: x }))} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Data as at: <b style={{ color: 'var(--text-2)' }}>{dataAsAt}</b></span>
          <button className="ov-btn-ghost" onClick={reset} disabled={!active}>Reset Filters</button>
          <button className="ov-btn" onClick={exportPrint}><Printer size={14} /> Export</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="ov-kpis">
        <Kpi icon={FolderKanban} accent={KPI_ACCENT.total} label="Total Projects" value={total} sub={active ? 'Matching filters' : 'All active projects'} />
        <Kpi icon={CheckCircle2} accent={KPI_ACCENT.on_track} label="On Track" value={byBucket.on_track} sub={`${pct1(byBucket.on_track, total)} of total`} />
        <Kpi icon={AlertTriangle} accent={KPI_ACCENT.at_risk} label="At Risk / Delayed" value={byBucket.at_risk} sub={`${pct1(byBucket.at_risk, total)} of total`} />
        <Kpi icon={Ban} accent={KPI_ACCENT.not_started} label="Not Started" value={byBucket.not_started} sub={`${pct1(byBucket.not_started, total)} of total`} />
        <Kpi icon={Flag} accent={KPI_ACCENT.completed} label="Completed" value={byBucket.completed} sub={`${pct1(byBucket.completed, total)} of total`} />
        <Kpi icon={Wallet} accent={KPI_ACCENT.budget} label="Total Approved Budget" value={fmtVUV(totalBudget)} sub="Across all projects" small />
      </div>

      {/* Analytics row 1 */}
      <div className="ov-grid4">
        <Panel title="Projects by Status" footer={<FooterLink label="View all projects" onClick={() => nav('/analytics/portfolio')} />}>
          <Donut data={statusData} center={[total, 'Projects']} onSlice={(s) => setFilter('status', s.key)} />
          <Legend items={statusData.map((s) => ({ ...s, onClick: () => setFilter('status', s.key) }))} total={total} />
        </Panel>
        <Panel title="Projects by Theme / Sector" footer={<FooterLink label="View full breakdown" onClick={() => nav('/analytics/portfolio')} />}>
          {themeData.length === 0 ? <NoData /> : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={themeData} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={116} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => [`${v} (${pct1(v, total)})`, 'Projects']} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={BLUE} cursor="pointer"
                    onClick={(e) => { const n = e?.name ?? e?.payload?.name; if (n) setFilter('theme', n); }}>
                    <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: 'var(--text-2)' }}
                      formatter={(v) => `${v} (${pct1(v, total)})`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Projects by Province" footer={<FooterLink label="View on map" icon={MapPin} onClick={() => nav('/analytics/geographic')} />}>
          <VanuatuMap counts={provinceCounts} nationalCount={nationalCount} selected={filters.province} onSelect={(name) => setFilter('province', name)} />
        </Panel>
        <Panel title="Budget Overview (VUV)" footer={<FooterLink label="View finance" onClick={() => nav('/analytics/financial')} />}>
          {budgetByCategory.length === 0 ? <NoData /> : (
            <>
              <Donut data={budgetByCategory} center={[fmtCompact(totalBudget), 'VUV Total']} valueFmt={fmtCompact} />
              <Legend items={budgetByCategory} total={totalBudget} valueFmt={fmtCompact} />
            </>
          )}
        </Panel>
      </div>

      {/* Analytics row 2 */}
      <div className="ov-grid4">
        <Panel title="Results Progress (Indicators)" footer={<FooterLink label="View all indicators" onClick={() => nav('/analytics/results')} />}>
          <Donut data={perfData} center={[totalIndicators, 'Indicators']} />
          <Legend items={perfData} total={perfData.reduce((a, s) => a + s.value, 0)} />
        </Panel>
        <Panel title="Progress Trend (All Indicators)" footer={<FooterLink label="View trend analysis" onClick={() => nav('/analytics/results')} />}>
          {trendData.length === 0 ? <NoData label="No reported progress yet" /> : (
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ left: -10, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid stroke="var(--border)" />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(v) => [`${v}%`, 'Avg achievement']} />
                  <Line type="monotone" dataKey="pct" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3, fill: BLUE }} label={{ fontSize: 10, position: 'top', fill: 'var(--text-2)', formatter: (v) => `${v}%` }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Beneficiaries Reached" footer={<FooterLink label="View beneficiaries" onClick={() => nav('/analytics/geographic')} />}>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 200, gap: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ width: 40, height: 40, borderRadius: '50%', background: '#dcfce7', color: '#22a565', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={20} /></span>
              <div>
                <div style={{ fontSize: '1.9rem', fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-display)' }}>{totalBen ? totalBen.toLocaleString() : '0'}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Total beneficiaries</div>
              </div>
            </div>
            <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)' }}>
              {femalePct == null ? (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>No disaggregated data</div>
              ) : (
                <>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1, color: '#22a565' }}>{femalePct}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Female beneficiaries</div>
                </>
              )}
            </div>
          </div>
        </Panel>
        <Panel title="Risks Overview" footer={<FooterLink label="View risks register" onClick={() => nav('/analytics/risks')} />}>
          <Donut data={risksData} center={[totalRisks, 'Risks']} />
          <Legend items={risksData} total={totalRisks} />
        </Panel>
      </div>

      {/* Recent updates + milestones */}
      <div className="ov-bottom">
        <Panel title="Recent Project Updates" footer={<FooterLink label="View all projects" onClick={() => nav('/analytics/portfolio')} />}>
          {recent.length === 0 ? <NoData label="No projects match the current filters" /> : (
            <div style={{ overflowX: 'auto' }}>
              <table className="ov-table">
                <thead><tr><th>Project ID</th><th>Title</th><th>Status</th><th>Progress</th><th>Budget (VUV)</th><th>Last Updated</th><th>Updated By</th></tr></thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.code}</td>
                      <td>{p.name}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td><Progress value={p.progress} /></td>
                      <td>{fmtVUV(p.budget_vuv).replace('VUV ', '')}</td>
                      <td style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{p.updated_at ? p.updated_at.slice(0, 10) : '—'}</td>
                      <td style={{ color: 'var(--text-2)' }}>{p.updatedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Upcoming Milestones" subtitle="Next 30 Days" footer={<FooterLink label="View all milestones" onClick={() => nav('/analytics/reporting')} />}>
          {milestones.length === 0 ? <NoData label="Nothing due in the next 30 days" /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {milestones.map((m, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < milestones.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: ['#22a565', BLUE, '#e0a12a', '#7c3aed'][i % 4], flexShrink: 0 }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: BLUE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.subtitle}</div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 34 }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-1)' }}>{m.date.getDate()}</div>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em', color: '#22a565' }}>{m.date.toLocaleString('en', { month: 'short' }).toUpperCase()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function STATUS_BUCKETS_LABEL(k) {
  return { on_track: 'On Track', at_risk: 'At Risk / Delayed', not_started: 'Not Started', completed: 'Completed' }[k] || k;
}

// ── Presentational pieces ─────────────────────────────────────────────────────
function Kpi({ icon: Icon, accent, label, value, sub, small }) {
  return (
    <div className="ov-kpi">
      <div style={{ minWidth: 0 }}>
        <div className="ov-kpi-label">{label}</div>
        <div className="ov-kpi-value" style={{ fontSize: small ? '1.35rem' : '1.7rem' }}>{value}</div>
        {sub && <div className="ov-kpi-sub">{sub}</div>}
      </div>
      <span className="ov-kpi-ic" style={{ background: `color-mix(in srgb, ${accent} 15%, #fff)`, color: accent }}><Icon size={20} /></span>
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
function Donut({ data, center, onSlice, valueFmt }) {
  const totalVal = data.reduce((a, s) => a + s.value, 0);
  return (
    <div style={{ position: 'relative', height: 180 }}>
      {totalVal === 0 ? <NoData /> : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={2}
              onClick={(e) => { if (onSlice && e) onSlice(e.payload ?? e); }} cursor={onSlice ? 'pointer' : 'default'}>
              {data.map((s, i) => <Cell key={i} fill={s.color || '#0e6e6e'} />)}
            </Pie>
            <Tooltip formatter={(v, n) => [valueFmt ? valueFmt(v) : v, n]} />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{center[0]}</div>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{center[1]}</div>
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
function NoData({ label = 'No data' }) {
  return <div style={{ height: 180, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', gap: '0.3rem' }}><CircleDashed size={22} /><span style={{ fontSize: '0.8rem' }}>{label}</span></div>;
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
