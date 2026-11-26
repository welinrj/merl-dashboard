import { useId } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { targetContributions } from '../lib/targetContributions';
import './project-target-contributions.css';

export default function ProjectTargetContributions({summary,french=false,period=''}) {
  const model=targetContributions(summary),id=useId();
  const number=n=>new Intl.NumberFormat(french?'fr-FR':'en-GB',{maximumFractionDigits:2}).format(n);
  const label=p=>p.acronym||p.code||p.name;
  return <section className="target-contributions" aria-labelledby={id}>
    <header><h3 id={id}>{french?'Contribution par projet':'Contribution by project'}</h3><p>{model.valid?(french?`Part des ${number(model.totalAchieved)} cibles atteintes`:`Share of the ${number(model.totalAchieved)} achieved targets`):(french?'Répartition non disponible':'Breakdown unavailable')}{period&&<> · {period}</>}</p></header>
    {model.rows.length>0?<div className="target-contributions-layout">
      <div className="target-contributions-chart" role="img" aria-label={model.rows.map(r=>`${label(r.project)}: ${number(r.share)}%`).join('; ')}>
        <ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer={false}>
          <Pie data={model.rows} dataKey="achieved" cx="50%" cy="50%" innerRadius="57%" outerRadius="88%" startAngle={90} endAngle={-270} paddingAngle={model.rows.length>1?2:0} isAnimationActive={false} stroke="#fff" strokeWidth={2}>
            {model.rows.map(r=><Cell key={r.project.id} fill={r.colour}/>)}</Pie>
          <text x="50%" y="48%" textAnchor="middle" className="target-contributions-total">{number(model.totalAchieved)}</text>
          <text x="50%" y="59%" textAnchor="middle" className="target-contributions-caption">{french?'atteintes':'achieved'}</text>
        </PieChart></ResponsiveContainer>
      </div>
      <ul className="target-contributions-legend">{model.rows.map(r=><li key={r.project.id} data-project-code={r.project.code}>
        <i aria-hidden="true" style={{background:r.colour}}/><div><strong title={r.project.name}>{label(r.project)}</strong><small>{number(r.achieved)} {french?'cibles atteintes':'targets achieved'}</small></div>
        <span><b>{number(r.share)}%</b></span>
      </li>)}</ul>
    </div>:model.valid?<p className="target-contributions-empty">{french?'Aucune cible atteinte enregistrée dans cette sélection.':'No achieved targets recorded in this selection.'}</p>:null}
    {model.others.length>0&&<details className="target-contributions-others"><summary>{french?'Autres projets':'Other projects'} ({model.others.length})</summary><ul>{model.others.map(r=><li key={r.project.id}><strong>{label(r.project)}</strong><span>{r.reported===0?(french?'Résultats non enregistrés':'Results not recorded'):(french?'Aucune cible atteinte enregistrée':'No achieved targets recorded')}</span></li>)}</ul></details>}
    {model.rows.length>0&&<p className="target-contributions-note">{french?'Part = cibles atteintes du projet ÷ total des cibles atteintes.':'Share = project’s achieved targets ÷ all achieved targets.'}</p>}
  </section>;
}
