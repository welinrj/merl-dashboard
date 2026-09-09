import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import KpiCardBase from './KpiCardBase';
import Gedsi from './Gedsi';
import { supabase } from '../../supabaseClient';
import { useDashboardFilters, projectMatches } from '../../lib/dashboardFilters';
import { localised, i18nCols } from '../../lib/contentLocale';
import { fmtNum } from '../../lib/locale';
import { aggregateBeneficiaries } from '../../lib/beneficiaryAggregation';

const FIELDS = [
  ['female', 'female'], ['male', 'male'], ['other_gender', null],
  ['youth', 'youth'], ['persons_with_disability', 'disability'], ['indirect', 'indirect'],
];
const COPY = {
  en: {
    title: 'Beneficiaries & GEDSI', total: 'Total direct beneficiaries',
    female: 'Female', male: 'Male', other_gender: 'Other gender', youth: 'Youth',
    persons_with_disability: 'Persons with disability', indirect: 'Indirect beneficiaries',
    loading: 'Loading beneficiary breakdown…', error: 'The beneficiary breakdown could not be loaded.',
    retry: 'Retry', empty: 'No beneficiary records are available for this selection.',
    records: 'Reported records', projects: 'Projects with records', checked: 'Double-counting checks recorded',
    completeness: 'Records with gender information', details: 'View project breakdown', hide: 'Hide project breakdown',
    project: 'Project', note: 'Totals are sums of reported Form 8 records, not verified unique people. Demographic categories may overlap and should not be added together.',
  },
  fr: {
    title: 'Bénéficiaires et GEDSI', total: 'Total des bénéficiaires directs',
    female: 'Femmes', male: 'Hommes', other_gender: 'Autre genre', youth: 'Jeunes',
    persons_with_disability: 'Personnes handicapées', indirect: 'Bénéficiaires indirects',
    loading: 'Chargement de la ventilation des bénéficiaires…', error: 'Impossible de charger la ventilation des bénéficiaires.',
    retry: 'Réessayer', empty: 'Aucune donnée sur les bénéficiaires pour cette sélection.',
    records: 'Enregistrements déclarés', projects: 'Projets avec données', checked: 'Contrôles de double comptage enregistrés',
    completeness: 'Enregistrements avec données sur le genre', details: 'Voir la ventilation par projet', hide: 'Masquer la ventilation par projet',
    project: 'Projet', note: 'Les totaux sont la somme des enregistrements du formulaire 8, et non un décompte vérifié de personnes uniques. Les catégories démographiques peuvent se chevaucher et ne doivent pas être additionnées.',
  },
};

// Fetch every page rather than silently losing records at PostgREST's row limit.
async function readAll(view, columns, lang, translate = false) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const run = () => supabase.from(view).select(translate ? i18nCols(columns) : columns)
      .order('id').range(offset, offset + pageSize - 1);
    const result = translate ? await localised(run, lang) : await run();
    if (result.error) throw result.error;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export default function BeneficiarySummary(props) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  const c = COPY[lang];
  const { filters } = useDashboardFilters();
  const [source, setSource] = useState(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    setSource(null);
    setError(false);
    Promise.all([
      readAll('v_projects', 'id, code, name, status, provinces, donor, category, start_date, end_date', lang, true),
      readAll('v_beneficiaries', 'id, project_id, total_direct, female, male, other_gender, youth, persons_with_disability, indirect, double_counting_check', lang),
    ]).then(([projects, beneficiaries]) => {
      if (active) setSource({ projects, beneficiaries });
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [lang, retry]);

  const scoped = useMemo(() => {
    if (!source) return null;
    const projects = source.projects.filter(p => projectMatches(p, filters));
    const ids = new Set(projects.map(p => p.id));
    const rows = source.beneficiaries.filter(row => ids.has(row.project_id));
    return { projects, rows, summary: aggregateBeneficiaries(rows) };
  }, [source, filters]);

  const summary = scoped?.summary;
  const display = value => value == null ? '—' : fmtNum(value);
  const gender = summary && (summary.female != null || summary.male != null)
    ? `${display(summary.female)} ${c.female} · ${display(summary.male)} ${c.male}` : null;
  const projectRows = scoped?.projects.map(project => ({
    ...project,
    totals: aggregateBeneficiaries(scoped.rows.filter(row => row.project_id === project.id)),
  })).filter(row => row.totals.records > 0) ?? [];

  return <>
    <KpiCardBase {...props}
      value={summary ? display(summary.total_direct) : props.value}
      sub={summary ? (gender || undefined) : props.sub}
    />
    <section className="ovx-beneficiary-summary" aria-label={c.title}>
      <style>{`
        .dsh .ovx .ovx-kpis > .ovx-beneficiary-summary{grid-column:1/-1;min-width:0;padding:1rem 1.15rem;border:1px solid var(--border);border-radius:18px;background:var(--white);box-shadow:var(--shadow-sm)}
        .ovx-beneficiary-summary .bene-head{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin-bottom:.85rem}
        .ovx-beneficiary-summary h2{margin:0;color:var(--text-1);font-size:1rem;font-weight:750}
        .ovx-beneficiary-summary .bene-meta{font-size:.72rem;color:var(--text-3)}
        .ovx-beneficiary-summary .bene-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.65rem}
        .ovx-beneficiary-summary .bene-tile{min-width:0;padding:.75rem;border:1px solid var(--border);border-radius:12px;background:var(--surface-1)}
        .ovx-beneficiary-summary .bene-number{font-size:1.35rem;font-weight:780;font-variant-numeric:tabular-nums;color:var(--text-1)}
        .ovx-beneficiary-summary .bene-label{display:flex;align-items:center;gap:.4rem;margin-top:.2rem;font-size:.76rem;color:var(--text-2)}
        .ovx-beneficiary-summary .bene-note{margin:.8rem 0 0;font-size:.72rem;line-height:1.5;color:var(--text-3)}
        .ovx-beneficiary-summary .bene-actions{margin-top:.8rem}
        .ovx-beneficiary-summary .bene-action{border:0;background:none;padding:.4rem 0;color:var(--green-700);font:inherit;font-size:.78rem;font-weight:700;cursor:pointer}
        .ovx-beneficiary-summary .bene-table-wrap{max-width:100%;overflow-x:auto;margin-top:.6rem}
        .ovx-beneficiary-summary table{width:100%;border-collapse:collapse;font-size:.76rem}
        .ovx-beneficiary-summary th,.ovx-beneficiary-summary td{padding:.55rem .6rem;text-align:right;border-bottom:1px solid var(--border);white-space:nowrap}
        .ovx-beneficiary-summary th:first-child,.ovx-beneficiary-summary td:first-child{text-align:left;white-space:normal;min-width:160px}
        .ovx-beneficiary-summary th{color:var(--text-3);font-weight:700}
        @media(max-width:650px){.ovx-beneficiary-summary .bene-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
      <div className="bene-head"><h2>{c.title}</h2>
        {summary && <span className="bene-meta">{c.records}: {display(summary.records)} · {c.projects}: {display(summary.projects)}</span>}
      </div>
      {error ? <div role="alert">{c.error} <button type="button" className="bene-action" onClick={() => setRetry(n => n + 1)}>{c.retry}</button></div>
        : !scoped ? <div role="status">{c.loading}</div>
        : !summary.records ? <p className="bene-note">{c.empty}</p>
        : <>
          <div className="bene-grid">
            {FIELDS.map(([field, icon]) => <div className="bene-tile" key={field}>
              <div className="bene-number">{display(summary[field])}</div>
              <div className="bene-label">{icon && <Gedsi name={icon} size={16} aria-hidden="true" />}{c[field]}</div>
            </div>)}
          </div>
          <p className="bene-note">{c.total}: <strong>{display(summary.total_direct)}</strong> · {c.completeness}: {display(summary.genderCompleteness)}% · {c.checked}: {display(summary.checked)} / {display(summary.records)}.</p>
          <p className="bene-note">{c.note}</p>
          {projectRows.length > 0 && <div className="bene-actions"><button type="button" className="bene-action" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? c.hide : c.details}</button></div>}
          {expanded && <div className="bene-table-wrap"><table>
            <thead><tr><th>{c.project}</th><th>{c.total}</th>{FIELDS.map(([field]) => <th key={field}>{c[field]}</th>)}</tr></thead>
            <tbody>{projectRows.map(row => <tr key={row.id}><td>{row.code} — {row.name}</td><td>{display(row.totals.total_direct)}</td>{FIELDS.map(([field]) => <td key={field}>{display(row.totals[field])}</td>)}</tr>)}</tbody>
          </table></div>}
        </>}
    </section>
  </>;
}
