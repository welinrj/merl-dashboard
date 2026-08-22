// =============================================================================
// Reports.jsx — DoCC MERL report generators, built directly from the
// standardised dataset (the "REPORT" end of ENTER ONCE -> STORE -> DISPLAY ->
// REPORT). No separate report datasets: every report reads the public.v_*
// views and renders a printable document (Print -> Save as PDF).
// Report types: Project Progress, Portfolio Performance, Indicator Performance,
// Financial Performance, Geographic/Provincial, Funding Partner/Donor.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { FileBarChart, Printer } from 'lucide-react';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';
import { fmtAmount, fmtPct, utilisationPct } from '../lib/docc/reporting';

const REPORT_TYPES = [
  { key: 'project',    label: 'Project Progress Report' },
  { key: 'portfolio',  label: 'Portfolio Performance Report' },
  { key: 'indicator',  label: 'Indicator Performance Report' },
  { key: 'financial',  label: 'Financial Performance Report' },
  { key: 'geographic', label: 'Geographic / Provincial Report' },
  { key: 'donor',      label: 'Funding Partner / Donor Report' },
];

const sum = (rows, f) => rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);
function latestByProject(rows) {
  const m = new Map();
  for (const r of rows) { const p = m.get(r.project_id); if (!p || (r.created_at ?? '') > (p.created_at ?? '')) m.set(r.project_id, r); }
  return m;
}

export default function Reports() {
  const [d, setD] = useState(null);
  const [type, setType] = useState('project');
  const [projectId, setProjectId] = useState('');
  const [province, setProvince] = useState('');
  const [donor, setDonor] = useState('');
  const [period, setPeriod] = useState('');

  useEffect(() => {
    (async () => {
      const q = (v, cols) => supabase.from(v).select(cols);
      const [proj, fin, risk, ben, act, ind, prog, rep, loc, obj, oc, op, learn] = await Promise.all([
        q('v_projects', '*'),
        q('v_financial_progress', '*'),
        q('v_risks_issues', '*'),
        q('v_beneficiaries', '*'),
        q('v_project_activities', '*'),
        q('v_project_indicators', '*'),
        q('v_indicator_progress', '*'),
        q('v_reporting_periods', '*'),
        q('v_project_locations', '*'),
        q('v_objectives', '*'),
        q('v_outcomes', '*'),
        q('v_outputs', '*'),
        q('v_learning_updates', '*'),
      ]);
      setD({
        projects: proj.data ?? [], financial: fin.data ?? [], risks: risk.data ?? [],
        beneficiaries: ben.data ?? [], activities: act.data ?? [], indicators: ind.data ?? [],
        progress: prog.data ?? [], reporting: rep.data ?? [], locations: loc.data ?? [],
        objectives: obj.data ?? [], outcomes: oc.data ?? [], outputs: op.data ?? [], learning: learn.data ?? [],
      });
      if ((proj.data ?? []).length) setProjectId(proj.data[0].id);
    })();
  }, []);

  if (!d) return <div className="page-pad"><p style={{ color: 'var(--text-3)' }}>Loading…</p></div>;

  const donors = [...new Set(d.projects.map((p) => p.donor).filter(Boolean))];
  const provinces = ['TORBA', 'SANMA', 'PENAMA', 'MALAMPA', 'SHEFA', 'TAFEA'];

  return (
    <div className="page-pad" style={{ maxWidth: 960, margin: '0 auto' }}>
      <style>{`
        .rp-doc{background:#fff;border:1px solid var(--border);border-radius:12px;padding:2rem;margin-top:1rem;color:#1a1a1a}
        .rp-doc h2{font-family:var(--font-display);font-size:1.4rem;margin:0 0 .2rem}
        .rp-doc h3{font-size:1rem;margin:1.3rem 0 .5rem;padding-bottom:.25rem;border-bottom:2px solid var(--green-600);color:var(--green-800)}
        .rp-doc h4{font-size:.9rem;margin:.9rem 0 .3rem}
        .rp-meta{display:grid;grid-template-columns:repeat(2,1fr);gap:.3rem .9rem;font-size:.82rem;margin:.6rem 0 0}
        .rp-meta b{color:#555}
        .rp-t{width:100%;border-collapse:collapse;font-size:.8rem;margin:.4rem 0}
        .rp-t th,.rp-t td{border:1px solid #ddd;padding:.35rem .5rem;text-align:left}
        .rp-t th{background:#f4f6f5;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#555}
        .rp-narr{font-size:.85rem;line-height:1.5;white-space:pre-wrap;margin:.2rem 0}
        .rp-muted{color:#888;font-size:.82rem}
        @media (max-width:640px){.rp-meta{grid-template-columns:1fr}.rp-doc{padding:1.1rem}}
        @media print{
          body *{visibility:hidden !important}
          .rp-print,.rp-print *{visibility:visible !important}
          .rp-print{position:absolute;left:0;top:0;width:100%;border:none;border-radius:0;padding:0}
          .rp-noprint{display:none !important}
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }} className="rp-noprint">
        <FileBarChart size={22} style={{ color: 'var(--green-700)' }} />
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem,4vw,1.9rem)', fontWeight: 700, margin: 0 }}>Reports</h1>
      </div>
      <p className="rp-muted rp-noprint" style={{ margin: '0.35rem 0 0.8rem' }}>
        Generated automatically from the standardised MERL dataset. Use Print to save as PDF.
      </p>

      {/* Controls */}
      <div className="rp-noprint" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label className="field-label">Report type</label>
          <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
            {REPORT_TYPES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>
        {type === 'project' && (
          <div style={{ flex: '1 1 240px' }}>
            <label className="field-label">Project</label>
            <select className="field-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {d.projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
        )}
        {type === 'geographic' && (
          <div style={{ flex: '1 1 180px' }}>
            <label className="field-label">Province (optional)</label>
            <select className="field-input" value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="">All provinces</option>
              {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {type === 'donor' && (
          <div style={{ flex: '1 1 200px' }}>
            <label className="field-label">Donor (optional)</label>
            <select className="field-input" value={donor} onChange={(e) => setDonor(e.target.value)}>
              <option value="">All donors</option>
              {donors.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        <div style={{ flex: '0 1 160px' }}>
          <label className="field-label">Reporting period</label>
          <input className="field-input" placeholder="e.g. 2026-Q1" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--green-700)' }}>
          <Printer size={16} /> Print / PDF
        </button>
      </div>

      <div className="rp-doc rp-print">
        {type === 'project' && <ProjectProgress d={d} projectId={projectId} period={period} />}
        {type === 'portfolio' && <Portfolio d={d} period={period} />}
        {type === 'indicator' && <IndicatorReport d={d} period={period} />}
        {type === 'financial' && <FinancialReport d={d} period={period} />}
        {type === 'geographic' && <GeographicReport d={d} province={province} period={period} />}
        {type === 'donor' && <DonorReport d={d} donor={donor} period={period} />}
      </div>
    </div>
  );
}

const Section = ({ n, title, children }) => (
  <div><h3>{n}. {title}</h3>{children}</div>
);
const Narr = ({ text }) => text ? <p className="rp-narr">{text}</p> : <p className="rp-muted">Not reported.</p>;

// ── 1. Project Progress Report (14-section standard structure) ────────────────
function ProjectProgress({ d, projectId, period }) {
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) return <p className="rp-muted">Select a project.</p>;
  const fin = latestByProject(d.financial.filter((f) => f.project_id === projectId)).get(projectId);
  const inds = d.indicators.filter((i) => i.project_id === projectId);
  const prog = d.progress.filter((x) => x.project_id === projectId);
  const acts = d.activities.filter((a) => a.project_id === projectId);
  const risks = d.risks.filter((r) => r.project_id === projectId);
  const locs = d.locations.filter((l) => l.project_id === projectId);
  const bens = d.beneficiaries.filter((b) => b.project_id === projectId);
  const learn = d.learning.filter((l) => l.project_id === projectId).sort((a, b) => (b.reporting_period ?? '').localeCompare(a.reporting_period ?? ''))[0] || {};
  const budget = fin?.approved_budget ?? p.budget_vuv;
  const exp = fin?.cumulative_expenditure ?? p.spent_vuv;
  const physAvg = acts.filter((a) => a.physical_progress_pct != null);
  const phys = physAvg.length ? Math.round(physAvg.reduce((a, x) => a + Number(x.physical_progress_pct), 0) / physAvg.length) : null;
  const indLast = (i) => prog.filter((x) => x.indicator_id === i.id).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];

  return (
    <div>
      <h2>Project Progress Report</h2>
      <div className="rp-muted">{p.code} — {p.name}{period ? ` · ${period}` : ''}</div>

      <Section n="1" title="Project Information">
        <div className="rp-meta">
          <div><b>Project ID:</b> {p.code}</div>
          <div><b>Title:</b> {p.name}</div>
          <div><b>Donor:</b> {p.donor || '—'}</div>
          <div><b>Implementing:</b> {p.executing_agency || p.lead_agency || '—'}</div>
          <div><b>Duration:</b> {p.start_date || '—'} → {p.end_date || '—'}</div>
          <div><b>Approved Budget:</b> {fmtAmount(budget)} {p.currency || 'VUV'}</div>
          <div><b>Locations:</b> {(p.provinces || []).join(', ') || 'National'}</div>
          <div><b>Reporting Period:</b> {period || '—'}</div>
        </div>
      </Section>

      <Section n="2" title="Executive Summary">
        <div className="rp-meta">
          <div><b>Overall Status:</b> {OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</div>
          <div><b>Physical Progress:</b> {phys != null ? `${phys}%` : '—'}</div>
          <div><b>Financial Utilisation:</b> {fmtPct(utilisationPct(budget, exp))}</div>
          <div><b>Open Risks:</b> {risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length}</div>
        </div>
        <Narr text={learn.key_achievements} />
      </Section>

      <Section n="3" title="Progress Against Objectives, Outcomes and Outputs">
        <table className="rp-t"><thead><tr><th>Code</th><th>Level</th><th>Statement</th></tr></thead>
          <tbody>
            {d.objectives.filter((o) => o.project_id === projectId).map((o) => <tr key={o.code}><td>{o.code}</td><td>Objective</td><td>{o.statement}</td></tr>)}
            {d.outcomes.filter((o) => o.project_id === projectId).map((o) => <tr key={o.code}><td>{o.code}</td><td>Outcome</td><td>{o.statement}</td></tr>)}
            {d.outputs.filter((o) => o.project_id === projectId).map((o) => <tr key={o.code}><td>{o.code}</td><td>Output</td><td>{o.statement}</td></tr>)}
          </tbody>
        </table>
      </Section>

      <Section n="4" title="Indicator Performance">
        <table className="rp-t"><thead><tr><th>Indicator</th><th>Baseline</th><th>Period Target</th><th>Current</th><th>Final Target</th><th>Achievement %</th><th>Status</th></tr></thead>
          <tbody>
            {inds.map((i) => { const l = indLast(i); return (
              <tr key={i.code}><td>{i.code} {i.name}</td><td>{i.baseline_value ?? '—'}</td><td>{l?.period_target ?? '—'}</td>
                <td>{l?.cumulative_actual ?? '—'}</td><td>{i.target_value ?? '—'}</td><td>{fmtPct(l?.achievement_pct)}</td>
                <td>{OPT.labelOf(OPT.PERFORMANCE_STATUS, l?.performance_status)}</td></tr>); })}
            {inds.length === 0 && <tr><td colSpan={7} className="rp-muted">No indicators.</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section n="5" title="Activity Implementation">
        <table className="rp-t"><thead><tr><th>Code</th><th>Activity</th><th>Status</th><th>Progress</th><th>Planned budget</th><th>Actual exp.</th></tr></thead>
          <tbody>
            {acts.map((a) => <tr key={a.code}><td>{a.code}</td><td>{a.name}</td><td>{OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</td>
              <td>{a.physical_progress_pct != null ? `${a.physical_progress_pct}%` : '—'}</td><td>{fmtAmount(a.planned_budget)}</td><td>{fmtAmount(a.actual_expenditure)}</td></tr>)}
            {acts.length === 0 && <tr><td colSpan={6} className="rp-muted">No activities.</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section n="6" title="Financial Performance">
        <div className="rp-meta">
          <div><b>Approved Budget:</b> {fmtAmount(budget)}</div>
          <div><b>Period Budget:</b> {fmtAmount(fin?.period_budget)}</div>
          <div><b>Expenditure this period:</b> {fmtAmount(fin?.expenditure_period)}</div>
          <div><b>Cumulative Expenditure:</b> {fmtAmount(exp)}</div>
          <div><b>Remaining Balance:</b> {fmtAmount(fin?.remaining_balance ?? ((Number(budget) || 0) - (Number(exp) || 0)))}</div>
          <div><b>Utilisation %:</b> {fmtPct(fin?.utilisation_pct ?? utilisationPct(budget, exp))}</div>
        </div>
        <Narr text={fin?.narrative} />
      </Section>

      <Section n="7" title="Geographic Implementation">
        <table className="rp-t"><thead><tr><th>Province</th><th>Island</th><th>Area Council</th><th>Community</th><th>Beneficiaries</th></tr></thead>
          <tbody>
            {locs.map((l) => <tr key={l.id}><td>{l.province || '—'}</td><td>{l.island || '—'}</td><td>{l.area_council || '—'}</td><td>{l.community || '—'}</td><td>{l.beneficiaries ?? '—'}</td></tr>)}
            {locs.length === 0 && <tr><td colSpan={5} className="rp-muted">No locations recorded.</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section n="8" title="Beneficiaries & GEDSI">
        <table className="rp-t"><thead><tr><th>Period</th><th>Total Direct</th><th>Female</th><th>Male</th><th>Youth</th><th>PWD</th></tr></thead>
          <tbody>
            {bens.map((b) => <tr key={b.id}><td>{b.reporting_period || '—'}</td><td>{b.total_direct ?? '—'}</td><td>{b.female ?? '—'}</td><td>{b.male ?? '—'}</td><td>{b.youth ?? '—'}</td><td>{b.persons_with_disability ?? '—'}</td></tr>)}
            {bens.length === 0 && <tr><td colSpan={6} className="rp-muted">No beneficiary data recorded.</td></tr>}
          </tbody>
        </table>
        <p className="rp-muted">Blank cells denote data not collected (distinct from a recorded zero).</p>
      </Section>

      <Section n="9" title="Key Achievements"><Narr text={[learn.key_achievements, learn.major_results].filter(Boolean).join('\n\n')} /></Section>
      <Section n="10" title="Challenges, Risks & Corrective Actions">
        <Narr text={learn.challenges} />
        <table className="rp-t"><thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Rating</th><th>Status</th><th>Mitigation</th></tr></thead>
          <tbody>
            {risks.map((r) => <tr key={r.code}><td>{r.code}</td><td>{OPT.labelOf(OPT.RISK_TYPE, r.type)}</td><td>{r.description}</td><td>{r.risk_rating || '—'}</td><td>{OPT.labelOf(OPT.RISK_STATUS, r.status)}</td><td>{r.mitigation || '—'}</td></tr>)}
            {risks.length === 0 && <tr><td colSpan={6} className="rp-muted">No risks or issues logged.</td></tr>}
          </tbody>
        </table>
      </Section>
      <Section n="11" title="Lessons Learned"><Narr text={learn.lessons_learned} /></Section>
      <Section n="12" title="Priorities for Next Reporting Period"><Narr text={learn.next_period_priorities} /></Section>
      <Section n="13" title="Recommendations"><Narr text={learn.recommendations} /></Section>
      <Section n="14" title="Supporting Evidence"><p className="rp-muted">See the project Evidence register (Form 12) for attached documents.</p></Section>
    </div>
  );
}

// ── Portfolio Performance ─────────────────────────────────────────────────────
function Portfolio({ d, period }) {
  const fin = latestByProject(d.financial);
  const budget = sum(d.projects, (p) => p.budget_vuv);
  const exp = [...fin.values()].reduce((a, r) => a + (Number(r.cumulative_expenditure) || 0), 0);
  return (
    <div>
      <h2>Portfolio Performance Report</h2>
      <div className="rp-muted">All projects{period ? ` · ${period}` : ''}</div>
      <Section n="1" title="Portfolio Summary">
        <div className="rp-meta">
          <div><b>Projects:</b> {d.projects.length}</div>
          <div><b>Approved Budget:</b> {fmtAmount(budget)}</div>
          <div><b>Expenditure:</b> {fmtAmount(exp)}</div>
          <div><b>Utilisation:</b> {fmtPct(utilisationPct(budget, exp))}</div>
          <div><b>Total Beneficiaries:</b> {sum(d.beneficiaries, (b) => b.total_direct).toLocaleString()}</div>
          <div><b>Open Risks:</b> {d.risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length}</div>
        </div>
      </Section>
      <Section n="2" title="Projects">
        <table className="rp-t"><thead><tr><th>Code</th><th>Project</th><th>Status</th><th>Donor</th><th>Budget</th><th>Expenditure</th><th>Utilisation</th></tr></thead>
          <tbody>
            {d.projects.map((p) => { const f = fin.get(p.id); const b = f?.approved_budget ?? p.budget_vuv; const e = f?.cumulative_expenditure ?? p.spent_vuv;
              return <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</td><td>{p.donor || '—'}</td><td>{fmtAmount(b)}</td><td>{fmtAmount(e)}</td><td>{fmtPct(utilisationPct(b, e))}</td></tr>; })}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ── Indicator Performance ─────────────────────────────────────────────────────
function IndicatorReport({ d, period }) {
  const rows = period ? d.progress.filter((r) => r.reporting_period === period) : d.progress;
  return (
    <div>
      <h2>Indicator Performance Report</h2>
      <div className="rp-muted">{period || 'All periods'}</div>
      <table className="rp-t"><thead><tr><th>Indicator</th><th>Period</th><th>Period Target</th><th>Current</th><th>Final Target</th><th>Achievement %</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}><td>{r.indicator_code} {r.indicator_name}</td><td>{r.reporting_period}</td><td>{r.period_target ?? '—'}</td><td>{r.cumulative_actual ?? '—'}</td><td>{r.final_target ?? '—'}</td><td>{fmtPct(r.achievement_pct)}</td><td>{OPT.labelOf(OPT.PERFORMANCE_STATUS, r.performance_status)}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={7} className="rp-muted">No indicator progress recorded.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Financial Performance ─────────────────────────────────────────────────────
function FinancialReport({ d }) {
  const fin = latestByProject(d.financial);
  let tb = 0, te = 0;
  const rows = d.projects.map((p) => { const f = fin.get(p.id); const b = f?.approved_budget ?? p.budget_vuv; const e = f?.cumulative_expenditure ?? p.spent_vuv; tb += Number(b) || 0; te += Number(e) || 0; return { p, b, e, avail: f?.funds_available }; });
  return (
    <div>
      <h2>Financial Performance Report</h2>
      <div className="rp-meta">
        <div><b>Total Approved:</b> {fmtAmount(tb)}</div>
        <div><b>Total Expenditure:</b> {fmtAmount(te)}</div>
        <div><b>Remaining:</b> {fmtAmount(tb - te)}</div>
        <div><b>Utilisation:</b> {fmtPct(utilisationPct(tb, te))}</div>
      </div>
      <table className="rp-t"><thead><tr><th>Code</th><th>Project</th><th>Approved</th><th>Expenditure</th><th>Remaining</th><th>Utilisation</th><th>Funds available</th></tr></thead>
        <tbody>
          {rows.map(({ p, b, e, avail }) => <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{fmtAmount(b)}</td><td>{fmtAmount(e)}</td><td>{fmtAmount((Number(b) || 0) - (Number(e) || 0))}</td><td>{fmtPct(utilisationPct(b, e))}</td><td>{fmtAmount(avail)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

// ── Geographic / Provincial ───────────────────────────────────────────────────
function GeographicReport({ d, province }) {
  const locs = province ? d.locations.filter((l) => l.province === province) : d.locations;
  const projectIds = new Set(locs.map((l) => l.project_id));
  const projs = d.projects.filter((p) => projectIds.has(p.id) || (province && (p.provinces || []).includes(province)));
  return (
    <div>
      <h2>{province ? `${province} Province` : 'Geographic'} Report</h2>
      <Section n="1" title="Coverage summary">
        <div className="rp-meta">
          <div><b>Projects:</b> {projs.length}</div>
          <div><b>Sites:</b> {locs.length}</div>
          <div><b>Beneficiaries:</b> {sum(locs, (l) => l.beneficiaries).toLocaleString()}</div>
        </div>
      </Section>
      <Section n="2" title="Sites">
        <table className="rp-t"><thead><tr><th>Province</th><th>Island</th><th>Area Council</th><th>Community</th><th>Intervention</th><th>Beneficiaries</th></tr></thead>
          <tbody>
            {locs.map((l) => <tr key={l.id}><td>{l.province || '—'}</td><td>{l.island || '—'}</td><td>{l.area_council || '—'}</td><td>{l.community || '—'}</td><td>{l.intervention || '—'}</td><td>{l.beneficiaries ?? '—'}</td></tr>)}
            {locs.length === 0 && <tr><td colSpan={6} className="rp-muted">No sites recorded.</td></tr>}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ── Funding Partner / Donor ───────────────────────────────────────────────────
function DonorReport({ d, donor }) {
  const projs = donor ? d.projects.filter((p) => p.donor === donor) : d.projects;
  const fin = latestByProject(d.financial);
  const ids = new Set(projs.map((p) => p.id));
  const budget = sum(projs, (p) => p.budget_vuv);
  const exp = projs.reduce((a, p) => a + (Number(fin.get(p.id)?.cumulative_expenditure ?? p.spent_vuv) || 0), 0);
  const bens = sum(d.beneficiaries.filter((b) => ids.has(b.project_id)), (b) => b.total_direct);
  return (
    <div>
      <h2>{donor || 'All Donors'} — Funding Partner Report</h2>
      <Section n="1" title="Investment summary">
        <div className="rp-meta">
          <div><b>Projects:</b> {projs.length}</div>
          <div><b>Investment (budget):</b> {fmtAmount(budget)}</div>
          <div><b>Expenditure:</b> {fmtAmount(exp)}</div>
          <div><b>Utilisation:</b> {fmtPct(utilisationPct(budget, exp))}</div>
          <div><b>Beneficiaries:</b> {bens.toLocaleString()}</div>
        </div>
      </Section>
      <Section n="2" title="Projects">
        <table className="rp-t"><thead><tr><th>Code</th><th>Project</th><th>Status</th><th>Budget</th><th>Expenditure</th></tr></thead>
          <tbody>
            {projs.map((p) => <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</td><td>{fmtAmount(p.budget_vuv)}</td><td>{fmtAmount(fin.get(p.id)?.cumulative_expenditure ?? p.spent_vuv)}</td></tr>)}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
