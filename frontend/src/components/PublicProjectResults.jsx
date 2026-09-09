import { useState } from 'react';

// Identity colors are stable across pages. They do not imply performance.
const COLORS = [
  ['#1d4ed8','#eff6ff'], ['#047857','#ecfdf5'], ['#7c3aed','#f5f3ff'],
  ['#b45309','#fffbeb'], ['#be185d','#fdf2f8'], ['#0f766e','#f0fdfa'],
  ['#4338ca','#eef2ff'], ['#9a3412','#fff7ed'],
];
export function projectColor(project) {
  const key = String(project?.id || project?.code || project?.name || '');
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [ink, background] = COLORS[hash % COLORS.length];
  return { '--project-ink': ink, '--project-bg': background };
}
export function ProjectIdentity({ project, children, className = '', onClick, selected = false }) {
  const props = { className: `ppr-identity ${className}`, style: projectColor(project) };
  return onClick ? <button type="button" {...props} aria-pressed={selected} onClick={onClick}>{children}</button>
    : <span {...props}>{children}</span>;
}
const COPY = {
  en: { title:'Project results and progress', result:'Published results', progress:'Progress', outcome:'Expected outcome', period:'Latest approved period', indicators:'Indicators with published results', beneficiaries:'Published direct beneficiaries', none:'No approved results have been published for this project yet.', unknown:'Not yet published', detail:'View project details', note:'Only approved reporting is shown. Expected outcomes are plans, not verified achievements.', count:'projects', expand:'Show results', collapse:'Hide results' },
  fr: { title:'Résultats et progrès par projet', result:'Résultats publiés', progress:'Progrès', outcome:'Résultat attendu', period:'Dernière période approuvée', indicators:'Indicateurs avec résultats publiés', beneficiaries:'Bénéficiaires directs publiés', none:'Aucun résultat approuvé publié pour ce projet.', unknown:'Pas encore publié', detail:'Voir le projet', note:'Seuls les rapports approuvés sont affichés. Les résultats attendus ne sont pas des réalisations vérifiées.', count:'projets', expand:'Afficher les résultats', collapse:'Masquer les résultats' },
};
const number = (value, lang) => new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-US').format(Number(value));
const percent = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Math.round(Number(value))}%`;

export default function PublicProjectResults({ projects = [], lang = 'en', onProject }) {
  const c = COPY[lang] || COPY.en;
  const [expanded, setExpanded] = useState(null);
  return <section className="ppr-root" aria-label={c.title}>
    <div className="ppr-head"><h2>{c.title}</h2><span>{projects.length} {c.count}</span></div>
    <p className="ppr-note">{c.note}</p>
    <div className="ppr-list">{projects.map(project => {
      const open = expanded === String(project.id);
      const known = project.progress_pct != null && Number.isFinite(Number(project.progress_pct));
      const hasResults = known || Number(project.published_indicator_count) > 0 || Number(project.published_beneficiaries) > 0;
      return <article key={project.id} className="ppr-item" style={projectColor(project)}>
        <ProjectIdentity project={project} className="ppr-project-button" selected={open} onClick={() => setExpanded(open ? null : String(project.id))}>
          <span className="ppr-project-copy"><strong>{project.name}</strong><small>{project.code || project.acronym || ''}</small></span>
          <span className="ppr-project-progress"><strong>{percent(project.progress_pct)}</strong><small>{c.progress}</small></span>
          <span aria-hidden="true">{open ? '−' : '+'}</span>
        </ProjectIdentity>
        {open && <div className="ppr-detail">
          <h3>{c.outcome}</h3><p>{project.expected_primary_outcome || project.description || c.unknown}</p>
          <h3>{c.result}</h3>
          {!hasResults ? <p className="ppr-note">{c.none}</p> : <div className="ppr-metrics">
            <div><span>{c.progress}</span><strong>{percent(project.progress_pct)}</strong><div className="ppr-track"><span style={{width:`${known ? Math.max(0,Math.min(100,Number(project.progress_pct))) : 0}%`}}/></div></div>
            <div><span>{c.indicators}</span><strong>{number(project.published_indicator_count || 0,lang)}</strong></div>
            <div><span>{c.beneficiaries}</span><strong>{number(project.published_beneficiaries || 0,lang)}</strong></div>
          </div>}
          <p className="ppr-note">{c.period}: {project.last_published_period || c.unknown}</p>
          {onProject && <button type="button" className="ppr-detail-link" onClick={() => onProject(project)}>{c.detail} →</button>}
        </div>}
      </article>;
    })}</div>
    {!projects.length && <p className="ppr-note">{c.none}</p>}
    <style>{`.ppr-root{min-width:0}.ppr-head{display:flex;justify-content:space-between;align-items:center;gap:1rem}.ppr-head h2{font-size:1rem;margin:0}.ppr-head span,.ppr-note{font-size:.8rem;color:var(--text-2);line-height:1.5}.ppr-list{display:grid;gap:.65rem;margin-top:1rem}.ppr-item{min-width:0;border:1px solid var(--border);border-radius:10px;overflow:hidden}.ppr-identity{--project-ink:#1d4ed8;--project-bg:#eff6ff;display:inline-flex;align-items:center;gap:.5rem;border:1px solid var(--project-ink);border-radius:8px;background:var(--project-bg);color:var(--project-ink);font:inherit;font-weight:650;padding:.4rem .7rem;text-align:left}.ppr-project-button{display:flex;width:100%;min-height:65px;border:0;border-left:5px solid var(--project-ink);border-radius:0;gap:1rem;cursor:pointer;padding:.8rem 1rem}.ppr-project-button:focus-visible,.ppr-identity:focus-visible{outline:3px solid var(--project-ink);outline-offset:2px}.ppr-project-copy{flex:1;min-width:0;display:grid;gap:.2rem}.ppr-project-copy strong{font-size:.9rem;line-height:1.4}.ppr-project-copy small,.ppr-project-progress small{font-size:.72rem;opacity:.85}.ppr-project-progress{display:grid;text-align:right;gap:.1rem}.ppr-project-progress strong{font-size:1.1rem}.ppr-detail{padding:1rem;border-top:1px solid var(--border)}.ppr-detail h3{font-size:.8rem;margin:0 0 .4rem}.ppr-detail p{font-size:.84rem;line-height:1.6;margin:.3rem 0 1rem}.ppr-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:.65rem;margin:.7rem 0 1rem}.ppr-metrics>div{display:grid;gap:.4rem;border:1px solid var(--border);border-radius:8px;padding:.7rem}.ppr-metrics span{font-size:.72rem;color:var(--text-2)}.ppr-metrics strong{font-size:1.1rem}.ppr-track{height:6px;border-radius:8px;background:var(--surface-2);overflow:hidden}.ppr-track span{display:block;height:100%;background:var(--project-ink)}.ppr-detail-link{border:0;background:none;color:var(--project-ink);font:inherit;font-weight:650;cursor:pointer;padding:.3rem 0}@media(max-width:400px){.ppr-project-button{gap:.5rem;padding:.6rem}.ppr-project-copy strong{font-size:.82rem}}`}</style>
  </section>;
}
