import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, LayoutDashboard, Menu, MapPin, Wallet } from '../components/ui/icons';
import { FeatureCardGradient } from '../components/ui/feature-section-with-card-gradient';
import PublicHeaderLogin from '../components/PublicHeaderLogin';
import HeaderPartnerLogos from '../components/HeaderPartnerLogos';
import PublicCoverageMap from '../components/PublicCoverageMap';
import { usePublicSnapshot, publicTotals } from '../lib/publicSnapshot';
import { aggregateIndicatorCategories, projectThemes, thematicAreaCategory } from '../lib/publicPortfolioCategories';
import './public-dashboard.css';

const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
const PROVINCES = ['Torba', 'Sanma', 'Penama', 'Malampa', 'Shefa', 'Tafea'];
const COPY = {
  en: {
    title: 'Public Overview', subtitle: 'Department of Climate Change project portfolio', overview: 'Public Overview',
    search: 'Search projects…', status: 'Status', theme: 'Theme', province: 'Province', all: 'All', reset: 'Reset',
    refresh: 'Refresh', refreshing: 'Checking for updates…', projects: 'DoCC Projects', projectCount: 'Projects under the Department of Climate Change',
    funding: 'Total Project Funding', fundingSub: 'Total recorded project budgets', utilised: 'Funds Utilised', utilisedSub: 'Latest approved cumulative expenditure',
    beneficiaries: 'Total Beneficiaries', beneficiariesSub: 'Direct beneficiaries from approved reports', utilisation: 'Financial Utilisation',
    utilisationSub: 'Approved expenditure as a share of total funding', portfolio: 'Project portfolio', portfolioIntro: 'Projects coordinated by the Department of Climate Change and the information currently recorded for public view.',
    locations: 'Where projects are implementing activities', locationsIntro: 'Recorded provinces and Area Councils for projects in the selected view.',
    activityAreas: 'What project indicators cover', activityAreasIntro: 'Select a category to see its recorded activities, targets and implementing projects.',
    indicator: 'indicator', indicators: 'indicators', inProject: 'in 1 project', inProjects: 'across {count} projects', noIndicators: 'No indicators are recorded for this selection.',
    activity: 'Activity / indicator', target: 'Target', implementingProject: 'Implementing project', noTarget: 'Not recorded', expandCategory: 'View activities and targets', collapseCategory: 'Hide activities and targets',
    activityCategoryLabels: {ecosystems:'Ecosystems & nature-based solutions',livelihoods:'Livelihoods, food & agriculture','climate-risk':'Climate information & disaster risk',infrastructure:'Infrastructure & technology',governance:'Governance, policy & planning',capacity:'Capacity, awareness & inclusion',finance:'Climate finance & fund systems','learning-delivery':'Learning, monitoring & project delivery',beneficiaries:'Beneficiaries & resilience outcomes',other:'Other recorded outcomes'},
    manager: 'Project Manager', implementation: 'Implementation locations', budget: 'Project funding', spent: 'Utilised',
    reached: 'Beneficiaries', outcome: 'Expected outcome', noDescription: 'Project information has not yet been recorded.', unknown: 'Not recorded',
    noFinance: 'Not yet reported', noProjects: 'No projects match these filters.', noLocations: 'No implementation location is recorded for this selection.',
    areaCouncils: 'Area Councils', clearArea: 'Clear area selection', selectedArea: 'Showing projects recorded in',
    publicOnly: 'Public overview', source: 'Project profiles and implementation locations come from the DoCC MERL project register. Beneficiary and expenditure figures are shown only from approved reporting periods.',
    updated: 'Data refreshed', ongoing: 'Ongoing', completed: 'Completed', upcoming: 'Upcoming', other: 'Other',
    language: 'Language', menu: 'Open menu', close: 'Close menu', error: 'Public project information is temporarily unavailable.',
    stale: 'Could not check for updates. The last successfully loaded information remains displayed.', retry: 'Retry', loading: 'Loading public overview…',
  },
  fr: {
    title: 'Vue publique', subtitle: 'Portefeuille de projets du Département du changement climatique', overview: 'Vue publique',
    search: 'Rechercher des projets…', status: 'État', theme: 'Thème', province: 'Province', all: 'Tous', reset: 'Réinitialiser',
    refresh: 'Actualiser', refreshing: 'Recherche de mises à jour…', projects: 'Projets du DoCC', projectCount: 'Projets relevant du Département du changement climatique',
    funding: 'Financement total des projets', fundingSub: 'Total des budgets de projet enregistrés', utilised: 'Fonds utilisés', utilisedSub: 'Dernières dépenses cumulées approuvées',
    beneficiaries: 'Total des bénéficiaires', beneficiariesSub: 'Bénéficiaires directs issus des rapports approuvés', utilisation: 'Utilisation financière',
    utilisationSub: 'Dépenses approuvées en proportion du financement total', portfolio: 'Portefeuille de projets', portfolioIntro: 'Projets coordonnés par le Département du changement climatique et informations actuellement enregistrées pour le public.',
    locations: 'Où les projets mettent en œuvre des activités', locationsIntro: 'Provinces et conseils de zone enregistrés pour les projets sélectionnés.',
    activityAreas: 'Domaines couverts par les indicateurs', activityAreasIntro: 'Sélectionnez une catégorie pour voir les activités, les cibles et les projets de mise en œuvre.',
    indicator: 'indicateur', indicators: 'indicateurs', inProject: 'dans 1 projet', inProjects: 'dans {count} projets', noIndicators: 'Aucun indicateur n’est enregistré pour cette sélection.',
    activity: 'Activité / indicateur', target: 'Cible', implementingProject: 'Projet de mise en œuvre', noTarget: 'Non renseignée', expandCategory: 'Voir les activités et les cibles', collapseCategory: 'Masquer les activités et les cibles',
    activityCategoryLabels: {ecosystems:'Écosystèmes et solutions fondées sur la nature',livelihoods:'Moyens de subsistance, alimentation et agriculture','climate-risk':'Information climatique et risques de catastrophe',infrastructure:'Infrastructures et technologie',governance:'Gouvernance, politiques et planification',capacity:'Capacités, sensibilisation et inclusion',finance:'Finance climatique et systèmes de fonds','learning-delivery':'Apprentissage, suivi et mise en œuvre',beneficiaries:'Bénéficiaires et résultats de résilience',other:'Autres résultats enregistrés'},
    manager: 'Chef de projet', implementation: 'Lieux de mise en œuvre', budget: 'Financement du projet', spent: 'Utilisé',
    reached: 'Bénéficiaires', outcome: 'Résultat attendu', noDescription: 'Les informations du projet ne sont pas encore enregistrées.', unknown: 'Non renseigné',
    noFinance: 'Pas encore déclaré', noProjects: 'Aucun projet ne correspond à ces filtres.', noLocations: 'Aucun lieu de mise en œuvre n’est enregistré pour cette sélection.',
    areaCouncils: 'Conseils de zone', clearArea: 'Effacer la sélection de zone', selectedArea: 'Projets enregistrés à',
    publicOnly: 'Vue publique', source: 'Les profils des projets et les lieux de mise en œuvre proviennent du registre MERL du DoCC. Les bénéficiaires et les dépenses proviennent uniquement des périodes de rapportage approuvées.',
    updated: 'Données actualisées', ongoing: 'En cours', completed: 'Achevé', upcoming: 'À venir', other: 'Autre',
    language: 'Langue', menu: 'Ouvrir le menu', close: 'Fermer le menu', error: 'Les informations publiques sur les projets sont temporairement indisponibles.',
    stale: 'Impossible de vérifier les mises à jour. Les dernières informations chargées restent affichées.', retry: 'Réessayer', loading: 'Chargement de la vue publique…',
  },
};

const finite = value => value != null && value !== '' && Number.isFinite(Number(value));
const positive = value => finite(value) && Number(value) > 0;
const num = (value, lang = 'en') => finite(value)
  ? new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 0 }).format(Number(value)) : '—';
const pct = value => finite(value) ? `${Math.round(Number(value))}%` : '—';
const vuv = (value, lang, fallback = '—') => finite(value) ? `VT ${num(value, lang)}` : fallback;
const recordedVuv = (value, lang, fallback = '—') => positive(value) ? vuv(value, lang) : fallback;
const list = value => Array.isArray(value) ? value : [];
const themesOf = projectThemes;
const themeOf = project => themesOf(project).join(', ');
const statusOf = project => ['ongoing', 'completed', 'upcoming'].includes(project.lifecycle_status) ? project.lifecycle_status : 'other';
const initialFilters = { search: '', status: '', theme: '', province: '' };

function Metric({ label, value, detail, tone = '' }) {
  return <article className={`pbd-metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function ProjectCard({ project, areas, copy, lang }) {
  const projectAreas = areas.filter(area => list(area.project_ids).some(id => String(id) === String(project.id)));
  const places = [...new Set([...list(project.provinces), ...projectAreas.map(area => area.area_council).filter(Boolean)])];
  return <FeatureCardGradient className="pbd-project-card">
    <header><div className="pbd-project-identity">{project.docc_image_url && <img className="pbd-project-image" src={project.docc_image_url} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true; }} />}<div><span className="pbd-project-code">{project.code || project.acronym || copy.projects}</span><h3>{project.name}</h3></div></div><span className={`pbd-status pbd-status-${statusOf(project)}`}>{copy[statusOf(project)]}</span></header>
    <p className="pbd-project-description">{project.description || project.expected_primary_outcome || copy.noDescription}</p>
    <dl className="pbd-project-facts">
      <div><dt>{copy.manager}</dt><dd>{project.project_manager || copy.unknown}</dd></div>
      <div><dt>{copy.implementation}</dt><dd>{places.length ? places.join(', ') : copy.unknown}</dd></div>
      <div><dt>{copy.budget}</dt><dd>{recordedVuv(project.budget_vuv, lang, copy.unknown)}</dd></div>
      <div><dt>{copy.spent}</dt><dd>{vuv(project.cumulative_expenditure_vuv, lang, copy.noFinance)}{finite(project.utilisation_pct) ? ` · ${pct(project.utilisation_pct)}` : ''}</dd></div>
      <div><dt>{copy.reached}</dt><dd>{project.last_published_period ? num(project.published_beneficiaries, lang) : copy.noFinance}</dd></div>
      <div><dt>{copy.theme}</dt><dd>{themeOf(project) || copy.unknown}</dd></div>
    </dl>
    {project.expected_primary_outcome && <div className="pbd-project-outcome"><strong>{copy.outcome}</strong><p>{project.expected_primary_outcome}</p></div>}
  </FeatureCardGradient>;
}

export default function PublicDashboard() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  const c = COPY[lang];
  const { data, isLoading, isFetching, isError, refetch } = usePublicSnapshot();
  const [filters, setFilters] = useState(initialFilters);
  const [selectedArea, setSelectedArea] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState(null);
  const projects = data?.projects || [];
  const summary = data?.summary;
  const sourceAreas = data?.areas || [];
  const sourceIndicatorCategories = data?.indicatorCategories || [];
  const sourceIndicatorDetails = data?.indicatorDetails || [];
  const selectedAreaIds = selectedArea
    ? new Set(list(sourceAreas.find(area => area.province === selectedArea.province && area.area_council === selectedArea.area_council)?.project_ids).map(String))
    : null;
  const filtered = useMemo(() => projects.filter(project => {
    const text = [project.name, project.code, project.acronym, project.description, project.expected_primary_outcome, project.project_manager, themeOf(project), ...list(project.provinces)].join(' ').toLowerCase();
    return (!filters.search || text.includes(filters.search.trim().toLowerCase()))
      && (!filters.status || statusOf(project) === filters.status)
      && (!filters.theme || themesOf(project).includes(filters.theme))
      && (!filters.province || list(project.provinces).includes(filters.province))
      && (!selectedAreaIds || selectedAreaIds.has(String(project.id)));
  }), [projects, filters, selectedAreaIds]);
  const themes = useMemo(() => [...new Set(projects.flatMap(themesOf))].sort(), [projects]);
  const allScope = !filters.search && !filters.status && !filters.theme && !filters.province && !selectedArea;
  const totals = publicTotals(filtered, summary, allScope);
  const selectedIds = new Set(filtered.map(project => String(project.id)));
  const areas = sourceAreas.map(area => {
    const ids = list(area.project_ids).filter(id => selectedIds.has(String(id)));
    const areaProjects = ids.map(id => filtered.find(project => String(project.id) === String(id))).filter(Boolean);
    return { ...area, project_ids: ids, project_names: areaProjects.map(project => project.name), project_count: ids.length, theme_category: thematicAreaCategory(areaProjects) };
  });
  const visibleAreas = areas.filter(area => area.project_count > 0);
  const indicatorCategories = aggregateIndicatorCategories(sourceIndicatorCategories, selectedIds);
  const indicatorTotal = indicatorCategories.reduce((sum, category) => sum + category.indicatorCount, 0);
  const visibleIndicatorDetails = sourceIndicatorDetails.filter(row => selectedIds.has(String(row.project_id)));
  const activeCategory = indicatorCategories.find(category => category.key === openCategory);
  const activeDetails = activeCategory ? visibleIndicatorDetails.filter(row => row.category_key === activeCategory.key) : [];
  const maxCategoryCount = Math.max(1, ...indicatorCategories.map(category => category.indicatorCount));
  const reset = () => { setFilters(initialFilters); setSelectedArea(null); };
  const refresh = () => { void refetch(); };

  return <div className="dsh pbd-root">
    {menuOpen && <button type="button" className="pbd-overlay" aria-label={c.close} onClick={() => setMenuOpen(false)} />}
    <aside className={`dsh-side${menuOpen ? ' open' : ''}`}>
      <div className="dsh-brand"><img src={CREST} alt="" /><div className="dsh-brand-dept">Department of Climate Change</div><div className="dsh-brand-title">MERL</div></div>
      <nav className="dsh-nav" aria-label={c.overview}><button type="button" className="active" onClick={() => setMenuOpen(false)}><LayoutDashboard size={16} aria-hidden="true" />{c.overview}</button></nav>
      <div className="pbd-sidebar-access"><span>{c.publicOnly}</span></div>
    </aside>
    <div className="dsh-main">
      <header className="dsh-head"><button type="button" className="dsh-hamburger" aria-label={c.menu} onClick={() => setMenuOpen(value => !value)}><Menu size={18} /></button><HeaderPartnerLogos/><div className="dsh-head-actions"><div className="dsh-lang" role="group" aria-label={c.language}><button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => void i18n.changeLanguage('en')}>EN</button><button type="button" lang="fr" aria-pressed={lang === 'fr'} onClick={() => void i18n.changeLanguage('fr')}>FR</button></div><PublicHeaderLogin/></div></header>
      <main className="dsh-scroll scrollbar-thin"><div className="pbd-view">
        <div className="pbd-title-row"><div><h1>{c.title}</h1><p>{c.subtitle}{summary?.updated_at && <> · {c.updated}: {new Date(summary.updated_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</>}</p></div></div>
        <div className="pbd-filters">
          <label className="pbd-search"><span className="sr-only">{c.search}</span><input type="search" value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))} placeholder={c.search} /></label>
          <label><span>{c.status}</span><select value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value }))}><option value="">{c.all}</option>{['ongoing', 'completed', 'upcoming', 'other'].map(key => <option key={key} value={key}>{c[key]}</option>)}</select></label>
          <label><span>{c.theme}</span><select value={filters.theme} onChange={event => setFilters(value => ({ ...value, theme: event.target.value }))}><option value="">{c.all}</option>{themes.map(theme => <option key={theme}>{theme}</option>)}</select></label>
          <label><span>{c.province}</span><select value={filters.province} onChange={event => setFilters(value => ({ ...value, province: event.target.value }))}><option value="">{c.all}</option>{PROVINCES.map(province => <option key={province}>{province}</option>)}</select></label>
          <button type="button" className="pbd-reset" disabled={allScope} onClick={reset}>{c.reset}</button><button type="button" className="pbd-refresh" disabled={isFetching} onClick={refresh}>{c.refresh}</button>
        </div>
        {isFetching && data && <div className="pbd-refresh-status" role="status">{c.refreshing}</div>}
        {isError && data && <div className="pbd-refresh-status pbd-refresh-error" role="alert">{c.stale}<button type="button" onClick={refresh}>{c.retry}</button></div>}
        {!data ? (isLoading ? <div className="pbd-state" role="status">{c.loading}</div> : <div className="pbd-state" role="alert">{c.error}<button type="button" onClick={refresh}>{c.retry}</button></div>) : <>
          <section className="pbd-metrics" aria-label={c.title}>
            <Metric label={c.projects} value={num(filtered.length, lang)} detail={c.projectCount} tone="projects" />
            <Metric label={c.funding} value={vuv(totals.investment, lang)} detail={c.fundingSub} tone="funding" />
            <Metric label={c.utilised} value={vuv(totals.utilised, lang, c.noFinance)} detail={c.utilisedSub} tone="utilised" />
            <Metric label={c.beneficiaries} value={num(totals.beneficiaries, lang)} detail={c.beneficiariesSub} tone="beneficiaries" />
            <Metric label={c.utilisation} value={pct(totals.utilisation)} detail={c.utilisationSub} tone="rate" />
          </section>

          <section className="pbd-section pbd-location-section">
            <div className="pbd-section-head"><div><span><MapPin size={16} aria-hidden="true" />{c.locations}</span><p>{c.locationsIntro}</p></div>{selectedArea && <button type="button" onClick={() => setSelectedArea(null)}>{c.clearArea}</button>}</div>
            {selectedArea && <div className="pbd-area-selection">{c.selectedArea} <strong>{selectedArea.area_council}, {selectedArea.province}</strong></div>}
            <div className="pbd-location-grid">
              <PublicCoverageMap areas={areas} selectedArea={selectedArea} onAreaSelect={setSelectedArea} />
              <div className="pbd-area-directory"><h3>{c.areaCouncils}</h3>{visibleAreas.length ? visibleAreas.map(area => <button type="button" key={`${area.province}-${area.area_council}`} className={selectedArea?.province === area.province && selectedArea?.area_council === area.area_council ? 'active' : ''} onClick={() => setSelectedArea({ province: area.province, area_council: area.area_council })}><span><strong>{area.area_council}</strong><small>{area.province}</small></span><b>{area.project_count}</b></button>) : <p>{c.noLocations}</p>}</div>
            </div>
          </section>

          <section className="pbd-section pbd-activity-section">
            <div className="pbd-section-head"><div><span><Activity size={16} aria-hidden="true" />{c.activityAreas}</span><p>{c.activityAreasIntro}</p></div><strong>{num(indicatorTotal, lang)} {indicatorTotal === 1 ? c.indicator : c.indicators}</strong></div>
            {indicatorCategories.length ? <><div className="pbd-activity-grid">{indicatorCategories.map(category => <button type="button" className={`pbd-activity-category pbd-activity-${category.key}${openCategory === category.key ? ' is-open' : ''}`} key={category.key} aria-expanded={openCategory === category.key} aria-controls="pbd-activity-details" onClick={() => setOpenCategory(current => current === category.key ? null : category.key)}>
              <div className="pbd-activity-category-head"><span>{c.activityCategoryLabels[category.key] || c.activityCategoryLabels.other}</span><strong>{num(category.indicatorCount, lang)}</strong></div>
              <div className="pbd-activity-bar" aria-hidden="true"><i style={{ width: `${category.indicatorCount / maxCategoryCount * 100}%` }} /></div>
              <small>{category.indicatorCount === 1 ? c.indicator : c.indicators} · {category.projectCount === 1 ? c.inProject : c.inProjects.replace('{count}', num(category.projectCount, lang))} · {openCategory === category.key ? c.collapseCategory : c.expandCategory}</small>
            </button>)}</div>{activeCategory && <div className="pbd-activity-details" id="pbd-activity-details"><h3>{c.activityCategoryLabels[activeCategory.key] || c.activityCategoryLabels.other} <small>({num(activeDetails.length, lang)})</small></h3><div className="pbd-activity-list">{activeDetails.map(row => <article key={row.indicator_id} className="pbd-activity-item"><div><span className="pbd-activity-label">{c.activity}</span><strong>{row.indicator_name}</strong>{row.indicator_code && <small>{row.indicator_code}</small>}</div><div><span className="pbd-activity-label">{c.target}</span><span>{row.target_text || (finite(row.target_value) ? `${num(row.target_value, lang)}${row.unit ? ` ${row.unit}` : ''}` : c.noTarget)}</span></div><div><span className="pbd-activity-label">{c.implementingProject}</span><span>{row.project_name}</span></div></article>)}</div></div>}</> : <div className="pbd-empty">{c.noIndicators}</div>}
          </section>

          <section className="pbd-section pbd-portfolio">
            <div className="pbd-section-head"><div><span><Wallet size={16} aria-hidden="true" />{c.portfolio}</span><p>{c.portfolioIntro}</p></div><strong>{num(filtered.length, lang)} {c.projects}</strong></div>
            <div className="pbd-project-grid">{filtered.length ? filtered.map(project => <ProjectCard key={project.id} project={project} areas={sourceAreas} copy={c} lang={lang} />) : <div className="pbd-empty">{c.noProjects}</div>}</div>
          </section>
          <footer className="pbd-footer"><span>{c.source}</span></footer>
        </>}
      </div></main>
    </div>
  </div>;
}
