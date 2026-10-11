import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { officialProjects, isCompletedProject } from '../lib/docc/projectScope';
import './pending-results-frameworks.css';

// Internal follow-up only. Unknown readiness is never treated as missing.
export default function PendingResultsFrameworks({ projects = [], user, onSelect }) {
  const { i18n } = useTranslation();
  if (!user) return null;
  const pending = officialProjects(projects).filter(project =>
    !isCompletedProject(project) && project.has_results_framework === false);
  if (!pending.length) return null;
  const french = i18n.resolvedLanguage?.startsWith('fr');
  const label = french ? 'Cadre de résultats non encore enregistré' : 'Results framework not yet registered';
  return <details className="pending-frameworks rp-noprint">
    <summary>{pending.length} {french ? 'projet(s) en attente de l’enregistrement du cadre de résultats' : `project${pending.length === 1 ? '' : 's'} awaiting results framework registration`}</summary>
    <p>{french ? 'Ces projets sont déjà enregistrés. Leur cadre de résultats reste à associer à cette entrée du registre.' : 'These projects are already registered. A results framework still needs to be linked to each register entry.'}</p>
    <ul>{pending.map(project => <li key={project.id}>
      {onSelect
        ? <button type="button" onClick={() => onSelect(project.id)}>{project.code && `${project.code} — `}{project.name}</button>
        : <Link to={`/project-setup?project=${encodeURIComponent(project.id)}`}>{project.code && `${project.code} — `}{project.name}</Link>}
      <span>{label}</span>
      {project.code === '24C498' && projects.some(p => p.code === '24B298' && p.has_results_framework === true) && <small>{french ? 'Le cadre du projet 24B298 – Loss and Damage Fund Development Project est déjà enregistré. Cette entrée porte un autre code.' : '24B298 – Loss and Damage Fund Development Project already has a registered framework. This entry has a different project code.'}</small>}
    </li>)}</ul>
  </details>;
}
