import { ProjectsIcon, UpdateProgressIcon, ReportsIcon, HelpIcon } from './ui/MerlIcons';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './workspace-guide.css';
const steps = {
  '/dashboards': ['Read the summary cards. Use filters to focus on a project or location.', 'Choose View projects to read or edit project details.', 'Choose Update progress to record results, or Generate a report to download them.'],
  '/analytics/project-portfolio': ['Choose your project, then a reporting period or All periods.', 'Read its results, finances, activities, beneficiaries and risks.', 'Choose Generate project reports to switch between progress, financial and indicator reports for this project.'],
  '/project-setup': ['Search for your project and select it.', 'Choose Edit beside the information you want to change.', 'Choose Save changes. Use Goals & activities for indicators and targets.'],
  '/results-framework': ['Choose your project. An indicator is a measure used to track its results.', 'Read the goals, activities, indicators and targets. A target is the result the project aims to reach.', 'If you have editing access, choose Edit beside a row, change the value and save.'],
  '/merl-reporting': ['Choose your project and the reporting period—the dates covered by your update.', 'Choose a section, then Add. Enter what was achieved and save it.', 'Complete the required sections, then Submit for review. Approval is shown separately from saving.'],
  '/reports': ['Choose the type of report you need.', 'Choose its project or scope, frequency and reporting period.', 'Preview the report, then download Word or PDF.'],
  '/review': ['Search for a project and choose a submission.', 'Read its results and supporting information.', 'If you are a reviewer, approve it or return it with clear comments.'],
  '/admin': ['Find the person or setting you need.', 'Check their role and project access before making a change.', 'Save, then check the updated information.'],
};
export default function WorkspaceGuide({ user }) {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const fr = i18n.resolvedLanguage?.startsWith('fr');
  const canEdit = ['ROLE_ADMIN','ROLE_DOCC_MEO','ROLE_PROJ_MANAGER'].includes(user?.role);
  const guide = steps[pathname] || ['Choose a view and its filters.', 'Read the results for the selected projects and reporting periods.', 'Use Projects, Update Progress or Reports for your next task.'];
  const french = {
    '/dashboards': ['Consultez les cartes et filtrez par projet ou lieu.', 'Ouvrez Projets pour consulter ou modifier les détails.', 'Ouvrez Saisir les progrès pour ajouter des résultats, ou Générer un rapport.'],
    '/analytics/project-portfolio': ['Choisissez votre projet et la période.', 'Consultez les résultats, finances, activités, bénéficiaires et risques.', 'Ouvrez les rapports de ce projet pour choisir le type de rapport.'],
    '/project-setup': ['Recherchez et sélectionnez votre projet.', 'Choisissez Modifier à côté des informations concernées.', 'Enregistrez les modifications. Les objectifs et activités sont dans le cadre de résultats.'],
    '/results-framework': ['Choisissez le projet. Un indicateur mesure ses résultats.', 'Consultez les objectifs, activités, indicateurs et cibles.', 'Avec un accès en modification, choisissez Modifier sur une ligne et enregistrez.'],
    '/merl-reporting': ['Choisissez le projet et la période couverte.', 'Choisissez une section, puis Ajouter. Saisissez et enregistrez les résultats.', 'Complétez les sections obligatoires et soumettez pour examen.'],
    '/reports': ['Choisissez le type de rapport.', 'Choisissez le projet, la fréquence et la période.', 'Prévisualisez puis téléchargez en Word ou PDF.'],
    '/review': ['Recherchez le projet et ouvrez une soumission.', 'Consultez les résultats et les justificatifs.', 'Les réviseurs peuvent approuver ou renvoyer avec des commentaires.'],
    '/admin': ['Recherchez la personne ou le paramètre.', 'Vérifiez le rôle et les projets autorisés.', 'Enregistrez puis vérifiez les informations.'],
  };
  return <div className="wg-wrap rp-noprint">
    {pathname === '/dashboards' && <nav className="wg-start" aria-label={fr ? 'Commencer' : 'Start here'}>
      <a href="#/project-setup"><ProjectsIcon size={22} />{fr ? 'Voir les projets' : 'View projects'}</a>
      {canEdit && <a href="#/merl-reporting"><UpdateProgressIcon size={22} />{fr ? 'Saisir les progrès' : 'Update progress'}</a>}
      <a href="#/reports"><ReportsIcon size={22} />{fr ? 'Générer un rapport' : 'Generate a report'}</a>
    </nav>}
    <details className="wg-guide" key={pathname}><summary><HelpIcon size={24} /> {fr ? 'Comment utiliser cette page' : 'How to use this page'}</summary><ol>{(fr ? french[pathname] || ['Choisissez une vue et ses filtres.','Consultez les résultats des projets et périodes sélectionnés.','Utilisez Projets ou Rapports pour continuer.'] : guide).map((step,index)=><li key={step}><span className="wg-step-icon" aria-hidden="true">{index === 0 ? <ProjectsIcon size={26} /> : index === 1 ? <UpdateProgressIcon size={26} /> : <ReportsIcon size={26} />}</span><span>{step}</span></li>)}</ol><p>{fr ? 'Les boutons de modification dépendent de votre accès.' : 'Editing buttons depend on your access. A missing result means it has not been reported; it does not mean zero.'}</p></details>
  </div>;
}
