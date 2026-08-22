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

export default function Dashboards() {
  const [tab, setTab] = useState('portfolio');
  const [d, setD] = useState(null); // loaded datasets
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const q = (v, cols) => supabase.from(v).select(cols);
      const [proj, fin, risk, ben, act, ind, prog, rep, loc, obj, oc, op] = await Promise.all([
        q('v_projects', 'id, code, name, status, budget_vuv, spent_vuv, provinces, donor, category, start_date, end_date'),
        q('v_financial_progress', 'project_id, approved_budget, cumulative_expenditure, remaining_balance, utilisation_pct, funds_received, funds_available, reporting_period, created_at'),
        q('v_risks_issues', 'project_id, code, type, description, category, risk_rating, status, due_date, date_resolved, responsible_person'),
        q('v_beneficiaries', 'project_id, total_direct, female, male, persons_with_disability, reporting_period'),
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

  if (loading || !d) {
    return <div className="page-pad"><p style={{ color: 'var(--text-3)' }}>Loading dashboards…</p></div>;
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

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <LayoutDashboard size={22} style={{ color: 'var(--green-700)' }} />
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem,4vw,1.9rem)', fontWeight: 700, margin: 0 }}>Dashboards</h1>
      </div>

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

      {tab === 'portfolio' && <Portfolio d={d} />}
      {tab === 'project' && <ProjectView d={d} projectId={projectId} />}
      {tab === 'results' && <Results d={d} />}
      {tab === 'financial' && <Financial d={d} />}
      {tab === 'geographic' && <Geographic d={d} />}
      {tab === 'risks' && <Risks d={d} />}
      {tab === 'reporting' && <Reporting d={d} />}
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
function Portfolio({ d }) {
  const m = useMemo(() => {
    const fin = latestByProject(d.financial);
    const totalBudget = sum(d.projects, (p) => p.budget_vuv);
    const totalExp = [...fin.values()].reduce((a, r) => a + (Number(r.cumulative_expenditure) || 0), 0)
      || sum(d.projects, (p) => p.spent_vuv);
    const openRisks = d.risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status));
    const overdue = d.risks.filter((r) => r.due_date && r.due_date < today() && !['resolved', 'closed'].includes(r.status));
    const achieved = d.progress.filter((p) => p.achievement_pct != null);
    const avgAch = achieved.length ? Math.round(achieved.reduce((a, r) => a + Number(r.achievement_pct), 0) / achieved.length) : null;
    return {
      total: d.projects.length,
      active: d.projects.filter((p) => ACTIVE_STATUSES.includes(p.status)).length,
      completed: d.projects.filter((p) => ['completed', 'closed'].includes(p.status)).length,
      atRisk: d.projects.filter((p) => p.status === 'at_risk').length,
      delayed: d.projects.filter((p) => p.status === 'delayed').length,
      totalBudget, totalExp, util: utilisationPct(totalBudget, totalExp),
      actCompleted: d.activities.filter((a) => a.status === 'completed').length,
      openRisks: openRisks.length, overdue: overdue.length,
      beneficiaries: sum(d.beneficiaries, (b) => b.total_direct),
      avgAch,
      byProvince: countBy(d.projects, (p) => p.provinces || []),
      byDonor: countBy(d.projects, (p) => p.donor),
      byTheme: countBy(d.projects, (p) => p.category),
    };
  }, [d]);

  return (
    <>
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
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">Projects by Province</h3><BarList rows={m.byProvince} total={m.total} /></div>
        <div className="db-card"><h3 className="db-h">Projects by Donor</h3><BarList rows={m.byDonor} total={m.total} accent="#2563eb" /></div>
      </div>
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">Projects by Theme / Sector</h3><BarList rows={m.byTheme} total={m.total} accent="#7c3aed" /></div>
        <div className="db-card"><h3 className="db-h">Projects by Status</h3><BarList rows={countBy(d.projects, (p) => OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status))} total={m.total} accent="#0891b2" /></div>
      </div>
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
function Risks({ d }) {
  const open = d.risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status));
  const critical = d.risks.filter((r) => ['Critical', 'High'].includes(r.risk_rating));
  const overdue = d.risks.filter((r) => r.due_date && r.due_date < today() && !['resolved', 'closed'].includes(r.status));
  const resolved = d.risks.filter((r) => ['resolved', 'closed'].includes(r.status));
  return (
    <>
      <div className="db-kpis">
        <StatTile label="Critical / High" value={critical.length} status={critical.length ? 'red' : 'green'} icon={AlertTriangle} accent="#dc2626" />
        <StatTile label="Open" value={open.length} status={open.length ? 'amber' : 'green'} icon={AlertTriangle} accent="#d97706" />
        <StatTile label="Overdue Actions" value={overdue.length} status={overdue.length ? 'red' : 'green'} icon={Clock} accent="#dc2626" />
        <StatTile label="Resolved" value={resolved.length} icon={FileCheck} accent="var(--green-700)" />
      </div>
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">By Category</h3><BarList rows={countBy(d.risks, (r) => OPT.labelOf(OPT.RISK_CATEGORY, r.category || 'other'))} total={d.risks.length} accent="#d97706" /></div>
        <div className="db-card"><h3 className="db-h">By Rating</h3><BarList rows={countBy(d.risks, (r) => r.risk_rating || 'Unrated')} total={d.risks.length} accent="#dc2626" /></div>
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">Open risks &amp; issues</h3>
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Rating</th><th>Due</th><th>Owner</th></tr></thead>
          <tbody>
            {open.slice(0, 40).map((r) => (
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
