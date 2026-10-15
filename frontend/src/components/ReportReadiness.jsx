import { useTranslation } from 'react-i18next';
import { readinessAction } from '../lib/docc/reportReadiness';
import './ResultAssurance.css';
export default function ReportReadiness({ result, period, readOnly = false }) {
  const { t } = useTranslation();
  return <section className="report-readiness rp-noprint" aria-labelledby="report-readiness-title">
    <h2 id="report-readiness-title">{t('readiness.title')}</h2>
    <p role="status"><strong>{result.empty ? t('readiness.empty') : result.issues.length ? t('readiness.attention', { count: result.issues.length }) : t('readiness.passed')}</strong></p>
    <p>{t('readiness.scope', { projects: result.projectCount, approved: result.approvedCount, periods: result.periodCount })}</p>
    <p>{t('readiness.basis')}</p>
    {result.issues.length > 0 && <details><summary>{t('readiness.review')}</summary><ul>{result.issues.map((issue, index) => <li key={`${issue.key}-${issue.projectId || index}`}>
      <div><strong>{issue.projectName}</strong><p>{t(`readiness.issues.${issue.key}`, { count: issue.count })}</p></div>
      {!result.empty && <a href={readinessAction(issue, period, readOnly)}>{t('readiness.open')}</a>}
    </li>)}</ul></details>}
  </section>;
}
export function ReadinessExportSummary({ result }) {
  const { t } = useTranslation();
  return <div className="rp-readiness-summary"><h3>{t('readiness.exportTitle')}</h3><p>{result.issues.length ? t('readiness.attention', { count: result.issues.length }) : t('readiness.passed')} {t('readiness.exportBasis')}</p>
    {result.issues.map((issue, index) => <p key={index}>{issue.projectName ? `${issue.projectName}: ` : ''}{t(`readiness.issues.${issue.key}`, { count: issue.count })}</p>)}
  </div>;
}
