import { useId } from 'react';
import { publicTargetSummary } from '../lib/publicTargetProgress';
import ProjectTargetContributions from './ProjectTargetContributions';
import './executive-portfolio-summary.css';

export default function PublicTargetAchievement({ projects, french = false, hideNotes = false }) {
  const summary = publicTargetSummary(projects), { targets } = summary, id = useId();
  const number = n => new Intl.NumberFormat(french ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 }).format(n);
  const title = french ? 'Atteinte globale des cibles' : 'Overall target achievement';
  return <section className="pbd-section pbd-target-achievement" aria-labelledby={id}>
    <div className="executive-targets">
      <div><h2 id={id}>{title}</h2><p>{targets.total === null
        ? (french ? 'Synthèse publiée temporairement indisponible.' : 'Published target summary unavailable.')
        : (french ? `${number(targets.achieved)} atteintes / ${number(targets.total)} cibles au total` : `${number(targets.achieved)} achieved / ${number(targets.total)} total targets`)}</p>
        <strong className="executive-target-value">{targets.percentage === null ? '—' : `${number(targets.percentage)}%`}</strong></div>
      <div className="executive-target-context">
        {targets.percentage !== null && <div className="executive-target-track" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={targets.percentage}><span style={{width: `${targets.percentage}%`}} /></div>}
        <p>{targets.reported === null ? (french ? 'Résultats publiés indisponibles.' : 'Published results unavailable.') : (french ? `Résultats disponibles : ${number(targets.reported)} / ${number(targets.total)}` : `Results available: ${number(targets.reported)} / ${number(targets.total)}`)}</p>
      </div>
    </div>
    <ProjectTargetContributions summary={summary} french={french} hideNote={hideNotes} />
    {!hideNotes && <details className="executive-method"><summary>{french ? 'Comment ces chiffres sont calculés' : 'How these figures are calculated'}</summary><p>{french ? 'Cibles atteintes ÷ toutes les cibles enregistrées des projets sélectionnés. Les cibles sans résultat restent dans le total ; les résultats absents ne sont pas présentés comme une réalisation de 0 %.' : 'Achieved targets ÷ all registered targets for the selected projects. Targets without results remain in the total; missing results are not shown as 0% achievement.'}</p></details>}
  </section>;
}
