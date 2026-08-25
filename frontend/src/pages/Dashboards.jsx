// =============================================================================
// Dashboards.jsx — DoCC MERL dashboards, all derived from the standardised
// dataset (the "DISPLAY" end of ENTER ONCE -> STORE -> DISPLAY -> REPORT).
// Tabs: Executive Portfolio, Project, Results & Indicators, Financial,
// Geographic, Risks, Reporting. Everything is computed client-side from the
// public.v_* views; no separate dashboard tables.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
// One icon on this page: the warning triangle that marks Attention Required.
// Every other metric, tab and heading is carried by its label and its number.
import { AlertTriangle } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import StatTile from '../components/ui/StatTile';
import MetricStrip from '../components/ui/MetricStrip';
import Gedsi from '../components/ui/Gedsi';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/LoadingSkeleton';
import FilterBar from '../components/ui/FilterBar';
import VanuatuMap from '../components/VanuatuMap';
import * as OPT from '../constants/formOptions';
import { fmtAmount, fmtPct, utilisationPct } from '../lib/docc/reporting';
import { useTranslation } from 'react-i18next';

const TABS = [
  { key: 'portfolio',  label: 'dash.tabPortfolio' },
  { key: 'project',    label: 'dash.tabProject' },
  { key: 'results',    label: 'dash.tabResults' },
  { key: 'financial',  label: 'dash.tabFinancial' },
  { key: 'geographic', label: 'dash.tabGeographic' },
  { key: 'risks',      label: 'dash.tabRisks' },
  { key: 'reporting',  label: 'dash.tabReporting' },
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
  const { t } = useTranslation();
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
        <PageHeader title={t('dash.pageTitle')} subtitle={t('dash.pageSubtitle')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.7rem' }}>
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-pad" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        /* Text tabs on a shared baseline rule — reporting-application
           navigation, not pills. The active tab is carried by weight, ink
           colour and a 2px accent underline sitting on that rule. */
        .db-tabs{display:flex;gap:.25rem;flex-wrap:wrap;margin:1rem 0 1.1rem;border-bottom:1px solid var(--border);overflow-x:auto}
        .db-tab{position:relative;padding:.5rem .7rem;margin-bottom:-1px;border:none;border-bottom:2px solid transparent;background:none;cursor:pointer;font-size:.8125rem;font-weight:600;color:var(--text-3);white-space:nowrap;transition:color .12s,border-color .12s}
        .db-tab:hover{color:var(--text-1)}
        .db-tab.active{color:var(--green-700);border-bottom-color:var(--green-600);font-weight:700}
        .db-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,220px));justify-content:start;gap:.7rem}
        .db-2{display:grid;grid-template-columns:repeat(2,1fr);gap:.9rem;margin-top:1rem}
        .db-card{background:var(--white);border:1px solid var(--border);border-radius:var(--radius-card);padding:1rem}
        .db-h{font-size:.9rem;font-weight:700;margin:0 0 .7rem}
        .db-table{width:100%;border-collapse:collapse;font-size:.83rem}
        .db-table th,.db-table td{padding:.45rem .5rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .db-table th{font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)}
        @media (max-width:900px){.db-2{grid-template-columns:1fr}}
        @media (max-width:420px){.db-kpis{grid-template-columns:1fr}}
      `}</style>

      <PageHeader
        title={t('dash.pageTitle')}
        subtitle={t('dash.pageSubtitle')}
        actions={dataAsAt ? (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{t('dash.dataAsAt')} <strong style={{ color: 'var(--text-2)' }}>{dataAsAt}</strong></span>
        ) : null}
      />

      {d.projects.length === 0 ? (
        <EmptyState title={t('dash.noProjectData')}
          description="Register your first project to begin portfolio monitoring." />
      ) : (
      <>
      <div className="db-tabs" role="tablist" aria-label={t('dash.dashboardViews')}>
        {TABS.map(({ key, label }) => (
          <button key={key} role="tab" aria-selected={tab === key}
            className={`db-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            {t(label)}
          </button>
        ))}
      </div>

      {tab === 'project' && (
        <div style={{ marginBottom: '0.5rem', maxWidth: 420 }}>
          <label className="field-label">{t('dash.tabProject')}</label>
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
  const { t } = useTranslation();
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{t('dash.noData')}</p>;
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
  const { t, i18n } = useTranslation();
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
    if (atRiskDelayed) attention.push({ label: t('dash.attnProjects', { count: atRiskDelayed }), tab: 'portfolio', tone: 'amber' });
    if (offTrack) attention.push({ label: t('dash.attnIndicators', { count: offTrack }), tab: 'results', tone: 'red' });
    if (reportsOverdue) attention.push({ label: t('dash.attnReports', { count: reportsOverdue }), tab: 'reporting', tone: 'red' });
    if (highRiskOverdue) attention.push({ label: t('dash.attnActions', { count: highRiskOverdue }), tab: 'risks', tone: 'red' });

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
  }, [d, flt, t, i18n.resolvedLanguage]);

  return (
    <>
      <FilterBar
        filters={[
          { key: 'status', label: t('dash.status'), value: flt.status, onChange: (v) => setFlt((s) => ({ ...s, status: v })),
            options: [{ value: '', label: t('dash.allStatuses') }, ...OPT.DOCC_PROJECT_STATUS] },
          { key: 'theme', label: t('dash.themeSector'), value: flt.theme, onChange: (v) => setFlt((s) => ({ ...s, theme: v })),
            options: [{ value: '', label: t('dash.allThemes') }, ...opts.themes.map((t) => ({ value: t, label: OPT.labelOf(OPT.CLIMATE_THEME, t) || t }))] },
          { key: 'province', label: t('dash.province'), value: flt.province, onChange: (v) => setFlt((s) => ({ ...s, province: v })),
            options: [{ value: '', label: t('dash.allProvinces') }, ...opts.provinces.map((p) => ({ value: p, label: p }))] },
          { key: 'donor', label: t('dash.fundingPartner'), value: flt.donor, onChange: (v) => setFlt((s) => ({ ...s, donor: v })),
            options: [{ value: '', label: t('dash.allPartners') }, ...opts.donors.map((x) => ({ value: x, label: x }))] },
        ]}
        onReset={() => setFlt({ status: '', theme: '', province: '', donor: '' })}
      />
      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: '0.6rem 0' }}>
        {t('dash.showing')} <strong style={{ color: 'var(--text-2)' }}>{m.total}</strong> of {d.projects.length} projects
      </div>
      <div className="db-kpis">
        <StatTile label={t('dash.totalProjects')} value={m.total} />
        <StatTile label={t('dash.totalBeneficiaries')} value={m.beneficiaries ? m.beneficiaries.toLocaleString() : '—'} />
        <StatTile label={t('dash.approvedBudget')} value={fmtAmount(m.totalBudget)} />
        <StatTile label={t('dash.budgetUtilisation')} value={fmtPct(m.util)} status={m.util > 100 ? 'red' : 'green'} />
        <StatTile label={t('dash.indAchievement')} value={m.avgAch != null ? `${m.avgAch}%` : '—'} sub="avg across reported" />
      </div>
      <MetricStrip title={t('dash.portfolioSummary')} style={{ marginTop: '0.7rem' }} items={[
        { label: t('dash.active'), value: m.active },
        { label: t('dash.completed'), value: m.completed },
        { label: t('dash.atRiskDelayed'), value: m.atRisk + m.delayed, tone: (m.atRisk + m.delayed) ? 'warning' : undefined },
        { label: t('dash.expenditure'), value: fmtAmount(m.totalExp) },
        { label: t('dash.activitiesCompleted'), value: m.actCompleted },
        { label: t('dash.openRisks'), value: m.openRisks, tone: m.openRisks ? 'warning' : undefined },
        { label: t('dash.overdueActions'), value: m.overdue, tone: m.overdue ? 'danger' : undefined },
      ]} />

      {/* Attention Required (§31) */}
      {m.attention.length > 0 && (
        <div className="db-card" style={{ marginTop: '1rem', borderLeft: '3px solid var(--gold-500)' }}>
          {/* The one warning triangle on this page: it marks the section that
              needs action. The rows below carry a status dot, not a repeat of
              the same triangle. */}
          <h3 className="db-h" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={16} style={{ color: 'var(--gold-500)', flexShrink: 0 }} aria-hidden="true" /> {t('dash.attentionRequired')}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {m.attention.map((a, i) => (
              <button key={i} onClick={() => onNavigate?.(a.tab)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', padding: '0.25rem 0', font: 'inherit', color: 'var(--text-1)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: a.tone === 'red' ? 'var(--red-600)' : 'var(--gold-500)' }} />
                <span style={{ fontSize: '0.83rem' }}>{a.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--green-700)', fontWeight: 700 }}>{t('dash.view')} →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Beneficiaries & GEDSI (§38) */}
      {m.gedsi.total != null && (
        <div className="db-card" style={{ marginTop: '1rem' }}>
          {/* No heading symbol — the per-category pictograms below are where a
              symbol adds meaning, by making the disaggregation comparable at a
              glance. One generic Users icon on the heading would not. */}
          <h3 className="db-h" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            Beneficiaries &amp; GEDSI
            {m.gedsi.completeness != null && (
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 600, color: m.gedsi.completeness >= 75 ? 'var(--green-700)' : 'var(--gold-500)' }}>
                Disaggregation completeness: {m.gedsi.completeness}%
              </span>
            )}
          </h3>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-1)' }}>
            {m.gedsi.total.toLocaleString()} <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-3)' }}>{t('dash.totalDirectBeneficiaries')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.6rem', marginTop: '0.75rem' }}>
            {[
              ['Female', m.gedsi.female, 'female'],
              ['Male', m.gedsi.male, 'male'],
              ['Other / N.R.', m.gedsi.other, null],
              ['Youth', m.gedsi.youth, 'youth'],
              ['Persons w/ disability', m.gedsi.pwd, 'disability'],
              ['Indirect', m.gedsi.indirect, 'indirect'],
            ].map(([lbl, val, sym]) => (
              <div key={lbl} style={{ background: 'var(--surface-1)', borderRadius: 'var(--radius-control)', padding: '0.5rem 0.65rem' }}>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-1)' }}>{val != null ? val.toLocaleString() : '—'}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: 'var(--text-3)' }}>
                  {sym && <Gedsi name={sym} size={14} style={{ color: 'var(--green-700)', flexShrink: 0 }} />}
                  {lbl}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-3)', margin: '0.5rem 0 0' }}>{t('dash.dashNote')}</p>
        </div>
      )}

      <div className="db-2">
        <div className="db-card"><h3 className="db-h">{t('dash.projectsByProvince')}</h3><BarList rows={m.byProvince} total={m.total} /></div>
        <div className="db-card"><h3 className="db-h">{t('dash.projectsByDonor')}</h3><BarList rows={m.byDonor} total={m.total} accent="#2563eb" /></div>
      </div>
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">{t('dash.projectsByTheme')}</h3><BarList rows={m.byTheme} total={m.total} accent="#7c3aed" /></div>
        <div className="db-card"><h3 className="db-h">{t('dash.projectsByStatus')}</h3><BarList rows={m.byStatus} total={m.total} accent="#0891b2" /></div>
      </div>

      {/* Physical vs Financial progress (§32) */}
      {m.pf.length > 0 && (
        <div className="db-card" style={{ marginTop: '1rem' }}>
          <h3 className="db-h">{t('dash.physVsFin')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="db-table">
              <thead><tr><th>{t('dash.tabProject')}</th><th>{t('dash.physical')}</th><th>{t('dash.tabFinancial')}</th><th>{t('dash.variance')}</th></tr></thead>
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
                        {flag && <span style={{ marginLeft: 6, fontSize: '0.62rem', color: 'var(--red-700)', background: 'var(--red-100)', borderRadius: 9999, padding: '0.05rem 0.4rem' }}>{t('dash.check')}</span>}
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
  const { t } = useTranslation();
  const p = d.projects.find((x) => x.id === projectId);
  const fin = useMemo(() => latestByProject(d.financial.filter((f) => f.project_id === projectId)).get(projectId), [d, projectId]);
  if (!p) return <p style={{ color: 'var(--text-3)' }}>{t('dash.selectProject')}</p>;
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
        <StatTile label={t('dash.physicalProgress')} value={phys != null ? `${phys}%` : '—'} sub="avg of activities" />
        <StatTile label={t('dash.financialUtilisation')} value={fmtPct(utilisationPct(budget, exp))} />
        <StatTile label={t('dash.beneficiaries')} value={ben ? ben.toLocaleString() : '—'} />
        <StatTile label={t('dash.latestReport')} value={rep ? OPT.labelOf(OPT.SUBMISSION_STATUS, rep.submission_status) : '—'} sub={rep?.period_label} />
      </div>
      {(() => { const openRisksCount = risks.filter((r) => ['open', 'monitoring', 'escalated'].includes(r.status)).length; return (
        <MetricStrip title={t('dash.finDeliverySummary')} style={{ marginTop: '0.7rem' }} items={[
          { label: t('dash.approvedBudget'), value: fmtAmount(budget) },
          { label: t('dash.expenditure'), value: fmtAmount(exp) },
          { label: t('dash.activities'), value: `${acts.length} (${acts.filter((a) => a.status === 'completed').length} completed)` },
          { label: t('dash.openRisks'), value: openRisksCount, tone: openRisksCount ? 'warning' : undefined },
        ]} />
      ); })()}
      <div className="db-2">
        <div className="db-card">
          <h3 className="db-h">{t('dash.indPerformance')}</h3>
          {inds.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{t('dash.noIndicators')}</p> : (
            <div style={{ overflowX: 'auto' }}><table className="db-table">
              <thead><tr><th>{t('dash.code')}</th><th>{t('dash.indicator')}</th><th>{t('dash.baseline')}</th><th>{t('dash.target')}</th><th>{t('dash.current')}</th><th>{t('dash.achievementShort')}</th></tr></thead>
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
          <h3 className="db-h">{t('dash.activityProgress')}</h3>
          {acts.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{t('dash.noActivities')}</p> : (
            <BarList rows={countBy(acts, (a) => OPT.labelOf(OPT.ACTIVITY_STATUS, a.status))} total={acts.length} />
          )}
          <h3 className="db-h" style={{ marginTop: '1rem' }}>{t('dash.tabRisks')}</h3>
          {risks.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{t('dash.noRisks')}</p> : (
            <BarList rows={countBy(risks, (r) => r.risk_rating || 'Unrated')} accent="#dc2626" />
          )}
        </div>
      </div>
    </>
  );
}

// ── Results & Indicators ─────────────────────────────────────────────────────
function Results({ d }) {
  const { t } = useTranslation();
  const perf = countBy(d.progress, (p) => OPT.labelOf(OPT.PERFORMANCE_STATUS, p.performance_status || 'no_data'));
  return (
    <>
      <MetricStrip title={t('dash.resultsFramework')} items={[
        { label: t('dash.objectives'), value: d.objectives.length },
        { label: t('dash.outcomes'), value: d.outcomes.length },
        { label: t('dash.outputs'), value: d.outputs.length },
        { label: t('dash.indicators'), value: d.indicators.length },
      ]} />
      <div className="db-2">
        <div className="db-card"><h3 className="db-h">{t('dash.indPerfStatus')}</h3><BarList rows={perf} total={d.progress.length} accent="#0891b2" /></div>
        <div className="db-card"><h3 className="db-h">{t('dash.indByLevel')}</h3><BarList rows={countBy(d.indicators, (i) => OPT.labelOf(OPT.INDICATOR_LEVEL, i.indicator_level || '—'))} total={d.indicators.length} accent="#7c3aed" /></div>
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">{t('dash.latestReported')}</h3>
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>{t('dash.indicator')}</th><th>{t('dash.period')}</th><th>{t('dash.current')}</th><th>{t('dash.target')}</th><th>{t('dash.achievement')}</th><th>{t('dash.status')}</th></tr></thead>
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
  const { t } = useTranslation();
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
        <StatTile label={t('dash.totalApproved')} value={fmtAmount(totalBudget)} />
        <StatTile label={t('dash.utilisation')} value={fmtPct(utilisationPct(totalBudget, totalExp))} />
      </div>
      <MetricStrip style={{ marginTop: '0.7rem' }} items={[
        { label: t('dash.totalExpenditure'), value: fmtAmount(totalExp) },
        { label: t('dash.remaining'), value: fmtAmount(totalBudget - totalExp) },
      ]} />
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">{t('dash.budgetVsExp')}</h3>
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>{t('dash.code')}</th><th>{t('dash.tabProject')}</th><th>{t('dash.approved')}</th><th>{t('dash.expenditure')}</th><th>{t('dash.remaining')}</th><th>{t('dash.utilisation')}</th></tr></thead>
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
  const { t } = useTranslation();
  const [province, setProvince] = useState(null);
  const locs = province ? d.locations.filter((l) => l.province === province) : d.locations;
  const provinceCounts = Object.fromEntries(countBy(d.locations, (l) => l.province)); // { province: sites }
  const byIsland = countBy(locs, (l) => l.island);
  const byAC = countBy(locs, (l) => l.area_council);
  const benByProvince = (() => {
    const m = new Map();
    for (const l of d.locations) if (l.province) m.set(l.province, (m.get(l.province) || 0) + (Number(l.beneficiaries) || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const withCoords = locs.filter((l) => l.latitude != null && l.longitude != null);
  return (
    <>
      <MetricStrip title={t('dash.geoCoverage')} items={[
        { label: t('dash.sites'), value: locs.length },
        { label: t('dash.provinces'), value: Object.keys(provinceCounts).length },
        { label: t('dash.areaCouncils'), value: byAC.length },
        { label: t('dash.geoSites'), value: withCoords.length },
      ]} />

      {/* Vanuatu geographic dashboard (§36) — click a province to filter. */}
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 className="db-h" style={{ margin: 0 }}>{t('dash.sitesAcross')}</h3>
          {province && (
            <button onClick={() => setProvince(null)} style={{ background: 'none', border: 'none', color: 'var(--green-700)', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
              {province} · clear ×
            </button>
          )}
        </div>
        <div style={{ marginTop: '0.6rem' }}>
          <VanuatuMap counts={provinceCounts} nationalCount={d.locations.length}
            selected={province} onSelect={(p) => setProvince((prev) => (prev === p ? null : p))} />
        </div>
      </div>

      <div className="db-2">
        <div className="db-card"><h3 className="db-h">{t('dash.benByProvince')}</h3><BarList rows={benByProvince} accent="#7c3aed" /></div>
        <div className="db-card"><h3 className="db-h">Sites by Island{province ? ` · ${province}` : ''}</h3><BarList rows={byIsland} accent="#2563eb" /></div>
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">Sites by Area Council{province ? ` · ${province}` : ''}</h3><BarList rows={byAC} accent="#0891b2" />
      </div>
    </>
  );
}

// ── Risks ────────────────────────────────────────────────────────────────────
// 5x5 risk matrix band from likelihood x impact score (§37).
function riskBand(score, t) {
  if (score >= 15) return { key: 'critical', label: t('dash.critical'), bg: '#b3402f', fg: '#fff' };
  if (score >= 10) return { key: 'high', label: t('dash.high'), bg: '#e06636', fg: '#fff' };
  if (score >= 5) return { key: 'medium', label: t('dash.medium'), bg: '#e0a12a', fg: '#3a2e12' };
  return { key: 'low', label: t('dash.low'), bg: '#2f8f6b', fg: '#fff' };
}

function Risks({ d }) {
  const { t } = useTranslation();
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
        <StatTile label={t('dash.criticalHigh')} value={critical.length} status={critical.length ? 'red' : 'green'} />
        <StatTile label={t('dash.overdueActions')} value={overdue.length} status={overdue.length ? 'red' : 'green'} />
      </div>
      <MetricStrip style={{ marginTop: '0.7rem' }} items={[
        { label: t('dash.open'), value: open.length, tone: open.length ? 'warning' : undefined },
        { label: t('dash.resolved'), value: resolved.length },
      ]} />

      {/* 5x5 Risk Matrix (§37) */}
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">{t('dash.riskMatrix')}</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem' }}>
            <tbody>
              {[5, 4, 3, 2, 1].map((i) => (
                <tr key={i}>
                  {i === 5 && <td rowSpan={5} style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 0.3rem' }}>{t('dash.impactAxis')}</td>}
                  <td style={{ fontWeight: 700, color: 'var(--text-3)', padding: '0 0.4rem', textAlign: 'right' }}>{i}</td>
                  {[1, 2, 3, 4, 5].map((l) => {
                    const n = cellCount(l, i);
                    const band = riskBand(l * i, t);
                    const sel = cell && cell.l === l && cell.i === i;
                    return (
                      <td key={l} style={{ padding: 2 }}>
                        <button onClick={() => setCell(sel ? null : { l, i })}
                          title={t('dash.matrixCell', { likelihood: l, impact: i, band: band.label })}
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
              <tr><td /><td /><td colSpan={5} style={{ textAlign: 'center', fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: 2 }}>{t('dash.likelihoodAxis')}</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem', marginTop: '0.6rem', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-3)' }}>
          {['low', 'medium', 'high', 'critical'].map((k) => { const b = riskBand(k === 'low' ? 1 : k === 'medium' ? 6 : k === 'high' ? 12 : 20, t); return (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: 11, height: 11, borderRadius: 3, background: b.bg }} />{b.label}</span>
          ); })}
          {cell && <button onClick={() => setCell(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--green-700)', fontWeight: 700, cursor: 'pointer' }}>{t('dash.clearCellFilter')}</button>}
        </div>
      </div>

      <div className="db-2">
        <div className="db-card"><h3 className="db-h">{t('dash.byCategory')}</h3><BarList rows={countBy(d.risks, (r) => OPT.labelOf(OPT.RISK_CATEGORY, r.category || 'other'))} total={d.risks.length} accent="#d97706" /></div>
        <div className="db-card"><h3 className="db-h">{t('dash.byRating')}</h3><BarList rows={countBy(d.risks, (r) => r.risk_rating || 'Unrated')} total={d.risks.length} accent="#dc2626" /></div>
      </div>
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">{cell ? `Risks at Likelihood ${cell.l} × Impact ${cell.i}` : 'Open risks & issues'}</h3>
        {tableRisks.length === 0 ? (
          <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>{t('dash.noRisksCell')}</p>
        ) : (
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>{t('dash.id')}</th><th>{t('dash.type')}</th><th>{t('dash.description')}</th><th>{t('dash.rating')}</th><th>{t('dash.due')}</th><th>{t('dash.owner')}</th></tr></thead>
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
  const { t } = useTranslation();
  const by = (s) => d.reporting.filter((r) => r.submission_status === s).length;
  const overdue = d.reporting.filter((r) => r.period_end && r.period_end < today() && r.submission_status !== 'approved').length;
  return (
    <>
      <MetricStrip title={t('dash.reportingStatus')} items={[
        { label: t('dash.draft'), value: by('draft') },
        { label: t('dash.submitted'), value: by('submitted') },
        { label: t('dash.returned'), value: by('returned'), tone: by('returned') ? 'warning' : undefined },
        { label: t('dash.reviewed'), value: by('reviewed') },
        { label: t('dash.approved'), value: by('approved'), tone: by('approved') ? 'success' : undefined },
        { label: t('dash.overdue'), value: overdue, tone: overdue ? 'danger' : undefined },
      ]} />
      <div className="db-card" style={{ marginTop: '1rem' }}>
        <h3 className="db-h">{t('dash.reportingPeriods')}</h3>
        <div style={{ overflowX: 'auto' }}><table className="db-table">
          <thead><tr><th>{t('dash.tabProject')}</th><th>{t('dash.period')}</th><th>{t('dash.type')}</th><th>{t('dash.end')}</th><th>{t('dash.status')}</th></tr></thead>
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
