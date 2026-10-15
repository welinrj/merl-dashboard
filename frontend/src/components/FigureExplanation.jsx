import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { latestReportedBy } from '../lib/docc/progressSelection';
import { toVuv, sumReported } from '../lib/docc/currency';
import { fmtNum } from '../lib/locale';
import './ResultAssurance.css';
const statuses = new Set(['approved','draft','submitted','under_review','resubmitted','returned','published','locked','reviewed']);
export default function FigureExplanation({ metric, value, data, period, readOnly = false, onClose }) {
  const { t } = useTranslation();
  const dialog = useRef(null), titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  const projectMap = new Map(data.projects.map(project => [project.id, project]));
  const periods = data.reporting || [];
  const current = metric === 'projects' || (metric === 'attention' && !period);
  const progress = [...latestReportedBy(data.progress).values()];
  const finance = [...latestReportedBy(data.financial, 'project_id').values()];
  const rows = metric === 'projects' ? data.projects.map(project => ({ ...project, project_id: project.id }))
    : metric === 'progress' ? progress
    : metric === 'budget' ? finance
    : metric === 'beneficiaries' ? data.beneficiaries
    : metric === 'reporting' ? periods
    : period ? data.progress : data.portfolioStatus;
  const missing = metric === 'progress' ? data.indicators.filter(indicator => !progress.some(row => row.indicator_id === indicator.id)).length
    : metric === 'budget' ? data.projects.filter(project => !finance.some(row => row.project_id === project.id && toVuv(row.cumulative_expenditure, project.currency) != null)).length
    : metric === 'beneficiaries' ? data.projects.filter(project => !data.beneficiaries.some(row => row.project_id === project.id && row.total_direct != null)).length : 0;
  const route = metric === 'projects' ? '/project-setup' : metric === 'progress' ? '/results-framework' : metric === 'attention' || readOnly ? '/analytics/project-portfolio' : '/merl-reporting';
  const sourceHref = row => {
    const params = new URLSearchParams();
    if (row.project_id) params.set('project', row.project_id);
    const label = row.reporting_period || row.period_label;
    if (!current && (label || period)) params.set('period', label || period);
    if (!readOnly && metric === 'budget') params.set('module','financial_progress');
    if (!readOnly && metric === 'beneficiaries') params.set('module','beneficiaries');
    return `#${route}${params.size ? `?${params}` : ''}`;
  };
  const statusText = status => t(`figure.status.${statuses.has(status) ? status : 'unknown'}`);
  return createPortal(<dialog ref={dialog} className="figure-dialog" aria-labelledby={titleId} onClose={onClose}
    onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
    <header><h2 id={titleId}>{t(`figure.metrics.${metric}`)}</h2><button type="button" onClick={() => dialog.current.close()} aria-label={t('common.close')}>×</button></header>
    <p className="figure-meaning">{t(`figure.meaning.${metric}`)}</p>
    <dl><dt>{t('figure.value')}</dt><dd>{value}</dd><dt>{t(current ? 'figure.basis' : 'workspace.period')}</dt><dd>{current ? t('figure.current') : period || t('workspace.allPeriods')}</dd></dl>
    <p>{t(`figure.summary.${metric}`)}</p>
    {missing > 0 && <p className="figure-note">{t('figure.missing')}</p>}
    <details className="figure-details"><summary>{t('figure.calculation')}</summary>
    <p>{t(`figure.formulas.${metric}`)}</p>
    {metric === 'budget' && <><p>{t('figure.currency')}</p><p>{t('figure.budgetTerms', { spent: fmtNum(sumReported(finance.map(row => toVuv(row.cumulative_expenditure, projectMap.get(row.project_id)?.currency)))), budget: fmtNum(sumReported(data.projects.map(project => toVuv(project.budget_vuv, project.currency)))) })}</p></>}
    </details>
    <details className="figure-details figure-sources"><summary>{t('figure.sourceCount', { count: rows.length })}</summary>
    {!rows.length ? <p>{t('figure.noSources')}</p> : <ul>{rows.map((row, index) => {
      const project = projectMap.get(row.project_id);
      const label = row.reporting_period || row.period_label;
      const approval = row.submission_status || periods.find(item => item.project_id === row.project_id && item.period_label === label)?.submission_status;
      const indicator = data.indicators.find(item => item.id === row.indicator_id);
      const amount = metric === 'budget' ? toVuv(row.cumulative_expenditure, project?.currency) : metric === 'beneficiaries' ? row.total_direct : metric === 'progress' ? row.achievement_pct : null;
      return <li key={`${row.id || row.project_id}-${index}`}><strong>{project?.name || project?.code}{indicator ? ` · ${indicator.name || indicator.code || ''}` : ''}</strong>
        <span>{label || t('figure.current')}{amount != null ? ` · ${fmtNum(amount)}${metric === 'progress' ? '%' : metric === 'budget' ? ' VT' : ''}` : ''}</span>
        {!current && <span>{t('figure.approval')}: {statusText(approval)}</span>}
        {row.review_status && <span>{t('figure.review')}: {statusText(row.review_status)}</span>}
        <a href={sourceHref(row)} onClick={onClose}>{t('figure.openSource')}</a>
      </li>;
    })}</ul>}
    </details>
  </dialog>, document.body);
}
