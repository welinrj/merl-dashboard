import { useEffect, useMemo, useState } from 'react';
import { loadAreaPopulation, reachAnalysis } from '../lib/areaCouncilPopulation';
import ReportNotes from './ReportNotes';
import './public-reach-analysis.css';

const COPY = {
  en: {
    title: 'Estimated population of Area Councils with project locations', intro: 'Persons and households living in the Area Councils where each indicator or activity is recorded. Estimates for 2026.',
    people: 'Persons', households: 'Households', share: 'Share of national population', councils: 'Area Councils',
    ofNational: 'of {total} nationally', view: 'Group by', byItem: 'Indicator or activity', byProject: 'Project', byCouncil: 'Area Council', category: 'Category', allCategories: 'All categories',
    activity: 'Activity', indicator: 'Indicator', councilOne: 'Area Council', councilMany: 'Area Councils', peopleShort: 'persons', hhShort: 'households', avgHh: 'persons per household',
    showCouncils: 'List councils', hideCouncils: 'Hide list', noData: 'No activities or indicators with an Area Council location are published for this selection.',
    loading: 'Loading population estimates…', unavailable: 'Population estimates are temporarily unavailable.', unmatched: '{n} Area Council name(s) could not be matched to the population table and are not counted.',
    projects: 'projects', select: 'Show on map',
    notes: [
      'Figures are for whole Area Councils where an indicator or activity is recorded. They describe the population living where a project works, not people counted as beneficiaries.',
      'Each Area Council is counted once per row and once in the totals, even when several projects or indicators are recorded there.',
      'Estimates: VNSO 2020 National Population and Housing Census counts by Area Council, projected to November 2026 as P2026 = P2020 × (1 + r)^6 using the VNSO 2009–2020 average annual growth rates (Table 1): Port Vila 1.0 %, Luganville 2.7 %; elsewhere the provincial rural rate, Torba 1.7 %, Sanma 2.3 %, Penama 1.3 %, Malampa 1.3 %, Shefa 4.0 %, Tafea 3.1 %. Households are held at the 2020 average household size.',
      'Census figures were transferred to the 2025 Area Council boundaries using the 2020 census dwelling locations. Residents of the Port Vila and Luganville municipalities outside those boundaries are not included in council figures.',
      'Prepared by the Department of Environmental Protection and Conservation GIS unit (November 2026). These are estimates, not official VNSO statistics.',
    ],
    method: 'How these figures are made', methodBody: 'Figures are the 2026 estimated population and households of the whole Area Councils where an activity or indicator is recorded. They show who lives in the places a project works, its potential reach, not people counted as beneficiaries. Each council is counted once per row, and once in the totals, even when several projects work there. Estimates: VNSO 2020 National Population and Housing Census counts projected to November 2026 as P2026 = P2020 × (1 + r)^6 with the VNSO 2009–2020 average annual growth rates (Port Vila 1.0 %, Luganville 2.7 %, provincial rural rates elsewhere: Torba 1.7, Sanma 2.3, Penama 1.3, Malampa 1.3, Shefa 4.0, Tafea 3.1 %), households at the 2020 average household size, and moved onto the 2025 Area Council boundaries using the 2020 census dwelling locations. Residents of the Port Vila and Luganville municipalities outside these boundaries are not included. These are estimates, not official VNSO statistics.',
  },
  fr: {
    title: 'Population estimée des conseils de zone avec des lieux de projet', intro: 'Personnes et ménages vivant dans les conseils de zone où chaque indicateur ou activité est enregistré. Estimations pour 2026.',
    people: 'Personnes', households: 'Ménages', share: 'Part de la population nationale', councils: 'Conseils de zone',
    ofNational: 'sur {total} au niveau national', view: 'Regrouper par', byItem: 'Indicateur ou activité', byProject: 'Projet', byCouncil: 'Conseil de zone', category: 'Catégorie', allCategories: 'Toutes les catégories',
    activity: 'Activité', indicator: 'Indicateur', councilOne: 'conseil de zone', councilMany: 'conseils de zone', peopleShort: 'personnes', hhShort: 'ménages', avgHh: 'personnes par ménage',
    showCouncils: 'Lister les conseils', hideCouncils: 'Masquer la liste', noData: 'Aucune activité ni indicateur avec un conseil de zone n’est publié pour cette sélection.',
    loading: 'Chargement des estimations de population…', unavailable: 'Les estimations de population sont temporairement indisponibles.', unmatched: '{n} nom(s) de conseil de zone non rapproché(s) du tableau de population et non comptés.',
    projects: 'projets', select: 'Voir sur la carte',
    notes: [
      'Les chiffres portent sur l’ensemble des conseils de zone où un indicateur ou une activité est enregistré. Ils décrivent la population vivant là où un projet intervient, et non des bénéficiaires comptés.',
      'Chaque conseil de zone est compté une seule fois par ligne et dans les totaux, même si plusieurs projets ou indicateurs y sont enregistrés.',
      'Estimations : recensement général de la population et de l’habitat VNSO 2020 par conseil de zone, projeté à novembre 2026 selon P2026 = P2020 × (1 + r)^6 avec les taux de croissance annuels moyens VNSO 2009–2020 (tableau 1) : Port-Vila 1,0 %, Luganville 2,7 % ; ailleurs le taux rural provincial, Torba 1,7 %, Sanma 2,3 %, Penama 1,3 %, Malampa 1,3 %, Shefa 4,0 %, Tafea 3,1 %. Les ménages sont maintenus à la taille moyenne de 2020.',
      'Les chiffres du recensement ont été reportés sur les limites 2025 des conseils de zone à l’aide des logements du recensement 2020. Les habitants des municipalités de Port-Vila et Luganville hors de ces limites ne sont pas inclus.',
      'Préparé par l’unité SIG du Département de la protection et de la conservation de l’environnement (novembre 2026). Il s’agit d’estimations, et non de statistiques officielles du VNSO.',
    ],
    method: 'Comment ces chiffres sont établis', methodBody: 'Les chiffres correspondent à la population et aux ménages estimés en 2026 de l’ensemble des conseils de zone où une activité ou un indicateur est enregistré. Ils indiquent qui vit là où un projet intervient (portée potentielle), et non des bénéficiaires comptés. Chaque conseil est compté une seule fois par ligne et dans les totaux, même si plusieurs projets y travaillent. Estimations : recensement VNSO 2020 projeté à novembre 2026 selon P2026 = P2020 × (1 + r)^6 avec les taux de croissance annuels moyens VNSO 2009–2020 (Port-Vila 1,0 %, Luganville 2,7 %, taux ruraux provinciaux ailleurs : Torba 1,7, Sanma 2,3, Penama 1,3, Malampa 1,3, Shefa 4,0, Tafea 3,1 %), ménages à la taille moyenne de 2020, puis reportés sur les limites 2025 des conseils de zone à l’aide des logements du recensement 2020. Les habitants des municipalités de Port-Vila et Luganville hors de ces limites ne sont pas inclus. Il s’agit d’estimations, et non de statistiques officielles du VNSO.',
  },
};

export default function PublicReachAnalysis({ number = '', areas = [], projects = [], categoryLabels = {}, activityLayer = '', lang = 'en', onAreaSelect }) {
  const c = COPY[lang] || COPY.en;
  const locale = lang === 'fr' ? 'fr-FR' : 'en-US';
  const num = v => new Intl.NumberFormat(locale).format(Math.round(v || 0));
  const [population, setPopulation] = useState(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState('item');
  const [category, setCategory] = useState(activityLayer || '');
  const [open, setOpen] = useState(null);
  useEffect(() => { setCategory(activityLayer || ''); }, [activityLayer]);
  useEffect(() => { let alive = true; loadAreaPopulation().then(d => alive && setPopulation(d)).catch(() => alive && setFailed(true)); return () => { alive = false; }; }, []);

  const projectName = useMemo(() => new Map(projects.map(p => [String(p.id), p.acronym || p.name])), [projects]);
  const analysis = useMemo(() => population ? reachAnalysis(areas, population, { category }) : null, [areas, population, category]);
  const usedCategories = useMemo(() => [...new Set(areas.flatMap(a => (a.implementation_details || []).map(e => e.category_key)).filter(Boolean))], [areas]);

  const rows = useMemo(() => {
    if (!analysis) return [];
    if (view === 'project') return analysis.projects.map(p => ({ id: `p-${p.project_id}`, title: projectName.get(p.project_id) || p.project_id, meta: '', ...p }));
    if (view === 'council') return analysis.total.councils.map(k => {
      const projectsHere = analysis.projects.filter(p => p.councils.some(x => x.province === k.province && x.area_council === k.area_council)).length;
      return { id: `c-${k.province}-${k.area_council}`, title: k.area_council, meta: `${k.province} · ${projectsHere} ${projectsHere === 1 ? (lang === 'fr' ? 'projet' : 'project') : c.projects}`, councilCount: 1, pop2026: k.pop2026 || 0, hh2026: k.hh2026 || 0, councils: [k], single: k };
    });
    return analysis.items.map(i => ({ id: `i-${i.project_id}-${i.label}-${i.kind}`, title: i.label, meta: `${i.kind === 'activity' ? c.activity : c.indicator} · ${projectName.get(i.project_id) || ''}${i.category_key && categoryLabels[i.category_key] ? ` · ${categoryLabels[i.category_key]}` : ''}`, ...i }));
  }, [analysis, view, projectName, categoryLabels, c, lang]);
  const max = Math.max(1, ...rows.map(r => r.pop2026 || 0));
  const unmatched = analysis ? analysis.total.unmatched : 0;

  return <section className="pbd-section pbd-reach" aria-labelledby="pbd-reach-title">
    <div className="pbd-section-head"><div><h2 id="pbd-reach-title" className="pbd-progress-summary-title">{number ? `${number} ` : ''}{c.title}</h2><p>{c.intro}</p></div></div>
    {!population ? <p className="pbd-reach-state" role="status">{failed ? c.unavailable : c.loading}</p> : <>
      <div className="pbd-reach-kpis">
        <div><span>{c.people}</span><strong>{num(analysis.total.pop2026)}</strong><small>{c.ofNational.replace('{total}', num(analysis.nationalPop))}</small></div>
        <div><span>{c.households}</span><strong>{num(analysis.total.hh2026)}</strong><small>{analysis.total.hh2026 ? `${(analysis.total.pop2026 / analysis.total.hh2026).toLocaleString(locale, { maximumFractionDigits: 1 })} ${c.avgHh}` : '—'}</small></div>
        <div><span>{c.share}</span><strong>{analysis.share == null ? '—' : `${(analysis.share * 100).toLocaleString(locale, { maximumFractionDigits: 1 })} %`}</strong><small>{lang === 'fr' ? 'estimation 2026' : '2026 estimate'}</small></div>
        <div><span>{c.councils}</span><strong>{num(analysis.total.councilCount)}</strong><small>{lang === 'fr' ? 'sur 71' : 'of 71'}</small></div>
      </div>
      <div className="pbd-reach-controls">
        <div className="pbd-reach-tabs" role="group" aria-label={c.view}><span>{c.view}</span>{[['item', c.byItem], ['project', c.byProject], ['council', c.byCouncil]].map(([k, label]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => { setView(k); setOpen(null); }}>{label}</button>)}</div>
        <label><span>{c.category}</span><select value={category} onChange={e => { setCategory(e.target.value); setOpen(null); }}><option value="">{c.allCategories}</option>{Object.entries(categoryLabels).filter(([k]) => usedCategories.includes(k) || k === category).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      {rows.length ? <ol className="pbd-reach-list">{rows.map(r => <li key={r.id} className="pbd-reach-row">
        <div className="pbd-reach-label"><strong>{r.title}</strong>{r.meta && <small>{r.meta}</small>}</div>
        <div className="pbd-reach-figures">
          <span><b>{num(r.pop2026)}</b> {c.peopleShort}</span>
          <span><b>{num(r.hh2026)}</b> {c.hhShort}</span>
          <span><b>{num(r.councilCount)}</b> {r.councilCount === 1 ? c.councilOne : c.councilMany}</span>
        </div>
        <div className="pbd-reach-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, (r.pop2026 / max) * 100)}%` }} /></div>
        {r.single ? onAreaSelect && <button type="button" className="pbd-reach-toggle" onClick={() => onAreaSelect({ province: r.single.province, area_council: r.single.area_council })}>{c.select}</button>
          : <><button type="button" className="pbd-reach-toggle" aria-expanded={open === r.id} onClick={() => setOpen(o => o === r.id ? null : r.id)}>{open === r.id ? c.hideCouncils : c.showCouncils}</button>
            {open === r.id && <ul className="pbd-reach-councils">{r.councils.map(k => <li key={`${k.province}-${k.area_council}`}><button type="button" disabled={!onAreaSelect} onClick={() => onAreaSelect?.({ province: k.province, area_council: k.area_council })}><span>{k.area_council}<small>{k.province}</small></span><span>{k.matched ? <>{num(k.pop2026)} {c.peopleShort} · {num(k.hh2026)} {c.hhShort}</> : '—'}</span></button></li>)}</ul>}</>}
      </li>)}</ol> : <p className="pbd-reach-state">{c.noData}</p>}
      {unmatched > 0 && <p className="pbd-reach-note" role="status">{c.unmatched.replace('{n}', unmatched)}</p>}
      <ReportNotes french={lang === 'fr'} items={c.notes} />
    </>}
  </section>;
}
