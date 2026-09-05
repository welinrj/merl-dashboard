// Compact application filter toolbar. Filters remain explicit labelled fields;
// selected values are shown as small rectangular tokens rather than decorative
// pills. Reset/export are ordinary utility buttons.
import { useTranslation } from 'react-i18next';
import { X, RotateCcw, Download } from './icons';

export default function FilterBar({ filters = [], onReset, onExport, dataAsAt, right }) {
  const { t } = useTranslation();
  const active = filters.filter((f) => f.value != null && f.value !== '' && f.value !== 'all');

  return (
    <div className="filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.22rem', minWidth: 0 }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 650, color: 'var(--text-2)' }}>{f.label}</span>
            <select value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)}
              className="field-input" style={{ width: 'auto', minWidth: 130, padding: '0.4rem 0.55rem', fontSize: '0.82rem' }}>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {dataAsAt && <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{t('ui.dataAsAt')} <strong style={{ color: 'var(--text-2)' }}>{dataAsAt}</strong></span>}
          {right}
          {onExport && (
            <button onClick={onExport} className="btn btn-secondary" style={{ padding: '0.45rem 0.7rem' }}>
              <Download size={14} aria-hidden="true" /> {t('ui.export')}
            </button>
          )}
          {onReset && active.length > 0 && (
            <button onClick={onReset} className="btn btn-secondary" style={{ padding: '0.45rem 0.7rem' }}>
              <RotateCcw size={14} aria-hidden="true" /> {t('ui.reset')}
            </button>
          )}
        </div>
      </div>

      {active.length > 0 && (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {active.map((f) => {
            const opt = f.options.find((o) => String(o.value) === String(f.value));
            return (
              <span key={f.key} className="filter-active-token" style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                border: '1px solid var(--border)', padding: '0.2rem 0.3rem 0.2rem 0.5rem', fontSize: '0.72rem',
              }}>
                {f.label}: {opt?.label ?? f.value}
                <button onClick={() => f.onChange(f.multi ? [] : '')} aria-label={t('ui.clearFilter', { label: f.label })}
                  style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: 2 }}>
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
