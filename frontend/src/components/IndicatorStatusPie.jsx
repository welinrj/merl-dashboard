import { useTranslation } from 'react-i18next';
import './indicator-status-pie.css';

const STATUS = [
  { key: 'achieved', en: 'Achieved', fr: 'Atteints', color: '#15803d' },
  { key: 'on_track', en: 'On track', fr: 'En bonne voie', color: '#0e7490' },
  { key: 'below_target', en: 'Needs attention', fr: 'À surveiller', color: '#b45309' },
  { key: 'not_yet_due', en: 'Not yet due', fr: 'Pas encore dus', color: '#6366f1' },
  { key: 'no_data', en: 'Not reported', fr: 'Non renseignés', color: '#94a3b8' },
];

// Uses the portfolio's existing results calculation and latest-row selection.
// Every indicator appears once, including unreported and not-yet-due targets.
export default function IndicatorStatusPie({ results }) {
  const { i18n } = useTranslation();
  const french = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('fr');
  const values = STATUS.map(status => ({
    ...status, label: french ? status.fr : status.en,
    count: results?.counts?.[status.key] || 0,
  }));
  const total = values.reduce((sum, value) => sum + value.count, 0);
  const summary = values.map(value => `${value.label}: ${value.count}`).join('; ');
  let angle = -Math.PI / 2;
  const slices = values.filter(value => value.count > 0).map(value => {
    const start = angle;
    angle += value.count / total * Math.PI * 2;
    const x1 = 120 + 108 * Math.cos(start), y1 = 120 + 108 * Math.sin(start);
    const x2 = 120 + 108 * Math.cos(angle), y2 = 120 + 108 * Math.sin(angle);
    return { ...value, path: `M 120 120 L ${x1} ${y1} A 108 108 0 ${value.count / total > .5 ? 1 : 0} 1 ${x2} ${y2} Z` };
  });
  if (!total) return <p className="indicator-pie-empty">{french ? 'Aucun indicateur enregistré.' : 'No indicators recorded.'}</p>;
  return <figure className="indicator-status-pie" data-total={total}>
    <svg viewBox="0 0 240 240" className="indicator-status-pie-visual" role="img"
      aria-label={`${french ? 'État des indicateurs' : 'Indicator status'} — ${summary}`}>
      <title>{summary}</title>
      {slices.map(slice => slice.count === total
        ? <circle key={slice.key} cx="120" cy="120" r="108" fill={slice.color}><title>{`${slice.label}: ${slice.count}`}</title></circle>
        : <path key={slice.key} d={slice.path} fill={slice.color} stroke="#fff" strokeWidth="2"><title>{`${slice.label}: ${slice.count}`}</title></path>)}
    </svg>
    <figcaption className="indicator-status-pie-caption">
      <p className="indicator-status-pie-total"><strong>{total}</strong> {french ? 'indicateurs' : 'indicators'}</p>
      <ul className="indicator-status-pie-legend">
        {values.map(value => <li key={value.key} data-status={value.key} data-count={value.count}>
          <span className="indicator-status-pie-dot" style={{ background: value.color }} aria-hidden="true" />
          <span>{value.label}</span>
          <strong>{value.count}</strong>
          <span className="indicator-status-pie-percent">{Math.round(value.count / total * 100)}%</span>
        </li>)}
      </ul>
    </figcaption>
  </figure>;
}
