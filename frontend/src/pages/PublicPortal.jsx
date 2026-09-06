import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import PublicCoverageMap from '../components/PublicCoverageMap';
import './public-portal.css';

const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
const HERO = `${import.meta.env.BASE_URL}login-tanna.webp`;
const MFAT = `${import.meta.env.BASE_URL}mfat-logo-white.png`;

const copy = {
  en: {
    home:'Home', projects:'Projects', results:'Results', map:'Map', about:'About', login:'Login',
    heroKicker:'OUR PEOPLE · OUR ISLANDS · OUR FUTURE',
    heroTitle:'Climate Action for a Stronger Vanuatu',
    heroText:'Public results from climate and resilience projects coordinated through the Department of Climate Change.',
    explore:'Explore our progress', projectsLabel:'Projects', progress:'Results progress', people:'People benefiting', investment:'Total investment',
    impact:'Our Impact', impactText:'Progress published here comes only from approved project reporting.',
    resilient:'Resilient communities', ecosystems:'Healthy ecosystems', risks:'Reduced climate risks', livelihoods:'Sustainable livelihoods',
    projectProgress:'Project Progress', projectProgressText:'Approved portfolio projects and their latest published results.',
    noPublished:'No approved progress published yet', viewProjects:'View all projects',
    locations:'Project Locations', locationsText:'Explore where approved projects are working across Vanuatu.',
    latest:'Published Results', latestText:'Latest approved project progress available for public viewing.',
    publicNote:'This public platform shows approved results and project progress only. Internal monitoring, tracking, risks, review workflows and management information are available only to authorised users.',
    authorised:'Authorised MERL users', secure:'Access full MERL portal', footer:'Department of Climate Change · Government of the Republic of Vanuatu',
    updated:'Public data last refreshed'
  },
  fr: {
    home:'Accueil', projects:'Projets', results:'Résultats', map:'Carte', about:'À propos', login:'Connexion',
    heroKicker:'NOTRE PEUPLE · NOS ÎLES · NOTRE AVENIR',
    heroTitle:'Action climatique pour un Vanuatu plus fort',
    heroText:'Résultats publics des projets climatiques et de résilience coordonnés par le Département du changement climatique.',
    explore:'Voir nos progrès', projectsLabel:'Projets', progress:'Progrès des résultats', people:'Bénéficiaires', investment:'Investissement total',
    impact:'Notre impact', impactText:'Les progrès publiés ici proviennent uniquement de rapports de projet approuvés.',
    resilient:'Communautés résilientes', ecosystems:'Écosystèmes sains', risks:'Risques climatiques réduits', livelihoods:'Moyens de subsistance durables',
    projectProgress:'Progrès des projets', projectProgressText:'Projets approuvés et derniers résultats publiés.',
    noPublished:'Aucun progrès approuvé publié pour le moment', viewProjects:'Voir tous les projets',
    locations:'Localisation des projets', locationsText:'Découvrez où les projets approuvés interviennent au Vanuatu.',
    latest:'Résultats publiés', latestText:'Derniers progrès approuvés disponibles au public.',
    publicNote:'Cette plateforme publique présente uniquement les résultats approuvés et les progrès des projets. Les informations internes de suivi, de gestion des risques et de validation sont réservées aux utilisateurs autorisés.',
    authorised:'Utilisateurs MERL autorisés', secure:'Accéder au portail MERL complet', footer:'Département du changement climatique · Gouvernement de la République du Vanuatu',
    updated:'Dernière actualisation des données publiques'
  }
};

const fmtVuv = (value) => {
  const n = Number(value) || 0;
  if (n >= 1e9) return `VT ${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `VT ${(n / 1e6).toFixed(1)}M`;
  return `VT ${new Intl.NumberFormat('en-US').format(n)}`;
};
const fmtNum = (value) => new Intl.NumberFormat('en-US').format(Number(value) || 0);

function scrollToId(id) { document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' }); }

export default function PublicPortal() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  const c = copy[lang];
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, p, a] = await Promise.all([
        supabase.from('public_portal_summary').select('*').single(),
        supabase.from('public_portal_projects').select('*').order('name'),
        supabase.from('public_portal_area_councils').select('*').order('project_count', { ascending:false }),
      ]);
      const failed = [s,p,a].find((r) => r.error);
      if (!alive) return;
      if (failed?.error) { setError(failed.error.message || 'Public results are temporarily unavailable.'); return; }
      setSummary(s.data); setProjects(p.data || []); setAreas(a.data || []);
    })();
    return () => { alive = false; };
  }, []);

  const featured = useMemo(() => [...projects].sort((a,b) => (b.progress_pct ?? -1) - (a.progress_pct ?? -1)).slice(0,6), [projects]);
  const published = featured.filter((p) => p.progress_pct != null);
  const heroStats = [
    [summary?.project_count ?? '—', c.projectsLabel],
    [summary?.overall_progress_pct != null ? `${Math.round(summary.overall_progress_pct)}%` : '—', c.progress],
    [summary ? fmtNum(summary.published_beneficiaries) : '—', c.people],
    [summary ? fmtVuv(summary.total_investment_vuv) : '—', c.investment],
  ];

  return (
    <div className="pub-root">
      <header className="pub-head">
        <div className="pub-head-inner">
          <button className="pub-brand" onClick={() => scrollToId('home')} aria-label={c.home}>
            <img src={CREST} alt="Vanuatu coat of arms" />
            <span><strong>VANUATU</strong><small>Department of Climate Change</small></span>
          </button>
          <nav className="pub-nav" aria-label="Public navigation">
            <button onClick={() => scrollToId('home')}>{c.home}</button>
            <button onClick={() => scrollToId('projects')}>{c.projects}</button>
            <button onClick={() => scrollToId('results')}>{c.results}</button>
            <button onClick={() => scrollToId('map')}>{c.map}</button>
            <button onClick={() => scrollToId('about')}>{c.about}</button>
          </nav>
          <div className="pub-actions">
            <div className="pub-lang" role="group" aria-label="Language">
              <button className={lang==='en'?'active':''} onClick={() => void i18n.changeLanguage('en')}>EN</button>
              <button className={lang==='fr'?'active':''} onClick={() => void i18n.changeLanguage('fr')}>FR</button>
            </div>
            <Link className="pub-login" to="/login">{c.login}</Link>
          </div>
        </div>
      </header>

      <main>
        <section id="home" className="pub-hero" style={{ backgroundImage:`linear-gradient(90deg,rgba(3,39,48,.92),rgba(3,55,66,.66) 48%,rgba(4,39,48,.25)),url(${HERO})` }}>
          <div className="pub-hero-copy">
            <div className="pub-kicker">{c.heroKicker}</div>
            <h1>{c.heroTitle}</h1>
            <p>{c.heroText}</p>
            <button className="pub-cta" onClick={() => scrollToId('results')}>{c.explore} <span>→</span></button>
          </div>
          <div className="pub-hero-tag">People · Nature · Climate · Resilience</div>
          <div className="pub-stat-band">
            {heroStats.map(([value,label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}
          </div>
        </section>

        {error && <div className="pub-error" role="alert">{error}</div>}

        <section id="results" className="pub-section pub-impact">
          <div className="pub-section-head"><div><span className="pub-eyebrow">PUBLIC RESULTS</span><h2>{c.impact}</h2><p>{c.impactText}</p></div></div>
          <div className="pub-impact-grid">
            {[['◉',c.resilient],['◆',c.ecosystems],['◇',c.risks],['✦',c.livelihoods]].map(([icon,label]) => <article key={label}><span>{icon}</span><strong>{label}</strong></article>)}
          </div>
          <div className="pub-quote"><blockquote>“Stronger islands today for a safer, more resilient tomorrow.”</blockquote><span>Vanuatu climate resilience portfolio</span></div>
        </section>

        <section id="projects" className="pub-section">
          <div className="pub-section-head"><div><span className="pub-eyebrow">PORTFOLIO</span><h2>{c.projectProgress}</h2><p>{c.projectProgressText}</p></div><span className="pub-count">{projects.length} {c.projectsLabel}</span></div>
          <div className="pub-project-grid">
            {featured.map((p) => {
              const pct = p.progress_pct == null ? null : Math.max(0, Math.min(100, Number(p.progress_pct)));
              return <article className="pub-project" key={p.id}>
                <div className="pub-project-top"><span className={`pub-status ${p.lifecycle_status}`}>{p.lifecycle_status}</span><span>{p.code || p.acronym || ''}</span></div>
                <h3>{p.name}</h3>
                <p>{p.expected_primary_outcome || p.description || p.primary_climate_theme || ''}</p>
                <div className="pub-project-meta"><span>{p.provinces?.length ? p.provinces.join(', ') : 'Vanuatu'}</span><span>{fmtVuv(p.budget_vuv)}</span></div>
                {pct == null ? <div className="pub-no-result">{c.noPublished}</div> : <div className="pub-progress"><div><span>{c.progress}</span><strong>{Math.round(pct)}%</strong></div><div className="pub-track"><span style={{width:`${pct}%`}} /></div><small>{p.last_published_period || ''}</small></div>}
              </article>;
            })}
          </div>
        </section>

        <section id="map" className="pub-section pub-map-section">
          <div className="pub-section-head"><div><span className="pub-eyebrow">WHERE WE WORK</span><h2>{c.locations}</h2><p>{c.locationsText}</p></div></div>
          <div className="pub-map-layout">
            <div className="pub-map-card"><PublicCoverageMap areas={areas} /></div>
            <aside className="pub-area-list"><h3>Area Councils</h3>{areas.slice(0,8).map((a) => <div key={`${a.province}-${a.area_council}`}><span><strong>{a.area_council}</strong><small>{a.province}</small></span><b>{a.project_count}</b></div>)}</aside>
          </div>
        </section>

        <section className="pub-section" id="about">
          <div className="pub-section-head"><div><span className="pub-eyebrow">ACCOUNTABILITY</span><h2>{c.latest}</h2><p>{c.latestText}</p></div></div>
          <div className="pub-published-grid">
            {published.length ? published.slice(0,3).map((p) => <article key={p.id}><strong>{p.name}</strong><span>{Math.round(p.progress_pct)}% {c.progress.toLowerCase()}</span><small>{p.last_published_period}</small></article>) : <article><strong>Approved public reporting</strong><span>{c.noPublished}</span></article>}
          </div>
          <div className="pub-disclosure"><p>{c.publicNote}</p><div><strong>{c.authorised}</strong><Link to="/login">{c.secure} →</Link></div></div>
        </section>
      </main>

      <footer className="pub-footer"><div><img src={CREST} alt=""/><span><strong>VANUATU</strong><small>{c.footer}</small></span></div><div className="pub-footer-right">{summary?.updated_at && <span>{c.updated}: {new Date(summary.updated_at).toLocaleDateString(lang==='fr'?'fr-FR':'en-GB')}</span>}{MFAT && <img src={MFAT} alt="" />}</div></footer>
    </div>
  );
}
