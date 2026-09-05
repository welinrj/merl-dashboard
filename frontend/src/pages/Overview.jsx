// =============================================================================
// Overview.jsx — MERL Project Portfolio Dashboard (Executive Overview)
//
// Executive reading order:
//   1. Portfolio status
//   2. Management attention + implementation status
//   3. Results performance + geographic coverage
//   4. Reporting obligations
//
// All figures are read live from the existing Supabase public.v_* views.
// =============================================================================
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Printer } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST } from '../constants/vanuatuGeo';
import { VanuatuMapMini } from '../components/VanuatuMap';
import {
  useDashboardFilters, projectMatches, STATUS_BUCKETS, bucketOf,
} from '../lib/dashboardFilters';
import { useTranslation } from 'react-i18next';
import { fmtDate, fmtNum } from '../lib/locale';
import { localised, i18nCols } from '../lib/contentLocale';

const C = {
  violet: '#5a4784',
  green: '#228a57',
  amber: '#c88918',
  red: '#c8463d',
};

const STATUS_COLOR = {
  on_track: C.green,
  at_risk: C.amber,
  not_started: C.red,
  completed: C.violet,
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const sum = (rows, getter) => rows.reduce((a, r) => a + (Number(getter(r)) || 0), 0);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const rankOf = (row) => row?.created_at ?? row?.reporting_period ?? '';

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

function uniqueProjects(rows) {
  return new Set(rows.map((row) => row.project_id).filter(Boolean)).size;
}

export default function Overview() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const isFr = lang?.startsWith('fr');
  const nav = useNavigate();
  const { filters, setFilter, reset, active } = useDashboardFilters();

  const copy = isFr ? {
    portfolioStatus: 'État du portefeuille',
    managementAttention: 'Priorités de gestion',
    performanceCoverage: 'Performance et couverture',
    reportingObligations: 'Obligations de rapportage',
    filters: 'Filtres',
    lastUpdated: 'Mis à jour',
    sincePrevious: 'depuis le rapport précédent',
    projectsAffected: (n) => `${n} projet${n > 1 ? 's' : ''} concerné${n > 1 ? 's' : ''}`,
    olderThan30: (n) => `${n} depuis plus de 30 jours`,
    review: 'Examiner',
    statusDistribution: 'Répartition du statut de mise en œuvre',
    statusHint: 'Sélectionnez un statut pour filtrer le portefeuille.',
    resultsPerformance: 'Performance des résultats',
    coverageConcentration: 'Concentration géographique',
    projectsLabel: 'projets',
    beneficiariesLabel: 'bénéficiaires',
    national: 'National / multi-provinces',
  } : {
    portfolioStatus: 'Portfolio status',
    managementAttention: 'Management attention',
    performanceCoverage: 'Performance and coverage',
    reportingObligations: 'Reporting obligations',
    filters: 'Filters',
    lastUpdated: 'Updated',
    sincePrevious: 'since previous report',
    projectsAffected: (n) => `${n} project${n === 1 ? '' : 's'} affected`,
    olderThan30: (n) => `${n} more than 30 days overdue`,
    review: 'Review',
    statusDistribution: 'Implementation status distribution',
    statusHint: 'Select a status to filter the portfolio.',
    resultsPerformance: 'Results performance',
    coverageConcentration: 'Geographic concentration',
    projectsLabel: 'projects',
    beneficiariesLabel: 'beneficiaries',
    national: 'National / multi-province',
  };

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

  const projects = data.projects.filter((p) => projectMatches(p, filters));
  const ids = new Set(projects.map((p) => p.id));
  const inScope = (rows) => rows.filter((r) => ids.has(r.project_id));

  const financial = inScope(data.financial);
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

  // Current budget utilisation plus a like-for-like previous-period trend for
  // projects that actually have at least two financial records.
  const financeByProject = new Map();
  for (const row of financial) {
    const list = financeByProject.get(row.project_id) ?? [];
    list.push(row);
    financeByProject.set(row.project_id, list);
  }
  let totalExpenditure = 0;
  let trendBudget = 0;
  let trendCurrentExpenditure = 0;
  let trendPreviousExpenditure = 0;
  let trendFinanceProjects = 0;
  for (const [projectId, rows] of financeByProject) {
    rows.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    const latest = rows[rows.length - 1];
    totalExpenditure += Number(latest?.cumulative_expenditure) || 0;
    if (rows.length > 1) {
      const previous = rows[rows.length - 2];
      const project = projects.find((p) => p.id === projectId);
      trendBudget += Number(project?.budget_vuv) || Number(latest?.approved_budget) || 0;
      trendCurrentExpenditure += Number(latest?.cumulative_expenditure) || 0;
      trendPreviousExpenditure += Number(previous?.cumulative_expenditure) || 0;
      trendFinanceProjects += 1;
    }
  }
  const totalBudget = sum(projects, (p) => p.budget_vuv);
  const budgetUtilisation = totalBudget ? Math.round((totalExpenditure / totalBudget) * 100) : 0;
  const budgetTrend = trendFinanceProjects && trendBudget
    ? Math.round((trendCurrentExpenditure / trendBudget) * 100)
      - Math.round((trendPreviousExpenditure / trendBudget) * 100)
    : null;

  // Latest and previous recorded result per indicator. The headline progress
  // uses the latest result only; the trend compares indicators with two records.
  const progressByIndicator = new Map();
  for (const row of progress) {
    const list = progressByIndicator.get(row.indicator_id) ?? [];
    list.push(row);
    progressByIndicator.set(row.indicator_id, list);
  }
  const latestProgress = new Map();
  const previousProgress = new Map();
  for (const [indicatorId, rows] of progressByIndicator) {
    rows.sort((a, b) => rankOf(a).localeCompare(rankOf(b)));
    latestProgress.set(indicatorId, rows[rows.length - 1]);
    if (rows.length > 1) previousProgress.set(indicatorId, rows[rows.length - 2]);
  }

  const latestAchievement = indicators
    .map((ind) => latestProgress.get(ind.id)?.achievement_pct)
    .filter((v) => v != null)
    .map(Number);
  const overallProgress = latestAchievement.length
    ? Math.round(latestAchievement.reduce((a, b) => a + b, 0) / latestAchievement.length)
    : null;

  const pairedCurrent = [];
  const pairedPrevious = [];
  for (const ind of indicators) {
    const current = latestProgress.get(ind.id)?.achievement_pct;
    const previous = previousProgress.get(ind.id)?.achievement_pct;
    if (current != null && previous != null) {
      pairedCurrent.push(Number(current));
      pairedPrevious.push(Number(previous));
    }
  }
  const progressTrend = pairedCurrent.length
    ? Math.round(
      pairedCurrent.reduce((a, b) => a + b, 0) / pairedCurrent.length
      - pairedPrevious.reduce((a, b) => a + b, 0) / pairedPrevious.length,
    )
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
  const daysUntil = (date) => Math.round((new Date(date.slice(0, 10)) - new Date(now)) / 864e5);

  const overdueRows = reporting.filter((r) => (
    r.submission_status !== 'approved' && r.period_end && r.period_end.slice(0, 10) < now
  ));
  const overdueReports = overdueRows.length;
  const overdue30 = overdueRows.filter((r) => daysUntil(r.period_end) < -30).length;

  const delayedRows = activities.filter((a) => (
    a.status !== 'completed' && a.planned_end_date && a.planned_end_date.slice(0, 10) < now
  ));
  const awaitingRows = reporting.filter((r) => ['submitted', 'reviewed'].includes(r.submission_status));
  const offTrackRows = [...latestProgress.values()].filter((r) => r?.performance_status === 'off_track');

  const attention = [
    {
      key: 'reports',
      label: t('overview.attnOverdue'),
      value: overdueReports,
      context: `${copy.olderThan30(overdue30)} · ${copy.projectsAffected(uniqueProjects(overdueRows))}`,
      to: '/merl-reporting',
      tone: overdueReports ? 'critical' : 'clear',
    },
    {
      key: 'indicators',
      label: t('overview.attnOffTrack'),
      value: offTrackRows.length,
      context: copy.projectsAffected(uniqueProjects(offTrackRows)),
      to: '/analytics/results',
      tone: offTrackRows.length ? 'warning' : 'clear',
    },
    {
      key: 'activities',
      label: t('overview.attnDelayed'),
      value: delayedRows.length,
      context: copy.projectsAffected(uniqueProjects(delayedRows)),
      to: '/merl-reporting',
      tone: delayedRows.length ? 'warning' : 'clear',
    },
    {
      key: 'review',
      label: t('overview.attnAwaiting'),
      value: awaitingRows.length,
      context: copy.projectsAffected(uniqueProjects(awaitingRows)),
      to: '/review',
      tone: awaitingRows.length ? 'warning' : 'clear',
    },
  ];

  const attentionProjectIds = new Set([
    ...overdueRows.map((r) => r.project_id),
    ...offTrackRows.map((r) => r.project_id),
    ...delayedRows.map((r) => r.project_id),
    ...awaitingRows.map((r) => r.project_id),
  ].filter(Boolean));

  const statusData = Object.keys(byBucket).map((key) => ({
    key,
    name: statusLabel(key, t),
    value: byBucket[key],
    percent: pct(byBucket[key], total),
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
      key: 'reporting',
      label: t('overview.perfReporting'),
      value: pct(reportsApproved, reporting.length),
      detail: `${fmtNum(reportsApproved)} / ${fmtNum(reporting.length)}`,
    },
  ];

  const projectName = (id) => data.projects.find((p) => p.id === id)?.name || '—';
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

      <header className="ovx-heading rp-noprint">
        <div>
          <h1>{t('overview.title')}</h1>
          <p>{t('overview.subtitle')}</p>
        </div>
        <div className="ovx-heading-actions">
          <span className="ovx-updated">{copy.lastUpdated} <b>{dataAsAt}</b></span>
          <button type="button" className="ovx-export" onClick={() => window.print()}>
            <Printer size={15} aria-hidden="true" /> {t('ui.export')}
          </button>
        </div>
      </header>

      <section className="ovx-filterbar rp-noprint" aria-label={copy.filters}>
        <span className="ovx-filterbar-title">{copy.filters}</span>
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

      <section className="ovx-section" aria-labelledby="ovx-portfolio-status">
        <SectionIntro id="ovx-portfolio-status" title={copy.portfolioStatus} />
        <div className="ovx-metric-strip">
          <Metric
            primary
            label={t('overview.overallProgress')}
            value={overallProgress == null ? '—' : `${overallProgress}%`}
            sub={`${fmtNum(indicatorStatus.on_track)} / ${fmtNum(indicators.length)} · ${t('overview.indicatorsOnTrack')}`}
            progress={overallProgress}
            trend={progressTrend}
            trendLabel={copy.sincePrevious}
            onClick={() => nav('/analytics/results')}
          />
          <Metric
            label={t('overview.kpiProjects')}
            value={fmtNum(total)}
            sub={t('overview.activeCompleted', { active: activeProjects, completed })}
            onClick={() => nav('/analytics/portfolio')}
          />
          <Metric
            label={t('overview.budgetUtilisation')}
            value={`${budgetUtilisation}%`}
            sub={`${fmtVUV(totalExpenditure)} / ${fmtVUV(totalBudget)}`}
            progress={budgetUtilisation}
            trend={budgetTrend}
            trendLabel={copy.sincePrevious}
            onClick={() => nav('/analytics/financial')}
          />
          <Metric
            label={t('overview.kpiBeneficiaries')}
            value={fmtNum(totalBeneficiaries)}
            sub={genderSummary || undefined}
            onClick={() => nav('/analytics/geographic')}
          />
        </div>
      </section>

      <section className="ovx-section" aria-labelledby="ovx-management-attention">
        <SectionIntro id="ovx-management-attention" title={copy.managementAttention} />
        <div className="ovx-priority-grid">
          <article className="ovx-panel ovx-attention-panel">
            <div className="ovx-panel-heading">
              <div>
                <h2><AlertTriangle size={16} aria-hidden="true" />{t('overview.needsAttention')}</h2>
                <p>{copy.projectsAffected(attentionProjectIds.size)}</p>
              </div>
            </div>
            <div className="ovx-attention-list">
              {attention.map((item) => (
                <button key={item.key} type="button" className={`ovx-attention-row tone-${item.tone}`} onClick={() => nav(item.to)}>
                  <span className="ovx-attention-dot" aria-hidden="true" />
                  <span className="ovx-attention-copy">
                    <b>{item.label}</b>
                    <small>{item.context}</small>
                  </span>
                  <strong>{fmtNum(item.value)}</strong>
                  <span className="ovx-row-action">{copy.review}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="ovx-panel ovx-status-panel">
            <div className="ovx-panel-heading">
              <div>
                <h2>{t('overview.implementation')}</h2>
                <p>{copy.statusHint}</p>
              </div>
              <button type="button" className="ovx-text-link" onClick={() => nav('/analytics/portfolio')}>
                {t('overview.viewPerformance')}
              </button>
            </div>
            <div className="ovx-status-summary">
              <div className="ovx-segmented-track" role="img" aria-label={copy.statusDistribution}>
                {statusData.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-label={`${item.name}: ${item.value} (${item.percent}%)`}
                    title={`${item.name}: ${item.value} (${item.percent}%)`}
                    style={{ width: `${item.percent}%`, background: item.color }}
                    onClick={() => setFilter('status', item.key)}
                  />
                ))}
              </div>
              <div className="ovx-status-grid">
                {statusData.map((item) => (
                  <button key={item.key} type="button" className="ovx-status-item" onClick={() => setFilter('status', item.key)}>
                    <span className="ovx-status-dot" style={{ background: item.color }} aria-hidden="true" />
                    <span>{item.name}</span>
                    <b>{fmtNum(item.value)}</b>
                    <small>{item.percent}%</small>
                  </button>
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="ovx-section" aria-labelledby="ovx-performance-coverage">
        <SectionIntro id="ovx-performance-coverage" title={copy.performanceCoverage} />
        <div className="ovx-secondary-grid">
          <article className="ovx-panel">
            <div className="ovx-panel-heading">
              <div>
                <h2>{copy.resultsPerformance}</h2>
                <p>{t('overview.portfolio')}</p>
              </div>
              <button type="button" className="ovx-text-link" onClick={() => nav('/analytics/results')}>
                {t('overview.viewPerformance')}
              </button>
            </div>
            <div className="ovx-performance-list">
              {performanceRows.map((row) => (
                <div key={row.key} className="ovx-performance-row">
                  <div className="ovx-performance-meta">
                    <span>{row.label}</span>
                    <span><b>{row.value}%</b> <small>{row.detail}</small></span>
                  </div>
                  <div className="ovx-performance-track" aria-hidden="true">
                    <div style={{ width: `${Math.min(100, Math.max(0, row.value))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <ProjectLocations
            counts={provinceCounts}
            beneficiaries={provinceBeneficiaries}
            nationalCount={nationalCount}
            selected={filters.province}
            onSelect={(province) => setFilter('province', province)}
            onView={() => nav('/analytics/geographic')}
            copy={copy}
          />
        </div>
      </section>

      <section className="ovx-section" aria-labelledby="ovx-reporting-obligations">
        <SectionIntro id="ovx-reporting-obligations" title={copy.reportingObligations} />
        <article className="ovx-panel ovx-reporting-panel">
          <div className="ovx-panel-heading">
            <div>
              <h2>{t('overview.recentUpcoming')}</h2>
            </div>
            <button type="button" className="ovx-text-link" onClick={() => nav('/analytics/reporting')}>
              {t('overview.viewAllReports')}
            </button>
          </div>
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
        </article>
      </section>
    </div>
  );
}

function SectionIntro({ id, title }) {
  return (
    <div className="ovx-section-intro">
      <h2 id={id}>{title}</h2>
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

function Metric({ primary = false, label, value, sub, progress, trend, trendLabel, onClick }) {
  return (
    <button type="button" className={`ovx-metric${primary ? ' is-primary' : ''}`} onClick={onClick}>
      <span className="ovx-metric-label">{label}</span>
      <strong>{value}</strong>
      {sub && <span className="ovx-metric-sub">{sub}</span>}
      {progress != null && (
        <span className="ovx-metric-progress" aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
        </span>
      )}
      {trend != null && (
        <span className="ovx-metric-trend">
          {trend > 0 ? '+' : ''}{trend} pp · {trendLabel}
        </span>
      )}
    </button>
  );
}

function ProjectLocations({ counts, beneficiaries, nationalCount, selected, onSelect, onView, copy }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(null);
  const ranked = [...PROVINCE_LIST].sort((a, b) => (
    (counts[b] || 0) - (counts[a] || 0)
    || (beneficiaries[b] || 0) - (beneficiaries[a] || 0)
    || a.localeCompare(b)
  ));

  return (
    <article className="ovx-panel ovx-location-panel">
      <div className="ovx-panel-heading">
        <div>
          <h2>{t('overview.locations')}</h2>
          <p>{copy.coverageConcentration}</p>
        </div>
        <button type="button" className="ovx-text-link" onClick={onView}>{t('overview.viewCoverage')}</button>
      </div>
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
        <div className="ovx-province-list">
          {ranked.map((province, index) => (
            <button
              type="button"
              key={province}
              className={`ovx-province-row${selected === province ? ' selected' : ''}${hovered === province ? ' hovered' : ''}`}
              onClick={() => onSelect(province)}
              onMouseEnter={() => setHovered(province)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="ovx-province-rank">{index + 1}</span>
              <span className="ovx-province-name">{province}</span>
              <span className="ovx-province-stat">
                <b>{fmtNum(counts[province] || 0)}</b><small>{copy.projectsLabel}</small>
              </span>
              <span className="ovx-province-stat">
                <b>{fmtNum(beneficiaries[province] || 0)}</b><small>{copy.beneficiariesLabel}</small>
              </span>
            </button>
          ))}
          {nationalCount > 0 && (
            <div className="ovx-province-row is-static">
              <span className="ovx-province-rank">—</span>
              <span className="ovx-province-name">{copy.national}</span>
              <span className="ovx-province-stat"><b>{fmtNum(nationalCount)}</b><small>{copy.projectsLabel}</small></span>
              <span className="ovx-province-stat"><b>—</b><small>{copy.beneficiariesLabel}</small></span>
            </div>
          )}
        </div>
      </div>
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
          <p>{t('ppa.sectionFailed')}</p>
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
      <div className="ovx-skeleton ovx-skeleton-filter" />
      <div className="ovx-skeleton ovx-skeleton-strip" />
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
      .ovx{max-width:1360px;margin:0 auto;padding:1.5rem 1.5rem 2.5rem;color:var(--text-1)}
      .ovx-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:1.5rem;margin:0 0 1rem}
      .ovx-heading h1{margin:0;color:var(--text-1);font-size:clamp(1.65rem,2.4vw,2rem);font-weight:760;letter-spacing:-.035em}
      .ovx-heading p{margin:.28rem 0 0;color:var(--text-3);font-size:.82rem}
      .ovx-heading-actions{display:flex;align-items:center;gap:.85rem}
      .ovx-updated{color:var(--text-3);font-size:.7rem;white-space:nowrap}
      .ovx-updated b{color:var(--text-2);font-weight:650}
      .ovx-export{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:36px;padding:.48rem .72rem;border:1px solid var(--border-strong);border-radius:6px;background:#fff;color:var(--green-700);font:inherit;font-size:.74rem;font-weight:650;cursor:pointer;box-shadow:none}
      .ovx-export:hover{border-color:#a99cbc;background:#faf9fc}

      .ovx-filterbar{display:flex;align-items:flex-end;gap:.6rem;flex-wrap:wrap;margin-bottom:1.5rem;padding:.7rem 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
      .ovx-filterbar-title{align-self:center;margin-right:.15rem;color:var(--text-2);font-size:.72rem;font-weight:700}
      .ovx-filter{display:block;min-width:116px;flex:1 1 126px;max-width:190px}
      .ovx-filter:nth-of-type(3),.ovx-filter:nth-of-type(5){max-width:220px}
      .ovx-filter>span{display:block;margin:0 0 .22rem;color:var(--text-3);font-size:.66rem;font-weight:620;letter-spacing:0;text-transform:none}
      .ovx-filter select{width:100%;min-height:36px;padding:.4rem .6rem;border:1px solid var(--border);border-radius:6px;background:#fff;color:var(--text-1);font:inherit;font-size:.76rem;outline:none}
      .ovx-filter select:focus{border-color:#77669a;box-shadow:0 0 0 3px var(--ring)}
      .ovx-reset{align-self:flex-end;min-height:36px;padding:.4rem .45rem;border:0;background:none;color:var(--green-700);font:inherit;font-size:.72rem;font-weight:650;cursor:pointer}
      .ovx-reset:hover{text-decoration:underline}.ovx-reset:disabled{opacity:.35;cursor:not-allowed;text-decoration:none}

      .ovx-section{margin-top:1.5rem}
      .ovx-section:first-of-type{margin-top:0}
      .ovx-section-intro{display:flex;align-items:center;justify-content:space-between;margin:0 0 .65rem}
      .ovx-section-intro h2{margin:0;color:#6e6876;font-size:.7rem;font-weight:720;letter-spacing:.055em;text-transform:uppercase}

      .ovx-metric-strip{display:grid;grid-template-columns:1.35fr repeat(3,1fr);overflow:hidden;border:1px solid var(--border);border-radius:8px;background:#fff}
      .ovx-metric{position:relative;display:flex;min-width:0;min-height:142px;flex-direction:column;align-items:flex-start;padding:1.1rem 1.2rem;border:0;border-right:1px solid var(--border);background:#fff;text-align:left;font:inherit;cursor:pointer}
      .ovx-metric:last-child{border-right:0}
      .ovx-metric:hover{background:#fafafb}
      .ovx-metric.is-primary{background:#f6f3fa}
      .ovx-metric.is-primary:hover{background:#f2eef7}
      .ovx-metric-label{color:var(--text-2);font-size:.73rem;font-weight:650}
      .ovx-metric>strong{margin-top:.38rem;color:#2f2742;font-family:var(--font-display);font-size:clamp(1.72rem,2.4vw,2.18rem);font-weight:780;letter-spacing:-.035em;line-height:1}
      .ovx-metric-sub{margin-top:.55rem;color:var(--text-3);font-size:.72rem;line-height:1.35}
      .ovx-metric-progress{display:block;width:100%;height:4px;margin-top:auto;background:#ebe9ef;border-radius:2px;overflow:hidden}
      .ovx-metric-progress>span{display:block;height:100%;background:var(--green-600);border-radius:2px}
      .ovx-metric-trend{margin-top:.5rem;color:#695b84;font-size:.65rem;font-weight:620}

      .ovx-priority-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.25fr);gap:1rem}
      .ovx-secondary-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.45fr);gap:1rem}
      .ovx-panel{min-width:0;border:1px solid var(--border);border-radius:8px;background:#fff;padding:1rem 1.1rem}
      .ovx-panel-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:.85rem}
      .ovx-panel-heading h2{display:flex;align-items:center;gap:.45rem;margin:0;color:var(--text-1);font-size:.92rem;font-weight:720;letter-spacing:-.015em}
      .ovx-panel-heading h2 svg{color:#9a633c}
      .ovx-panel-heading p{margin:.22rem 0 0;color:var(--text-3);font-size:.68rem;line-height:1.35}
      .ovx-text-link{flex-shrink:0;padding:.1rem 0;border:0;background:none;color:var(--green-700);font:inherit;font-size:.69rem;font-weight:650;cursor:pointer}
      .ovx-text-link:hover{text-decoration:underline}

      .ovx-attention-list{border-top:1px solid var(--border)}
      .ovx-attention-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto auto;gap:.65rem;align-items:center;width:100%;padding:.72rem .1rem;border:0;border-bottom:1px solid var(--border);background:none;text-align:left;font:inherit;cursor:pointer}
      .ovx-attention-row:last-child{border-bottom:0}
      .ovx-attention-row:hover{background:#fafafb}
      .ovx-attention-dot{width:7px;height:7px;border-radius:50%;background:#8c8891}
      .ovx-attention-row.tone-critical .ovx-attention-dot{background:var(--red-600)}
      .ovx-attention-row.tone-warning .ovx-attention-dot{background:#c88918}
      .ovx-attention-row.tone-clear .ovx-attention-dot{background:#2f8b54}
      .ovx-attention-copy{display:flex;min-width:0;flex-direction:column;gap:.15rem}
      .ovx-attention-copy b{color:var(--text-1);font-size:.74rem;font-weight:660}
      .ovx-attention-copy small{overflow:hidden;color:var(--text-3);font-size:.64rem;text-overflow:ellipsis;white-space:nowrap}
      .ovx-attention-row>strong{min-width:2ch;color:#342b43;font-family:var(--font-display);font-size:1rem;font-weight:760;text-align:right}
      .ovx-row-action{color:var(--green-700);font-size:.66rem;font-weight:650}

      .ovx-status-summary{padding:.15rem 0 .1rem}
      .ovx-segmented-track{display:flex;width:100%;height:16px;overflow:hidden;border-radius:3px;background:var(--surface-2)}
      .ovx-segmented-track button{min-width:0;height:100%;padding:0;border:0;border-right:2px solid #fff;cursor:pointer}
      .ovx-segmented-track button:last-child{border-right:0}
      .ovx-segmented-track button:hover{filter:brightness(.94)}
      .ovx-status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 1rem;margin-top:.85rem}
      .ovx-status-item{display:grid;grid-template-columns:8px minmax(0,1fr) auto auto;gap:.48rem;align-items:center;padding:.58rem 0;border:0;border-bottom:1px solid var(--border);background:none;color:var(--text-2);text-align:left;font:inherit;font-size:.71rem;cursor:pointer}
      .ovx-status-item:hover{color:var(--text-1)}
      .ovx-status-dot{width:7px;height:7px;border-radius:2px}
      .ovx-status-item b{color:var(--text-1);font-size:.74rem}.ovx-status-item small{min-width:30px;color:var(--text-3);text-align:right}

      .ovx-performance-list{display:flex;flex-direction:column;gap:1rem;padding:.2rem 0 .15rem}
      .ovx-performance-row{display:flex;flex-direction:column;gap:.38rem}
      .ovx-performance-meta{display:flex;align-items:center;justify-content:space-between;gap:.8rem;color:var(--text-2);font-size:.73rem;font-weight:620}
      .ovx-performance-meta>span:last-child{display:flex;align-items:baseline;gap:.4rem}
      .ovx-performance-meta b{color:var(--text-1);font-size:.8rem}.ovx-performance-meta small{color:var(--text-3);font-size:.62rem}
      .ovx-performance-track{height:6px;overflow:hidden;border-radius:2px;background:#ecebef}
      .ovx-performance-track>div{height:100%;border-radius:2px;background:var(--green-600)}

      .ovx-location-layout{display:grid;grid-template-columns:minmax(230px,.9fr) minmax(320px,1.1fr);gap:1rem;align-items:stretch}
      .ovx-map-panel{min-height:280px;overflow:hidden;border:1px solid var(--border);border-radius:6px;background:#f5f4f8}
      .ovx-province-list{display:flex;min-width:0;flex-direction:column;border-top:1px solid var(--border)}
      .ovx-province-row{display:grid;grid-template-columns:24px minmax(0,1fr) 72px 88px;gap:.55rem;align-items:center;min-width:0;padding:.62rem .2rem;border:0;border-bottom:1px solid var(--border);background:#fff;text-align:left;font:inherit;cursor:pointer}
      .ovx-province-row:hover,.ovx-province-row.hovered{background:#fafafb}.ovx-province-row.selected{background:#f4f1f8}.ovx-province-row.is-static{cursor:default}
      .ovx-province-rank{color:#aaa5b0;font-size:.66rem;text-align:center}
      .ovx-province-name{overflow:hidden;color:var(--text-1);font-size:.72rem;font-weight:650;text-overflow:ellipsis;white-space:nowrap}
      .ovx-province-stat{display:flex;flex-direction:column;align-items:flex-end;line-height:1.1}
      .ovx-province-stat b{color:#3c3449;font-size:.73rem}.ovx-province-stat small{margin-top:.15rem;color:var(--text-3);font-size:.57rem}

      .ovx-reporting-panel{padding-bottom:.9rem}
      .ovx-table-wrap{overflow:auto;border-top:1px solid var(--border)}
      .ovx-table{width:100%;border-collapse:collapse;font-size:.73rem}
      .ovx-table th{padding:.56rem .68rem;border-bottom:1px solid var(--border);background:#fafafb;color:var(--text-3);font-size:.64rem;font-weight:650;letter-spacing:0;text-align:left;text-transform:none}
      .ovx-table td{padding:.68rem;border-bottom:1px solid var(--border);color:var(--text-2)}
      .ovx-table tbody tr{cursor:pointer}.ovx-table tbody tr:hover{background:#fafafb}.ovx-table-strong{color:var(--text-1)!important;font-weight:650}
      .ovx-badge{display:inline-flex;padding:.16rem .42rem;border-radius:4px;font-size:.61rem;font-weight:680;white-space:nowrap}
      .ovx-badge.tone-ok{background:#edf6f0;color:#2f7546}.ovx-badge.tone-info{background:#f0f3f8;color:#4f6178}.ovx-badge.tone-warn{background:#fbf5e8;color:#8b6519}.ovx-badge.tone-crit{background:#faecea;color:#a9423a}
      .ovx-empty{display:flex;min-height:110px;align-items:center;justify-content:center;color:var(--text-3);font-size:.76rem}

      .ovx-error-state{display:flex;min-height:60vh;align-items:center;justify-content:center}
      .ovx-error-card,.ovx-empty-card{display:flex;max-width:620px;align-items:flex-start;gap:.9rem;padding:1.1rem;border:1px solid var(--border);border-radius:8px;background:#fff}
      .ovx-empty-card{display:block;text-align:center}.ovx-error-card svg{color:#9a633c;flex-shrink:0}
      .ovx-error-card h2,.ovx-empty-card h2{margin:0 0 .25rem;color:var(--text-1);font-size:1rem}
      .ovx-error-card p,.ovx-empty-card p{margin:0;color:var(--text-2);font-size:.78rem;line-height:1.5}
      .ovx-error-card .ovx-export{margin-left:auto;flex-shrink:0}.ovx-empty-card .ovx-export{margin-top:.8rem}

      .ovx-skeleton{position:relative;overflow:hidden;border-radius:6px;background:#ececef}
      .ovx-skeleton::after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);animation:ovx-shimmer 1.4s infinite}
      .ovx-skeleton-heading{height:56px;margin-bottom:1rem}.ovx-skeleton-filter{height:62px;margin-bottom:1.5rem}.ovx-skeleton-strip{height:144px;margin-bottom:1.5rem}.ovx-skeleton-panel{height:260px}
      @keyframes ovx-shimmer{to{transform:translateX(100%)}}

      @media(max-width:1180px){
        .ovx{padding:1.25rem 1rem 2rem}
        .ovx-metric-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
        .ovx-metric{border-bottom:1px solid var(--border)}
        .ovx-metric:nth-child(2){border-right:0}
        .ovx-metric:nth-child(3),.ovx-metric:nth-child(4){border-bottom:0}
        .ovx-priority-grid,.ovx-secondary-grid{grid-template-columns:1fr}
        .ovx-location-layout{grid-template-columns:minmax(220px,.8fr) minmax(320px,1.2fr)}
      }
      @media(max-width:820px){
        .ovx{padding:1rem .85rem 1.6rem}
        .ovx-heading{align-items:flex-start}
        .ovx-heading-actions{align-items:flex-end;flex-direction:column;gap:.4rem}
        .ovx-filterbar{gap:.5rem}
        .ovx-filter{flex:1 1 132px;max-width:none}
        .ovx-location-layout{grid-template-columns:1fr}.ovx-map-panel{min-height:240px}
      }
      @media(max-width:560px){
        .ovx-heading{flex-direction:column;gap:.75rem}.ovx-heading-actions{width:100%;align-items:center;flex-direction:row;justify-content:space-between}
        .ovx-metric-strip{grid-template-columns:1fr}
        .ovx-metric{min-height:116px;border-right:0!important;border-bottom:1px solid var(--border)!important}
        .ovx-metric:last-child{border-bottom:0!important}
        .ovx-status-grid{grid-template-columns:1fr}.ovx-attention-row{grid-template-columns:8px minmax(0,1fr) auto}.ovx-row-action{display:none}
        .ovx-province-row{grid-template-columns:20px minmax(0,1fr) 62px 76px}
        .ovx-filterbar-title{width:100%}.ovx-filter{flex:1 1 calc(50% - .5rem)}
        .ovx-export{min-height:34px}
      }
      @media print{
        .ovx{max-width:none;padding:0}.ovx-filterbar,.ovx-export,.ovx-text-link{display:none!important}
        .ovx-panel,.ovx-metric-strip{break-inside:avoid}
      }
    `}</style>
  );
}
