import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../supabaseClient';
import { useDashboardFilters, projectMatches, bucketOf } from '../../lib/dashboardFilters';
import { fmtNum } from '../../lib/locale';

const LABELS = {
  en: { title: 'Projects by status', ongoing: 'Ongoing / On track', risk: 'At risk / Delayed / On hold', planning: 'Planning / Not started', completed: 'Completed', cancelled: 'Cancelled', unknown: 'Other / Unclassified', loading: 'Loading project statuses…', error: 'Project statuses could not be loaded.', retry: 'Retry', empty: 'No projects match the selected filters.', total: 'Projects' },
  fr: { title: 'Projets par statut', ongoing: 'En cours / En bonne voie', risk: 'À risque / En retard / En attente', planning: 'Planification / Non démarrés', completed: 'Terminés', cancelled: 'Annulés', unknown: 'Autres / Non classés', loading: 'Chargement des statuts…', error: 'Impossible de charger les statuts.', retry: 'Réessayer', empty: 'Aucun projet ne correspond aux filtres.', total: 'Projets' },
};
const GROUPS = [['on_track', 'ongoing'], ['at_risk', 'risk'], ['not_started', 'planning'], ['completed', 'completed'], ['cancelled', 'cancelled'], ['unknown', 'unknown']];

export default function ProjectStatusSummary() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  const c = LABELS[lang];
  const { filters, setFilter } = useDashboardFilters();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setRows(null);
    setError(false);
    (async () => {
      try {
        const all = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error: readError } = await supabase.from('v_projects')
            .select('id,status,category,donor,provinces,start_date,end_date')
            .order('id').range(offset, offset + 999);
          if (readError) throw readError;
          const page = data ?? [];
          all.push(...page);
          if (page.length < 1000) break;
        }
        if (active) setRows(all);
      } catch (_) { if (active) setError(true); }
    })();
    return () => { active = false; };
  }, [retry]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const scoped = rows.filter(p => projectMatches(p, filters));
    const counts = Object.fromEntries(GROUPS.map(([key]) => [key, 0]));
    for (const project of scoped) counts[bucketOf(project.status)] += 1;
    return { total: scoped.length, counts };
  }, [rows, filters]);

  return <section className="ovx-status-summary" aria-label={c.title}>
    <style>{`
      .dsh .ovx .ovx-kpis > .ovx-status-summary{grid-column:1/-1;order:5;min-width:0;padding:1rem 1.15rem;border:1px solid var(--border);border-radius:18px;background:var(--white);box-shadow:var(--shadow-sm)}
      .ovx-status-summary h2{margin:0 0 .7rem;color:var(--text-1);font-size:1rem;font-weight:750}
      .ovx-status-summary .status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.65rem}
      .ovx-status-summary .status-tile{min-width:0;padding:.75rem;border:1px solid var(--border);border-radius:12px;background:var(--surface-1);text-align:left;font:inherit;color:var(--text-1);cursor:pointer}
      .ovx-status-summary .status-tile[aria-pressed="true"]{border-color:var(--green-600);background:var(--surface-2)}
      .ovx-status-summary .status-number{display:block;font-size:1.4rem;font-weight:780;font-variant-numeric:tabular-nums}
      .ovx-status-summary .status-label{display:block;margin-top:.2rem;font-size:.76rem;color:var(--text-2);line-height:1.35}
      .ovx-status-summary .status-note{margin:.65rem 0 0;font-size:.75rem;color:var(--text-3)}
      .ovx-status-summary .status-retry{border:0;background:none;color:var(--green-700);font:inherit;font-weight:700;cursor:pointer}
      @media(max-width:650px){.ovx-status-summary .status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `}</style>
    <h2>{c.title}</h2>
    {error ? <p role="alert">{c.error} <button type="button" className="status-retry" onClick={() => setRetry(n => n + 1)}>{c.retry}</button></p>
      : !summary ? <p role="status">{c.loading}</p>
      : <>
        <div className="status-grid">
          {GROUPS.filter(([key]) => !['cancelled', 'unknown'].includes(key) || summary.counts[key] > 0).map(([key, label]) =>
            <button type="button" className="status-tile" key={key} aria-pressed={filters.status === key} onClick={() => setFilter('status', key)}>
              <span className="status-number">{fmtNum(summary.counts[key])}</span><span className="status-label">{c[label]}</span>
            </button>)}
        </div>
        <p className="status-note">{c.total}: {fmtNum(summary.total)}{!summary.total ? ` · ${c.empty}` : ''}</p>
      </>}
  </section>;
}
