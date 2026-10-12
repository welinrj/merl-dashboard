import './ProjectDetailsForm.css';

const text = value => value || 'Not yet added';
export default function ProjectDetailsSummary({ project, canEdit, onEdit }) {
  const card = (key, title, body) => <section className="pd-summary-section" key={key} aria-label={title}>
    <header><h3>{title}</h3>{canEdit && <button type="button" className="btn btn-secondary" onClick={() => onEdit(project, key)} aria-label={`Edit ${title.toLowerCase()}`}>Edit</button>}</header>{body}
  </section>;
  return <div className="pd-summary">
    <header className="pd-project-heading"><h2>{project.name}</h2>{project.code && <p>Project code: {project.code}</p>}<p>{canEdit ? 'Choose Edit beside the information you want to change.' : 'You can view this project. Ask an administrator if information needs to change.'}</p></header>
    <p><a className="btn btn-primary" href={`#/analytics/project-portfolio?project=${encodeURIComponent(project.id)}`}>View project portfolio & reports</a></p>
    <div className="pd-summary-grid">
      {card('about', 'About the project', <><p>{text(project.description)}</p><dl><dt>Short name</dt><dd>{text(project.acronym)}</dd><dt>Status</dt><dd>{text(project.status)?.replaceAll('_', ' ')}</dd><dt>Lead organisation</dt><dd>{text(project.lead_agency)}</dd></dl></>)}
      {card('funding', 'Funding', <dl><dt>Who funds it?</dt><dd>{text(project.donor)}</dd><dt>Approved budget (Vanuatu vatu)</dt><dd>{project.budget_vuv == null ? 'Not yet added' : `VT ${Number(project.budget_vuv).toLocaleString()}`}</dd><dt>Start date</dt><dd>{text(project.start_date)}</dd><dt>End date</dt><dd>{text(project.end_date)}</dd></dl>)}
      {card('locations', 'Locations', <><p><strong>Provinces:</strong> {project.provinces?.length ? project.provinces.join(', ') : 'Not yet added'}</p><p><strong>Islands:</strong> {project.islands?.length ? project.islands.join(', ') : 'Not yet added'}</p><p><strong>Communities:</strong> {project.communities?.length ? project.communities.join(', ') : 'Not yet added'}</p></>)}
      {card('contacts', 'Project manager', <dl><dt>Project manager</dt><dd>{text(project.project_manager)}</dd><dt>Monitoring contact</dt><dd>{text(project.me_officer)}</dd><dt>Finance contact</dt><dd>{text(project.finance_officer)}</dd></dl>)}
      {card('goals', 'Goals & activities', <><p>{text(project.expected_primary_outcome)}</p><p>Project goals, activities, indicators and targets are in the results framework.</p><a className="btn btn-secondary" href={`#/results-framework?project=${encodeURIComponent(project.id)}`}>Open goals & activities</a></>)}
    </div>
  </div>;
}
