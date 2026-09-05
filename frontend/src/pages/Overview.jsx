// =============================================================================
// Overview.jsx — MERL Project Portfolio Dashboard (Executive Overview)
//
// Executive reading order:
//   1. Overall progress · Projects · Budget utilisation · Beneficiaries
//   2. Needs attention · Implementation performance
//   3. Portfolio/results performance · Geographic coverage
//   4. Reporting and upcoming deadlines
//
// All figures are read live from the existing Supabase public.v_* views. There
// are no mock KPI values in this page. If one of the required backend reads
// fails, the dashboard now shows a retryable connection error instead of
// silently treating the failure as an empty portfolio.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
} from 'recharts';
import { AlertTriangle, Printer, ArrowRight } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST } from '../constants/vanuatuGeo';
import { VanuatuMapMini } from '../components/VanuatuMap';
import {
  useDashboardFilters, projectMatches, STATUS_BUCKETS, bucketOf,
} from '../lib/dashboardFilters';
import KpiCard from '../components/ui/KpiCard';
import { useTranslation } from 'react-i18next';
import { fmtDate, fmtNum } from '../lib/locale';
import { localised, i18nCols } from '../lib/contentLocale';

const C = {
  violet: '#6b55a7',
  violetDark: '#4b377d',
  blue: '#3287d9',
  green: '#22a565',
  amber: '#e0a12a',
  red: '#dc2626',
  muted: '#94a3b8',
};

const STATUS_COLOR = {
  on_track: C.green,
  at_risk: C.amber,
  not_started: C.red,
  completed: '#7c3aed',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const sum = (rows, getter) => rows.reduce((a, r) => a + (Number(getter(r)) || 0), 0);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function fmtVUV(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `VT ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `VT ${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `VT ${(n / 1e3).toFixed(1)}K`;
  return `VT ${fmtNum(n)}`;
}

function statusLabel(key, t) {
  return {
    on_track: t('overview.bucketOnTrack'),
    at_risk: t('overview.bucketAtRisk'),
    not_started: t('overview.bucketNotStarted'),
    completed: t('overview.bucketCompleted'),
  }[key] || key;
}

export default function Overview() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const nav = useNavigate();
  const { filters, setFilter, reset, active } = useDashboardFilters();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setData(null);
    setLoadError(null);

    (async () => {
      try {
        const q = (view, columns) => localised(() => (
          supabase.from(view).select(i18nCols(columns))
        ));

        const responses = await Promise.all([
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

        const failed = responses.find((r) => r?.error);
        if (failed?.error) throw failed.error;
        if (!mounted) return;

        const [proj, fin, risk, ben, act, ind, prog, rep, loc] = responses;
        setData({
          projects: proj.data ?? [],
          financial: fin.data ?? [],
          risks: risk.data ?? [],
          beneficiaries: ben.data ?? [],
          activities: act.data ?? [],
          indicators: ind.data ?? [],
          progress: prog.data ?? [],
          reporting: rep.data ?? [],
          locations: loc.data ?? [],
        });
      } catch (err) {
        if (mounted) setLoadError(err);
      }
    })();

    return () => { mounted = false; };
  }, [lang, reloadKey]);

  if (loadError) {
    return <BackendError onRetry={() => setReloadKey((n) => n + 1)} />;
  }
  if (!data) return <OverviewSkeleton />;
  if (data.projects.length === 0) return <EmptyPortfolio />;

  const years = [...new Set(
    data.projects.flatMap((p) => [p.start_date, p.end_date]
      .filter(Boolean)
      .map((x) => new Date(x).getFullYear())),
  )].sort((a, b) => b - a);
  const donors = [...new Set(data.projects.map((p) => p.donor).filter(Boolean))].sort();
  const themes = [...new Set(data.projects.map((p) => p.category).filter(Boolean))].sort();

  const projects = useMemo(
    () => data.projects.filter((p) => projectMatches(p, filters)),
    [data.projects, filters],
  );
  const ids = useMemo(() => new Set(projects.map((p) => p.id)), [projects]);
  const inScope = (rows) => rows.filter((r) => ids.has(r.project_id));

  const financial = inScope(data.financial);
  const risks = inScope(data.risks);
  const beneficiaries = inScope(data.beneficiaries);
  const activities = inScope(data.activities);
  const indicators = inScope(data.indicators);
  const progress = inScope(data.progress);
  const reporting = inScope(data.reporting);

  const total = projects.length;
  const byBucket = { on_track: 0, at_risk: 0, not_started: 0, completed: 0 };
  for (const p of projects) {
    const key = bucketOf(p.status);
    if (key in byBucket) byBucket[key] += 1;
  }

  const completed = byBucket.completed;
  const activeProjects = total - completed;

  const latestFinance = new Map();
  for (const row of financial) {
    const prev = latestFinance.get(row.project_id);
    if (!prev || (row.created_at ?? '') > (prev.created_at ?? '')) {
      latestFinance.set(row.project_id, row);
    }
  }
  const totalBudget = sum(projects, (p) => p.budget_vuv);
  const totalExpenditure = [...latestFinance.values()]
    .reduce((a, f) => a + (Number(f.cumulative_expenditure) || 0), 0);
  const budgetUtilisation = totalBudget ? Math.round((totalExpenditure / totalBudget) * 100) : 0;

  // Latest recorded result per indicator. This keeps the headline result from
  // overweighting indicators that have more historical reporting periods.
  const latestProgress = new Map();
  for (const row of progress) {
    const prev = latestProgress.get(row.indicator_id);
    const rank = row.created_at ?? row.reporting_period ?? '';
    const prevRank = prev?.created_at ?? prev?.reporting_period ?? '';
    if (!prev || rank > prevRank) latestProgress.set(row.indicator_id, row);
  }

  const latestAchievement = indicators
    .map((ind) => latestProgress.get(ind.id)?.achievement_pct)
    .filter((v) => v != null)
    .map(Number);
  const overallProgress = latestAchievement.length
    ? Math.round(latestAchievement.reduce((a, b) => a + b, 0) / latestAchievement.length)
    : null;

  const indicatorStatus = { on_track: 0, attention_required: 0, off_track: 0, no_data: 0 };
  for (const ind of indicators) {
    const key = latestProgress.get(ind.id)?.performance_status || 'no_data';
    indicatorStatus[key in indicatorStatus ? key : 'no_data'] += 1;
  }

  const totalBeneficiaries = sum(beneficiaries, (b) => b.total_direct);
  const hasField = (field) => beneficiaries.some((b) => b[field] != null);
  const fieldSum = (field) => hasField(field)
    ? beneficiaries.reduce((a, b) => a + (b[field] != null ? Number(b[field]) : 0), 0)
    : null;
  const female = fieldSum('female');
  const male = fieldSum('male');
  const genderSummary = female != null || male != null
    ? `${female != null ? fmtNum(female) : '—'} ${t('overview.beneFemale')} · ${male != null ? fmtNum(male) : '—'} ${t('overview.beneMale')}`
    : null;

  const approvedDates = data.reporting
    .filter((r) => r.submission_status === 'approved')
    .map((r) => r.approved_at || r.period_end)
    .filter(Boolean)
    .sort();
  const dataAsAt = approvedDates.length
    ? approvedDates[approvedDates.length - 1].slice(0, 10)
    : '—';

  const provinceCounts = {};
  for (const p of projects) {
    for (const province of (p.provinces || [])) {
      provinceCounts[province] = (provinceCounts[province] || 0) + 1;
    }
  }
  const nationalCount = projects.filter((p) => !(p.provinces || []).length).length;

  const provincesByProject = new Map(data.projects.map((p) => [p.id, p.provinces || []]));
  const provinceBeneficiaries = {};
  for (const row of beneficiaries) {
    const value = Number(row.total_direct) || 0;
    for (const province of (provincesByProject.get(row.project_id) || [])) {
      provinceBeneficiaries[province] = (provinceBeneficiaries[province] || 0) + value;
    }
  }

  const now = todayIso();
  const overdueActivities = activities.filter((a) => (
    a.status !== 'completed' && a.planned_end_date && a.planned_end_date.slice(0, 10) < now
  )).length;
  const overdueReports = reporting.filter((r) => (
    r.submission_status !== 'approved' && r.period_end && r.period_end.slice(0, 10) < now
  )).length;
  const awaitingReview = reporting.filter((r) => ['submitted', 'reviewed'].includes(r.submission_status)).length;
  const offTrackIndicators = indicatorStatus.off_track;

  const attention = [
    { key: 'reports', label: t('overview.attnOverdue'), value: overdueReports, to: '/merl-reporting', tone: overdueReports ? 'critical' : 'clear' },
    { key: 'indicators', label: t('overview.attnOffTrack'), value: offTrackIndicators, to: '/analytics/results', tone: offTrackIndicators ? 'warning' : 'clear' },
    { key: 'activities', label: t('overview.attnDelayed'), value: overdueActivities, to: '/merl-reporting', tone: overdueActivities ? 'warning' : 'clear' },
    { key: 'review', label: t('overview.attnAwaiting'), value: awaitingReview, to: '/review', tone: awaitingReview ? 'warning' : 'clear' },
  ];

  const statusData = Object.keys(byBucket).map((key) => ({
    key,
    name: statusLabel(key, t),
    value: byBucket[key],
    color: STATUS_COLOR[key],
  }));

  const activitiesDone = activities.filter((a) => a.status === 'completed').length;
  const reportsApproved = reporting.filter((r) => r.submission_status === 'approved').length;
  const performanceRows = [
    {
      key: 'indicators',
      label: t('overview.perfIndicators'),
      value: pct(indicatorStatus.on_track, indicators.length),
      detail: `${fmtNum(indicatorStatus.on_track)} / ${fmtNum(indicators.length)}`,
    },
    {
      key: 'activities',
      label: t('overview.perfActivities'),
      value: pct(activitiesDone, activities.length),
      detail: `${fmtNum(activitiesDone)} / ${fmtNum(activities.length)}`,
    },
    {
      key: 'budget',
      label: t('overview.perfBudget'),
      value: budgetUtilisation,
      detail: fmtVUV(totalExpenditure),
    },
    {
      key: 'reporting',
      label: t('overview.perfReporting'),
      value: pct(reportsApproved, reporting.length),
      detail: `${fmtNum(reportsApproved)} / ${fmtNum(reporting.length)}`,
    },
  ];

  const projectName = (id) => data.projects.find((p) => p.id === id)?.name || '—';
  const daysUntil = (date) => Math.round((new Date(date.slice(0, 10)) - new Date(now)) / 864e5);
  const reportStatus = (row) => {
    if (row.submission_status === 'approved') return { label: t('overview.statusApproved'), tone: 'ok' };
    if (['submitted', 'reviewed'].includes(row.submission_status)) return { label: t('overview.statusSubmitted'), tone: 'info' };
    if (!row.period_end) return { label: t('overview.statusPending'), tone: 'warn' };
    const left = daysUntil(row.period_end);
    if (left < 0) return { label: t('overview.statusOverdue'), tone: 'crit' };
    return { label: t('overview.dueInDays', { count: left }), tone: left <= 7 ? 'crit' : 'warn' };
  };

  const reportRows = [...reporting]
    .filter((r) => r.period_end && daysUntil(r.period_end) >= -60)
    .sort((a, b) => (a.period_end || '').localeCompare(b.period_end || ''))
    .slice(0, 6)
    .map((r) => ({
      id: `${r.project_id}-${r.period_label}`,
      item: r.period_label || t('overview.reportingPeriod'),
      project: projectName(r.project_id),
      due: r.period_end,
      status: reportStatus(r),
    }));

  return (
    <div className="ovx">
      <OverviewStyles />

      <section className="ovx-heading rp-noprint">
        <div>
          <h1>{t('overview.title')}</h1>
          <p>{t('overview.subtitle')} <b>{dataAsAt}</b></p>
        </div>
        <button type="button" className="ovx-export" onClick={() => window.print()}>
          <Printer size={15} aria-hidden="true" /> {t('ui.export')}
        </button>
      </section>

      <section className="ovx-filterbar rp-noprint" aria-label={t('overview.title')}>
        <FilterSelect label={t('overview.filterFy')} value={filters.fy}
          onChange={(v) => setFilter('fy', v)} options={years.map((y) => ({ value: String(y), label: String(y) }))} />
        <FilterSelect label={t('overview.filterStatus')} value={filters.status}
          onChange={(v) => setFilter('status', v)} options={Object.keys(STATUS_BUCKETS).map((key) => ({ value: key, label: statusLabel(key, t) }))} />
        <FilterSelect label={t('overview.filterTheme')} value={filters.theme}
          onChange={(v) => setFilter('theme', v)} options={themes.map((theme) => ({ value: theme, label: theme }))} />
        <FilterSelect label={t('overview.filterProvince')} value={filters.province}
          onChange={(v) => setFilter('province', v)} options={PROVINCE_LIST.map((province) => ({ value: province, label: province }))} />
        <FilterSelect label={t('overview.filterPartner')} value={filters.partner}
          onChange={(v) => setFilter('partner', v)} options={donors.map((donor) => ({ value: donor, label: donor }))} />
        <button type="button" className="ovx-reset" onClick={reset} disabled={!active}>{t('ui.reset')}</button>
      </section>

      {/* Level 1 — headline results. These are deliberately the only four cards
          competing for the first visual read. */}
      <section className="ovx-kpis" aria-label={t('overview.title')}>
        <KpiCard
          className="ovx-kpi ovx-kpi-progress"
          label={t('overview.overallProgress')}
          value={overallProgress == null ? '—' : `${overallProgress}%`}
          sub={`${fmtNum(indicatorStatus.on_track)} / ${fmtNum(indicators.length)} · ${t('overview.indicatorsOnTrack')}`}
          progress={overallProgress}
          progressColor={C.violet}
          linkLabel={t('overview.viewPerformance')}
          onClick={() => nav('/analytics/results')}
        />
        <KpiCard
          className="ovx-kpi ovx-kpi-projects"
          label={t('overview.kpiProjects')}
          value={fmtNum(total)}
          sub={t('overview.activeCompleted', { active: activeProjects, completed })}
          linkLabel={t('overview.viewProjects')}
          onClick={() => nav('/analytics/portfolio')}
        />
        <KpiCard
          className="ovx-kpi ovx-kpi-budget"
          label={t('overview.budgetUtilisation')}
          value={`${budgetUtilisation}%`}
          sub={`${fmtVUV(totalExpenditure)} / ${fmtVUV(totalBudget)}`}
          progress={budgetUtilisation}
          progressColor={C.amber}
          linkLabel={t('overview.viewFinancials')}
          onClick={() => nav('/analytics/financial')}
        />
        <KpiCard
          className="ovx-kpi ovx-kpi-beneficiaries"
          label={t('overview.kpiBeneficiaries')}
          value={fmtNum(totalBeneficiaries)}
          sub={genderSummary || undefined}
          linkLabel={t('overview.viewBeneficiaries')}
          onClick={() => nav('/analytics/geographic')}
        />
      </section>

      {/* Level 2 — what requires intervention, then the implementation picture. */}
      <section className="ovx-priority-grid">
        <article className="ovx-card ovx-attention-card">
          <CardHeading icon={<AlertTriangle size={17} aria-hidden="true" />} title={t('overview.needsAttention')} />
          <div className="ovx-attention-grid">
            {attention.map((item) => (
              <button key={item.key} type="button" className={`ovx-attention-item tone-${item.tone}`} onClick={() => nav(item.to)}>
                <span className="ovx-attention-number">{fmtNum(item.value)}</span>
                <span className="ovx-attention-label">{item.label}</span>
                <span className="ovx-attention-action">{t('overview.viewAll')} <ArrowRight size={12} /></span>
              </button>
            ))}
          </div>
        </article>

        <article className="ovx-card">
          <CardHeading title={t('overview.implementation')} />
          <div className="ovx-implementation">
            <Donut data={statusData} total={total} onSlice={(slice) => setFilter('status', slice.key)} />
            <div className="ovx-status-list">
              {statusData.map((item) => (
                <button key={item.key} type="button" className="ovx-status-row" onClick={() => setFilter('status', item.key)}>
                  <span className="ovx-status-dot" style={{ background: item.color }} />
                  <span className="ovx-status-name">{item.name}</span>
                  <b>{fmtNum(item.value)}</b>
                  <span>{pct(item.value, total)}%</span>
                </button>
              ))}
            </div>
          </div>
          <CardLink onClick={() => nav('/analytics/portfolio')}>{t('overview.viewPerformance')}</CardLink>
        </article>
      </section>

      {/* Level 3 — performance explanation first, geographic context second. */}
      <section className="ovx-secondary-grid">
        <article className="ovx-card">
          <CardHeading title={t('overview.portfolio')} />
          <div className="ovx-performance-list">
            {performanceRows.map((row) => (
              <div key={row.key} className="ovx-performance-row">
                <div className="ovx-performance-meta">
                  <span>{row.label}</span>
                  <b>{row.value}%</b>
                </div>
                <div className="ovx-performance-track">
                  <div style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }} />
                </div>
                <span className="ovx-performance-detail">{row.detail}</span>
              </div>
            ))}
          </div>
          <CardLink onClick={() => nav('/analytics/results')}>{t('overview.viewPerformance')}</CardLink>
        </article>

        <ProjectLocations
          counts={provinceCounts}
          beneficiaries={provinceBeneficiaries}
          nationalCount={nationalCount}
          selected={filters.province}
          onSelect={(province) => setFilter('province', province)}
          onView={() => nav('/analytics/geographic')}
        />
      </section>

      {/* Level 4 — operational follow-up after the management picture is clear. */}
      <section className="ovx-card ovx-reporting-card">
        <CardHeading title={t('overview.recentUpcoming')} />
        {reportRows.length === 0 ? (
          <div className="ovx-empty">{t('overview.nothingDueSoon')}</div>
        ) : (
          <div className="ovx-table-wrap">
            <table className="ovx-table">
              <thead>
                <tr>
                  <th>{t('overview.colItem')}</th>
                  <th>{t('overview.colProject')}</th>
                  <th>{t('overview.colDueDate')}</th>
                  <th>{t('overview.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {reportRows.map((row) => (
                  <tr key={row.id} onClick={() => nav('/analytics/reporting')}>
                    <td className="ovx-table-strong">{row.item}</td>
                    <td>{row.project}</td>
                    <td>{fmtDate(row.due)}</td>
                    <td><span className={`ovx-badge tone-${row.status.tone}`}>{row.status.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CardLink onClick={() => nav('/analytics/reporting')}>{t('overview.viewAllReports')}</CardLink>
      </section>

      <div className="ovx-updated">{t('overview.subtitle')} <b>{dataAsAt}</b></div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  const { t } = useTranslation();
  return (
    <label className="ovx-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        <option value="">{t('ui.all')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{OPT.optionLabel(option)}</option>
        ))}
      </select>
    </label>
  );
}

function CardHeading({ title, icon }) {
  return (
    <div className="ovx-card-heading">
      <div className="ovx-card-title">{icon}{title}</div>
    </div>
  );
}

function CardLink({ onClick, children }) {
  return (
    <button type="button" className="ovx-card-link" onClick={onClick}>
      {children} <ArrowRight size={13} aria-hidden="true" />
    </button>
  );
}

function Donut({ data, total, onSlice }) {
  return (
    <div className="ovx-donut-wrap">
      {total === 0 ? (
        <div className="ovx-empty">—</div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={47}
              outerRadius={68}
              paddingAngle={2}
              onClick={(entry) => onSlice?.(entry?.payload ?? entry)}
              cursor="pointer"
            >
              {data.map((item) => <Cell key={item.key} fill={item.color} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="ovx-donut-center">
        <b>{fmtNum(total)}</b>
        <span>Total</span>
      </div>
    </div>
  );
}

function ProjectLocations({ counts, beneficiaries, nationalCount, selected, onSelect, onView }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(null);

  return (
    <article className="ovx-card ovx-location-card">
      <CardHeading title={t('overview.locations')} />
      <div className="ovx-location-layout">
        <div className="ovx-map-panel">
          <VanuatuMapMini
            counts={counts}
            selected={selected}
            hovered={hovered}
            onHover={setHovered}
            onSelect={onSelect}
          />
        </div>
        <div className="ovx-location-table-wrap">
          <table className="ovx-location-table">
            <thead>
              <tr>
                <th>{t('overview.colProvince')}</th>
                <th>{t('overview.colProjects')}</th>
                <th>{t('overview.colBeneficiaries')}</th>
              </tr>
            </thead>
            <tbody>
              {PROVINCE_LIST.map((province) => (
                <tr
                  key={province}
                  className={`${selected === province ? 'selected ' : ''}${hovered === province ? 'hovered' : ''}`}
                  onClick={() => onSelect(province)}
                  onMouseEnter={() => setHovered(province)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <td><span className="ovx-province-dot" style={{ opacity: counts[province] ? 1 : 0.28 }} />{province}</td>
                  <td>{fmtNum(counts[province] || 0)}</td>
                  <td>{fmtNum(beneficiaries[province] || 0)}</td>
                </tr>
              ))}
              {nationalCount > 0 && (
                <tr>
                  <td><span className="ovx-province-dot is-muted" />{t('overview.nationalMulti')}</td>
                  <td>{fmtNum(nationalCount)}</td>
                  <td>—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <CardLink onClick={onView}>{t('overview.viewCoverage')}</CardLink>
    </article>
  );
}

function BackendError({ onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="ovx ovx-error-state">
      <OverviewStyles />
      <div className="ovx-error-card">
        <AlertTriangle size={22} aria-hidden="true" />
        <div>
          <h2>{t('ppa.sectionFailed')}</h2>
          <p>The dashboard could not read the live MERL data service. No figures have been substituted.</p>
        </div>
        <button type="button" className="ovx-export" onClick={onRetry}>{t('ppa.retry')}</button>
      </div>
    </div>
  );
}

function EmptyPortfolio() {
  const { t } = useTranslation();
  const nav = useNavigate();
  return (
    <div className="ovx ovx-error-state">
      <OverviewStyles />
      <div className="ovx-empty-card">
        <h2>{t('overview.emptyTitle')}</h2>
        <p>{t('overview.emptyBody')}</p>
        <button type="button" className="ovx-export" onClick={() => nav('/project-setup')}>{t('overview.emptyCta')}</button>
      </div>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="ovx">
      <OverviewStyles />
      <div className="ovx-skeleton ovx-skeleton-heading" />
      <div className="ovx-skeleton ovx-skeleton-filters" />
      <div className="ovx-kpis">
        {Array.from({ length: 4 }).map((_, i) => <div className="ovx-skeleton ovx-skeleton-kpi" key={i} />)}
      </div>
      <div className="ovx-priority-grid">
        <div className="ovx-skeleton ovx-skeleton-panel" />
        <div className="ovx-skeleton ovx-skeleton-panel" />
      </div>
    </div>
  );
}

function OverviewStyles() {
  return (
    <style>{`
      .ovx{max-width:1440px;margin:0 auto;padding:1.05rem 1.05rem 1.5rem;color:var(--text-1)}
      .ovx-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin:.1rem 0 .9rem}
      .ovx-heading h1{margin:0;color:#2a2148;font-size:clamp(1.55rem,2.3vw,2rem);font-weight:780;letter-spacing:-.035em}
      .ovx-heading p{margin:.3rem 0 0;color:#91899f;font-size:.82rem}
      .ovx-heading p b{color:#736a84;font-weight:700}
      .ovx-export{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;min-height:42px;padding:.65rem 1rem;border:0;border-radius:11px;background:#5b4692;color:#fff;font:inherit;font-size:.79rem;font-weight:700;cursor:pointer;box-shadow:0 8px 18px rgba(74,55,125,.14)}
      .ovx-export:hover{background:#4b377d}

      .ovx-filterbar{display:grid;grid-template-columns:.8fr .8fr 1.25fr .9fr 1.2fr auto;gap:.65rem;align-items:end;margin-bottom:1rem;padding:.85rem .9rem;border:1px solid #ebe7f2;border-radius:14px;background:#fff;box-shadow:var(--shadow-sm)}
      .ovx-filter{display:block;min-width:0}
      .ovx-filter>span{display:block;margin:0 0 .32rem;color:#898194;font-size:.62rem;font-weight:760;letter-spacing:.065em;text-transform:uppercase}
      .ovx-filter select{width:100%;min-height:40px;padding:.5rem .7rem;border:1px solid #e4dfed;border-radius:9px;background:#fff;color:#41374f;font:inherit;font-size:.8rem;outline:none}
      .ovx-filter select:focus{border-color:#7a66aa;box-shadow:0 0 0 3px rgba(91,70,146,.1)}
      .ovx-reset{min-height:40px;padding:.5rem .85rem;border:1px solid #e6e1ef;border-radius:9px;background:#f9f8fc;color:#7f778c;font:inherit;font-size:.75rem;font-weight:700;cursor:pointer}
      .ovx-reset:disabled{opacity:.45;cursor:not-allowed}

      .ovx-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;margin-bottom:.9rem}
      .ovx-kpi{min-height:174px!important;border-radius:14px!important;border-color:#ebe7f2!important;padding:1rem!important;box-shadow:var(--shadow-sm)!important}
      .ovx-kpi::before{content:'';position:absolute;left:-1px;top:14px;bottom:14px;width:4px;border-radius:0 5px 5px 0;background:#6b55a7}
      .ovx-kpi-projects::before{background:#4ea76b}.ovx-kpi-budget::before{background:#f0b323}.ovx-kpi-beneficiaries::before{background:#338bdc}
      .ovx-kpi [class*='uppercase']{text-transform:none!important;letter-spacing:.01em!important;font-size:.7rem!important;color:#7e758e!important}
      .ovx-kpi [class*='font-extrabold']{font-size:clamp(1.55rem,2.1vw,2rem)!important;color:#281f48!important}
      .ovx-kpi [class*='text-xs']{color:#786f87!important}

      .ovx-priority-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.35fr);gap:.9rem;margin-bottom:.9rem}
      .ovx-secondary-grid{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.45fr);gap:.9rem;margin-bottom:.9rem}
      .ovx-card{display:flex;min-width:0;flex-direction:column;border:1px solid #ebe7f2;border-radius:14px;background:#fff;padding:1rem;box-shadow:var(--shadow-sm)}
      .ovx-card-heading{display:flex;align-items:center;justify-content:space-between;gap:.8rem;margin-bottom:.8rem}
      .ovx-card-title{display:flex;align-items:center;gap:.48rem;color:#33284f;font-size:.91rem;font-weight:760;letter-spacing:-.015em}
      .ovx-card-title svg{color:#b16a43}
      .ovx-card-link{display:inline-flex;align-items:center;gap:.35rem;align-self:flex-start;margin-top:auto;padding:.75rem 0 0;border:0;background:none;color:#5b4692;font:inherit;font-size:.72rem;font-weight:730;cursor:pointer}
      .ovx-card-link:hover{text-decoration:underline}

      .ovx-attention-card{background:linear-gradient(180deg,#fffdfa 0%,#fff 30%)}
      .ovx-attention-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}
      .ovx-attention-item{display:grid;grid-template-columns:auto 1fr;grid-template-areas:'num label' 'num action';column-gap:.7rem;row-gap:.18rem;min-width:0;padding:.72rem;border:1px solid #eee9f3;border-radius:11px;background:#fff;text-align:left;cursor:pointer;font:inherit}
      .ovx-attention-item:hover{border-color:#ddd4e9;background:#fcfbfe}
      .ovx-attention-number{grid-area:num;align-self:center;min-width:1.7ch;color:#4b377d;font-size:1.35rem;font-weight:820;font-family:var(--font-display);line-height:1}
      .ovx-attention-label{grid-area:label;min-width:0;color:#50475d;font-size:.74rem;font-weight:650;line-height:1.25}
      .ovx-attention-action{grid-area:action;display:flex;align-items:center;gap:.2rem;color:#91899f;font-size:.64rem;font-weight:650}
      .ovx-attention-item.tone-critical .ovx-attention-number{color:#c23b32}.ovx-attention-item.tone-warning .ovx-attention-number{color:#c78417}.ovx-attention-item.tone-clear .ovx-attention-number{color:#4b9a67}

      .ovx-implementation{display:grid;grid-template-columns:170px minmax(0,1fr);gap:1rem;align-items:center;min-height:178px}
      .ovx-donut-wrap{position:relative;width:170px;height:170px}
      .ovx-donut-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none}
      .ovx-donut-center b{color:#2d234d;font-size:1.35rem;font-family:var(--font-display)}
      .ovx-donut-center span{color:#91899f;font-size:.62rem;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
      .ovx-status-list{display:flex;flex-direction:column;gap:.3rem}
      .ovx-status-row{display:grid;grid-template-columns:10px minmax(0,1fr) auto 44px;gap:.55rem;align-items:center;width:100%;padding:.48rem .35rem;border:0;border-bottom:1px solid #f0edf4;background:none;color:#5b5268;text-align:left;cursor:pointer;font:inherit;font-size:.73rem}
      .ovx-status-row:last-child{border-bottom:0}.ovx-status-row:hover{background:#faf8fd}
      .ovx-status-dot{width:9px;height:9px;border-radius:3px}.ovx-status-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ovx-status-row b{color:#31274d;font-size:.78rem}.ovx-status-row>span:last-child{text-align:right;color:#91899f}

      .ovx-performance-list{display:flex;flex-direction:column;gap:.9rem;padding:.25rem 0 .35rem}
      .ovx-performance-row{display:grid;grid-template-columns:1fr auto;grid-template-areas:'meta meta' 'track detail';gap:.35rem .7rem}
      .ovx-performance-meta{grid-area:meta;display:flex;align-items:center;justify-content:space-between;gap:.8rem;color:#62596f;font-size:.74rem;font-weight:650}
      .ovx-performance-meta b{color:#34284f;font-size:.82rem}
      .ovx-performance-track{grid-area:track;height:7px;overflow:hidden;border-radius:999px;background:#efecf5}
      .ovx-performance-track>div{height:100%;border-radius:inherit;background:linear-gradient(90deg,#6b55a7,#806bb4)}
      .ovx-performance-detail{grid-area:detail;min-width:62px;color:#9991a5;font-size:.64rem;text-align:right}

      .ovx-location-layout{display:grid;grid-template-columns:minmax(230px,.92fr) minmax(300px,1.08fr);gap:.8rem;align-items:stretch}
      .ovx-map-panel{min-height:270px;overflow:hidden;border:1px solid #ebe7f2;border-radius:11px;background:#f4f3fa}
      .ovx-location-table-wrap{overflow:auto}
      .ovx-location-table{width:100%;border-collapse:collapse;font-size:.72rem}
      .ovx-location-table th{padding:.55rem .48rem;border-bottom:1px solid #eae6f0;color:#8f879c;background:#faf9fc;font-size:.61rem;font-weight:760;letter-spacing:.05em;text-align:right;text-transform:uppercase}
      .ovx-location-table th:first-child{text-align:left}.ovx-location-table td{padding:.55rem .48rem;border-bottom:1px solid #f0edf4;color:#554c62;text-align:right}.ovx-location-table td:first-child{display:flex;align-items:center;gap:.45rem;color:#3d334f;font-weight:680;text-align:left}.ovx-location-table tr{cursor:pointer}.ovx-location-table tbody tr:hover,.ovx-location-table tr.hovered{background:#faf8fd}.ovx-location-table tr.selected{background:#f4effb}
      .ovx-province-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#6b55a7;flex-shrink:0}.ovx-province-dot.is-muted{background:#a9a2b3}

      .ovx-reporting-card{margin-bottom:.7rem}
      .ovx-table-wrap{overflow:auto;border:1px solid #ece8f2;border-radius:11px}
      .ovx-table{width:100%;border-collapse:collapse;font-size:.74rem}
      .ovx-table th{padding:.65rem .75rem;background:#faf9fc;color:#8c8499;font-size:.62rem;font-weight:760;letter-spacing:.055em;text-align:left;text-transform:uppercase}
      .ovx-table td{padding:.7rem .75rem;border-top:1px solid #efecf4;color:#61586d}.ovx-table tbody tr{cursor:pointer}.ovx-table tbody tr:hover{background:#faf9fd}.ovx-table-strong{color:#372c50!important;font-weight:680}
      .ovx-badge{display:inline-flex;padding:.18rem .5rem;border-radius:999px;font-size:.62rem;font-weight:730;white-space:nowrap}.ovx-badge.tone-ok{background:#e8f6ec;color:#2f7d49}.ovx-badge.tone-info{background:#eef3ff;color:#4169a9}.ovx-badge.tone-warn{background:#fff6df;color:#996713}.ovx-badge.tone-crit{background:#feebea;color:#b53b34}
      .ovx-empty{display:flex;min-height:110px;align-items:center;justify-content:center;color:#9a92a5;font-size:.78rem}.ovx-updated{padding:.2rem .15rem;color:#9a92a5;font-size:.66rem;text-align:right}

      .ovx-error-state{display:flex;min-height:60vh;align-items:center;justify-content:center}.ovx-error-card,.ovx-empty-card{display:flex;max-width:620px;align-items:flex-start;gap:.9rem;padding:1.1rem;border:1px solid #ebe7f2;border-radius:14px;background:#fff;box-shadow:var(--shadow-sm)}.ovx-empty-card{display:block;text-align:center}.ovx-error-card svg{color:#c78417;flex-shrink:0}.ovx-error-card h2,.ovx-empty-card h2{margin:0 0 .25rem;color:#33284f;font-size:1rem}.ovx-error-card p,.ovx-empty-card p{margin:0;color:#776e84;font-size:.78rem;line-height:1.5}.ovx-error-card .ovx-export{margin-left:auto;flex-shrink:0}.ovx-empty-card .ovx-export{margin-top:.8rem}

      .ovx-skeleton{position:relative;overflow:hidden;border-radius:14px;background:#ece9f2}.ovx-skeleton::after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:ovx-shimmer 1.4s infinite}.ovx-skeleton-heading{height:58px;margin-bottom:.9rem}.ovx-skeleton-filters{height:82px;margin-bottom:1rem}.ovx-skeleton-kpi{height:174px}.ovx-skeleton-panel{height:270px}@keyframes ovx-shimmer{to{transform:translateX(100%)}}

      @media(max-width:1180px){.ovx-filterbar{grid-template-columns:repeat(3,minmax(0,1fr))}.ovx-reset{align-self:end}.ovx-location-layout{grid-template-columns:1fr}.ovx-map-panel{min-height:240px}}
      @media(max-width:980px){.ovx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.ovx-priority-grid,.ovx-secondary-grid{grid-template-columns:1fr}.ovx-location-layout{grid-template-columns:minmax(220px,.9fr) minmax(300px,1.1fr)}}
      @media(max-width:760px){.ovx{padding:.8rem .7rem 1.1rem}.ovx-heading{align-items:flex-start}.ovx-filterbar{grid-template-columns:repeat(2,minmax(0,1fr))}.ovx-location-layout{grid-template-columns:1fr}.ovx-implementation{grid-template-columns:145px minmax(0,1fr)}.ovx-donut-wrap{width:145px;height:145px}}
      @media(max-width:560px){.ovx-heading{flex-direction:column}.ovx-export{width:100%}.ovx-filterbar{grid-template-columns:1fr}.ovx-kpis{grid-template-columns:1fr}.ovx-attention-grid{grid-template-columns:1fr}.ovx-implementation{grid-template-columns:1fr;justify-items:center}.ovx-status-list{width:100%}.ovx-kpi{min-height:154px!important}}
      @media print{.ovx{max-width:none;padding:0}.ovx-filterbar,.ovx-export{display:none!important}.ovx-card,.ovx-kpi{box-shadow:none!important}}
    `}</style>
  );
}
