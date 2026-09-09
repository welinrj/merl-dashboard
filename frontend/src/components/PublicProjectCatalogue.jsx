import { useMemo, useState } from 'react';

const SOURCE = 'https://docc.gov.vu/index.php/projects/view-projects';
// This is a separately sourced directory, not a MERL reporting snapshot.
// Do not infer registration, approval, implementation status or achievements from it.
const official = [
  ['Forest Carbon Partnership Facility (FCPF)', 'Mitigation', 'Forest carbon and support for reducing emissions through improved forest management.', ''],
  ['Vanuatu Coastal Adaptation Project (VCAP)', 'Adaptation', 'Strengthens coastal resilience through adaptation planning, livelihood and food-production support, ecosystem rehabilitation and climate-resilient infrastructure.', '/7-vanuatu-coastal-adaptation-project-vcap'],
  ['Technical Needs Assessment for Climate Change Project', 'Mitigation', 'Identifies and prioritises climate technologies, addresses barriers to their use and develops technology action plans.', '/9-technical-needs-assessment-for-climate-change-project'],
  ['Increasing Resilience to Climate Change and Natural Hazards (IRCCNH) Project 2013-2018', 'Adaptation, Mitigation', 'Addresses vulnerability to climate change and natural hazards in Vanuatu.', '/11-increasing-resilience-to-climate-change-and-natural-haz'],
  ['Renewable Energy & Energy Efficiency', 'Mitigation', 'Supports renewable energy, energy efficiency and reduced reliance on imported fossil fuels.', '/13-renewable-energy-energy-efficiency'],
  ['Vanuatu Rural Electrification Project (VREP)', 'Mitigation', 'Supports rural electrification and access to energy.', ''],
  ['Reducing Emissions from Deforestation and Forest Degradation', 'Mitigation', 'Strengthens national REDD+ readiness, forest conservation, sustainable forest management and forest carbon stocks.', '/15-reducing-emissions-from-deforestation-and-forest-degrad'],
  ['Pacific Adaptation to Climate Change and Resilience Building (PACRES)', 'Mitigation', 'Supports adaptation and ecosystem-based resilience, including restoration of the Tagabe River watershed and urban and peri-urban areas of Port Vila.', '/16-pacific-adaptation-to-climate-change-and-resilience-bui'],
  ['REDD+ Project', 'Adaptation', 'Supports Vanuatu’s efforts to address deforestation and forest degradation and protect forest resources and livelihoods.', '/18-redd-project'],
  ['Pacific Risk Tool for Resilience, Phase 2 (PARTneR-2)', 'Adaptation', 'A regional resilience and risk-information initiative. See the official project page for its detailed scope.', ''],
  ['Vanuatu Coastal Adaptation Project (VCAP2)', 'Adaptation', 'Strengthens government service delivery and community resilience, with environmental resource protection, biodiversity conservation, protected-area management and land-degradation activities.', '/20-vanuatu-coastal-adaptation-project-vcap2'],
  ['Vanuatu Revised and Enhanced Nationally Determined Contribution', 'Mitigation', 'Sets out Vanuatu’s enhanced climate commitments, including emissions reduction, adaptation, loss and damage and financing needs.', '/21-vanuatu-ndc-revised-and-enhanced'],
];
const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const text = (value, fallback) => String(value || '').trim() || fallback;
const copy = {
  en: {official:'DoCC website', merl:'MERL records', source:'Official DoCC project directory', note:'Website entries and MERL records are different sources. A website entry is not evidence that a project is registered, approved or reporting in MERL.', registered:'Approved public record', demo:'Demo record', about:'About this project', outcome:'Expected outcome', noDescription:'A project description has not been published.', sourceLink:'Read official project information', noMatch:'No projects match this search.', search:'Search project names and descriptions', count:'projects', filter:'All categories'},
  fr: {official:'Site du DoCC', merl:'Dossiers MERL', source:'Répertoire officiel des projets du DoCC', note:'Les fiches du site et les dossiers MERL sont des sources distinctes. Une fiche ne prouve pas qu’un projet est enregistré, approuvé ou déclaré dans MERL.', registered:'Dossier public approuvé', demo:'Dossier de démonstration', about:'Présentation du projet', outcome:'Résultat attendu', noDescription:'Aucune description de projet publiée.', sourceLink:'Lire la fiche officielle', noMatch:'Aucun projet ne correspond à cette recherche.', search:'Rechercher des projets', count:'projets', filter:'Toutes les catégories'}
};

export default function PublicProjectCatalogue({projects = [], lang = 'en', onProject, initialSource = 'official'}) {
  const c = copy[lang] || copy.en;
  const [source, setSource] = useState(initialSource);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [expanded, setExpanded] = useState(null);
  const rows = useMemo(() => source === 'official'
    ? official.map(([name, theme, description, path]) => ({id: name, name, theme, description, url: path ? SOURCE + path : SOURCE, official: true}))
    : projects.map(p => ({...p, theme:p.primary_climate_theme || '', official:false})), [source,projects]);
  const visible = rows.filter(p => (!category || p.theme?.includes(category)) && (!search || [p.name,p.code,p.description,p.expected_primary_outcome,p.theme].join(' ').toLowerCase().includes(search.toLowerCase().trim())));
  const choose = next => {setSource(next);setSearch('');setCategory('');setExpanded(null);};
  return <div className="pdir">
    <div className="pdir-tabs" role="group" aria-label={c.source}><button type="button" aria-pressed={source==='official'} onClick={()=>choose('official')}>{c.official}</button><button type="button" aria-pressed={source==='merl'} onClick={()=>choose('merl')}>{c.merl}</button></div>
    <p className="pdir-note">{c.note}</p>
    <div className="pdir-filters"><label><span>{c.search}</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} /></label>{source==='official'&&<label><span>{c.filter}</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">{c.filter}</option><option value="Adaptation">Adaptation</option><option value="Mitigation">Mitigation</option></select></label>}<span>{visible.length} {c.count}</span></div>
    <div className="pdir-list">{visible.map(p=><article className="pdir-item" key={p.id}><div className="pdir-item-head"><div><h3>{p.name}</h3><small>{p.official ? p.theme : `${p.code || p.acronym || ''} · ${c.registered}`}</small></div>{!p.official&&<span className="pdir-badge">{c.registered}</span>}</div><p>{text(p.description,c.noDescription)}</p>{p.expected_primary_outcome&&<p><strong>{c.outcome}:</strong> {p.expected_primary_outcome}</p>}{p.official?<a href={p.url} target="_blank" rel="noopener noreferrer">{c.sourceLink} ↗</a>:<button type="button" className="pdir-link" onClick={()=>onProject?.(p)}>{c.about} →</button>}</article>)}{!visible.length&&<p className="pdir-note">{c.noMatch}</p>}</div>
    <style>{`.pdir{min-width:0}.pdir-tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem}.pdir-tabs button{border:1px solid var(--border);border-radius:9px;padding:.65rem 1rem;background:var(--white);color:var(--text-1);font:inherit;font-weight:650;cursor:pointer}.pdir-tabs button[aria-pressed=true]{background:var(--blue-600,#2563eb);color:white;border-color:transparent}.pdir-note{color:var(--text-2);font-size:.83rem;line-height:1.5}.pdir-filters{display:flex;align-items:end;gap:.7rem;flex-wrap:wrap;margin:1rem 0}.pdir-filters label{display:grid;gap:.3rem;flex:1;min-width:160px;font-size:.8rem}.pdir-filters input,.pdir-filters select{width:100%;min-height:40px;border:1px solid var(--border);border-radius:8px;background:var(--white);color:var(--text-1);padding:.5rem;font:inherit}.pdir-filters>span{font-size:.8rem;color:var(--text-2)}.pdir-list{display:grid;gap:.75rem}.pdir-item{border:1px solid var(--border);border-radius:12px;padding:1rem;background:var(--white)}.pdir-item-head{display:flex;justify-content:space-between;gap:.75rem;align-items:start}.pdir-item h3{margin:0 0 .3rem;font-size:1rem;line-height:1.4}.pdir-item small{color:var(--text-2)}.pdir-item p{margin:.65rem 0;font-size:.87rem;line-height:1.6}.pdir-item a,.pdir-link{display:inline-block;margin-top:.25rem;color:var(--blue-700,#1d4ed8);font:inherit;font-size:.85rem;font-weight:650;text-decoration:none}.pdir-link{border:0;background:none;padding:0;cursor:pointer}.pdir-badge{font-size:.7rem;background:var(--blue-50,#eff6ff);color:var(--blue-700,#1d4ed8);padding:.25rem .5rem;border-radius:6px;white-space:nowrap}@media(max-width:600px){.pdir-item-head{flex-wrap:wrap}}`}</style>
  </div>;
}
