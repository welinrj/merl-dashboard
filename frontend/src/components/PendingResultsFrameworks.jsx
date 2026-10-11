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
    <ul>{pending.map(project => <li key={project.id}>
      {onSelect
        ? <button type="button" onClick={() => onSelect(project.id)}>{project.name}</button>
        : <Link to={`/project-setup?project=${encodeURIComponent(project.id)}`}>{project.name}</Link>}
      <span>{label}</span>
    </li>)}</ul>
  </details>;
}
