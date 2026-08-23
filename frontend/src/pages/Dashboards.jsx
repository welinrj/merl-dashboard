// =============================================================================
// Dashboards.jsx — DoCC MERL dashboards, all derived from the standardised
// dataset (the "DISPLAY" end of ENTER ONCE -> STORE -> DISPLAY -> REPORT).
// Tabs: Executive Portfolio, Project, Results & Indicators, Financial,
// Geographic, Risks, Reporting. Everything is computed client-side from the
// public.v_* views; no separate dashboard tables.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, FolderKanban, Target, Wallet, MapPin, AlertTriangle, FileCheck,
  Users, Activity, TrendingUp, Clock,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import StatTile from '../components/ui/StatTile';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/LoadingSkeleton';
import FilterBar from '../components/ui/FilterBar';
import * as OPT from '../constants/formOptions';
import { fmtAmount, fmtPct, utilisationPct } from '../lib/docc/reporting';

const TABS = [
  { key: 'portfolio', label: 'Executive Portfolio', Icon: LayoutDashboard },
  { key: 'project',   label: 'Project',             Icon: FolderKanban },
  { key: 'results',   label: 'Results & Indicators', Icon: Target },
  { key: 'financial', label: 'Financial',           Icon: Wallet },
  { key: 'geographic', label: 'Geographic',         Icon: MapPin },
  { key: 'risks',     label: 'Risks',               Icon: AlertTriangle },
  { key: 'reporting', label: 'Reporting',           Icon: FileCheck },
];

const ACTIVE_STATUSES = ['approved', 'not_started', 'on_track', 'at_risk', 'delayed'];
const today = () => new Date().toISOString().slice(0, 10);

// latest row per project_id, by created_at
function latestByProject(rows) {
  const m = new Map();
  for (const r of rows) {
    const prev = m.get(r.project_id);
    if (!prev || (r.created_at ?? '') > (prev.created_at ?? '')) m.set(r.project_id, r);
  }
  return m;
}
const countBy = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) { for (const k of [].concat(keyFn(r)).filter(Boolean)) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const sum = (rows, f) => rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);

export default function Dashboards({ initialTab }) {
  const [tab, setTab] = useState(initialTab || 'portfolio');
  const [d, setD] = useState(null); // loaded datasets
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const q = (v, cols) => supabase.from(v).select(cols);
      const [proj, fin, risk, ben, act, ind, prog, rep, loc, obj, oc, op] = await Promise.all([
        q('v_projects', 'id, code, name, status, budget_vuv, spent_vuv, provinces, donor, category, start_date, end_date'),
        q('v_financial_progress', 'project_id, approved_budget, cumulative_expenditure, remaining_balance, utilisation_pct, funds_received, funds_available, reporting_period, created_at'),
        q('v_risks_issues', 'project_id, code, type, description, category, likelihood, impact, risk_rating, status, due_date, date_resolved, responsible_person'),
        q('v_beneficiaries', 'project_id, total_direct, female, male, other_gender, youth, persons_with_disability, other_vulnerable, indirect, reporting_period'),
        q('v_project_activities', 'project_id, code, name, status, physical_progress_pct, output_code'),
        q('v_project_indicators', 'project_id, code, name, baseline_value, target_value, indicator_level'),
        q('v_indicator_progress', 'project_id, indicator_id, indicator_code, cumulative_actual, achievement_pct, performance_status, reporting_period, final_target, created_at'),
        q('v_reporting_periods', 'project_id, period_label, period_type, submission_status, period_end'),
        q('v_project_locations', 'project_id, province, island, area_council, community, beneficiaries, latitude, longitude'),
        q('v_objectives', 'project_id, code, statement'),
        q('v_outcomes', 'project_id, code, statement, objective_id'),
        q('v_outputs', 'project_id, code, statement, outcome_id'),
      ]);
      setD({
        projects: proj.data ?? [], financial: fin.data ?? [], risks: risk.data ?? [],
        beneficiaries: ben.data ?? [], activities: act.data ?? [], indicators: ind.data ?? [],
        progress: prog.data ?? [], reporting: rep.data ?? [], locations: loc.data ?? [],
        objectives: obj.data ?? [], outcomes: oc.data ?? [], outputs: op.data ?? [],
      });
      if ((proj.data ?? []).length && !projectId) setProjectId(proj.data[0].id);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data freshness (§76): latest approved reporting period.
  const dataAsAt = useMemo(() => {
    const approved = (d?.reporting || []).filter((r) => r.submission_status === 'approved' && r.period_end);
    if (!approved.length) return null;
    const latest = approved.map((r) => r.period_end).sort().pop();
    return new Date(latest).toLocaleDateString('en-VU', { year: 'numeric', month: 'short', day: 'numeric' });
  }, [d]);

  if (loading || !d) {
    return (
      <div className="page-pad" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <PageHeader icon={LayoutDashboard} title="Dashboards" subtitle="Portfolio monitoring across the L&D programme." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.7rem' }}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-pad" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        .db-tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin:1rem 0}
        .db-tab{display:inline-flex;align-items:center;gap:.35rem;padding:.45rem .8rem;border-radius:9999px;border:1px solid var(--border);background:var(--white);cursor:pointer;font-size:.8125rem;font-weight:600;color:var(--text-2)}
        .db-tab.active{background:var(--green-600);color:#fff;border-color:var(--green-600)}
        .db-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:.7rem}
        .db-2{display:grid;grid-template-columns:repeat(2,1fr);gap:.9rem;margin-top:1rem}
        .db-card{background:var(--white);border:1px solid var(--border);border-radius:12px;padding:1rem}
        .db-h{font-size:.9rem;font-weight:700;margin:0 0 .7rem}
        .db-table{width:100%;border-collapse:collapse;font-size:.83rem}
        .db-table th,.db-table td{padding:.45rem .5rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .db-table th{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)}
        @media (max-width:900px){.db-kpis{grid-template-columns:repeat(2,1fr)}.db-2{grid-template-columns:1fr}}
        @media (max-width:420px){.db-kpis{grid-template-columns:1fr}}
      `}</style>

      <PageHeader
        icon={LayoutDashboard}
        title="Dashboards"
        subtitle="Portfolio monitoring across the L&D programme."
        actions={dataAsAt ? (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Data as at: <strong style={{ color: 'var(--text-2)' }}>{dataAsAt}</strong></span>
        ) : null}
      />

      {d.projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No project data available"
          description="Register your first project to begin portfolio monitoring." />
      ) : (
      <>
      <div className="db-tabs">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} className={`db-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {tab === 'project' && (
        <div style={{ marginBottom: '0.5rem', maxWidth: 420 }}>
          <label className="field-label">Project</label>
          <select className="field-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {d.projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
      )}

      {tab === 'portfolio' && <Portfolio d={d} onNavigate={setTab} />}
      {tab === 'project' && <ProjectView d={d} projectId={projectId} />}
      {tab === 'results' && <Results d={d} />}
      {tab === 'financial' && <Financial d={d} />}
      {tab === 'geographic' && <Geographic d={d} />}
      {tab === 'risks' && <Risks d={d} />}
      {tab === 'reporting' && <Reporting d={d} />}
      </>
      )}
    </div>
  );
}

// ── Reusable bits ────────────────────────────────────────────────────────────
function BarList({ rows, total, accent = 'var(--green-600)' }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No data.</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
      {rows.map(([label, n]) => (
        <div key={label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 2 }}>
            <span style={{ color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{label}</span>
            <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{n}{total ? ` · ${Math.round((n / total) * 100)}%` : ''}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: 'var(--green-50)', overflow: 'hidden' }}>
            <div style={{ width: `${(n / max) * 100}%`, height: '100%', background: accent }} />
          </div>
        </div>
      ))}
    </div>
  );
}
const perfTint = (s) => ({ on_track: '#16a34a', target_achieved: '#0891b2', attention_required: '#d97706', off_track: '#dc2626', no_data: '#94a3b8' }[s] || '#94a3b8');

// ── Executive Portfolio ──────────────────────────────────────────────────────
function Portfolio({ d, onNavigate }) {
  const [flt, setFlt] = useState({ status: '', theme: '', province: '', donor: '' });

  // Distinct filter options from the loaded projects (§25).
  const opts = useMemo(() => {
    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
    return {
      provinces: uniq(d.projects.flatMap((p) => p.provinces || [])),
      themes: uniq(d.projects.map((p) => p.category)),
      donors: uniq(d.projects.map((p) => p.donor)),
    };
  }, [d]);

  const m = useMemo(() => {
    // Apply the global filters to the project set, then scope child data to it.
    const projects = d.projects.filter((p) =>
      (!flt.status || p.status === flt.status)
      && (!flt.theme || p.category === flt.theme)
      && (!flt.province || (p.provinces || []).includes(flt.province))
      && (!flt.donor || p.donor === flt.donor));
    const pid = new Set(projects.map((p) => p.id));
    const within = (arr) => arr.filter((r) => pid.has(r.project_id));
    const financial = within(d.financial), risks = within(d.risks), progress = within(d.progress);
    const activities = within(d.activities), beneficiaries = within(d.beneficiaries), reporting = within(d.reporting);

    const fin = latestByProject(financial);
    const totalBudget = sum(projects, (p) => p.budget_vuv);
    const totalExp = [...fin.values()].reduce((a, r) => a + (Number(r.cumulative_expenditure) || 0), 0)
      || sum(projects, (p) => p.spent_vuv);
    const openRisks = risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status));
    const overdue = risks.filter((r) => r.due_date && r.due_date < today() && !['resolved', 'closed'].includes(r.status));
    const achieved = progress.filter((p) => p.achievement_pct != null);
    const avgAch = achieved.length ? Math.round(achieved.reduce((a, r) => a + Number(r.achievement_pct), 0) / achieved.length) : null;

    // Attention Required (§31) — clickable management intelligence.
    const atRiskDelayed = projects.filter((p) => ['at_risk', 'delayed'].includes(p.status)).length;
    const offTrack = progress.filter((p) => p.performance_status === 'off_track').length;
    const reportsOverdue = reporting.filter((r) => r.period_end && r.period_end < today() && r.submission_status !== 'approved').length;
    const highRiskOverdue = risks.filter((r) => ['high', 'critical', 'severe'].includes(String(r.risk_rating || '').toLowerCase())
      && r.due_date && r.due_date < today() && !['resolved', 'closed'].includes(r.status)).length;
    const attention = [];
    if (atRiskDelayed) attention.push({ label: `${atRiskDelayed} project${atRiskDelayed === 1 ? '' : 's'} at risk or delayed`, tab: 'portfolio', tone: 'amber' });
    if (offTrack) attention.push({ label: `${offTrack} indicator${offTrack === 1 ? '' : 's'} off track`, tab: 'results', tone: 'red' });
    if (reportsOverdue) attention.push({ label: `${reportsOverdue} report${reportsOverdue === 1 ? '' : 's'} overdue`, tab: 'reporting', tone: 'red' });
    if (highRiskOverdue) attention.push({ label: `${highRiskOverdue} high-risk action${highRiskOverdue === 1 ? '' : 's'} overdue`, tab: 'risks', tone: 'red' });

    // Physical vs financial progress (§32).
    const physAgg = {};
    activities.forEach((a) => {
      if (a.physical_progress_pct != null) { const g = physAgg[a.project_id] || (physAgg[a.project_id] = { s: 0, n: 0 }); g.s += Number(a.physical_progress_pct); g.n += 1; }
    });
    const pf = projects.map((p) => {
      const ph = physAgg[p.id] ? Math.round(physAgg[p.id].s / physAgg[p.id].n) : null;
      const f = fin.get(p.id);
      const finPct = f?.utilisation_pct != null ? Math.round(Number(f.utilisation_pct))
        : (p.budget_vuv ? Math.round(utilisationPct(p.budget_vuv, p.spent_vuv)) : null);
      const variance = (ph != null && finPct != null) ? finPct - ph : null;
      return { code: p.code, physical: ph, financial: finPct, variance };
    }).filter((r) => r.physical != null || r.financial != null);

    // Beneficiaries & GEDSI (§38). 0 is a real value — only null means "no data".
    const bAny = (f) => beneficiaries.some((b) => b[f] != null);
    const bSum = (f) => (bAny(f) ? beneficiaries.reduce((a, b) => a + (b[f] != null ? Number(b[f]) : 0), 0) : null);
    const bRows = beneficiaries.length;
    const gedsi = {
      total: bSum('total_direct'), female: bSum('female'), male: bSum('male'),
      other: bSum('other_gender'), youth: bSum('youth'), pwd: bSum('persons_with_disability'),
      indirect: bSum('indirect'),
      completeness: bRows ? Math.round(beneficiaries.filter((b) => b.female != null || b.male != null).length / bRows * 100) : null,
    };

    return {
      attention, pf, gedsi,
      total: projects.length,
      active: projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
      completed: projects.filter((p) => ['completed', 'closed'].includes(p.status)).length,
      atRisk: projects.filter((p) => p.status === 'at_risk').length,
      delayed: projects.filter((p) => p.status === 'delayed').length,
      totalBudget, totalExp, util: utilisationPct(totalBudget, totalExp),
      actCompleted: activities.filter((a) => a.status === 'completed').length,
      openRisks: openRisks.length, overdue: overdue.length,
      beneficiaries: sum(beneficiaries, (b) => b.total_direct),
      avgAch,
      byProvince: countBy(projects, (p) => p.provinces || []),
      byDonor: countBy(projects, (p) => p.donor),
      byTheme: countBy(projects, (p) => p.category),
      byStatus: countBy(projects, (p) => OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)),
    };
  }, [d, flt]);

  return (
    <>
      <FilterBar
        filters={[
          { key: 'status', label: 'Status', value: flt.status, onChange: (v) => setFlt((s) => ({ ...s, status: v })),
            options: [{ value: '', label: 'All statuses' }, ...OPT.DOCC_PROJECT_STATUS] },
          { key: 'theme', label: 'Theme / Sector', value: flt.theme, onChange: (v) => setFlt((s) => ({ ...s, theme: v })),
            options: [{ value: '', label: 'All themes' }, ...opts.themes.map((t) => ({ value: t, label: OPT.labelOf(OPT.CLIMATE_THEME, t) || t }))] },
          { key: 'province', label: 'Province', value: flt.province, onChange: (v) => setFlt((s) => ({ ...s, province: v })),
            options: [{ value: '', label: 'All provinces' }, ...opts.provinces.map((p) => ({ value: p, label: p }))] },
          { key: 'donor', label: 'Funding Partner', value: flt.donor, onChange: (v) => setFlt((s) => ({ ...s, donor: v })),
            options: [{ value: '', label: 'All partners' }, ...opts.donors.map((x) => ({ value: x, label: x }))] },
        ]}
        onReset={() => setFlt({ status: '', theme: '', province: '', donor: '' })}
      />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: '0.6rem 0' }}>
        Showing <strong style={{ color: 'var(--text-2)' }}>{m.total}</strong> of {d.projects.length} projects
      </div>
      <div className="db-kpis">
        <StatTile label="Total Projects" value={m.total} icon={FolderKanban} accent="var(--green-600)" />
        <StatTile label="Active" value={m.active} sub={`${m.completed} completed`} icon={Activity} accent="#2563eb" />
        <StatTile label="At Risk / Delayed" value={m.atRisk + m.delayed} status={m.atRisk + m.delayed ? 'amber' : 'green'} icon={AlertTriangle} accent="#d97706" />
        <StatTile label="Total Beneficiaries" value={m.beneficiaries ? m.beneficiaries.toLocaleString() : '—'} icon={Users} accent="#7c3aed" />
        <StatTile label="Approved Budget" value={fmtAmount(m.totalBudget)} icon={Wallet} accent="var(--green-700)" />
        <StatTile label="Expenditure" value={fmtAmount(m.totalExp)} icon={Wallet} accent="#0891b2" />
        <StatTile label="Budget Utilisation" value={fmtPct(m.util)} status={m.util > 100 ? 'red' : 'green'} icon={TrendingUp} accent="#0891b2" />
        <StatTile label="Indicator Achievement" value={m.avgAch != null ? `${m.avgAch}%` : '—'} sub="avg across reported" icon={Target} accent="var(--green-600)" />
        <StatTile label="Activities Completed" value={m.actCompleted} icon={Activity} accent="#2563eb" />
        <StatTile label="Open Risks" value={m.openRisks} status={m.openRisks ? 'amber' : 'green'} icon={AlertTriangle} accent="#d97706" />
        <StatTile label="Overdue Actions" value={m.overdue} status={m.overdue ? 'red' : 'green'} icon={Clock} accent="#dc2626" />
        <StatTile label="Completed Projects" value={m.completed} icon={FileCheck} accent="var(--green-700)" />
      </div>

      {/* Attention Required (§31) */}
      {m.attention.length > 0 && (
        <div className="db-card" style={{ marginTop: '1rem', borderLeft: '3px solid var(--gold-500)' }}>
          <h3 className="db-h" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={15} style={{ color: 'var(--gold-500)' }} /> Attention Required
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {m.attention.map((a, i) => (
              <button key={i} onClick={() => onNavigate?.(a.tab)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '0.25rem 0', font: 'inherit', color: 'var(--text-1)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: a.tone === 'red' ? 'var(--red-600)' : 'var(--gold-500)' }} />
                <span style={{ fontSize: '0.83rem' }}>{a.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--green-700)', fontWeight: 700 }}>View →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Beneficiaries & GEDSI (§38) */}
      {m.gedsi.total != null && (
        <div className="db-card" style={{ marginTop: '1rem' }}>
          <h3 className="db-h" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Users size={15} style={{ color: '#7c3aed' }} /> Beneficiaries &amp; GEDSI
            {m.gedsi.completeness != null && (
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, color: m.gedsi.completeness >= 75 ? 'var(--green-700)' : 'var(--gold-500)' }}>
                Disaggregation completeness: {m.gedsi.completeness}%
              </span>
            )}
          </h3>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-1)' }}>
            {m.gedsi.total.toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-3)' }}>total direct beneficiaries</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.6rem', marginTop: '0.75rem' }}>
            {[['Female', m.gedsi.female], ['Male', m.gedsi.male], ['Other / N.R.', m.gedsi.other], ['Youth', m.gedsi.youth], ['Persons w/ disability', m.gedsi.pwd], ['Indirect', m.gedsi.indirect]].map(([lbl, val]) => (
              <div key={lbl} style={{ background: 'var(--surface-1)', borderRadius: 8, padding: '0.5rem 0.65rem' }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-1)' }}>{val != null ? val.toLocaleString() : '—'}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>{lbl}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>A dash (—) means the field was not reported; 0 is a reported value.</p>
        </div>
      )}

      <div className="db-2">
        <div className="db-card"><h3 className="db-h">Projects by Province</h3><BarList rows={m.byProvince} total={m.total} /></div>
        <div className="db-card"><h3 className="db-h">Projects by Donor</h3><BarList rows={m.byDonor} total={m.total} accent="#2563eb" /></div>
      </div>
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">Projects by Theme / Sector</h3><BarList rows={m.byTheme} total={m.total} accent="#7c3aed" /></div>
        <div className="db-card"><h3 className="db-h">Projects by Status</h3><BarList rows={m.byStatus} total={m.total} accent="#0891b2" /></div>
      </div>

      {/* Physical vs Financial progress (§32) */}
      {m.pf.length > 0 && (
        <div className="db-card" style={{ marginTop: '1rem' }}>
          <h3 className="db-h">Physical vs Financial Progress</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="db-table">
              <thead><tr><th>Project</th><th>Physical</th><th>Financial</th><th>Variance</th></tr></thead>
              <tbody>
                {m.pf.map((r) => {
                  const flag = r.variance != null && Math.abs(r.variance) >= 25;
                  return (
                    <tr key={r.code}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{r.code}</td>
                      <td>{r.physical != null ? `${r.physical}%` : '—'}</td>
                      <td>{r.financial != null ? `${r.financial}%` : '—'}</td>
                      <td style={{ fontWeight: 700, color: flag ? 'var(--red-600)' : 'var(--text-2)' }}>
                        {r.variance != null ? `${r.variance > 0 ? '+' : ''}${r.variance} pp` : '—'}
                        {flag && <span style={{ marginLeft: 6, fontSize: '0.62rem', color: 'var(--red-700)', background: 'var(--red-100)', borderRadius: 9999, padding: '0.05rem 0.4rem' }}>CHECK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>
            Financial minus physical progress. A large gap (±25pp) is flagged for review — it is a prompt to check, not a conclusion.
          </p>
        </div>
      )}
    </>
  );
}

// ── Project dashboard ────────────────────────────────────────────────────────
function ProjectView({ d, projectId }) {
  const p = d.projects.find((x) => x.id === projectId);
  const fin = useMemo(() => latestByProject(d.financial.filter((f) => f.project_id === projectId)).get(projectId), [d, projectId]);
  if (!p) return <p style={{ color: 'var(--text-3)' }}>Select a project.</p>;
  const acts = d.activities.filter((a) => a.project_id === projectId);
  const risks = d.risks.filter((r) => r.project_id === projectId);
  const inds = d.indicators.filter((i) => i.project_id === projectId);
  const prog = d.progress.filter((x) => x.project_id === projectId);
  const rep = d.reporting.filter((r) => r.project_id === projectId).sort((a, b) => (b.period_end ?? '').localeCompare(a.period_end ?? ''))[0];
  const budget = fin?.approved_budget ?? p.budget_vuv;
  const exp = fin?.cumulative_expenditure ?? p.spent_vuv;
  const physAvg = acts.filter((a) => a.physical_progress_pct != null);
  const phys = physAvg.length ? Math.round(physAvg.reduce((a, x) => a + Number(x.physical_progress_pct), 0) / physAvg.length) : null;
  const ben = sum(d.beneficiaries.filter((b) => b.project_id === projectId), (b) => b.total_direct);

  return (
    <>
      <div className="db-card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{p.code} — {p.name}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>
              {p.donor || 'Donor —'} · {p.category || 'Theme —'} · {(p.provinces || []).join(', ') || 'National'}
            </div>
          </div>
          <span style={{ alignSelf: 'flex-start', fontSize: '0.72rem', fontWeight: 700, color: '#fff', background: 'var(--green-700)', padding: '0.25rem 0.6rem', borderRadius: 9999 }}>
            {OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}
          </span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '0.4rem' }}>
          Timeline: {p.start_date || '—'} → {p.end_date || '—'}
        </div>
      </div>
      <div className="db-kpis">
        <StatTile label="Approved Budget" value={fmtAmount(budget)} icon={Wallet} accent="var(--green-700)" />
        <StatTile label="Expenditure" value={fmtAmount(exp)} icon={Wallet} accent="#0891b2" />
        <StatTile label="Financial Utilisation" value={fmtPct(utilisationPct(budget, exp))} icon={TrendingUp} accent="#0891b2" />
        <StatTile label="Physical Progress" value={phys != null ? `${phys}%` : '—'} sub="avg of activities" icon={Activity} accent="var(--green-600)" />
        <StatTile label="Beneficiaries" value={ben ? ben.toLocaleString() : '—'} icon={Users} accent="#7c3aed" />
        <StatTile label="Activities" value={acts.length} sub={`${acts.filter((a) => a.status === 'completed').length} completed`} icon={Activity} accent="#2563eb" />
        <StatTile label="Open Risks" value={risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length} status="amber" icon={AlertTriangle} accent="#d97706" />
        <StatTile label="Latest Report" value={rep ? OPT.labelOf(OPT.SUBMISSION_STATUS, rep.submission_status) : '—'} sub={rep?.period_label} icon={FileCheck} accent="var(--green-700)" />
      </div>
      <div className="db-2">
        <div className="db-card">
          <h3 className="db-h">Indicator Performance</h3>
          {inds.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No indicators.</p> : (
            <div style={{ overflowX: 'auto' }}><table className="db-table">
              <thead><tr><th>Code</th><th>Indicator</th><th>Baseline</th><th>Target</th><th>Current</th><th>Ach.</th></tr></thead>
              <tbody>
                {inds.map((i) => {
                  const last = prog.filter((x) => x.indicator_id === i.id).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
                  return (
                    <tr key={i.code}>
                      <td>{i.code}</td><td>{i.name}</td><td>{i.baseline_value ?? '—'}</td><td>{i.target_value ?? '—'}</td>
                      <td>{last?.cumulative_actual ?? '—'}</td>
                      <td style={{ color: perfTint(last?.performance_status), fontWeight: 700 }}>{fmtPct(last?.achievement_pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </div>
        <div className="db-card">
          <h3 className="db-h">Activity Progress</h3>
          {acts.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No activities.</p> : (
            <BarList rows={countBy(acts, (a) => OPT.labelOf(OPT.ACTIVITY_STATUS, a.status))} total={acts.length} />
          )}
          <h3 className="db-h" style={{ marginTop: '1rem' }}>Risks</h3>
          {risks.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No risks.</p> : (
            <BarList rows={countBy(risks, (r) => r.risk_rating || 'Unrated')} accent="#dc2626" />
          )}
        </div>
      </div>
    </>
  );
}

// ── Results & Indicators ─────────────────────────────────────────────────────
function Results({ d }) {
  const perf = countBy(d.progress, (p) => OPT.labelOf(OPT.PERFORMANCE_STATUS, p.performance_status || 'no_data'));
  return (
    <>
      <div className="db-kpis">
        <StatTile label="Objectives" value={d.objectives.length} icon={Target} accent="var(--green-700)" />
        <StatTile label="Outcomes" value={d.outcomes.length} icon={Target} accent="#2563eb" />
        <StatTile label="Outputs" value={d.outputs.length} icon={Target} accent="#7c3aed" />
        <StatTile label="Indicators" value={d.indicators.length} icon={Activity} accent="var(--green-600)" />
      </div>
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">Indicator Performance Status</h3><BarList rows={perf} total={d.progress.length} accent="#0891b2" /></div>
        <div className="db-card"><h3 className="db-h">Indicators by Level</h3><BarList rows={countBy(d.indicators, (i) => OPT.labelOf(OPT.INDICATOR_LEVEL, i.indicator_level || '—'))} total={d.indicators.length} accent="#7c3aed" /></div>
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">Latest reported indicators</h3>
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>Indicator</th><th>Period</th><th>Current</th><th>Target</th><th>Achievement</th><th>Status</th></tr></thead>
          <tbody>
            {d.progress.slice(0, 30).map((r, idx) => (
              <tr key={idx}>
                <td>{r.indicator_code}</td><td>{r.reporting_period}</td><td>{r.cumulative_actual ?? '—'}</td>
                <td>{r.final_target ?? '—'}</td>
                <td style={{ fontWeight: 700 }}>{fmtPct(r.achievement_pct)}</td>
                <td style={{ color: perfTint(r.performance_status) }}>{OPT.labelOf(OPT.PERFORMANCE_STATUS, r.performance_status)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

// ── Financial ────────────────────────────────────────────────────────────────
function Financial({ d }) {
  const fin = latestByProject(d.financial);
  const rows = d.projects.map((p) => {
    const f = fin.get(p.id);
    const budget = f?.approved_budget ?? p.budget_vuv;
    const exp = f?.cumulative_expenditure ?? p.spent_vuv;
    return { code: p.code, name: p.name, budget, exp, util: utilisationPct(budget, exp), avail: f?.funds_available };
  });
  const totalBudget = sum(rows, (r) => r.budget); const totalExp = sum(rows, (r) => r.exp);
  return (
    <>
      <div className="db-kpis">
        <StatTile label="Total Approved" value={fmtAmount(totalBudget)} icon={Wallet} accent="var(--green-700)" />
        <StatTile label="Total Expenditure" value={fmtAmount(totalExp)} icon={Wallet} accent="#0891b2" />
        <StatTile label="Remaining" value={fmtAmount(totalBudget - totalExp)} icon={Wallet} accent="var(--green-600)" />
        <StatTile label="Utilisation" value={fmtPct(utilisationPct(totalBudget, totalExp))} icon={TrendingUp} accent="#0891b2" />
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">Budget vs Expenditure by project</h3>
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>Code</th><th>Project</th><th>Approved</th><th>Expenditure</th><th>Remaining</th><th>Utilisation</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code}>
                <td>{r.code}</td><td>{r.name}</td><td>{fmtAmount(r.budget)}</td><td>{fmtAmount(r.exp)}</td>
                <td>{fmtAmount((Number(r.budget) || 0) - (Number(r.exp) || 0))}</td>
                <td style={{ fontWeight: 700, color: (r.util ?? 0) > 100 ? '#dc2626' : 'var(--text-1)' }}>{fmtPct(r.util)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </>
  );
}

// ── Geographic ───────────────────────────────────────────────────────────────
function Geographic({ d }) {
  const byProvince = countBy(d.locations, (l) => l.province);
  const byIsland = countBy(d.locations, (l) => l.island);
  const byAC = countBy(d.locations, (l) => l.area_council);
  const benByProvince = (() => {
    const m = new Map();
    for (const l of d.locations) if (l.province) m.set(l.province, (m.get(l.province) || 0) + (Number(l.beneficiaries) || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const withCoords = d.locations.filter((l) => l.latitude != null && l.longitude != null);
  return (
    <>
      <div className="db-kpis">
        <StatTile label="Sites" value={d.locations.length} icon={MapPin} accent="var(--green-700)" />
        <StatTile label="Provinces" value={byProvince.length} icon={MapPin} accent="#2563eb" />
        <StatTile label="Area Councils" value={byAC.length} icon={MapPin} accent="#7c3aed" />
        <StatTile label="Geo-tagged" value={withCoords.length} sub="with coordinates" icon={MapPin} accent="#0891b2" />
      </div>
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">Sites by Province</h3><BarList rows={byProvince} total={d.locations.length} /></div>
        <div className="db-card"><h3 className="db-h">Beneficiaries by Province</h3><BarList rows={benByProvince} accent="#7c3aed" /></div>
      </div>
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">Sites by Island</h3><BarList rows={byIsland} accent="#2563eb" /></div>
        <div className="db-card"><h3 className="db-h">Sites by Area Council</h3><BarList rows={byAC} accent="#0891b2" /></div>
      </div>
    </>
  );
}

// ── Risks ────────────────────────────────────────────────────────────────────
// 5x5 risk matrix band from likelihood x impact score (§37).
function riskBand(score) {
  if (score >= 15) return { key: 'critical', label: 'Critical', bg: '#b3402f', fg: '#fff' };
  if (score >= 10) return { key: 'high', label: 'High', bg: '#e06636', fg: '#fff' };
  if (score >= 5) return { key: 'medium', label: 'Medium', bg: '#e0a12a', fg: '#3a2e12' };
  return { key: 'low', label: 'Low', bg: '#2f8f6b', fg: '#fff' };
}

function Risks({ d }) {
  const [cell, setCell] = useState(null); // { l, i } selected matrix cell
  const open = d.risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status));
  const critical = d.risks.filter((r) => ['Critical', 'High'].includes(r.risk_rating));
  const overdue = d.risks.filter((r) => r.due_date && r.due_date < today() && !['resolved', 'closed'].includes(r.status));
  const resolved = d.risks.filter((r) => ['resolved', 'closed'].includes(r.status));

  // Count active risks per (likelihood, impact) cell.
  const active = d.risks.filter((r) => !['resolved', 'closed'].includes(r.status) && r.likelihood && r.impact);
  const cellCount = (l, i) => active.filter((r) => Number(r.likelihood) === l && Number(r.impact) === i).length;
  const tableRisks = cell
    ? active.filter((r) => Number(r.likelihood) === cell.l && Number(r.impact) === cell.i)
    : open;

  return (
    <>
      <div className="db-kpis">
        <StatTile label="Critical / High" value={critical.length} status={critical.length ? 'red' : 'green'} icon={AlertTriangle} accent="#dc2626" />
        <StatTile label="Open" value={open.length} status={open.length ? 'amber' : 'green'} icon={AlertTriangle} accent="#d97706" />
        <StatTile label="Overdue Actions" value={overdue.length} status={overdue.length ? 'red' : 'green'} icon={Clock} accent="#dc2626" />
        <StatTile label="Resolved" value={resolved.length} icon={FileCheck} accent="var(--green-700)" />
      </div>

      {/* 5x5 Risk Matrix (§37) */}
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">Risk Matrix — Likelihood × Impact</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <tbody>
              {[5, 4, 3, 2, 1].map((i) => (
                <tr key={i}>
                  {i === 5 && <td rowSpan={5} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 0.3rem' }}>Impact →</td>}
                  <td style={{ fontWeight: 700, color: 'var(--text-3)', padding: '0 0.4rem', textAlign: 'right' }}>{i}</td>
                  {[1, 2, 3, 4, 5].map((l) => {
                    const n = cellCount(l, i);
                    const band = riskBand(l * i);
                    const sel = cell && cell.l === l && cell.i === i;
                    return (
                      <td key={l} style={{ padding: 2 }}>
                        <button onClick={() => setCell(sel ? null : { l, i })}
                          title={`Likelihood ${l} × Impact ${i} — ${band.label}`}
                          style={{ width: 46, height: 40, border: sel ? '2px solid var(--ink)' : '1px solid rgba(0,0,0,0.08)', borderRadius: 6,
                            background: band.bg, color: band.fg, fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', opacity: n === 0 ? 0.4 : 1 }}>
                          {n || ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td /><td />
                {[1, 2, 3, 4, 5].map((l) => <td key={l} style={{ textAlign: 'center', fontWeight: 700, color: 'var(--text-3)', paddingTop: 2 }}>{l}</td>)}
              </tr>
              <tr><td /><td /><td colSpan={5} style={{ textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 2 }}>Likelihood →</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.6rem', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-3)' }}>
          {['low', 'medium', 'high', 'critical'].map((k) => { const b = riskBand(k === 'low' ? 1 : k === 'medium' ? 6 : k === 'high' ? 12 : 20); return (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: 11, height: 11, borderRadius: 3, background: b.bg }} />{b.label}</span>
          ); })}
          {cell && <button onClick={() => setCell(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--green-700)', fontWeight: 700, cursor: 'pointer' }}>Clear cell filter ×</button>}
        </div>
      </div>

      <div className="db-2">
        <div className="db-card"><h3 className="db-h">By Category</h3><BarList rows={countBy(d.risks, (r) => OPT.labelOf(OPT.RISK_CATEGORY, r.category || 'other'))} total={d.risks.length} accent="#d97706" /></div>
        <div className="db-card"><h3 className="db-h">By Rating</h3><BarList rows={countBy(d.risks, (r) => r.risk_rating || 'Unrated')} total={d.risks.length} accent="#dc2626" /></div>
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">{cell ? `Risks at Likelihood ${cell.l} × Impact ${cell.i}` : 'Open risks & issues'}</h3>
        {tableRisks.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No risks in this cell.</p>
        ) : (
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Rating</th><th>Due</th><th>Owner</th></tr></thead>
          <tbody>
            {tableRisks.slice(0, 40).map((r) => (
              <tr key={r.code}>
                <td>{r.code}</td><td>{OPT.labelOf(OPT.RISK_TYPE, r.type)}</td>
                <td>{(r.description || '').slice(0, 60)}</td>
                <td style={{ fontWeight: 700 }}>{r.risk_rating || '—'}</td>
                <td style={{ color: r.due_date && r.due_date < today() ? '#dc2626' : 'inherit' }}>{r.due_date || '—'}</td>
                <td>{r.responsible_person || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        )}
      </div>
    </>
  );
}

// ── Reporting ────────────────────────────────────────────────────────────────
function Reporting({ d }) {
  const by = (s) => d.reporting.filter((r) => r.submission_status === s).length;
  const overdue = d.reporting.filter((r) => r.period_end && r.period_end < today() && r.submission_status !== 'approved').length;
  return (
    <>
      <div className="db-kpis">
        <StatTile label="Draft" value={by('draft')} icon={FileCheck} accent="#64748b" />
        <StatTile label="Submitted" value={by('submitted')} icon={FileCheck} accent="#2563eb" />
        <StatTile label="Returned" value={by('returned')} status={by('returned') ? 'amber' : 'green'} icon={FileCheck} accent="#d97706" />
        <StatTile label="Reviewed" value={by('reviewed')} icon={FileCheck} accent="#7c3aed" />
        <StatTile label="Approved" value={by('approved')} icon={FileCheck} accent="var(--green-700)" />
        <StatTile label="Overdue" value={overdue} status={overdue ? 'red' : 'green'} icon={Clock} accent="#dc2626" />
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">Reporting periods</h3>
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>Project</th><th>Period</th><th>Type</th><th>End</th><th>Status</th></tr></thead>
          <tbody>
            {d.reporting.slice(0, 40).map((r, i) => {
              const proj = d.projects.find((p) => p.id === r.project_id);
              return (
                <tr key={i}>
                  <td>{proj?.code || '—'}</td><td>{r.period_label}</td>
                  <td>{OPT.labelOf(OPT.PERIOD_TYPE, r.period_type)}</td><td>{r.period_end || '—'}</td>
                  <td>{OPT.labelOf(OPT.SUBMISSION_STATUS, r.submission_status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </>
  );
}
