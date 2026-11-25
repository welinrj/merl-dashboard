import { useTranslation } from 'react-i18next';
import './executive-portfolio-summary.css';

export default function ExecutivePortfolioSummary({ summary, period, onResults, onExplainProjects }) {
  const { t, i18n } = useTranslation();
  const { counts, targets } = summary;
  const number = value => new Intl.NumberFormat(i18n.resolvedLanguage || 'en', { maximumFractionDigits: 1 }).format(value);
  return <section id="ovx-summary" tabIndex={-1} className="executive-portfolio" aria-labelledby="executive-portfolio-title">
    <header><div><span className="executive-portfolio-eyebrow">{t('executive.eyebrow')}</span><h2 id="executive-portfolio-title">{t('executive.title')}</h2></div><span>{period || t('workspace.allPeriods')}</span></header>
    <p className="executive-portfolio-scope">{t('executive.scope')}</p>
    <div className="executive-health-grid">{['total','on_track','attention','critical','unassessed'].map(key => <article key={key} className={`executive-health executive-health--${key}`} data-health={key}><span>{t(`executive.health.${key}`)}</span><strong>{number(counts[key])}</strong><small>{t(`executive.healthHelp.${key}`)}</small></article>)}</div>
    <div className="executive-targets">
      <div><h3>{t('executive.overall')}</h3><p>{t('executive.targetRatio', { achieved: number(targets.achieved), total: number(targets.total) })}</p><strong className="executive-target-value">{targets.percentage === null ? '—' : `${number(targets.percentage)}%`}</strong></div>
      <div className="executive-target-context">{targets.percentage !== null && <div className="executive-target-track" role="progressbar" aria-label={t('executive.overall')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={targets.percentage}><span style={{ width: `${targets.percentage}%` }} /></div>}<p>{t('executive.reported', { reported: number(targets.reported), total: number(targets.total), missing: number(targets.total - targets.reported) })}</p><p>{t('executive.approval', { approved: number(targets.approvedAchieved), pending: number(targets.pending) })}</p><button type="button" onClick={onResults}>{t('executive.viewResults')}</button></div>
    </div>
    <details className="executive-method"><summary>{t('executive.methodTitle')}</summary><p>{t('executive.targetMethod')}</p><p>{t('executive.healthMethod')}</p><p>{t('executive.notPrediction')}</p>{onExplainProjects&&<button className="executive-project-source" type="button" onClick={onExplainProjects}>{t('simpleOverview.includedProjects')}</button>}</details>
  </section>;
}
