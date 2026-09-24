import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Menu } from '../components/ui/icons';
import PublicHeaderLogin from '../components/PublicHeaderLogin';
import HeaderPartnerLogos from '../components/HeaderPartnerLogos';
import PublicCoverageMap from '../components/PublicCoverageMap';
import { usePublicSnapshot, publicTotals, publicProjectCount } from '../lib/publicSnapshot';
import './public-dashboard.css';

const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;

const COPY = {
  en: {
    title: 'Public Overview',
    subtitle: 'Department of Climate Change project portfolio',
    overview: 'Public Overview',
    intro: 'This public overview brings together the Department of Climate Change project portfolio, where projects are working, who manages them, beneficiaries reached, total project investment and approved expenditure already utilised.',
    projects: 'Projects under the Department of Climate Change',
    projectsSub: 'Published project information from the MERL portfolio.',
    locations: 'Where projects are implementing activities',
    locationsSub: 'Approved Area Council coverage recorded for published projects.',
    search: 'Search projects…',
    projectCount: 'Total Projects',
    beneficiaries: 'Total Beneficiaries',
    investment: 'Total Project Investment',
    utilised: 'Funds Utilised',
    manager: 'Project Manager',
    province: 'Province(s)',
    areaCouncils: 'Area Council(s)',
    budget: 'Project Investment',
    spent: 'Utilised',
    people: 'Beneficiaries',
    noManager: 'Not yet published',
    noCoverage: 'No approved Area Council coverage published yet',
    noProjects: 'No published projects match this search.',
    loading: 'Loading public overview…',
    error: 'Public project information is temporarily unavailable.',
    retry: 'Retry',
    refreshed: 'Public data last refreshed',
    publicOnly: 'Approved public information only',
    language: 'Language',
    menu: 'Open menu',
    close: 'Close menu',
    disclosure: 'Only approved public information is shown. Draft monitoring records, internal reviews and management workflows remain restricted to authorised MERL users.'
  },
  fr: {
    title: 'Vue publique',
    subtitle: 'Portefeuille de projets du Département du changement climatique',
    overview: 'Vue publique',
    intro: 'Cette vue publique regroupe le portefeuille de projets du Département du changement climatique, les lieux de mise en œuvre, les responsables de projet, les bénéficiaires, l’investissement total et les dépenses approuvées déjà utilisées.',
    projects: 'Projets du Département du changement climatique',
    projectsSub: 'Informations publiées sur les projets du portefeuille MERL.',
    locations: 'Où les projets mettent en œuvre des activités',
    locationsSub: 'Couverture approuvée des conseils de zone pour les projets publiés.',
    search: 'Rechercher des projets…',
    projectCount: 'Total des projets',
    beneficiaries: 'Total des bénéficiaires',
    investment: 'Investissement total',
    utilised: 'Fonds utilisés',
    manager: 'Responsable du projet',
    province: 'Province(s)',
    areaCouncils: 'Conseil(s) de zone',
    budget: 'Investissement du projet',
    spent: 'Utilisé',
    people: 'Bénéficiaires',
    noManager: 'Pas encore publié',
    noCoverage: 'Aucune couverture approuvée des conseils de zone publiée',
    noProjects: 'Aucun projet publié ne correspond à cette recherche.',
    loading: 'Chargement de la vue publique…',
    error: 'Les informations publiques sur les projets sont temporairement indisponibles.',
    retry: 'Réessayer',
    refreshed: 'Dernière actualisation des données publiques',
    publicOnly: 'Informations publiques approuvées uniquement',
    language: 'Langue',
    menu: 'Ouvrir le menu',
    close: 'Fermer le menu',
    disclosure: 'Seules les informations publiques approuvées sont affichées. Les données de suivi provisoires, examens internes et processus de gestion restent réservés aux utilisateurs MERL autorisés.'
  }
};

const list = value => Array.isArray(value) ? value : [];
const finite = value => value != null && value !== '' && Number.isFinite(Number(value));
const fmtNum = (value, lang) => finite(value)
  ? new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', { maximumFractionDigits: 0 }).format(Number(value))
  : '—';
const fmtVuv = (value, lang) => finite(value) ? `VT ${fmtNum(value, lang)}` : '—';

export default function PublicDashboard() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  const c = COPY[lang];
  const { data, isLoading, isError, refetch } = usePublicSnapshot();
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const projects = data?.projects || [];
  const summary = data?.summary;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(project => [
      project.name,
      project.code,
      project.acronym,
      project.description,
      project.project_manager_name,
      ...list(project.provinces),
    ].join(' ').toLowerCase().includes(q));
  }, [projects, search]);

  const totals = publicTotals(projects, summary, true);
  const inventory = publicProjectCount(data?.inventory, projects.length, true);
  const projectCount = inventory.scope === 'all' ? inventory.value : summary?.project_count ?? projects.length;

  const areasByProject = useMemo(() => {
    const map = new Map();
    for (const area of data?.areas || []) {
      for (const id of list(area.project_ids)) {
        const key = String(id);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ name: area.area_council, province: area.province });
      }
    }
    return map;
  }, [data?.areas]);

  const visibleIds = new Set(filtered.map(project => String(project.id)));
  const visibleAreas = (data?.areas || []).map(area => {
    const ids = list(area.project_ids).filter(id => visibleIds.has(String(id)));
    return {
      ...area,
      project_ids: ids,
      project_count: ids.length,
      project_names: ids.map(id => filtered.find(p => String(p.id) === String(id))?.name).filter(Boolean),
    };
  }).filter(area => area.project_count > 0);

  return <div className="dsh pbd-root pbo-root">
    {menuOpen && <button type="button" className="pbd-overlay" aria-label={c.close} onClick={() => setMenuOpen(false)} />}
    <aside className={`dsh-side${menuOpen ? ' open' : ''}`}>
      <div className="dsh-brand">
        <img src={CREST} alt="" />
        <div className="dsh-brand-dept">Department of Climate Change</div>
        <div className="dsh-brand-title">MERL</div>
      </div>
      <nav className="dsh-nav" aria-label={c.overview}>
        <button type="button" className="active" onClick={() => setMenuOpen(false)}>
          <LayoutDashboard size={16} aria-hidden="true" />{c.overview}
        </button>
      </nav>
      <div className="pbd-sidebar-access"><span>{c.publicOnly}</span></div>
    </aside>

    <div className="dsh-main">
      <header className="dsh-head">
        <button type="button" className="dsh-hamburger" aria-label={c.menu} onClick={() => setMenuOpen(value => !value)}>
          <Menu size={18} aria-hidden="true" />
        </button>
        <HeaderPartnerLogos />
        <div className="dsh-head-actions">
          <div className="dsh-lang" role="group" aria-label={c.language}>
            <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => void i18n.changeLanguage('en')}>EN</button>
            <button type="button" lang="fr" aria-pressed={lang === 'fr'} onClick={() => void i18n.changeLanguage('fr')}>FR</button>
          </div>
          <PublicHeaderLogin />
        </div>
      </header>

      <main className="dsh-scroll scrollbar-thin">
        <div className="ovx pbd-view pbo-view">
          <div className="pbd-title-row pbo-title">
            <div>
              <h1>{c.title}</h1>
              <p>{c.subtitle}{summary?.updated_at && <> · {c.refreshed}: {new Date(summary.updated_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</>}</p>
            </div>
          </div>

          <section className="pbo-intro"><p>{c.intro}</p></section>

          {!data ? (
            isLoading
              ? <div className="pbd-state" role="status">{c.loading}</div>
              : <div className="pbd-state" role="alert">{c.error}<button type="button" onClick={() => void refetch()}>{c.retry}</button></div>
          ) : <>
            {isError && <div className="pbd-refresh-status pbd-refresh-error" role="alert">{c.error}<button type="button" onClick={() => void refetch()}>{c.retry}</button></div>}

            <section className="pbo-kpis" aria-label="Portfolio totals">
              <article><span>{c.projectCount}</span><strong>{projectCount == null ? '—' : fmtNum(projectCount, lang)}</strong></article>
              <article><span>{c.beneficiaries}</span><strong>{fmtNum(totals.beneficiaries, lang)}</strong></article>
              <article><span>{c.investment}</span><strong>{fmtVuv(totals.investment, lang)}</strong></article>
              <article><span>{c.utilised}</span><strong>{fmtVuv(totals.utilised, lang)}</strong></article>
            </section>

            <section className="pbd-panel pbo-projects">
              <div className="pbd-panel-head pbo-section-head">
                <div><h2>{c.projects}</h2><p>{c.projectsSub}</p></div>
                <span>{fmtNum(filtered.length, lang)} / {fmtNum(projects.length, lang)}</span>
              </div>
              <label className="pbo-search">
                <span className="sr-only">{c.search}</span>
                <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={c.search} />
              </label>

              <div className="pbo-project-list">
                {filtered.length ? filtered.map(project => {
                  const coverage = areasByProject.get(String(project.id)) || [];
                  const areaNames = [...new Set(coverage.map(item => item.name).filter(Boolean))];
                  const provinces = list(project.provinces);
                  return <article className="pbo-project-card" key={project.id}>
                    <div className="pbo-project-heading">
                      <div>
                        <span className="pbo-project-code">{project.acronym || project.code || ''}</span>
                        <h3>{project.name}</h3>
                      </div>
                      <span className={`pbo-status ${project.lifecycle_status || ''}`}>{project.lifecycle_status || ''}</span>
                    </div>
                    {project.description && <p className="pbo-project-description">{project.description}</p>}
                    <div className="pbo-project-meta">
                      <div><span>{c.manager}</span><strong>{project.project_manager_name || c.noManager}</strong></div>
                      <div><span>{c.province}</span><strong>{provinces.length ? provinces.join(', ') : '—'}</strong></div>
                      <div><span>{c.areaCouncils}</span><strong>{areaNames.length ? areaNames.join(', ') : c.noCoverage}</strong></div>
                      <div><span>{c.people}</span><strong>{fmtNum(project.published_beneficiaries, lang)}</strong></div>
                      <div><span>{c.budget}</span><strong>{fmtVuv(project.budget_vuv, lang)}</strong></div>
                      <div><span>{c.spent}</span><strong>{fmtVuv(project.utilised_vuv, lang)}</strong></div>
                    </div>
                  </article>;
                }) : <div className="pbd-empty">{c.noProjects}</div>}
              </div>
            </section>

            <section className="pbd-panel pbo-map-section">
              <div className="pbd-panel-head pbo-section-head">
                <div><h2>{c.locations}</h2><p>{c.locationsSub}</p></div>
              </div>
              <div className="pbo-map"><PublicCoverageMap areas={visibleAreas} /></div>
            </section>

            <footer className="pbd-footer"><span>{c.disclosure}</span></footer>
          </>}
        </div>
      </main>
    </div>
  </div>;
}
