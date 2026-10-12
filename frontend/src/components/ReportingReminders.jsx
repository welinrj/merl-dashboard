import StatusBadge from './ui/StatusBadge';
import { reportingStatus, needsReportingAction } from '../lib/reportingUx';
import { useTranslation } from 'react-i18next';
export default function ReportingReminders({ periods, projects, user }) {
  const { i18n } = useTranslation();
  const fr = i18n.resolvedLanguage?.startsWith('fr');
  const editor = ['ROLE_ADMIN','ROLE_DOCC_MEO','ROLE_PROJ_MANAGER'].includes(user?.role);
  const reviewer = ['ROLE_ADMIN','ROLE_DOCC_MEO'].includes(user?.role);
  if (!editor) return null;
  const byId = new Map(projects.map(p=>[p.id,p]));
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Pacific/Efate',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const rows = periods.filter(p=>byId.has(p.project_id) && needsReportingAction(p, reviewer, today))
    .sort((a,b)=>({returned:0,submitted:1,reviewed:2,draft:3}[a.submission_status]-{returned:0,submitted:1,reviewed:2,draft:3}[b.submission_status]) || String(b.period_end || '').localeCompare(String(a.period_end || '')));
  return <details className="wg-reminders rp-noprint"><summary>{fr ? 'Rapports à traiter' : 'Reports needing attention'} ({rows.length})</summary>
    {!rows.length ? <p>{fr ? 'Aucune période configurée ne nécessite une action.' : 'No configured reporting periods need action.'}</p> : <ul>{rows.slice(0,8).map((p,index)=>{
      const review = ['submitted','reviewed'].includes(p.submission_status);
      return <li key={`${p.project_id}-${p.period_label}-${index}`}><div><strong>{byId.get(p.project_id).name}</strong><p>{p.period_label}{p.period_end ? ` · ${fr ? 'Fin de période' : 'Period end'} ${p.period_end}` : ''}</p><StatusBadge {...reportingStatus(p.submission_status,fr)} /></div><a href={review ? '#/review' : `#/merl-reporting?project=${encodeURIComponent(p.project_id)}&period=${encodeURIComponent(p.period_label)}`}>{review ? (fr ? 'Examiner' : 'Open review queue') : (fr ? 'Continuer' : 'Continue report')}</a></li>;
    })}</ul>}{rows.length>8 && <a href="#/merl-reporting">{fr ? 'Voir les autres périodes' : 'Open Update progress for other periods'}</a>}
  </details>;
}
