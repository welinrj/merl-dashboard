import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { reportingTasks } from '../lib/reportingTasks';
import { fmtDate } from '../lib/locale';
import './ReportingWorkflow.css';
export default function MyTasks({ periods, projects, user }) {
  const { t } = useTranslation(), title = useId();
  if (!['ROLE_ADMIN','ROLE_DOCC_MEO','ROLE_PROJ_MANAGER'].includes(user?.role)) return null;
  const tasks = reportingTasks(projects,periods,user.role);
  const list = rows => <ul className="task-list">{rows.map(task => <li key={task.key}>
    <div><span className={`task-kind task-${task.kind}`}>{t(`tasks.kind.${task.kind}`)}</span>
      <strong>{task.project.name || task.project.code}</strong><p>{task.period.period_label}{task.period.period_end ? ` · ${t('tasks.periodEnd', {date:fmtDate(task.period.period_end)})}` : ''}</p>
      {task.kind === 'correct' && task.period.review_comments && <p className="task-feedback">{t('tasks.feedback')}: {task.period.review_comments}</p>}
    </div><a className="btn btn-secondary" href={task.href}>{t(`tasks.action.${task.kind}`)}</a>
  </li>)}</ul>;
  return <section className="my-tasks rp-noprint" aria-labelledby={title}>
    <header><h2 id={title}>{t('tasks.title')}</h2><span>{tasks.length}</span></header>
    <p className="workflow-note">{t('tasks.scope')}</p>
    {tasks.length ? <>{list(tasks.slice(0,3))}{tasks.length>3 && <details><summary>{t('tasks.more',{count:tasks.length-3})}</summary>{list(tasks.slice(3))}</details>}</> : <p>{t('tasks.none')}</p>}
  </section>;
}
