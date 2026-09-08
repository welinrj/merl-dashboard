import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { LayoutDashboard, FolderKanban, Target, MapPin, FileBarChart, Menu, ArrowRight, Activity } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import PublicCoverageMap from '../components/PublicCoverageMap';
import './public-portal.css';

const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
const PROVINCES = ['Torba', 'Sanma', 'Penama', 'Malampa', 'Shefa', 'Tafea'];
const COLORS = { ongoing:'#277a4f', completed:'#3875c4', upcoming:'#8393a7', other:'#d49a37' };
const copy = {
  en: {
    dashboard:'Dashboard', overview:'Public Overview', projects:'Projects', results:'Results', map:'Map', reports:'Reports', login:'Authorised login', title:'MERL Public Dashboard', subtitle:'Tracking climate action for resilient communities', search:'Search projects, provinces, locations...', all:'All', allProvinces:'All provinces', allThemes:'All themes', clear:'Clear filters', refresh:'Refresh', lastUpdated:'Public data last refreshed', totalProjects:'Total Projects', communities:'Communities Reached', ecosystems:'Ecosystems Supported', beneficiaries:'Beneficiaries', publicReports:'Public Reports', provinces:'Provinces covered', projectsByProvince:'Projects by Province', projectStatus:'Project Status', coverage:'Project Locations and Coverage', themes:'Thematic Areas', updates:'Recent Updates', impacts:'Key Impacts to Date', viewAll:'View all', viewMap:'View map', viewProjects:'View project list', viewResults:'View results', viewReports:'View reports', noData:'Not yet published', noProjects:'No published projects match these filters.', noProgress:'No approved progress published yet', publicOnly:'Approved public information only', publicNote:'Only approved public project information is shown. Drafts, internal risks, reviews and management records remain restricted.', projectCount:'projects', project:'project', areaCouncils:'Area councils', investment:'Published investment', progress:'Results progress', status:'Implementation status', allProjects:'Published projects', details:'Project details', close:'Close', back:'Back to overview', noUpdates:'No public updates have been published yet.', noReports:'No public reports have been published yet.', available:'Available to view', published:'Published', resultsSummary:'Published results summary', projectName:'Project', province:'Province', theme:'Theme', budget:'Budget', searchResults:'Search results', retry:'Retry', error:'Public results are temporarily unavailable.', loading:'Loading published results…', national:'National / not specified', coverageCount:'Number of projects', noSelection:'Select a project to view its published details.', emptyMetric:'Awaiting publication', sourceNote:'Figures are derived from the public reporting data. Project coverage can overlap across provinces.', onTrack:'Ongoing', completed:'Completed', upcoming:'Upcoming', other:'Other', viewAllProjects:'View all projects', publishedPeriod:'Latest published period', noBreakdown:'No public breakdown is available.', noDownload:'No public download is available for this record.', projectInformation:'Project information', outcome:'Expected outcome', reportInformation:'Public reports and resources', publicAccess:'Public access', noFake:'Unpublished indicators are shown as unavailable rather than estimated.'
  },
  fr: {
    dashboard:'Tableau de bord', overview:'Vue publique', projects:'Projets', results:'Résultats', map:'Carte', reports:'Rapports', login:'Connexion autorisée', title:'Tableau de bord public MERL', subtitle:'Suivi de l’action climatique pour des communautés résilientes', search:'Rechercher des projets, provinces, lieux...', all:'Tous', allProvinces:'Toutes les provinces', allThemes:'Tous les thèmes', clear:'Effacer les filtres', refresh:'Actualiser', lastUpdated:'Dernière actualisation des données publiques', totalProjects:'Nombre de projets', communities:'Communautés bénéficiaires', ecosystems:'Écosystèmes soutenus', beneficiaries:'Bénéficiaires', publicReports:'Rapports publics', provinces:'Provinces couvertes', projectsByProvince:'Projets par province', projectStatus:'État des projets', coverage:'Localisation et couverture des projets', themes:'Domaines thématiques', updates:'Actualités récentes', impacts:'Résultats clés à ce jour', viewAll:'Voir tout', viewMap:'Voir la carte', viewProjects:'Voir la liste des projets', viewResults:'Voir les résultats', viewReports:'Voir les rapports', noData:'Pas encore publié', noProjects:'Aucun projet publié ne correspond à ces filtres.', noProgress:'Aucun progrès approuvé publié pour le moment', publicOnly:'Informations publiques approuvées uniquement', publicNote:'Seules les informations publiques approuvées sont affichées. Les brouillons, risques internes, examens et dossiers de gestion restent réservés.', projectCount:'projets', project:'projet', areaCouncils:'Conseils de zone', investment:'Investissement publié', progress:'Progrès des résultats', status:'État de mise en œuvre', allProjects:'Projets publiés', details:'Détails du projet', close:'Fermer', back:'Retour à la vue publique', noUpdates:'Aucune actualité publique publiée pour le moment.', noReports:'Aucun rapport public publié pour le moment.', available:'Disponible', published:'Publié', resultsSummary:'Résumé des résultats publiés', projectName:'Projet', province:'Province', theme:'Thème', budget:'Budget', searchResults:'Résultats de recherche', retry:'Réessayer', error:'Les résultats publics sont temporairement indisponibles.', loading:'Chargement des résultats publiés…', national:'National / non précisé', coverageCount:'Nombre de projets', noSelection:'Sélectionnez un projet pour voir ses informations publiées.', emptyMetric:'En attente de publication', sourceNote:'Les chiffres proviennent des données publiques. La couverture des projets peut se chevaucher entre provinces.', onTrack:'En cours', completed:'Achevé', upcoming:'À venir', other:'Autre', viewAllProjects:'Voir tous les projets', publishedPeriod:'Dernière période publiée', noBreakdown:'Aucune ventilation publique disponible.', noDownload:'Aucun téléchargement public disponible pour cet enregistrement.', projectInformation:'Informations sur le projet', outcome:'Résultat attendu', reportInformation:'Rapports et ressources publics', publicAccess:'Accès public', noFake:'Les indicateurs non publiés sont indiqués comme indisponibles et non estimés.'
  }
};
const number = (value, lang='en') => value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat(lang==='fr'?'fr-FR':'en-US',{maximumFractionDigits:0}).format(Number(value));
const money = (value, lang) => value == null ? '—' : `VT ${number(value,lang)}`;
const percent = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value))}%`;
const clamp = value => Math.max(0,Math.min(100,Number(value)||0));
const nameOf = value => String(value||'').replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
const list = value => Array.isArray(value) ? value : [];
const first = (record, keys) => { for(const key of keys) if(record?.[key] != null) return record[key]; return null; };
const metric = (record, keys) => { const value=first(record,keys); return value == null || value==='' || !Number.isFinite(Number(value)) ? null : Number(value); };
const projectStatus = p => ['ongoing','completed','upcoming'].includes(p.lifecycle_status) ? p.lifecycle_status : 'other';
const projectProvinces = p => list(p.provinces);
const projectTheme = p => p.primary_climate_theme || p.category || p.theme || '';
const projectMatches = (p, filters) => {
  const query=filters.search.trim().toLowerCase();
  const haystack=[p.name,p.code,p.acronym,p.description,p.expected_primary_outcome,projectTheme(p),...projectProvinces(p)].join(' ').toLowerCase();
  return (!query||haystack.includes(query)) && (!filters.province||projectProvinces(p).includes(filters.province)) && (!filters.theme||projectTheme(p)===filters.theme);
};
const unique = values => [...new Set(values.filter(Boolean))];
const countText = (n,c) => `${number(n)} ${n===1?c.project:c.projectCount}`;
const initialFilters = {search:'',province:'',theme:''};

function Panel({title,action,children,className=''}) { return <section className={`pd-panel ${className}`}><div className="pd-panel-head"><h2>{title}</h2>{action}</div>{children}</section>; }
function Action({children,onClick}) {return <button type="button" className="pd-text-action" onClick={onClick}>{children}<ArrowRight size={14} aria-hidden="true"/></button>;}
function Bar({value,color}) {return <div className="pd-bar" aria-hidden="true"><span style={{width:`${clamp(value)}%`,background:color}}/></div>;}
function Empty({children}) {return <div className="pd-empty">{children}</div>;}
function Kpi({label,value,sub,Icon}) {return <article className="pd-kpi"><span className="pd-kpi-icon"><Icon size={22} aria-hidden="true"/></span><div className="pd-kpi-copy"><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></article>;}
function StatusChart({rows,c}) {
  const total=rows.reduce((sum,r)=>sum+r.value,0);
  return <div className="pd-status-layout"><div className="pd-donut">{total>0?<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows.filter(r=>r.value>0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius="67%" outerRadius="94%" paddingAngle={1} isAnimationActive={false}>{rows.filter(r=>r.value>0).map(r=><Cell key={r.key} fill={r.color}/>)}</Pie><Tooltip formatter={value=>number(value)}/></PieChart></ResponsiveContainer>:<div className="pd-donut-empty"/>}<div className="pd-donut-center"><strong>{number(total)}</strong><span>{c.projectCount}</span></div></div><div className="pd-status-legend">{rows.map(r=><div key={r.key}><span className="pd-legend-dot" style={{background:r.color}}/><span>{r.name}</span><strong>{number(r.value)}</strong></div>)}</div></div>;
}
function ProjectRow({p,c,lang,onClick}) {return <button type="button" className="pd-project-row" onClick={onClick}><span className="pd-project-row-main"><strong>{p.name}</strong><small>{p.code||p.acronym||projectProvinces(p).join(', ')||c.national}</small></span><span className="pd-project-row-progress"><Bar value={p.progress_pct} color="var(--pd-green)"/><small>{p.progress_pct==null?c.noData:percent(p.progress_pct)}</small></span><ArrowRight size={15} aria-hidden="true"/></button>;}

export default function PublicPortal() {
  const {i18n}=useTranslation();
  const lang=i18n.resolvedLanguage?.startsWith('fr')?'fr':'en';
  const c=copy[lang];
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [reload,setReload]=useState(0);
  const [filters,setFilters]=useState(initialFilters);
  const [tab,setTab]=useState('overview');
  const [selected,setSelected]=useState(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [mapProvince,setMapProvince]=useState('');
  useEffect(()=>{let alive=true;setLoading(true);setError(false);(async()=>{
    try{
      const responses=await Promise.all([
        supabase.from('public_portal_summary').select('*').single(),
        supabase.from('public_portal_projects').select('*').order('name'),
        supabase.from('public_portal_area_councils').select('*').order('project_count',{ascending:false}),
      ]);
      const failed=responses.find(r=>r.error); if(failed) throw failed.error;
      if(alive) setData({summary:responses[0].data,projects:responses[1].data||[],areas:responses[2].data||[]});
    }catch(_error){if(alive)setError(true);}finally{if(alive)setLoading(false);}
  })();return()=>{alive=false;};},[reload]);
  const projects=data?.projects||[];
  const summary=data?.summary;
  const areas=data?.areas||[];
  const themes=useMemo(()=>unique(projects.map(projectTheme)).sort(),[projects]);
  const filtered=useMemo(()=>projects.filter(p=>projectMatches(p,filters)),[projects,filters]);
  const ids=useMemo(()=>new Set(filtered.map(p=>p.id)),[filtered]);
  const filteredAreas=useMemo(()=>areas.filter(a=>!filters.province||a.province===filters.province).map(a=>({...a,project_count:list(a.project_ids).length?list(a.project_ids).filter(id=>ids.has(id)).length:a.project_count,project_names:list(a.project_names)})),[areas,filters.province,ids]);
  const provinceCounts=useMemo(()=>PROVINCES.map(province=>({name:province,value:filtered.filter(p=>projectProvinces(p).includes(province)).length})),[filtered]);
  const statusRows=useMemo(()=>[['ongoing',c.onTrack],['completed',c.completed],['upcoming',c.upcoming],['other',c.other]].map(([key,name])=>({key,name,value:filtered.filter(p=>projectStatus(p)===key).length,color:COLORS[key]})),[filtered,c]);
  const themeRows=useMemo(()=>unique(filtered.map(projectTheme)).map(name=>({name,value:filtered.filter(p=>projectTheme(p)===name).length})).sort((a,b)=>b.value-a.value),[filtered]);
  const allScope=filtered.length===projects.length;
  const publicMetrics=summary||{};
  const communities=metric(publicMetrics,['published_communities','communities_reached']);
  const ecosystems=metric(publicMetrics,['published_ecosystems_ha','ecosystems_supported_ha']);
  const reports=metric(publicMetrics,['public_report_count','published_report_count']);
  const beneficiaries=allScope?metric(publicMetrics,['published_beneficiaries']):null;
  const investments=filtered.reduce((sum,p)=>sum+(Number(p.budget_vuv)||0),0);
  const published=filtered.filter(p=>p.progress_pct!=null).sort((a,b)=>(b.last_published_period||'').localeCompare(a.last_published_period||''));
  const navigate=(next)=>{setTab(next);setSelected(null);setMenuOpen(false);};
  const openProject=(p)=>{setSelected(p);navigate('projects');setSelected(p);};
  const nav=[['overview',c.overview,LayoutDashboard],['projects',c.projects,FolderKanban],['results',c.results,Target],['map',c.map,MapPin],['reports',c.reports,FileBarChart]];
  const kpis=[
    [c.totalProjects,number(filtered.length,lang),c.provinces+': '+provinceCounts.filter(p=>p.value>0).length+' / 6',FolderKanban],
    [c.communities,allScope?number(communities,lang):'—',allScope?c.emptyMetric:c.noBreakdown,MapPin],
    [c.ecosystems,allScope&&ecosystems!=null?`${number(ecosystems,lang)} ha`:'—',allScope?c.emptyMetric:c.noBreakdown,Activity],
    [c.beneficiaries,number(beneficiaries,lang),beneficiaries==null?c.emptyMetric:c.published,Target],
    [c.publicReports,allScope?number(reports,lang):'—',reports==null?c.emptyMetric:c.available,FileBarChart]
  ];
  const projectList=<div className="pd-project-list">{filtered.length?filtered.map(p=><ProjectRow key={p.id} p={p} c={c} lang={lang} onClick={()=>openProject(p)}/>):<Empty>{c.noProjects}</Empty>}</div>;
  const provinceList=<div className="pd-progress-list">{provinceCounts.map(row=><button type="button" key={row.name} className="pd-progress-row" onClick={()=>{setFilters(f=>({...f,province:row.name}));navigate('projects');}}><span>{row.name}</span><Bar value={filtered.length?row.value/filtered.length*100:0} color="var(--pd-blue)"/><strong>{number(row.value,lang)}</strong></button>)}</div>;
  const themeList=<div className="pd-progress-list">{themeRows.length?themeRows.map(row=><button type="button" key={row.name} className="pd-progress-row pd-theme-row" onClick={()=>{setFilters(f=>({...f,theme:row.name}));navigate('projects');}}><span>{row.name}</span><Bar value={filtered.length?row.value/filtered.length*100:0} color="var(--pd-green)"/><strong>{number(row.value,lang)}</strong></button>):<Empty>{c.noProjects}</Empty>}</div>;
  return <div className="pub-root pd-root">
    <aside className={`pd-sidebar${menuOpen?' open':''}`}>
      <div className="pd-brand"><img src={CREST} alt="Vanuatu coat of arms"/><div><span>Republic of Vanuatu</span><strong>Department of<br/>Climate Change</strong><small>Our Islands. Our Future.</small></div></div>
      <nav className="pd-navigation" aria-label={c.dashboard}>{nav.map(([key,label,Icon])=><button key={key} type="button" className={tab===key?'active':''} onClick={()=>navigate(key)}><Icon size={18} aria-hidden="true"/><span>{label}</span></button>)}</nav>
      <div className="pd-sidebar-foot"><span>{c.publicOnly}</span><Link to="/login">{c.login}<ArrowRight size={13}/></Link></div>
    </aside>
    {menuOpen&&<button className="pd-menu-overlay" type="button" aria-label={c.close} onClick={()=>setMenuOpen(false)}/>}
    <main className="pd-main"><header className="pd-header"><button type="button" className="pd-menu-button" aria-label={c.dashboard} onClick={()=>setMenuOpen(v=>!v)}><Menu size={20}/></button><div className="pd-heading"><h1>{c.title}</h1><p>Republic of Vanuatu <span> | </span> Department of Climate Change</p><small>{c.subtitle}</small></div><div className="pd-header-actions"><div className="pd-search"><span aria-hidden="true">⌕</span><input aria-label={c.search} placeholder={c.search} value={filters.search} onChange={e=>setFilters(f=>({...f,search:e.target.value}))}/></div><div className="pd-language"><button type="button" className={lang==='en'?'active':''} onClick={()=>void i18n.changeLanguage('en')}>EN</button><button type="button" className={lang==='fr'?'active':''} onClick={()=>void i18n.changeLanguage('fr')}>FR</button></div></div></header>
      <div className="pd-content"><div className="pd-toolbar"><div className="pd-filter-controls"><label><span>{c.province}</span><select value={filters.province} onChange={e=>setFilters(f=>({...f,province:e.target.value}))}><option value="">{c.allProvinces}</option>{PROVINCES.map(p=><option key={p}>{p}</option>)}</select></label><label><span>{c.theme}</span><select value={filters.theme} onChange={e=>setFilters(f=>({...f,theme:e.target.value}))}><option value="">{c.allThemes}</option>{themes.map(t=><option key={t}>{t}</option>)}</select></label>{(filters.search||filters.province||filters.theme)&&<button type="button" className="pd-clear" onClick={()=>setFilters(initialFilters)}>{c.clear}</button>}</div><button type="button" className="pd-refresh" onClick={()=>setReload(n=>n+1)} disabled={loading}>{c.refresh}</button></div>
      {error?<div className="pd-load-state" role="alert">{c.error}<button type="button" onClick={()=>setReload(n=>n+1)}>{c.retry}</button></div>:loading?<div className="pd-load-state" role="status">{c.loading}</div>:<>
        {tab==='overview'&&<><div className="pd-kpi-grid">{kpis.map(([label,value,sub,Icon])=><Kpi key={label} label={label} value={value} sub={sub} Icon={Icon}/>)}</div><div className="pd-dashboard-grid"><div className="pd-column"><Panel title={c.projectsByProvince} action={<Action onClick={()=>navigate('projects')}>{c.viewAll}</Action>}>{provinceList}<div className="pd-panel-summary"><span><strong>{number(filtered.length,lang)}</strong>{c.totalProjects}</span><span><strong>{provinceCounts.filter(p=>p.value>0).length} / 6</strong>{c.provinces}</span></div></Panel><Panel title={c.projectStatus}><StatusChart rows={statusRows} c={c}/></Panel></div><div className="pd-column"><Panel title={c.coverage} className="pd-map-panel" action={<Action onClick={()=>navigate('map')}>{c.viewMap}</Action>}><PublicCoverageMap areas={filteredAreas}/></Panel><Panel title={c.impacts}><div className="pd-impact-grid"><div><strong>{number(beneficiaries,lang)}</strong><span>{c.beneficiaries}</span></div><div><strong>{number(communities,lang)}</strong><span>{c.communities}</span></div><div><strong>{allScope&&ecosystems!=null?`${number(ecosystems,lang)} ha`:'—'}</strong><span>{c.ecosystems}</span></div><div><strong>{percent(allScope?summary?.overall_progress_pct:null)}</strong><span>{c.progress}</span></div></div></Panel></div><div className="pd-column"><Panel title={c.themes} action={<Action onClick={()=>navigate('results')}>{c.viewAll}</Action>}>{themeList}</Panel><Panel title={c.updates} action={<Action onClick={()=>navigate('projects')}>{c.viewAll}</Action>}>{published.length?<div className="pd-updates">{published.slice(0,5).map(p=><button type="button" key={p.id} onClick={()=>openProject(p)}><strong>{p.name}</strong><span>{percent(p.progress_pct)} {c.progress.toLowerCase()}</span><small>{p.last_published_period||''}</small></button>)}</div>:<Empty>{c.noUpdates}</Empty>}</Panel></div></div></>}
        {tab==='projects'&&<Panel title={selected?c.details:c.allProjects} action={selected?<Action onClick={()=>setSelected(null)}>{c.back}</Action>:<span className="pd-count">{countText(filtered.length,c)}</span>}>{selected?<div className="pd-detail"><span className="pd-detail-code">{selected.code||selected.acronym||''}</span><h2>{selected.name}</h2><p>{selected.description||selected.expected_primary_outcome||c.noData}</p><div className="pd-detail-grid"><div><span>{c.status}</span><strong>{nameOf(selected.lifecycle_status)||'—'}</strong></div><div><span>{c.progress}</span><strong>{percent(selected.progress_pct)}</strong></div><div><span>{c.budget}</span><strong>{money(selected.budget_vuv,lang)}</strong></div><div><span>{c.province}</span><strong>{projectProvinces(selected).join(', ')||c.national}</strong></div><div><span>{c.theme}</span><strong>{projectTheme(selected)||'—'}</strong></div><div><span>{c.publishedPeriod}</span><strong>{selected.last_published_period||'—'}</strong></div></div><h3>{c.outcome}</h3><p>{selected.expected_primary_outcome||c.noData}</p><div className="pd-disclosure">{c.publicNote}</div></div>:projectList}</Panel>}
        {tab==='results'&&<div className="pd-section-grid"><Panel title={c.resultsSummary}><div className="pd-kpi-grid pd-results-kpis"><Kpi label={c.beneficiaries} value={number(beneficiaries,lang)} sub={c.published} Icon={Target}/><Kpi label={c.progress} value={percent(allScope?summary?.overall_progress_pct:null)} sub={c.published} Icon={Activity}/></div><div className="pd-disclosure">{c.noFake}</div></Panel><Panel title={c.themes}>{themeList}</Panel><Panel title={c.projectProgress||c.progress}>{published.length?published.map(p=><ProjectRow key={p.id} p={p} c={c} lang={lang} onClick={()=>openProject(p)}/>):<Empty>{c.noProgress}</Empty>}</Panel></div>}
        {tab==='map'&&<div className="pd-section-grid"><Panel title={c.coverage}><div className="pd-map-large"><PublicCoverageMap areas={filteredAreas}/></div></Panel><Panel title={c.projectsByProvince}>{provinceList}</Panel><Panel title={c.areaCouncils}><div className="pd-area-list">{filteredAreas.length?filteredAreas.map(a=><div key={`${a.province}-${a.area_council}`}><span><strong>{a.area_council}</strong><small>{a.province}</small></span><strong>{number(a.project_count,lang)}</strong></div>):<Empty>{c.noData}</Empty>}</div></Panel></div>}
        {tab==='reports'&&<Panel title={c.reportInformation}><Empty>{c.noReports}</Empty><div className="pd-disclosure">{c.publicNote}</div></Panel>}
        <div className="pd-footer"><span>{c.sourceNote}</span><span>{c.lastUpdated}: {summary?.updated_at?new Date(summary.updated_at).toLocaleDateString(lang==='fr'?'fr-FR':'en-GB'):'—'}</span></div>
      </>}
      </div></main>
  </div>;
}
