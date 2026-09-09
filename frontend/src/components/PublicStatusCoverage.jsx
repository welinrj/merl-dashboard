import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import PublicCoverageMap from './PublicCoverageMap';

const list = value => Array.isArray(value) ? value : [];
const norm = value => String(value || '').toLowerCase().replace(/\b(area council|council)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const labels = {
  en: { title:'Projects in selected areas', all:'All published statuses', ongoing:'Ongoing', completed:'Completed', upcoming:'Upcoming', other:'Other', clear:'Show all areas', areas:'Areas with projects', projects:'Projects', inputs:'Planned inputs / activities', outputs:'Expected outputs', outcome:'Expected outcome', empty:'No published projects match this selection.', missing:'No area council has been recorded for these projects.', unavailable:'Project plan details are temporarily unavailable.', noInputs:'No planned inputs or activities published.', noOutputs:'No expected outputs published.', note:'Planning information for approved projects. Expected outputs are not verified achievements.', area:'Area council', province:'Province', view:'View project', unknown:'Not specified', loading:'Loading approved project plans…' },
  fr: { title:'Projets dans les zones sélectionnées', all:'Tous les états publiés', ongoing:'En cours', completed:'Achevé', upcoming:'À venir', other:'Autre', clear:'Afficher toutes les zones', areas:'Zones avec projets', projects:'Projets', inputs:'Intrants / activités prévus', outputs:'Produits attendus', outcome:'Résultat attendu', empty:'Aucun projet publié ne correspond à cette sélection.', missing:'Aucun conseil de zone enregistré pour ces projets.', unavailable:'Les détails des plans sont temporairement indisponibles.', noInputs:'Aucun intrant ou activité prévu publié.', noOutputs:'Aucun produit attendu publié.', note:'Informations de planification des projets approuvés. Les produits attendus ne sont pas des réalisations vérifiées.', area:'Conseil de zone', province:'Province', view:'Voir le projet', unknown:'Non précisé', loading:'Chargement des plans approuvés…' }
};
const statusOf = p => ['ongoing','completed','upcoming'].includes(p.lifecycle_status) ? p.lifecycle_status : 'other';

export default function PublicStatusCoverage({ projects = [], areas = [], status = '', onStatusChange, onProject, lang = 'en', standalone = false }) {
  const c = labels[lang] || labels.en;
  const [area, setArea] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [plans, setPlans] = useState({});
  const [planError, setPlanError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase.rpc('public_portal_project_plan').then(({data,error}) => {
      if (!active) return;
      if (error) { setPlanError(true); setLoading(false); return; }
      setPlans(Object.fromEntries((data || []).map(row => [String(row.project_id), row])));
      setPlanError(false);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const scoped = useMemo(() => projects.filter(p => !status || statusOf(p) === status), [projects,status]);
  const ids = useMemo(() => new Set(scoped.map(p => String(p.id))), [scoped]);
  const coverage = useMemo(() => areas.map(a => {
    const matches = list(a.project_ids).filter(id => ids.has(String(id)));
    return { ...a, project_ids: matches, project_count: matches.length, project_names: matches.map(id => scoped.find(p => String(p.id) === String(id))?.name).filter(Boolean) };
  }), [areas,ids,scoped]);
  const activeArea = area && coverage.find(a => norm(a.area_council) === norm(area.area_council) && norm(a.province) === norm(area.province));
  const areaIds = activeArea ? new Set(list(activeArea.project_ids).map(String)) : null;
  const visible = scoped.filter(p => !areaIds || areaIds.has(String(p.id)));
  const selected = visible.find(p => String(p.id) === String(projectId)) || null;
  const plan = selected && plans[String(selected.id)];
  const selectArea = next => { setArea(next); setProjectId(null); };
  const chooseStatus = next => { onStatusChange?.(next); setArea(null); setProjectId(null); };
  const chooseProject = p => { setProjectId(String(p.id)); };
  return <div className="psc-root">
    <div className="psc-controls"><label>{lang === 'fr' ? 'État' : 'Status'} <select value={status} onChange={e => chooseStatus(e.target.value)}><option value="">{c.all}</option>{['ongoing','completed','upcoming','other'].map(key => <option key={key} value={key}>{c[key]}</option>)}</select></label><button type="button" onClick={() => selectArea(null)} disabled={!area}>{c.clear}</button><span>{visible.length} {c.projects.toLowerCase()}</span></div>
    <div className="psc-layout"><div className="psc-map"><PublicCoverageMap areas={coverage} selectedArea={activeArea} onAreaSelect={selectArea}/></div><div className="psc-details"><h3>{activeArea ? activeArea.area_council : c.title}</h3>{activeArea && <p className="psc-muted">{activeArea.province}</p>}{!activeArea && <p className="psc-muted">{coverage.filter(a => a.project_count > 0).length} {c.areas.toLowerCase()}</p>}
    {visible.length ? <div className="psc-projects">{visible.map(p => <button type="button" key={p.id} className={String(projectId) === String(p.id) ? 'psc-selected' : ''} onClick={() => chooseProject(p)}><strong>{p.name}</strong><span>{c[statusOf(p)]} · {p.code || p.acronym || c.unknown}</span></button>)}</div> : <p className="psc-muted">{c.empty}</p>}
    {selected && <article className="psc-plan"><h4>{selected.name}</h4><p className="psc-muted">{c.note}</p><h5>{c.outcome}</h5><p>{selected.expected_primary_outcome || c.unknown}</p><h5>{c.inputs}</h5>{loading ? <p>{c.loading}</p> : planError ? <p>{c.unavailable}</p> : list(plan?.inputs).length ? <ul>{plan.inputs.map((item,i) => <li key={i}><strong>{item.name}</strong>{item.description && <span> — {item.description}</span>}</li>)}</ul> : <p>{c.noInputs}</p>}<h5>{c.outputs}</h5>{loading ? <p>{c.loading}</p> : planError ? <p>{c.unavailable}</p> : list(plan?.outputs).length ? <ul>{plan.outputs.map((item,i) => <li key={i}>{item.statement}</li>)}</ul> : <p>{c.noOutputs}</p>}{onProject && <button type="button" className="psc-open" onClick={() => onProject(selected)}>{c.view} →</button>}</article>}
    </div></div>{!coverage.some(a => a.project_count > 0) && scoped.length > 0 && <p className="psc-muted">{c.missing}</p>}
    <style>{`.psc-root{min-width:0}.psc-controls{display:flex;align-items:end;gap:.6rem;flex-wrap:wrap;margin-bottom:.8rem}.psc-controls label{display:grid;gap:.3rem;font-size:.78rem;font-weight:650;color:var(--text-2)}.psc-controls select,.psc-controls button{min-height:38px;padding:.45rem .7rem;border:1px solid var(--border);border-radius:8px;background:var(--white);color:var(--text-1);font:inherit}.psc-controls button:disabled{opacity:.45}.psc-controls>span{margin-left:auto;font-size:.78rem;color:var(--text-2)}.psc-layout{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(260px,.8fr);gap:1rem;align-items:start}.psc-map{min-width:0}.psc-details{min-width:0}.psc-details h3{margin:0 0 .35rem;font-size:1rem}.psc-muted{font-size:.78rem;color:var(--text-2);line-height:1.5}.psc-projects{display:grid;gap:.4rem;max-height:260px;overflow:auto;margin:.7rem 0}.psc-projects button{display:grid;gap:.25rem;text-align:left;padding:.65rem;border:1px solid var(--border);border-radius:9px;background:var(--white);color:var(--text-1);font:inherit;cursor:pointer}.psc-projects button span{font-size:.73rem;color:var(--text-2)}.psc-projects button.psc-selected{border-color:var(--blue-600,#2563eb);background:var(--blue-50,#eff6ff)}.psc-plan{border-top:1px solid var(--border);padding-top:.8rem}.psc-plan h4{margin:0;font-size:.95rem}.psc-plan h5{margin:.9rem 0 .3rem;font-size:.78rem}.psc-plan p,.psc-plan li{font-size:.78rem;line-height:1.55}.psc-plan ul{padding-left:1.2rem}.psc-plan li{margin-bottom:.35rem}.psc-open{margin-top:.5rem;border:0;background:none;color:var(--blue-700,#1d4ed8);font:inherit;font-weight:700;cursor:pointer}@media(max-width:800px){.psc-layout{grid-template-columns:1fr}.psc-projects{max-height:220px}}`}</style>
  </div>;
}
