// =============================================================================
// Reports.jsx — DoCC MERL report generators, built directly from the
// standardised dataset (the "REPORT" end of ENTER ONCE -> STORE -> DISPLAY ->
// REPORT). No separate report datasets: every report reads the public.v_*
// views and renders a printable document (Print -> Save as PDF).
// Report types: Project Progress, Portfolio Performance, Indicator Performance,
// Financial Performance, Geographic/Provincial, Funding Partner/Donor.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
// One icon on this page: Printer, which labels the export control.
import { Printer } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';
import PageHeader from '../components/ui/PageHeader';
import { fmtAmount, fmtPct, utilisationPct } from '../lib/docc/reporting';
import { useTranslation } from 'react-i18next';

const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-VU', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const REPORT_TYPES = [
  { key: 'project',    label: 'rpt.projectProgressReport' },
  { key: 'portfolio',  label: 'rpt.portfolioPerformanceReport' },
  { key: 'indicator',  label: 'rpt.indicatorPerformanceReport' },
  { key: 'financial',  label: 'rpt.financialPerformanceReport' },
  { key: 'geographic', label: 'rpt.geographicReport' },
  { key: 'donor',      label: 'rpt.donorReport' },
];

const sum = (rows, f) => rows.reduce((a, r) => a + (Number(f(r)) || 0), 0);
function latestByProject(rows) {
  const m = new Map();
  for (const r of rows) { const p = m.get(r.project_id); if (!p || (r.created_at ?? '') > (p.created_at ?? '')) m.set(r.project_id, r); }
  return m;
}

export default function Reports() {
  const { t } = useTranslation();
  const [d, setD] = useState(null);
  const [type, setType] = useState('project');
  const [projectId, setProjectId] = useState('');
  const [province, setProvince] = useState('');
  const [donor, setDonor] = useState('');
  const [period, setPeriod] = useState('');
  const [runs, setRuns] = useState([]);

  // Report Library (§48-51): recent official report generations, portfolio-wide.
  const loadRuns = useCallback(async () => {
    const { data } = await supabase.from('v_report_runs').select('*')
      .order('generated_at', { ascending: false }).limit(20);
    setRuns(data ?? []);
  }, []);
  useEffect(() => { loadRuns(); }, [loadRuns]);

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

  if (!d) return <div className="page-pad"><p style={{ color: 'var(--text-3)' }}>{t('rpt.loading')}</p></div>;

  const donors = [...new Set(d.projects.map((p) => p.donor).filter(Boolean))];
  const provinces = ['TORBA', 'SANMA', 'PENAMA', 'MALAMPA', 'SHEFA', 'TAFEA'];

  // "Data as at" (§76): latest timestamp across the datasets this report reads.
  const times = [d.reporting, d.progress, d.financial, d.beneficiaries, d.risks, d.learning, d.activities]
    .flat().flatMap((r) => [r?.updated_at, r?.created_at]).filter(Boolean).map((t) => new Date(t).getTime());
  const dataAsAt = times.length ? new Date(Math.max(...times)) : null;
  const generatedAt = new Date();

  // Log the generation to the Report Library, then print. Logging is best-effort
  // and never blocks the report from printing.
  const generate = async () => {
    const label = REPORT_TYPES.find((r) => r.key === type)?.label;
    const { error } = await supabase.rpc('log_report_run', {
      p_report_type: type,
      p_report_label: label,
      p_project_id: type === 'project' ? (projectId || null) : null,
      p_reporting_period: period || null,
      p_params: { province: type === 'geographic' ? (province || null) : null, donor: type === 'donor' ? (donor || null) : null },
    });
    if (!error) loadRuns();
    window.print();
  };

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
        .rp-stamp{display:flex;justify-content:space-between;flex-wrap:wrap;gap:.4rem;font-size:.72rem;color:#666;padding-bottom:.6rem;margin-bottom:.9rem;border-bottom:1px solid #eee}
        .rp-stamp b{color:#333}
        .rl-t{width:100%;border-collapse:collapse;font-size:.82rem}
        .rl-t th,.rl-t td{padding:.55rem .7rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .rl-t th{font-size:.68rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);background:var(--green-50)}
        .rl-t tbody tr:last-child td{border-bottom:none}
        @media (max-width:640px){.rp-meta{grid-template-columns:1fr}.rp-doc{padding:1.1rem}}
        @media print{
          body *{visibility:hidden !important}
          .rp-print,.rp-print *{visibility:visible !important}
          .rp-print{position:absolute;left:0;top:0;width:100%;border:none;border-radius:0;padding:0}
          .rp-noprint{display:none !important}
        }
      `}</style>

      <div className="rp-noprint">
        <PageHeader
          title={t('rpt.reports')}
          subtitle="Generated automatically from the standardised MERL dataset. Use Print to save as PDF."
        />
      </div>

      {/* Controls */}
      <div className="rp-noprint" style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label className="field-label">{t('rpt.reportType')}</label>
          <select className="field-input" value={type} onChange={(e) => setType(e.target.value)}>
            {REPORT_TYPES.map((r) => <option key={r.key} value={r.key}>{t(r.label)}</option>)}
          </select>
        </div>
        {type === 'project' && (
          <div style={{ flex: '1 1 240px' }}>
            <label className="field-label">{t('rpt.project')}</label>
            <select className="field-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {d.projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </div>
        )}
        {type === 'geographic' && (
          <div style={{ flex: '1 1 180px' }}>
            <label className="field-label">{t('rpt.provinceOptional')}</label>
            <select className="field-input" value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="">{t('rpt.allProvinces')}</option>
              {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        {type === 'donor' && (
          <div style={{ flex: '1 1 200px' }}>
            <label className="field-label">{t('rpt.donorOptional')}</label>
            <select className="field-input" value={donor} onChange={(e) => setDonor(e.target.value)}>
              <option value="">{t('rpt.allDonors')}</option>
              {donors.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}
        <div style={{ flex: '0 1 160px' }}>
          <label className="field-label">{t('rpt.reportingPeriod')}</label>
          <input className="field-input" placeholder="e.g. 2026-Q1" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        <button onClick={generate} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none', cursor: 'pointer', color: '#fff', background: 'var(--green-700)' }}>
          <Printer size={16} /> {t('rpt.printPdf')}
        </button>
      </div>

      <div className="rp-doc rp-print">
        <div className="rp-stamp">
          <span>{t('rpt.generated')} <b>{fmtDateTime(generatedAt)}</b></span>
          <span>{t('rpt.dataAsAt')} <b>{dataAsAt ? fmtDateTime(dataAsAt) : '—'}</b></span>
        </div>
        {type === 'project' && <ProjectProgress d={d} projectId={projectId} period={period} />}
        {type === 'portfolio' && <Portfolio d={d} period={period} />}
        {type === 'indicator' && <IndicatorReport d={d} period={period} />}
        {type === 'financial' && <FinancialReport d={d} period={period} />}
        {type === 'geographic' && <GeographicReport d={d} province={province} period={period} />}
        {type === 'donor' && <DonorReport d={d} donor={donor} period={period} />}
      </div>

      {/* Report Library (§48-51): audit trail of official reports generated */}
      <div className="rp-noprint" style={{ marginTop: '1.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{t('rpt.reportLibrary')}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginLeft: '0.25rem' }}>{t('rpt.recentlyGenerated')}</span>
        </div>
        {runs.length === 0 ? (
          <div className="card" style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--text-3)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            No reports generated yet. Use Print / PDF above to produce one — it will be logged here.
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="rl-t">
              <thead>
                <tr><th>{t('rpt.report')}</th><th>{t('rpt.scope')}</th><th>{t('rpt.period')}</th><th>{t('rpt.generatedBy')}</th><th>{t('rpt.when')}</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td><b>{r.report_label || r.report_type}</b></td>
                    <td>{r.project_code ? `${r.project_code}` : (r.params?.province || r.params?.donor || 'Portfolio')}</td>
                    <td>{r.reporting_period || '—'}</td>
                    <td>{r.generated_by_name || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.generated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const Section = ({ n, title, children }) => (
  <div><h3>{n}. {title}</h3>{children}</div>
);
function Narr({ text }) {
  const { t } = useTranslation();
  return text ? <p className="rp-narr">{text}</p> : <p className="rp-muted">{t('rpt.notReported')}</p>;
}

// ── 1. Project Progress Report (14-section standard structure) ────────────────
function ProjectProgress({ d, projectId, period }) {
  const { t } = useTranslation();
  const p = d.projects.find((x) => x.id === projectId);
  if (!p) return <p className="rp-muted">{t('rpt.selectProject')}</p>;
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
      <h2>{t('rpt.projectProgressReport')}</h2>
      <div className="rp-muted">{p.code} — {p.name}{period ? ` · ${period}` : ''}</div>

      <Section n="1" title={t('rpt.projectInformation')}>
        <div className="rp-meta">
          <div><b>{t('rpt.projectId')}</b> {p.code}</div>
          <div><b>{t('rpt.titleLbl')}</b> {p.name}</div>
          <div><b>{t('rpt.donorLbl')}</b> {p.donor || '—'}</div>
          <div><b>{t('rpt.implementingLbl')}</b> {p.executing_agency || p.lead_agency || '—'}</div>
          <div><b>{t('rpt.durationLbl')}</b> {p.start_date || '—'} → {p.end_date || '—'}</div>
          <div><b>{t('rpt.approvedBudgetLbl')}</b> {fmtAmount(budget)} {p.currency || 'VUV'}</div>
          <div><b>{t('rpt.locationsLbl')}</b> {(p.provinces || []).join(', ') || 'National'}</div>
          <div><b>{t('rpt.reportingPeriodLbl')}</b> {period || '—'}</div>
        </div>
      </Section>

      <Section n="2" title={t('rpt.executiveSummary')}>
        <div className="rp-meta">
          <div><b>{t('rpt.overallStatusLbl')}</b> {OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</div>
          <div><b>{t('rpt.physicalProgressLbl')}</b> {phys != null ? `${phys}%` : '—'}</div>
          <div><b>{t('rpt.financialUtilisationLbl')}</b> {fmtPct(utilisationPct(budget, exp))}</div>
          <div><b>{t('rpt.openRisksLbl')}</b> {risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length}</div>
        </div>
        <Narr text={learn.key_achievements} />
      </Section>

      <Section n="3" title={t('rpt.progressAgainst')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.level')}</th><th>{t('rpt.statement')}</th></tr></thead>
          <tbody>
            {d.objectives.filter((o) => o.project_id === projectId).map((o) => <tr key={o.code}><td>{o.code}</td><td>{t('rpt.objective')}</td><td>{o.statement}</td></tr>)}
            {d.outcomes.filter((o) => o.project_id === projectId).map((o) => <tr key={o.code}><td>{o.code}</td><td>{t('rpt.outcome')}</td><td>{o.statement}</td></tr>)}
            {d.outputs.filter((o) => o.project_id === projectId).map((o) => <tr key={o.code}><td>{o.code}</td><td>{t('rpt.output')}</td><td>{o.statement}</td></tr>)}
          </tbody>
        </table>
      </Section>

      <Section n="4" title={t('rpt.indicatorPerformance')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.indicator')}</th><th>{t('rpt.baseline')}</th><th>{t('rpt.periodTarget')}</th><th>{t('rpt.current')}</th><th>{t('rpt.finalTarget')}</th><th>{t('rpt.achievementPct')}</th><th>{t('rpt.status')}</th></tr></thead>
          <tbody>
            {inds.map((i) => { const l = indLast(i); return (
              <tr key={i.code}><td>{i.code} {i.name}</td><td>{i.baseline_value ?? '—'}</td><td>{l?.period_target ?? '—'}</td>
                <td>{l?.cumulative_actual ?? '—'}</td><td>{i.target_value ?? '—'}</td><td>{fmtPct(l?.achievement_pct)}</td>
                <td>{OPT.labelOf(OPT.PERFORMANCE_STATUS, l?.performance_status)}</td></tr>); })}
            {inds.length === 0 && <tr><td colSpan={7} className="rp-muted">{t('rpt.noIndicators')}</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section n="5" title={t('rpt.activityImplementation')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.activity')}</th><th>{t('rpt.status')}</th><th>{t('rpt.progress')}</th><th>{t('rpt.plannedBudget')}</th><th>{t('rpt.actualExp')}</th></tr></thead>
          <tbody>
            {acts.map((a) => <tr key={a.code}><td>{a.code}</td><td>{a.name}</td><td>{OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</td>
              <td>{a.physical_progress_pct != null ? `${a.physical_progress_pct}%` : '—'}</td><td>{fmtAmount(a.planned_budget)}</td><td>{fmtAmount(a.actual_expenditure)}</td></tr>)}
            {acts.length === 0 && <tr><td colSpan={6} className="rp-muted">{t('rpt.noActivities')}</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section n="6" title={t('rpt.financialPerformance')}>
        <div className="rp-meta">
          <div><b>{t('rpt.approvedBudgetLbl')}</b> {fmtAmount(budget)}</div>
          <div><b>{t('rpt.periodBudgetLbl')}</b> {fmtAmount(fin?.period_budget)}</div>
          <div><b>{t('rpt.expenditureThisPeriodLbl')}</b> {fmtAmount(fin?.expenditure_period)}</div>
          <div><b>{t('rpt.cumulativeExpenditureLbl')}</b> {fmtAmount(exp)}</div>
          <div><b>{t('rpt.remainingBalanceLbl')}</b> {fmtAmount(fin?.remaining_balance ?? ((Number(budget) || 0) - (Number(exp) || 0)))}</div>
          <div><b>{t('rpt.utilisationPctLbl')}</b> {fmtPct(fin?.utilisation_pct ?? utilisationPct(budget, exp))}</div>
        </div>
        <Narr text={fin?.narrative} />
      </Section>

      <Section n="7" title={t('rpt.geographicImplementation')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.province')}</th><th>{t('rpt.island')}</th><th>{t('rpt.areaCouncil')}</th><th>{t('rpt.community')}</th><th>{t('rpt.beneficiaries')}</th></tr></thead>
          <tbody>
            {locs.map((l) => <tr key={l.id}><td>{l.province || '—'}</td><td>{l.island || '—'}</td><td>{l.area_council || '—'}</td><td>{l.community || '—'}</td><td>{l.beneficiaries ?? '—'}</td></tr>)}
            {locs.length === 0 && <tr><td colSpan={5} className="rp-muted">{t('rpt.noLocations')}</td></tr>}
          </tbody>
        </table>
      </Section>

      <Section n="8" title={t('rpt.beneficiariesGedsi')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.period')}</th><th>{t('rpt.totalDirect')}</th><th>{t('rpt.female')}</th><th>{t('rpt.male')}</th><th>{t('rpt.youth')}</th><th>{t('rpt.pwd')}</th></tr></thead>
          <tbody>
            {bens.map((b) => <tr key={b.id}><td>{b.reporting_period || '—'}</td><td>{b.total_direct ?? '—'}</td><td>{b.female ?? '—'}</td><td>{b.male ?? '—'}</td><td>{b.youth ?? '—'}</td><td>{b.persons_with_disability ?? '—'}</td></tr>)}
            {bens.length === 0 && <tr><td colSpan={6} className="rp-muted">{t('rpt.noBeneficiaryData')}</td></tr>}
          </tbody>
        </table>
        <p className="rp-muted">{t('rpt.blankCells')}</p>
      </Section>

      <Section n="9" title={t('rpt.keyAchievements')}><Narr text={[learn.key_achievements, learn.major_results].filter(Boolean).join('\n\n')} /></Section>
      <Section n="10" title={t('rpt.challengesRisks')}>
        <Narr text={learn.challenges} />
        <table className="rp-t"><thead><tr><th>ID</th><th>{t('rpt.type')}</th><th>{t('rpt.description')}</th><th>{t('rpt.rating')}</th><th>{t('rpt.status')}</th><th>{t('rpt.mitigation')}</th></tr></thead>
          <tbody>
            {risks.map((r) => <tr key={r.code}><td>{r.code}</td><td>{OPT.labelOf(OPT.RISK_TYPE, r.type)}</td><td>{r.description}</td><td>{r.risk_rating || '—'}</td><td>{OPT.labelOf(OPT.RISK_STATUS, r.status)}</td><td>{r.mitigation || '—'}</td></tr>)}
            {risks.length === 0 && <tr><td colSpan={6} className="rp-muted">{t('rpt.noRisks')}</td></tr>}
          </tbody>
        </table>
      </Section>
      <Section n="11" title={t('rpt.lessonsLearned')}><Narr text={learn.lessons_learned} /></Section>
      <Section n="12" title={t('rpt.nextPeriodPriorities')}><Narr text={learn.next_period_priorities} /></Section>
      <Section n="13" title={t('rpt.recommendations')}><Narr text={learn.recommendations} /></Section>
      <Section n="14" title={t('rpt.supportingEvidence')}><p className="rp-muted">{t('rpt.evidenceNote')}</p></Section>
    </div>
  );
}

// ── Portfolio Performance ─────────────────────────────────────────────────────
function Portfolio({ d, period }) {
  const { t } = useTranslation();
  const fin = latestByProject(d.financial);
  const budget = sum(d.projects, (p) => p.budget_vuv);
  const exp = [...fin.values()].reduce((a, r) => a + (Number(r.cumulative_expenditure) || 0), 0);
  return (
    <div>
      <h2>{t('rpt.portfolioPerformanceReport')}</h2>
      <div className="rp-muted">All projects{period ? ` · ${period}` : ''}</div>
      <Section n="1" title={t('rpt.portfolioSummary')}>
        <div className="rp-meta">
          <div><b>{t('rpt.projectsLbl')}</b> {d.projects.length}</div>
          <div><b>{t('rpt.approvedBudgetLbl')}</b> {fmtAmount(budget)}</div>
          <div><b>{t('rpt.expenditureLbl')}</b> {fmtAmount(exp)}</div>
          <div><b>{t('rpt.utilisationLbl')}</b> {fmtPct(utilisationPct(budget, exp))}</div>
          <div><b>{t('rpt.totalBeneficiariesLbl')}</b> {sum(d.beneficiaries, (b) => b.total_direct).toLocaleString()}</div>
          <div><b>{t('rpt.openRisksLbl')}</b> {d.risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length}</div>
        </div>
      </Section>
      <Section n="2" title={t('rpt.projects')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.project')}</th><th>{t('rpt.status')}</th><th>{t('rpt.donor')}</th><th>{t('rpt.budget')}</th><th>{t('rpt.expenditure')}</th><th>{t('rpt.utilisation')}</th></tr></thead>
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
  const { t } = useTranslation();
  const rows = period ? d.progress.filter((r) => r.reporting_period === period) : d.progress;
  return (
    <div>
      <h2>{t('rpt.indicatorPerformanceReport')}</h2>
      <div className="rp-muted">{period || 'All periods'}</div>
      <table className="rp-t"><thead><tr><th>{t('rpt.indicator')}</th><th>{t('rpt.period')}</th><th>{t('rpt.periodTarget')}</th><th>{t('rpt.current')}</th><th>{t('rpt.finalTarget')}</th><th>{t('rpt.achievementPct')}</th><th>{t('rpt.status')}</th></tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}><td>{r.indicator_code} {r.indicator_name}</td><td>{r.reporting_period}</td><td>{r.period_target ?? '—'}</td><td>{r.cumulative_actual ?? '—'}</td><td>{r.final_target ?? '—'}</td><td>{fmtPct(r.achievement_pct)}</td><td>{OPT.labelOf(OPT.PERFORMANCE_STATUS, r.performance_status)}</td></tr>)}
          {rows.length === 0 && <tr><td colSpan={7} className="rp-muted">{t('rpt.noIndicatorProgress')}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── Financial Performance ─────────────────────────────────────────────────────
function FinancialReport({ d }) {
  const { t } = useTranslation();
  const fin = latestByProject(d.financial);
  let tb = 0, te = 0;
  const rows = d.projects.map((p) => { const f = fin.get(p.id); const b = f?.approved_budget ?? p.budget_vuv; const e = f?.cumulative_expenditure ?? p.spent_vuv; tb += Number(b) || 0; te += Number(e) || 0; return { p, b, e, avail: f?.funds_available }; });
  return (
    <div>
      <h2>{t('rpt.financialPerformanceReport')}</h2>
      <div className="rp-meta">
        <div><b>{t('rpt.totalApprovedLbl')}</b> {fmtAmount(tb)}</div>
        <div><b>{t('rpt.totalExpenditureLbl')}</b> {fmtAmount(te)}</div>
        <div><b>{t('rpt.remainingLbl')}</b> {fmtAmount(tb - te)}</div>
        <div><b>{t('rpt.utilisationLbl')}</b> {fmtPct(utilisationPct(tb, te))}</div>
      </div>
      <table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.project')}</th><th>{t('rpt.approved')}</th><th>{t('rpt.expenditure')}</th><th>{t('rpt.remaining')}</th><th>{t('rpt.utilisation')}</th><th>{t('rpt.fundsAvailable')}</th></tr></thead>
        <tbody>
          {rows.map(({ p, b, e, avail }) => <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{fmtAmount(b)}</td><td>{fmtAmount(e)}</td><td>{fmtAmount((Number(b) || 0) - (Number(e) || 0))}</td><td>{fmtPct(utilisationPct(b, e))}</td><td>{fmtAmount(avail)}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

// ── Geographic / Provincial ───────────────────────────────────────────────────
function GeographicReport({ d, province }) {
  const { t } = useTranslation();
  const locs = province ? d.locations.filter((l) => l.province === province) : d.locations;
  const projectIds = new Set(locs.map((l) => l.project_id));
  const projs = d.projects.filter((p) => projectIds.has(p.id) || (province && (p.provinces || []).includes(province)));
  return (
    <div>
      <h2>{province ? `${province} Province` : 'Geographic'} Report</h2>
      <Section n="1" title={t('rpt.coverageSummary')}>
        <div className="rp-meta">
          <div><b>{t('rpt.projectsLbl')}</b> {projs.length}</div>
          <div><b>{t('rpt.sitesLbl')}</b> {locs.length}</div>
          <div><b>{t('rpt.beneficiariesLbl')}</b> {sum(locs, (l) => l.beneficiaries).toLocaleString()}</div>
        </div>
      </Section>
      <Section n="2" title={t('rpt.sites')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.province')}</th><th>{t('rpt.island')}</th><th>{t('rpt.areaCouncil')}</th><th>{t('rpt.community')}</th><th>{t('rpt.intervention')}</th><th>{t('rpt.beneficiaries')}</th></tr></thead>
          <tbody>
            {locs.map((l) => <tr key={l.id}><td>{l.province || '—'}</td><td>{l.island || '—'}</td><td>{l.area_council || '—'}</td><td>{l.community || '—'}</td><td>{l.intervention || '—'}</td><td>{l.beneficiaries ?? '—'}</td></tr>)}
            {locs.length === 0 && <tr><td colSpan={6} className="rp-muted">{t('rpt.noSites')}</td></tr>}
          </tbody>
        </table>
      </Section>
    </div>
  );
}

// ── Funding Partner / Donor ───────────────────────────────────────────────────
function DonorReport({ d, donor }) {
  const { t } = useTranslation();
  const projs = donor ? d.projects.filter((p) => p.donor === donor) : d.projects;
  const fin = latestByProject(d.financial);
  const ids = new Set(projs.map((p) => p.id));
  const budget = sum(projs, (p) => p.budget_vuv);
  const exp = projs.reduce((a, p) => a + (Number(fin.get(p.id)?.cumulative_expenditure ?? p.spent_vuv) || 0), 0);
  const bens = sum(d.beneficiaries.filter((b) => ids.has(b.project_id)), (b) => b.total_direct);
  return (
    <div>
      <h2>{donor || 'All Donors'} — Funding Partner Report</h2>
      <Section n="1" title={t('rpt.investmentSummary')}>
        <div className="rp-meta">
          <div><b>{t('rpt.projectsLbl')}</b> {projs.length}</div>
          <div><b>{t('rpt.investmentLbl')}</b> {fmtAmount(budget)}</div>
          <div><b>{t('rpt.expenditureLbl')}</b> {fmtAmount(exp)}</div>
          <div><b>{t('rpt.utilisationLbl')}</b> {fmtPct(utilisationPct(budget, exp))}</div>
          <div><b>{t('rpt.beneficiariesLbl')}</b> {bens.toLocaleString()}</div>
        </div>
      </Section>
      <Section n="2" title={t('rpt.projects')}>
        <table className="rp-t"><thead><tr><th>{t('rpt.code')}</th><th>{t('rpt.project')}</th><th>{t('rpt.status')}</th><th>{t('rpt.budget')}</th><th>{t('rpt.expenditure')}</th></tr></thead>
          <tbody>
            {projs.map((p) => <tr key={p.code}><td>{p.code}</td><td>{p.name}</td><td>{OPT.labelOf(OPT.DOCC_PROJECT_STATUS, p.status)}</td><td>{fmtAmount(p.budget_vuv)}</td><td>{fmtAmount(fin.get(p.id)?.cumulative_expenditure ?? p.spent_vuv)}</td></tr>)}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
