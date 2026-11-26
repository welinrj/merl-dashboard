import StatusBadge from '../components/ui/StatusBadge';
import { isCompletedProject } from '../lib/docc/projectScope';
import { IslandLoading, IslandLogo } from '../components/IslandBrand';
import { OverviewIcon, ProjectsIcon, FundingIcon, FundsUsedIcon, BeneficiariesIcon, BudgetUsageIcon, ForestsIcon, UpdateProgressIcon, AdaptationIcon, LossDamageIcon } from '../components/ui/MerlIcons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBuildingWheat,
  faCloudBolt,
  faLandmark,
  faListCheck,
  faMoneyBillTrendUp,
  faScrewdriverWrench,
  faShapes,
  faTree,
  faUsers,
  faUsersRays,
} from '@fortawesome/free-solid-svg-icons';
import { Activity, LayoutDashboard, MapPin, Menu, Pause, Play, Wallet } from '../components/ui/icons';
import { FeatureCardGradient } from '../components/ui/feature-section-with-card-gradient';
import { IndicatorProgressCard } from '../components/ui/indicator-progress-card';
import PublicTargetAchievement from '../components/PublicTargetAchievement';
import PublicHeaderLogin from '../components/PublicHeaderLogin';
import HeaderPartnerLogos from '../components/HeaderPartnerLogos';
import PublicCoverageMap from '../components/PublicCoverageMap';
import MetricInformation from '../components/MetricInformation';
import { PublishedProjectProgress } from '../components/ProjectProgressOverview';
import { fundingCoverage, comparableFinancialUtilisation } from '../lib/dataCoverage';
import { publicTargetProgress } from '../lib/publicTargetProgress';
import { usePublicSnapshot, publicTotals } from '../lib/publicSnapshot';
import { toVuv } from '../lib/docc/currency';
import { PROVINCES } from '../lib/publicProvinces';
import { aggregateIndicatorCategories, projectThemes, scopePublicAreas } from '../lib/publicPortfolioCategories';
import './public-dashboard.css';

const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
const INDICATOR_CATEGORY_ICONS = Object.freeze({
  ecosystems: faTree,
  livelihoods: faBuildingWheat,
  'climate-risk': faCloudBolt,
  infrastructure: faScrewdriverWrench,
  governance: faLandmark,
  capacity: faUsersRays,
  finance: faMoneyBillTrendUp,
  'learning-delivery': faListCheck,
  beneficiaries: faUsers,
  other: faShapes,
});
const COPY = {
  en: {
    title: 'Public Overview', subtitle: 'Department of Climate Change project portfolio', overview: 'Public Overview',
    search: 'Search projects…', status: 'Status', theme: 'Theme', province: 'Province', all: 'All', reset: 'Reset', filters: 'Filters',
    refresh: 'Refresh', refreshing: 'Checking for updates…', projects: 'DoCC Projects', singleProject: 'DoCC Project', projectCount: 'Projects under the Department of Climate Change', filteredProjectCount: 'Projects matching the selected filters',
    funding: 'Recorded Project Funding', fundingSub: 'All recorded project budgets converted to VUV using Reserve Bank of Vanuatu rates dated 25 Sep 2026', utilised: 'Funds Utilised', utilisedSub: 'Latest approved cumulative expenditure',
    beneficiaries: 'Total Beneficiaries', beneficiariesSub: 'Direct beneficiaries from approved reports', utilisation: 'Financial Utilisation',
    utilisationSub: 'Approved expenditure as a share of recorded budgets', portfolio: 'Project portfolio', portfolioIntro: 'Projects coordinated by the Department of Climate Change and the information currently recorded for public view.',
    locations: 'Where projects are implementing activities', locationsIntro: 'Recorded provinces and Area Councils for projects in the selected view.',
    activityAreas: 'What project indicators cover', activityAreasIntro: 'Select a category to see its recorded activities, targets and implementing projects.',
    indicator: 'indicator', indicators: 'indicators', inProject: 'in 1 project', inProjects: 'across {count} projects', noIndicators: 'No indicators are recorded for this selection.',
    activity: 'Activity / indicator', target: 'Target', implementingProject: 'Implementing project', noTarget: 'Not recorded', expandCategory: 'View activities and targets', collapseCategory: 'Hide activities and targets',
    activityCategoryLabels: {ecosystems:'Ecosystems & nature-based solutions',livelihoods:'Livelihoods, food & agriculture','climate-risk':'Climate information & disaster risk',infrastructure:'Infrastructure & technology',governance:'Governance, policy & planning',capacity:'Capacity, awareness & inclusion',finance:'Climate finance & fund systems','learning-delivery':'Learning, monitoring & project delivery',beneficiaries:'Beneficiaries & resilience outcomes',other:'Other recorded outcomes'},
    manager: 'Project Manager', implementation: 'All recorded implementation locations', budget: 'Project funding', spent: 'Utilised',
    reached: 'Beneficiaries', outcome: 'Expected outcome', noDescription: 'Project information has not yet been recorded.', unknown: 'Not recorded',
    noFinance: 'Not yet reported', noProjects: 'No projects match these filters.', noLocations: 'No Area Council assignments are recorded for this selection. Province coverage may still be recorded.',
    areaCouncils: 'Area Councils', clearArea: 'Clear area selection', selectedArea: 'Showing projects recorded in', pauseAreaScroll: 'Pause', resumeAreaScroll: 'Resume',
    publicOnly: 'Public overview', source: 'Project profiles and implementation locations come from the DoCC MERL project register. Beneficiary and expenditure figures are shown only from approved reporting periods.',
    updated: 'Data refreshed', ongoing: 'Ongoing', completed: 'Completed', upcoming: 'Upcoming', other: 'Other',
    language: 'Language', menu: 'Open menu', close: 'Close menu', error: 'Public project information is temporarily unavailable.',
    stale: 'Could not check for updates. The last successfully loaded information remains displayed.', retry: 'Retry', loading: 'Loading public overview…',
  },
  fr: {
    title: 'Vue publique', subtitle: 'Portefeuille de projets du Département du changement climatique', overview: 'Vue publique',
    search: 'Rechercher des projets…', status: 'État', theme: 'Thème', province: 'Province', all: 'Tous', reset: 'Réinitialiser', filters: 'Filtres',
    refresh: 'Actualiser', refreshing: 'Recherche de mises à jour…', projects: 'Projets du DoCC', singleProject: 'Projet du DoCC', projectCount: 'Projets relevant du Département du changement climatique', filteredProjectCount: 'Projets correspondant aux filtres sélectionnés',
    funding: 'Financement enregistré des projets', fundingSub: 'Tous les budgets enregistrés sont convertis en VUV selon les taux de la Banque de Réserve du Vanuatu du 25 sept. 2026', utilised: 'Fonds utilisés', utilisedSub: 'Dernières dépenses cumulées approuvées',
    beneficiaries: 'Total des bénéficiaires', beneficiariesSub: 'Bénéficiaires directs issus des rapports approuvés', utilisation: 'Utilisation financière',
    utilisationSub: 'Dépenses approuvées en proportion des budgets enregistrés', portfolio: 'Portefeuille de projets', portfolioIntro: 'Projets coordonnés par le Département du changement climatique et informations actuellement enregistrées pour le public.',
    locations: 'Où les projets mettent en œuvre des activités', locationsIntro: 'Provinces et conseils de zone enregistrés pour les projets sélectionnés.',
    activityAreas: 'Domaines couverts par les indicateurs', activityAreasIntro: 'Sélectionnez une catégorie pour voir les activités, les cibles et les projets de mise en œuvre.',
    indicator: 'indicateur', indicators: 'indicateurs', inProject: 'dans 1 projet', inProjects: 'dans {count} projets', noIndicators: 'Aucun indicateur n’est enregistré pour cette sélection.',
    activity: 'Activité / indicateur', target: 'Cible', implementingProject: 'Projet de mise en œuvre', noTarget: 'Non renseignée', expandCategory: 'Voir les activités et les cibles', collapseCategory: 'Masquer les activités et les cibles',
    activityCategoryLabels: {ecosystems:'Écosystèmes et solutions fondées sur la nature',livelihoods:'Moyens de subsistance, alimentation et agriculture','climate-risk':'Information climatique et risques de catastrophe',infrastructure:'Infrastructures et technologie',governance:'Gouvernance, politiques et planification',capacity:'Capacités, sensibilisation et inclusion',finance:'Finance climatique et systèmes de fonds','learning-delivery':'Apprentissage, suivi et mise en œuvre',beneficiaries:'Bénéficiaires et résultats de résilience',other:'Autres résultats enregistrés'},
    manager: 'Chef de projet', implementation: 'Tous les lieux de mise en œuvre enregistrés', budget: 'Financement du projet', spent: 'Utilisé',
    reached: 'Bénéficiaires', outcome: 'Résultat attendu', noDescription: 'Les informations du projet ne sont pas encore enregistrées.', unknown: 'Non renseigné',
    noFinance: 'Pas encore déclaré', noProjects: 'Aucun projet ne correspond à ces filtres.', noLocations: 'Aucune affectation à un conseil de zone n’est enregistrée pour cette sélection. Des provinces peuvent être renseignées.',
    areaCouncils: 'Conseils de zone', clearArea: 'Effacer la sélection de zone', selectedArea: 'Projets enregistrés à', pauseAreaScroll: 'Suspendre', resumeAreaScroll: 'Reprendre',
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
const projectCurrency = value => String(value || 'VUV').trim().toUpperCase() || 'VUV';
const money = (value, currency, lang, fallback = '—') => {
  if (!finite(value)) return fallback;
  const code = projectCurrency(currency);
  if (code === 'VUV') return `VT ${num(value, lang)}`;
  try {
    return new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
      style: 'currency', currency: code, maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return `${code} ${num(value, lang)}`;
  }
};
const recordedMoney = (value, currency, lang, fallback = '—') => {
  const converted = toVuv(value, currency);
  return converted != null && Number.isFinite(Number(converted)) && Number(converted) >= 0 ? money(converted, 'VUV', lang, fallback) : fallback;
};
const moneyTotals = (projects, field, lang, fallback = '—') => {
  let hasValue = false;
  let totalVuv = 0;
  for (const project of projects) {
    const converted = toVuv(project?.[field], project?.currency);
    if (converted == null || !Number.isFinite(Number(converted)) || Number(converted) < 0) continue;
    hasValue = true;
    totalVuv += converted;
  }
  return hasValue ? money(totalVuv, 'VUV', lang) : fallback;
};
const list = value => Array.isArray(value) ? value : [];
const themesOf = projectThemes;
const themeOf = project => themesOf(project).join(', ');
const statusOf = project => isCompletedProject(project)
  ? 'completed'
  : ['ongoing', 'upcoming'].includes(project.lifecycle_status) ? project.lifecycle_status : 'other';
const initialFilters = { search: '', status: '', theme: '', province: '' };

const METRIC_ICONS = { projects: OverviewIcon, funding: FundingIcon, utilised: FundsUsedIcon, beneficiaries: BeneficiariesIcon, rate: BudgetUsageIcon };
function Metric({ label, value, detail, stamp, french, tone = '' }) {
  const [open,setOpen]=useState(false);
  const Icon = METRIC_ICONS[tone] || OverviewIcon;
  return <article className={`pbd-metric island-metric ${tone}`}><div className="merl-metric-head"><span className="merl-card-icon"><Icon size={30} /></span><span>{label}</span><button type="button" className="pbd-metric-info" onClick={()=>setOpen(true)} aria-label={`${french?'À propos de':'About'} ${label}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg></button></div><strong>{value}</strong><small>{stamp}</small>{open&&<MetricInformation label={label} value={value} detail={detail} stamp={stamp} french={french} onClose={()=>setOpen(false)}/>}</article>;
}

// Use the existing public indicator categories, not climate policy themes or
// status colours. The remaining portion of the chart is deliberately neutral.
const TARGET_CATEGORY_COLORS = {
  ecosystems:'#19805d', livelihoods:'#a46716', 'climate-risk':'#2463c7',
  infrastructure:'#397b93', governance:'#7651b5', capacity:'#b25378',
  finance:'#1d6f8f', 'learning-delivery':'#596b83', beneficiaries:'#c5543d',
  other:'#7a6d60', undisclosed:'#94a3b8'
};
// Public names are read only from the published indicator detail snapshot.
function ThematicIndicatorNames({ records, lang, copy, showProject = true, achievedOnly = false }) {
  const fr=lang==='fr';
  const unique=[...new Map(records.filter(d=>d.indicator_id).map(d=>[d.indicator_id,d])).values()];
  const visible=unique.filter(d=>!achievedOnly||d.final_target_attained===true);
  const sorted=[...visible].sort((a,b)=>String(a.project_name||'').localeCompare(String(b.project_name||''))||String(a.indicator_code||'').localeCompare(String(b.indicator_code||''),undefined,{numeric:true})||String(a.indicator_name||'').localeCompare(String(b.indicator_name||'')));
  if(!sorted.length)return <p style={{fontSize:'.8rem',color:'#526476',margin:'.45rem 0'}}>{achievedOnly?(fr?'Aucune cible atteinte publiée dans cette catégorie.':'No achieved targets published in this category.'):(fr?'Aucun intitulé publié.':'No published indicator names available.')}</p>;
  return <ul style={{listStyle:'none',padding:0,margin:'.45rem 0',display:'grid',gap:'.55rem'}}>
    {sorted.map(d=>{
      const attained=d.final_target_attained;
      const status=attained===true?(fr?'Atteinte':'Achieved'):attained===false?(fr?'Évaluée, non atteinte':'Assessed, not achieved'):(fr?'Non évaluée':'Not assessed');
      const target=d.target_text||(finite(d.target_value)?`${num(d.target_value,lang)}${d.unit?' '+d.unit:''}`:copy.noTarget);
      return <li key={d.indicator_id} style={{borderTop:'1px solid #e2e8f0',paddingTop:'.55rem',overflowWrap:'anywhere'}}>
        <strong style={{display:'block',fontSize:'.83rem',lineHeight:1.45}}>{d.indicator_name||copy.unknown}</strong>
        <div style={{display:'flex',flexWrap:'wrap',gap:'.2rem .65rem',fontSize:'.75rem',color:'#526476',marginTop:'.2rem'}}>
          {d.indicator_code&&<span>{d.indicator_code}</span>}{showProject&&d.project_name&&<span>{d.project_name}</span>}
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:'.25rem .75rem',fontSize:'.75rem',marginTop:'.25rem'}}>
          <span>{copy.target}: {target}</span><span style={{fontWeight:600,color:attained===true?'#15803d':'#526476'}}>{status}</span>
        </div>
      </li>;
    })}
  </ul>;
}

function PublicProgressChart({ projects, details, lang, copy, onProject }) {
  const fr = lang === 'fr';
  const n = value => new Intl.NumberFormat(fr ? 'fr-FR' : 'en-GB', {maximumFractionDigits:1}).format(value);
  const labels = {...copy.activityCategoryLabels, undisclosed:fr?'Catégorie non publiée':'Category not published'};
  const keys=Object.keys(TARGET_CATEGORY_COLORS);
  const rows=projects.map(project=>{
    const model=publicTargetProgress(project), categories={};
    const seen=new Set();
    const records=details.filter(d=>String(d.project_id)===String(project.id));
    let categorized=0, assessed=0, achieved=0;
    for(const d of records){
      if(!d.indicator_id||seen.has(d.indicator_id))continue;
      seen.add(d.indicator_id);
      const k=keys.includes(d.category_key)&&d.category_key!=='undisclosed'?d.category_key:'other';
      const v=categories[k] ||= {total:0,assessed:0,achieved:0};
      v.total++;categorized++;
      if(typeof d.final_target_attained==='boolean'){v.assessed++;assessed++;}
      if(d.final_target_attained===true){v.achieved++;achieved++;}
    }
    const complete=records.every(d=>Object.prototype.hasOwnProperty.call(d,'final_target_attained'));
    const residual={total:model.total-categorized,assessed:model.assessed-assessed,achieved:model.achieved-achieved};
    const valid=model.total!=null&&complete&&residual.total>=0&&residual.assessed>=0&&residual.achieved>=0&&residual.achieved<=residual.assessed&&residual.assessed<=residual.total;
    if(valid&&residual.total>0)categories.undisclosed=residual;
    return {project,...model,categories,valid};
  });
  const totals={};
  for(const row of rows.filter(r=>r.valid)){
    for(const [k,v] of Object.entries(row.categories)){
      const t=totals[k] ||= {total:0,assessed:0,achieved:0};
      t.total+=v.total;t.assessed+=v.assessed;t.achieved+=v.achieved;
    }
  }
  const activeKeys=keys.filter(k=>totals[k]?.total>0);
  const validProjectIds=new Set(rows.filter(r=>r.valid).map(r=>String(r.project.id)));
  const recordsFor=(k,projectId=null)=>details.filter(d=>validProjectIds.has(String(d.project_id))&&(projectId==null||String(d.project_id)===String(projectId))&&(keys.includes(d.category_key)&&d.category_key!=='undisclosed'?d.category_key:'other')===k);
  const countLabel=(v)=>`${n(v.achieved)} / ${n(v.total)} ${fr?'atteintes':'achieved'} · ${n(v.assessed)} ${fr?'évaluées':'assessed'}`;
  const percent=(v)=>v.total>0&&v.assessed>0?n(v.achieved/v.total*100)+'%':'—';
  const bar=(segments,denominator,accessible)=> <div role="img" aria-label={accessible} style={{display:'flex',height:22,borderRadius:5,overflow:'hidden',background:'#e2e8f0'}}>
    {segments.map(([k,value])=>value>0&&<span key={k} title={`${labels[k]}: ${n(value)}`} style={{width:`${value/denominator*100}%`,background:TARGET_CATEGORY_COLORS[k]}}/>)}
  </div>;
  if(!rows.length)return null;
  return <div className="pbd-theme-progress-chart" style={{margin:'0 0 1rem',border:'1px solid #d4dfe6',borderRadius:12,padding:'clamp(.75rem,2vw,1.25rem)',background:'#fff',fontFamily:'Arial, sans-serif',minWidth:0}}>
    <h3 style={{margin:'0 0 .35rem',fontSize:'1rem',color:'#173e59'}}>{fr?'Cibles atteintes par domaine thématique':'Targets achieved by thematic area'}</h3>
    <p style={{fontSize:'.85rem',color:'#526476',margin:'0 0 .9rem'}}>{fr?'Les couleurs correspondent aux catégories des indicateurs. La partie grise claire représente les cibles non atteintes ou non évaluées.':'Colours match the indicator categories below. Light grey represents targets not yet achieved or not assessed. Only approved, published assessments are used.'}</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem 1rem',fontSize:'.8rem',marginBottom:'1rem'}}>{activeKeys.map(k=><span key={k} style={{display:'inline-flex',alignItems:'center',gap:'.35rem'}}><i aria-hidden="true" style={{width:12,height:12,borderRadius:2,background:TARGET_CATEGORY_COLORS[k]}}/>{labels[k]}</span>)}</div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,300px),1fr))',gap:'.8rem',marginBottom:'1.2rem'}}>
      {activeKeys.map(k=>{const v=totals[k];return <section key={k} style={{border:'1px solid #dce5eb',borderLeft:`4px solid ${TARGET_CATEGORY_COLORS[k]}`,borderRadius:8,padding:'.75rem',minWidth:0}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:'.75rem',alignItems:'baseline'}}><strong style={{fontSize:'.85rem'}}>{labels[k]}</strong><strong>{percent(v)}</strong></div>
        <div style={{margin:'.55rem 0'}}>{bar([[k,v.achieved]],v.total,`${labels[k]}: ${countLabel(v)}`)}</div>
        <small style={{color:'#526476'}}>{countLabel(v)}</small>
        {k==='undisclosed'?<p style={{fontSize:'.8rem',color:'#526476'}}>{fr?'Les intitulés de ces indicateurs ne sont pas publics.':'Indicator names in this group are not publicly available.'}</p>:<>
          {v.achieved>0&&<div style={{marginTop:'.6rem'}}><strong style={{fontSize:'.8rem'}}>{fr?'Indicateurs atteints':'Achieved indicators'}</strong><ThematicIndicatorNames records={recordsFor(k)} lang={lang} copy={copy} achievedOnly /></div>}
          <details style={{marginTop:'.6rem'}}><summary style={{cursor:'pointer',fontSize:'.8rem',fontWeight:600,color:'#173e59'}}>{fr?'Voir tous les indicateurs':'View all indicator names'} ({n(v.total)})</summary><ThematicIndicatorNames records={recordsFor(k)} lang={lang} copy={copy}/></details>
        </>}
      </section>;})}
    </div>
    <h3 style={{margin:'0 0 .5rem',fontSize:'1rem',color:'#173e59'}}>{fr?'Contribution thématique par projet':'Thematic achievement by project'}</h3>
    {rows.map(row=><div key={row.project.id} style={{padding:'.8rem 0',borderTop:'1px solid #e2e8f0'}}>
      <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:'.4rem',alignItems:'baseline'}}>
        <button type="button" onClick={()=>onProject(row.project.id)} style={{textAlign:'left',font:'inherit',fontWeight:700,color:'#173e59',border:0,background:'transparent',padding:0,cursor:'pointer',overflowWrap:'anywhere',flex:'1 1 220px'}}>{row.project.acronym||row.project.code||row.project.name}<small style={{display:'block',fontWeight:400,color:'#526476',fontSize:'.8rem'}}>{row.project.name}</small></button>
        <strong>{row.pct==null?'—':n(row.pct)+'%'}</strong>
      </div>
      {row.valid&&row.total>0?<><div style={{margin:'.45rem 0'}}>{bar(keys.map(k=>[k,row.categories[k]?.achieved||0]),row.total,`${row.project.name}: ${countLabel(row)}`)}</div>
        <small style={{color:'#526476'}}>{countLabel(row)}</small>
        <div style={{display:'flex',flexWrap:'wrap',gap:'.35rem .8rem',marginTop:'.4rem',fontSize:'.78rem'}}>{keys.filter(k=>row.categories[k]?.total>0).map(k=><span key={k} style={{display:'inline-flex',alignItems:'center',gap:'.25rem'}}><i aria-hidden="true" style={{width:9,height:9,borderRadius:2,background:TARGET_CATEGORY_COLORS[k]}}/>{labels[k]}: {n(row.categories[k].achieved)}/{n(row.categories[k].total)}</span>)}</div>
        <details style={{marginTop:'.6rem'}}><summary style={{cursor:'pointer',fontSize:'.85rem',fontWeight:600,color:'#173e59'}}>{fr?'Voir les indicateurs de ce projet':'View project indicator names'}</summary>
          {keys.filter(k=>row.categories[k]?.total>0).map(k=><section key={k} style={{borderLeft:`3px solid ${TARGET_CATEGORY_COLORS[k]}`,paddingLeft:'.65rem',margin:'.75rem 0'}}>
            <strong style={{fontSize:'.85rem'}}>{labels[k]} · {n(row.categories[k].achieved)}/{n(row.categories[k].total)}</strong>
            {k==='undisclosed'?<p style={{fontSize:'.8rem',color:'#526476'}}>{fr?'Intitulés non publics.':'Indicator names not publicly available.'}</p>:<ThematicIndicatorNames records={recordsFor(k,row.project.id)} lang={lang} copy={copy} showProject={false}/>}
          </section>)}
        </details>
      </>:<p style={{fontSize:'.85rem',color:'#526476'}}>{row.total===0?(fr?'Cadre de résultats non disponible':'Results framework unavailable'):(fr?'Ventilation thématique indisponible':'Thematic breakdown unavailable')}</p>}
    </div>)}
    <p style={{fontSize:'.8rem',color:'#526476',margin:'.8rem 0 0'}}>{fr?'Les cibles dont la catégorie n’est pas publique sont présentées séparément, sans déduire leur thème. Un tiret indique une absence d’évaluation.':'Targets without a publicly available category are shown separately, without inferring a theme. A dash means no assessment is available. Percentages use all recorded final targets, not just assessed targets.'}</p>
  </div>;
}

function ProjectCard({ project, areas, copy, lang }) {
  const projectAreas = areas.filter(area => list(area.project_ids).some(id => String(id) === String(project.id)));
  const ThemeIcon = /loss.*damage/i.test(themeOf(project)) ? LossDamageIcon : /adaptation/i.test(themeOf(project)) ? AdaptationIcon : null;
  const places = [...new Set([...list(project.provinces), ...projectAreas.map(area => area.area_council).filter(Boolean)])];
  return <FeatureCardGradient id={`public-project-${project.id}`} tabIndex={-1} className="pbd-project-card">
    <header><div className="pbd-project-identity">{project.docc_image_url && <img className="pbd-project-image" src={project.docc_image_url} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true; }} />}<div><span className="pbd-project-code">{project.code || project.acronym || copy.projects}</span><h3>{project.name}</h3></div></div><StatusBadge className={`pbd-status pbd-status-${statusOf(project)}`} label={copy[statusOf(project)]} tone={statusOf(project) === 'upcoming' ? 'warning' : statusOf(project) === 'other' ? 'neutral' : 'success'} /></header>
    <PublishedProjectProgress project={project} lang={lang}/>
    <details className="pbd-project-information">
      <summary>{lang === 'fr' ? 'Informations sur le projet' : 'Project information'}</summary>
    {project.description && project.description !== project.expected_primary_outcome
      ? <p className="pbd-project-description">{project.description}</p>
      : !project.expected_primary_outcome && <p className="pbd-project-description">{copy.noDescription}</p>}
    <dl className="pbd-project-facts">
      <div><dt>{copy.manager}</dt><dd>{project.project_manager || copy.unknown}</dd></div>
      <div><dt>{copy.implementation}</dt><dd>{places.length ? places.join(', ') : copy.unknown}</dd></div>
      <div><dt>{copy.budget}</dt><dd>{recordedMoney(project.budget_vuv, project.currency, lang, copy.unknown)}</dd></div>
      <div><dt>{copy.spent}</dt><dd>{recordedMoney(project.cumulative_expenditure_vuv, project.currency, lang, copy.noFinance)}{finite(project.utilisation_pct) ? ` · ${pct(project.utilisation_pct)}` : ''}</dd></div>
      <div><dt>{copy.reached}</dt><dd>{project.published_beneficiaries != null ? num(project.published_beneficiaries, lang) : copy.noFinance}</dd></div>
      <div><dt>{copy.theme}</dt><dd>{ThemeIcon && <ThemeIcon size={16} style={{ marginRight: 4 }} />}{themesOf(project).map(theme => lang === 'fr' ? ({'Loss and Damage':'Pertes et préjudices',Mitigation:'Atténuation'}[theme] || theme) : theme).join(', ') || copy.unknown}</dd></div>
    </dl>
    {project.expected_primary_outcome && <div className="pbd-project-outcome"><strong>{copy.outcome}</strong><p>{project.expected_primary_outcome}</p></div>}
    </details>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [autoAreaIndex, setAutoAreaIndex] = useState(0);
  const [areaScrollPaused, setAreaScrollPaused] = useState(false);
  const [areaScrollHover, setAreaScrollHover] = useState(false);
  const [reduceAreaMotion, setReduceAreaMotion] = useState(false);
  const areaListRef = useRef(null);
  const allProjects = data?.projects || [];
  const projects = allProjects.filter(project => !isCompletedProject(project));
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
  const totals = publicTotals(filtered, summary, allScope && projects.length === allProjects.length);
  const fundingTotal = moneyTotals(filtered, 'budget_vuv', lang);
  const utilisedTotal = moneyTotals(filtered, 'cumulative_expenditure_vuv', lang, c.noFinance);
  const comparableUtilisation = comparableFinancialUtilisation(filtered);
  const selectedIds = new Set(filtered.map(project => String(project.id)));
  const visibleAreas = scopePublicAreas(sourceAreas, filtered, filters.province);
  const visibleAreaKey = visibleAreas.map(area => `${area.province}:${area.area_council}`).join('|');
  const areaScrollStopped = areaScrollPaused || areaScrollHover || reduceAreaMotion;
  const indicatorCategories = aggregateIndicatorCategories(sourceIndicatorCategories, selectedIds);
  const indicatorTotal = indicatorCategories.reduce((sum, category) => sum + category.indicatorCount, 0);
  const visibleIndicatorDetails = sourceIndicatorDetails.filter(row => selectedIds.has(String(row.project_id)));
  const activeCategory = indicatorCategories.find(category => category.key === openCategory);
  const activeDetails = activeCategory ? visibleIndicatorDetails.filter(row => row.category_key === activeCategory.key) : [];
  const stamp = summary?.updated_at ? `${c.updated}: ${new Date(summary.updated_at).toLocaleDateString(lang==='fr'?'fr-FR':'en-GB')}` : (lang==='fr'?'Date de mise à jour non renseignée':'Refresh date not recorded');
  const coveredStamp = known => known<filtered.length ? `${lang==='fr'?'Données':'Coverage'}: ${known}/${filtered.length} · ${stamp}` : stamp;
  const metricRows = [
    {tone:'projects',label:c.projects,value:num(filtered.length,lang),detail:allScope?c.projectCount:c.filteredProjectCount},
    {tone:'funding',label:c.funding,value:fundingTotal,stamp:coveredStamp(fundingCoverage(filtered).known),detail:`${fundingCoverage(filtered).known} / ${filtered.length} ${lang==='fr'?'projets avec un financement renseigné':'projects with recorded funding'}. ${c.fundingSub}`},
    {tone:'utilised',label:c.utilised,value:utilisedTotal,stamp:coveredStamp(filtered.filter(p=>finite(p.cumulative_expenditure_vuv)).length),detail:c.utilisedSub},
    {tone:'beneficiaries',label:c.beneficiaries,stamp:coveredStamp(filtered.filter(p=>finite(p.published_beneficiaries)).length),value:totals.beneficiaries==null?c.noFinance:num(totals.beneficiaries,lang),detail:c.beneficiariesSub},
    {tone:'rate',label:c.utilisation,value:pct(comparableUtilisation),detail:c.utilisationSub},
  ];
  const viewProject=id=>{requestAnimationFrame(()=>{const card=document.getElementById(`public-project-${id}`);card?.scrollIntoView({block:'start',behavior:'auto'});card?.focus({preventScroll:true});});};
  const mapView=()=><PublicCoverageMap projectCount={filtered.length} projects={filtered} areas={visibleAreas} selectedArea={selectedArea} onAreaSelect={setSelectedArea} onViewProject={viewProject}/>;
  const reset = () => { setFilters(initialFilters); setSelectedArea(null); };
  const refresh = () => { void refetch(); };
  const chooseProvince = province => {
    setFilters(value => ({ ...value, province }));
    if (province && selectedArea?.province !== province) setSelectedArea(null);
  };

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotionPreference = () => setReduceAreaMotion(query.matches);
    syncMotionPreference();
    query.addEventListener?.('change', syncMotionPreference);
    return () => query.removeEventListener?.('change', syncMotionPreference);
  }, []);

  useEffect(() => {
    setAutoAreaIndex(0);
    areaListRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [visibleAreaKey]);

  useEffect(() => {
    if (areaScrollStopped || visibleAreas.length < 2) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setAutoAreaIndex(index => (index + 1) % visibleAreas.length);
      }
    }, 3200);
    return () => window.clearInterval(timer);
  }, [areaScrollStopped, visibleAreas.length, visibleAreaKey]);

  useEffect(() => {
    const directory = areaListRef.current;
    if (!directory || areaScrollStopped || visibleAreas.length < 2) return;
    const activeRow = directory.querySelector(`[data-area-index="${autoAreaIndex}"]`);
    if (!activeRow || directory.scrollHeight <= directory.clientHeight + 1) return;
    const maxScroll = directory.scrollHeight - directory.clientHeight;
    const rowTop = activeRow.getBoundingClientRect().top - directory.getBoundingClientRect().top + directory.scrollTop;
    const top = Math.max(0, Math.min(rowTop - (directory.clientHeight - activeRow.offsetHeight) / 2, maxScroll));
    directory.scrollTo({ top, behavior: 'smooth' });
  }, [autoAreaIndex, areaScrollStopped, visibleAreas.length]);

  return <div className="dsh pbd-root">

    {menuOpen && <button type="button" className="pbd-overlay" aria-label={c.close} onClick={() => setMenuOpen(false)} />}
    <aside className={`dsh-side${menuOpen ? ' open' : ''}`}>
      <div className="dsh-brand"><IslandLogo /><div className="dsh-brand-dept">Department of Climate Change</div><div className="dsh-brand-title">MERL Portal</div></div>
      <button type="button" className="dsh-side-close" aria-label={lang === 'fr' ? 'Fermer le menu' : 'Close menu'} onClick={() => setMenuOpen(false)}><span aria-hidden="true">×</span></button>
      <nav className="dsh-nav" aria-label={c.overview}><button type="button" className="active" onClick={() => setMenuOpen(false)}><OverviewIcon size={24} />{c.overview}</button></nav>
    </aside>
    <div className="dsh-main">
      <header className="dsh-head"><button type="button" className="dsh-hamburger" aria-label={c.menu} onClick={() => setMenuOpen(value => !value)}><Menu size={18} /></button><HeaderPartnerLogos/><div className="dsh-head-actions"><div className="dsh-lang" role="group" aria-label={c.language}><button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => void i18n.changeLanguage('en')}>EN</button><button type="button" lang="fr" aria-pressed={lang === 'fr'} onClick={() => void i18n.changeLanguage('fr')}>FR</button></div><PublicHeaderLogin/></div></header>
      <main className="dsh-scroll scrollbar-thin"><div className="pbd-view">
        <div className="pbd-title-row"><div><span className="pbd-eyebrow">{lang === 'fr' ? 'VANUATU · ACTION CLIMATIQUE' : 'VANUATU · CLIMATE ACTION'}</span><h1>{c.title}</h1><p>{c.subtitle}{summary?.updated_at && <> · {c.updated}: {new Date(summary.updated_at).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-GB')}</>}</p></div></div>
        <p className="pbd-scope-note">{data && (lang === 'fr' ? `${projects.length} projets actuels du DoCC. Les filtres portent sur ce portefeuille.` : `${projects.length} current DoCC projects. Filters apply to this portfolio.`)}</p>
        <div className={`pbd-filters${filtersOpen ? ' pbd-filters-open' : ''}`}>
          <label className="pbd-search"><span className="sr-only">{c.search}</span><input type="search" value={filters.search} onChange={event => setFilters(value => ({ ...value, search: event.target.value }))} placeholder={c.search} /></label>
          <button type="button" className="pbd-filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}>{c.filters}{!allScope && <span aria-label="active"> •</span>}</button>
          <label><span>{c.status}</span><select value={filters.status} onChange={event => setFilters(value => ({ ...value, status: event.target.value }))}><option value="">{c.all}</option>{['ongoing', 'upcoming', 'other'].map(key => <option key={key} value={key}>{c[key]}</option>)}</select></label>
          <label><span>{c.theme}</span><select value={filters.theme} onChange={event => setFilters(value => ({ ...value, theme: event.target.value }))}><option value="">{c.all}</option>{themes.map(theme => <option key={theme} value={theme}>{lang === 'fr' ? ({'Loss and Damage':'Pertes et préjudices',Mitigation:'Atténuation'}[theme] || theme) : theme}</option>)}</select></label>
          <label><span>{c.province}</span><select value={filters.province} onChange={event => chooseProvince(event.target.value)}><option value="">{c.all}</option>{PROVINCES.map(province => <option key={province}>{province}</option>)}</select></label>
          <button type="button" className="pbd-reset" disabled={allScope} onClick={reset}>{c.reset}</button><button type="button" className="pbd-refresh" disabled={isFetching} onClick={refresh}>{c.refresh}</button>
        </div>
        {isFetching && data && <div className="pbd-refresh-status" role="status">{c.refreshing}</div>}
        {isError && data && <div className="pbd-refresh-status pbd-refresh-error" role="alert">{c.stale}<button type="button" onClick={refresh}>{c.retry}</button></div>}
        {!data ? (isLoading ? <div className="pbd-state" role="status"><IslandLoading />{c.loading}</div> : <div className="pbd-state" role="alert">{c.error}<button type="button" onClick={refresh}>{c.retry}</button></div>) : <>
          {lang === 'fr' && <p className="pbd-refresh-status">Les intitulés et descriptions des projets et indicateurs sont affichés dans leur langue source lorsqu’une traduction validée n’est pas disponible.</p>}
          <section className="pbd-metrics" aria-label={c.title}>
            {metricRows.map(row=><Metric key={row.tone} {...row} stamp={row.stamp||stamp} french={lang==='fr'}/>)}
          </section>
          <details className="pbd-method-note"><summary>{lang === 'fr' ? 'À propos des chiffres' : 'About these figures'}</summary><p>{c.fundingSub}. {c.utilisedSub}. {c.beneficiariesSub}.</p></details>

          <PublicTargetAchievement projects={filtered} french={lang === 'fr'} />

          <section className="pbd-section pbd-portfolio">
            <div className="pbd-section-head"><div><h2 className="pbd-progress-summary-title"><ProjectsIcon size={20} aria-hidden="true" />{lang === 'fr' ? 'Progrès par projet' : 'Progress by project'}</h2><p>{lang === 'fr' ? 'Résumés des résultats approuvés et publiés.' : 'Approved, published result summaries.'}</p></div><strong>{num(filtered.length, lang)} {filtered.length === 1 ? c.singleProject : c.projects}</strong></div>
            <PublicProgressChart projects={filtered} details={visibleIndicatorDetails} lang={lang} copy={c} onProject={viewProject} />
            <div className="pbd-project-grid">{filtered.length ? filtered.map(project => <ProjectCard key={project.id} project={project} areas={sourceAreas} copy={c} lang={lang} />) : <div className="pbd-empty">{c.noProjects}</div>}</div>
          </section>
          <section className="pbd-section pbd-location-section">
            <div className="pbd-section-head"><div><span><MapPin size={16} aria-hidden="true" />{c.locations}</span><p>{c.locationsIntro}</p></div>{selectedArea && <button type="button" onClick={() => setSelectedArea(null)}>{c.clearArea}</button>}</div>
            {selectedArea && <div className="pbd-area-selection">{c.selectedArea} <strong>{selectedArea.area_council}, {selectedArea.province}</strong></div>}
            <div className="pbd-location-grid">
              {mapView()}
              <div className="pbd-area-directory">
                <div className="pbd-area-directory-head">
                  <h3>{c.areaCouncils}</h3>
                  {visibleAreas.length > 1 && <button type="button" className="pbd-area-scroll-toggle" aria-pressed={areaScrollPaused} onClick={() => setAreaScrollPaused(value => !value)}>{areaScrollPaused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}{areaScrollPaused ? c.resumeAreaScroll : c.pauseAreaScroll}</button>}
                </div>
                {visibleAreas.length ? <div
                  ref={areaListRef}
                  className="pbd-area-list"
                  onMouseEnter={() => setAreaScrollHover(true)}
                  onMouseLeave={() => setAreaScrollHover(false)}
                  onFocus={() => setAreaScrollHover(true)}
                  onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAreaScrollHover(false); }}
                  onTouchStart={() => setAreaScrollPaused(true)}
                >{visibleAreas.map((area, index) => <button
                  type="button"
                  key={`${area.province}-${area.area_council}`}
                  data-area-index={index}
                  className={[
                    selectedArea?.province === area.province && selectedArea?.area_council === area.area_council ? 'active' : '',
                    autoAreaIndex === index ? 'is-auto-current' : '',
                  ].filter(Boolean).join(' ')}
                  data-theme-category={area.project_count > 0 ? (area.theme_category || 'not-recorded') : undefined}
                  onClick={() => { setAreaScrollPaused(true); setSelectedArea({ province: area.province, area_council: area.area_council }); }}
                ><span className="pbd-area-copy"><strong className="pbd-area-flap" style={{ '--pbd-flap-delay': `${Math.min(index, 6) * 40}ms` }}><span className="pbd-area-flap-face">{area.area_council}</span></strong><small>{area.province}</small></span><b>{area.project_count}</b></button>)}</div> : <p>{c.noLocations}</p>}
              </div>
            </div>
          </section>

          <section className="pbd-section pbd-activity-section">
            <div className="pbd-section-head"><div><span><Activity size={16} aria-hidden="true" />{c.activityAreas}</span><p>{c.activityAreasIntro}</p></div><strong>{num(indicatorTotal, lang)} {indicatorTotal === 1 ? c.indicator : c.indicators}</strong></div>
            {indicatorCategories.length ? <><div className="pbd-activity-grid">{indicatorCategories.map(category => {
              const categoryIcon = INDICATOR_CATEGORY_ICONS[category.key] || faShapes;
              const CategoryIcon = { ecosystems: ForestsIcon, finance: FundingIcon, beneficiaries: BeneficiariesIcon, capacity: BeneficiariesIcon, 'learning-delivery': UpdateProgressIcon }[category.key];
              const indicatorLabel = category.indicatorCount === 1 ? c.indicator : c.indicators;
              const projectLabel = category.projectCount === 1 ? c.inProject : c.inProjects.replace('{count}', num(category.projectCount, lang));
              return <IndicatorProgressCard
                key={category.key}
                className={`pbd-activity-${category.key}${openCategory === category.key ? ' is-open' : ''}`}
                icon={CategoryIcon ? <CategoryIcon size={30} /> : <FontAwesomeIcon icon={categoryIcon} />}
                title={c.activityCategoryLabels[category.key] || c.activityCategoryLabels.other}
                value={num(category.indicatorCount, lang)}
                meta={`${indicatorLabel} · ${projectLabel}`}
                actionLabel={openCategory === category.key ? c.collapseCategory : c.expandCategory}
                open={openCategory === category.key}
                controls="pbd-activity-details"
                onClick={() => setOpenCategory(current => current === category.key ? null : category.key)}
              />;
            })}</div>{activeCategory && <div className="pbd-activity-details" id="pbd-activity-details"><h3>{c.activityCategoryLabels[activeCategory.key] || c.activityCategoryLabels.other} <small>({num(activeDetails.length, lang)})</small></h3><div className="pbd-activity-list">{activeDetails.map(row => <article key={row.indicator_id} className="pbd-activity-item"><div><span className="pbd-activity-label">{c.activity}</span><strong>{row.indicator_name}</strong>{row.indicator_code && <small>{row.indicator_code}</small>}</div><div><span className="pbd-activity-label">{c.target}</span><span>{row.target_text || (finite(row.target_value) ? `${num(row.target_value, lang)}${row.unit ? ` ${row.unit}` : ''}` : c.noTarget)}</span></div><div><span className="pbd-activity-label">{c.implementingProject}</span><span>{row.project_name}</span></div></article>)}</div></div>}</> : <div className="pbd-empty">{c.noIndicators}</div>}
          </section>


          <footer className="pbd-footer"><span>{c.source}</span></footer>
        </>}
      </div></main>
    </div>
  </div>;
}
