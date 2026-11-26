import { publicTargetProgress } from '../lib/publicTargetProgress';
import { useTranslation } from 'react-i18next';
import { projectProgressSummaries } from '../lib/projectProgressSummary';
import { resultNumber } from '../lib/resultComparison';
import './project-progress-overview.css';

const copy = {
  en:{title:'Progress by project',note:'Average progress across indicators with reported results. Check how many indicators are reported before comparing projects.',progress:'Reported indicator progress',none:'No reported results',definitions:'No indicators recorded',reported:'indicators with progress',achieved:'targets reported achieved',approved:'approved',pending:'awaiting approval',periods:'reporting periods',latest:'Latest available results',noPeriod:'Reporting period not recorded',view:'View project results',published:'Published indicator progress',unpublished:'Awaiting published update',publicCount:'indicators with published results'},
  fr:{title:'Progrès par projet',note:'Progression moyenne des indicateurs renseignés. Vérifiez le nombre d’indicateurs renseignés avant de comparer les projets.',progress:'Progression des indicateurs renseignés',none:'Aucun résultat rapporté',definitions:'Aucun indicateur enregistré',reported:'indicateurs renseignés',achieved:'cibles déclarées atteintes',approved:'approuvés',pending:'en attente d’approbation',periods:'périodes de rapport',latest:'Derniers résultats disponibles',noPeriod:'Période non renseignée',view:'Voir les résultats du projet',published:'Progrès des indicateurs publiés',unpublished:'En attente de résultats publiés',publicCount:'indicateurs avec résultats publiés'},
};
const numeric=(n,lang)=>new Intl.NumberFormat(lang==='fr'?'fr-FR':'en-GB',{maximumFractionDigits:1}).format(n);
function ProgressBar({value,label}) {
  return <div className="project-progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0,Math.min(100,value))}><span style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>;
}
export default function ProjectProgressOverview({projects,indicators,progress,periods,onProject,lang='en',healthRows=[]}) {
  const { t } = useTranslation();
  const healthByProject = new Map(healthRows.map(row => [row.project.id, row.health]));
  const finalByProject = new Map(healthRows.map(row => [row.project.id, row]));
  const language=lang?.startsWith('fr')?'fr':'en',c=copy[language];
  const rows=projectProgressSummaries(projects,indicators,progress,periods);
  return <section id="ovx-project-progress" tabIndex={-1} className="project-progress-overview" aria-labelledby="project-progress-title">
    <header><h2 id="project-progress-title">{c.title}</h2><p>{c.note}</p></header>
    <div className="project-progress-list">{rows.map(r=><article key={r.project.id} className={`project-progress-row${r.pending?' has-pending':''}${r.progress==null?' is-unreported':''}`}>
      <div className="project-progress-name"><small>{r.project.code}</small><h3>{r.project.name}</h3>{healthByProject.has(r.project.id)&&<span className={`executive-health-badge executive-health-badge--${healthByProject.get(r.project.id)}`}>{t(`executive.health.${healthByProject.get(r.project.id)}`)}</span>}</div>
      <div className="project-progress-measure"><div><span>{c.progress}</span><strong>{r.progress==null?'—':`${numeric(r.progress,language)}%`}</strong></div>{r.progress!=null?<ProgressBar value={r.progress} label={`${r.project.name}: ${c.progress}`}/>:<p>{r.total?c.none:c.definitions}</p>}</div>
      <div className="project-progress-detail"><span><b>{r.reported} / {r.total}</b> {c.reported}</span><span><b>{finalByProject.get(r.project.id)?.achieved ?? r.achieved} / {r.total}</b> {finalByProject.has(r.project.id)?t('executive.finalTargets'):c.achieved}</span>{r.reported>0&&<span>{r.approved} {c.approved}{r.pending>0&&<> · <b>{r.pending} {c.pending}</b></>}</span>}<small>{r.period||(r.periodCount>1?`${c.latest} · ${r.periodCount} ${c.periods}`:c.noPeriod)}{r.date&&!Number.isNaN(Date.parse(r.date))&&<> · <time dateTime={r.date}>{new Intl.DateTimeFormat(language==='fr'?'fr-FR':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(r.date))}</time></>}</small></div>
      <button type="button" className="project-progress-open" onClick={()=>onProject(r.project.id)} aria-label={`${c.view}: ${r.project.name}`}>{c.view}</button>
    </article>)}</div>
  </section>;
}
export function PublishedProjectProgress({project,lang='en'}) {
  const french=lang==='fr',model=publicTargetProgress(project),pct=model.pct;
  const title=french?'Cibles atteintes':'Targets achieved';
  const accent=pct==null?'#64748b':pct>=100?'#15803d':pct>=90?'#0e7490':pct>=60?'#b45309':'#b3402f';
  const unavailable=model.kind==='no_framework'?(french?'Cadre de résultats non disponible':'Results framework unavailable'):
    model.kind==='unassessed' && project.target_summary_period?(french?'Évaluation des cibles en attente':'Target assessment pending'):
    (french?'En attente de résultats approuvés':'Awaiting approved update');
  return <div className="published-project-progress" data-progress-basis={project.progress_basis || 'unavailable'} style={{'--project-progress-accent':accent}}>
    <div><span title={french?'Cibles finales atteintes ÷ toutes les cibles du projet.':'Achieved final targets ÷ all project targets.'}>{title}</span><strong>{pct==null?'—':`${numeric(pct,lang)}%`}</strong></div>
    {pct==null?<p>{unavailable}</p>:<ProgressBar value={pct} label={`${project.name}: ${title}`}/>}
    {model.total>0 && <small className="public-target-coverage">
      {pct!=null&&<span>{numeric(model.achieved,lang)} / {numeric(model.total,lang)} {french?'cibles atteintes':'targets achieved'}</span>}
      <span>{numeric(model.assessed,lang)} / {numeric(model.total,lang)} {french?'évaluées':'assessed'}</span>
    </small>}
    {project.target_summary_period&&<small>{project.target_summary_period}</small>}
  </div>;
}
export function PublishedProjectProgressOverview({projects=[],onProject,lang='en'}) {
  const c=copy[lang]||copy.en;
  return <section className="project-progress-overview" aria-labelledby="public-project-progress-title"><header><h2 id="public-project-progress-title">{c.title}</h2><p>{lang==='fr'?'Résultats approuvés et publiés uniquement.':'Approved, published results only.'}</p></header><div className="project-progress-list">{projects.map(project=><article key={project.id} className="project-progress-row project-progress-row--public"><div className="project-progress-name"><small>{project.code}</small><h3>{project.name}</h3></div><PublishedProjectProgress project={project} lang={lang}/><button type="button" className="project-progress-open" onClick={()=>onProject(project.id)} aria-label={`${c.view}: ${project.name}`}>{c.view}</button></article>)}</div></section>;
}
