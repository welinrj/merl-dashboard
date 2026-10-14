import { useRef, useState } from 'react';
import './DashboardFilterPanel.css';

const COPY = {
  en: {
    title: 'Filter dashboard', hide: 'Hide filters', all: 'All', clear: 'Clear all',
    none: 'No filters applied', applied: 'filters applied', results: 'Show results',
    remove: 'Remove filter',
  },
  fr: {
    title: 'Filtrer le tableau de bord', hide: 'Masquer les filtres', all: 'Tous', clear: 'Tout effacer',
    none: 'Aucun filtre appliqué', applied: 'filtres appliqués', results: 'Afficher les résultats',
    remove: 'Supprimer le filtre',
  },
};

export default function DashboardFilterPanel({ fields, filters, setFilter, reset, lang }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  const c = COPY[lang?.startsWith('fr') ? 'fr' : 'en'];
  const selected = fields.filter(field => filters[field.key]);
  const close = () => { setOpen(false); toggle.current?.focus(); };

  return <section className="dashboard-filters rp-noprint" aria-label={c.title} data-open={open}>
    <div className="dashboard-filters-heading">
      <h2>{c.title}</h2>
      <button ref={toggle} type="button" className="dashboard-filters-toggle"
        aria-expanded={open} aria-controls="overview-filter-fields" onClick={() => setOpen(value => !value)}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="white" /><circle cx="16" cy="12" r="2" fill="white" /><circle cx="10" cy="18" r="2" fill="white" />
        </svg>
        {open ? c.hide : c.title}
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      <button type="button" className="dashboard-filters-clear" disabled={!selected.length} onClick={reset}>{c.clear}</button>
    </div>
    <p className="dashboard-filters-status" role="status">{selected.length ? `${selected.length} ${c.applied}` : c.none}</p>
    {selected.length > 0 && <ul className="dashboard-filter-selections" aria-label={c.applied}>
      {selected.map(field => {
        const value = field.options.find(option => option.value === filters[field.key])?.label ?? filters[field.key];
        return <li key={field.key}><button type="button" onClick={() => setFilter(field.key, '')}
          aria-label={`${c.remove}: ${field.label}: ${value}`}>
          <span>{field.label}: <strong>{value}</strong></span><span aria-hidden="true">×</span>
        </button></li>;
      })}
    </ul>}
    <div id="overview-filter-fields" className="dashboard-filter-fields">
      {fields.map(field => <label className="dashboard-filter-field" key={field.key}>
        <span>{field.label}</span>
        <select aria-label={field.label} value={filters[field.key]} onChange={event => setFilter(field.key, event.target.value)}>
          <option value="">{c.all}</option>
          {filters[field.key] && !field.options.some(option => option.value === filters[field.key]) &&
            <option value={filters[field.key]}>{filters[field.key]}</option>}
          {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>)}
      <button type="button" className="dashboard-filter-results" onClick={close}>{c.results}</button>
    </div>
  </section>;
}
