import { useEffect, useState } from 'react';
import { resultComparison, resultNumber } from '../lib/resultComparison';
import './result-comparison.css';

const COPY = {
  en: { achieved:'Achieved to date', target:'Target', unreported:'Not yet reported', noTarget:'Not recorded', noUnit:'Unit not recorded', noPeriod:'Period not recorded', reported:'Reported', published:'Published', approved:'Approved', locked:'Locked', draft:'Draft', submitted:'Submitted', under_review:'Under review', resubmitted:'Resubmitted', rejected:'Returned for correction', unknownReview:'Review status not recorded', complete:'Target achieved', percentage:'Reported progress', noComparison:'Comparison unavailable', noComparisonNote:'A progress bar needs a reported value, a target and a calculated progress result.', pending:'Awaiting approval', date:'Reported', more:'Show more results', showing:'Showing', of:'of', publicTitle:'Published results', publicEmpty:'Approved results have not yet been published.', publicNote:'Only published indicators are shown.' },
  fr: { achieved:'Réalisé à ce jour', target:'Cible', unreported:'Pas encore renseigné', noTarget:'Non renseignée', noUnit:'Unité non renseignée', noPeriod:'Période non renseignée', reported:'Rapporté', published:'Publié', approved:'Approuvé', locked:'Verrouillé', draft:'Brouillon', submitted:'Soumis', under_review:'En cours de révision', resubmitted:'Soumis à nouveau', rejected:'À corriger', unknownReview:'État de révision non renseigné', complete:'Cible atteinte', percentage:'Progrès rapporté', noComparison:'Comparaison indisponible', noComparisonNote:'La barre nécessite une valeur rapportée, une cible et un résultat de progression calculé.', pending:'En attente d’approbation', date:'Rapporté', more:'Afficher plus de résultats', showing:'Affichage de', of:'sur', publicTitle:'Résultats publiés', publicEmpty:'Aucun résultat approuvé n’a encore été publié.', publicNote:'Seuls les indicateurs publiés sont affichés.' },
};
export function ResultComparisonCard({ title, code, actual, target, achievement, unit, period, date, dateLabel, reviewStatus, projectName, baseline, performanceLabel, lang='en' }) {
  const c=COPY[lang]||COPY.en;
  const m=resultComparison({actual,target,achievement,reviewStatus});
  const format=n=>new Intl.NumberFormat(lang==='fr'?'fr-FR':'en-GB',{maximumFractionDigits:2}).format(n);
  const parsed=date ? new Date(date) : null;
  const stamp=parsed&&!Number.isNaN(parsed.getTime()) ? new Intl.DateTimeFormat(lang==='fr'?'fr-FR':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(parsed) : null;
  const state=!m.reported?c.unreported:c[reviewStatus]||c.unknownReview;
  return <article className={`result-comparison result-comparison--${m.tone}`}>
    <header className="result-comparison-heading"><div>{code&&<small>{code}</small>}<h4>{title}</h4>{projectName&&<p>{projectName}</p>}</div><span className="result-comparison-state">{state}</span></header>
    <dl className="result-comparison-values">
      <div><dt>{c.achieved}</dt><dd>{m.reported?format(m.achieved):<span className="result-comparison-missing">{c.unreported}</span>}</dd></div>
      <div><dt>{c.target}</dt><dd>{m.planned!==null?format(m.planned):<span className="result-comparison-missing">{c.noTarget}</span>}</dd></div>
    </dl>
    <p className="result-comparison-unit">{unit||c.noUnit}</p>
    {(resultNumber(baseline)!==null||performanceLabel)&&<p className="result-comparison-context">{resultNumber(baseline)!==null&&<span>{lang==='fr'?'Référence':'Baseline'}: {format(Number(baseline))}</span>}{performanceLabel&&<span>{lang==='fr'?'Performance':'Performance'}: {performanceLabel}</span>}</p>}
    {m.width!==null ? <>
      <div className="result-comparison-track" role="progressbar" aria-label={`${title}: ${c.percentage}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.width} aria-valuetext={`${format(m.percentage)}% — ${state}`}><span style={{width:`${m.width}%`}}/></div>
      <p className="result-comparison-caption">{m.approved&&m.percentage>=100?c.complete:!m.approved?c.pending:c.percentage}<span>{format(m.percentage)}%</span></p>
    </> : <p className="result-comparison-unavailable" title={m.reported?c.noComparisonNote:undefined}>{m.reported?c.noComparison:c.unreported}</p>}
    <footer className="result-comparison-period"><span>{period||c.noPeriod}</span>{stamp&&<time dateTime={date}>{dateLabel||c.date}: {stamp}</time>}</footer>
  </article>;
}

export function ResultComparisonList({ rows=[], lang='en' }) {
  const [limit,setLimit]=useState(12),c=COPY[lang]||COPY.en;
  useEffect(()=>setLimit(12),[rows]);
  return <><div className="result-comparison-grid">{rows.slice(0,limit).map(row=><ResultComparisonCard key={row.id} {...row} lang={lang}/>)}</div>{rows.length>12&&<div className="result-comparison-pagination"><span>{c.showing} {Math.min(limit,rows.length)} {c.of} {rows.length}</span>{limit<rows.length&&<button type="button" onClick={()=>setLimit(n=>n+12)}>{c.more}</button>}</div>}</>;
}

export function PublishedResultComparisons({ project, lang='en' }) {
  const c=COPY[lang]||COPY.en,kpis=Array.isArray(project.public_kpis)?project.public_kpis:[];
  if(!kpis.length)return <p className="published-result-note">{c.publicEmpty}</p>;
  return <section className="published-result-comparisons" aria-label={c.publicTitle}>
    <h4 className="published-result-heading">{c.publicTitle}</h4>
    {kpis.length ? <><p className="published-result-note">{c.publicNote}</p><div className="result-comparison-grid">{kpis.map(k=><ResultComparisonCard key={k.indicator_id} title={k.label} actual={k.actual_value} target={k.target_value} achievement={k.progress_pct} unit={k.unit} period={k.period_label} date={k.published_at} dateLabel={c.published} reviewStatus="published" lang={lang}/>)}</div></> : <p className="published-result-note">{c.publicEmpty}</p>}
  </section>;
}
