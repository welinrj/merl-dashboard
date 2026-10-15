import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { recordCountSections, summarise } from '../lib/completion';
import './ReportingWorkflow.css';
export default function ReportingChecklist({ modules, counts, hasDraft, loading, error, status, editable, onRetry, onOpen, onSubmit }) {
  const { t } = useTranslation(), title = useId();
  const rows = recordCountSections(modules,counts), summary = summarise(rows);
  const required = rows.filter(row=>row.required), optional = rows.filter(row=>!row.required);
  const canPrepare = editable && ['draft','returned'].includes(status);
  const list = items => <ol className="checklist-list">{items.map(row => <li key={row.key}>
    <div><strong>{t(`tasks.sections.${row.key}`)}</strong><span className={row.filled ? 'checklist-saved' : ''}>{t(row.filled ? 'tasks.saved' : row.required ? 'tasks.notSaved' : 'tasks.optionalMissing')}</span>
      {hasDraft(row) && <span>{t('tasks.deviceDraft')}</span>}
    </div><button type="button" className="btn btn-secondary" onClick={()=>onOpen(row.key)} aria-label={`${t('tasks.openSection')}: ${t(`tasks.sections.${row.key}`)}`}>{t('tasks.openSection')}</button>
  </li>)}</ol>;
  return <section className="reporting-checklist" aria-labelledby={title}>
    <h2 id={title}>{t('tasks.checklistTitle')}</h2>
    {loading ? <p role="status">{t('tasks.checking')}</p> : error ? <div role="alert"><p>{t('tasks.checkFailed')}</p><button type="button" className="btn btn-secondary" onClick={onRetry}>{t('tasks.retry')}</button></div> : <>
      <p role="status">{t('tasks.requiredSaved',{done:summary.requiredDone,total:summary.requiredTotal})}</p>
      <p className="workflow-note">{t('tasks.savedBasis')}</p>
      {list(required)}
      <details><summary>{t('tasks.optional')}</summary><p className="workflow-note">{t('tasks.optionalBasis')}</p>{list(optional)}</details>
      {status === 'approved' ? <p className="workflow-note">{t('tasks.approved')}</p> : ['submitted','reviewed'].includes(status) ? <p className="workflow-note">{t('tasks.awaiting')}</p> : null}
      {canPrepare && <div className="checklist-next">{summary.missingRequired.length ? <button type="button" className="btn btn-primary" onClick={()=>onOpen(summary.missingRequired[0].key)}>{t('tasks.next',{section:t(`tasks.sections.${summary.missingRequired[0].key}`)})}</button>
        : <><p>{t('tasks.reviewBeforeSend')}</p><button type="button" className="btn btn-primary" onClick={onSubmit}>{t('merl.submit')}</button></>}
      </div>}
    </>}
  </section>;
}
