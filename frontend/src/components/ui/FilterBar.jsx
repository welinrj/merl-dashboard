// FilterBar — compact global filter row (spec §25). Renders labelled selects,
// active-filter chips, optional Reset/Export actions and a "Data as at" stamp.
//
//   <FilterBar
//     filters={[
//       { key:'fy', label:'Financial Year', value:fy, onChange:setFy,
//         options:[{value:'',label:'All'},{value:'2026',label:'2026'}] },
//       { key:'prov', label:'Province', value:prov, onChange:setProv, options:provinceOpts },
//     ]}
//     onReset={reset} onExport={exportCsv} dataAsAt="12 Aug 2026" />
import { useTranslation } from 'react-i18next';
import { X, RotateCcw, Download } from './icons';

export default function FilterBar({ filters = [], onReset, onExport, dataAsAt, right }) {
  const { t } = useTranslation();
  const active = filters.filter((f) => f.value != null && f.value !== '' && f.value !== 'all');

  return (
    <div className="card" style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {filters.map((f) => (
          <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0 }}>
            <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{f.label}</span>
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
            <button onClick={onExport} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.7rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              <Download size={14} aria-hidden="true" /> {t('ui.export')}
            </button>
          )}
          {onReset && active.length > 0 && (
            <button onClick={onReset} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.7rem', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              <RotateCcw size={14} aria-hidden="true" /> {t('ui.reset')}
            </button>
          )}
        </div>
      </div>

      {active.length > 0 && (
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {active.map((f) => {
            const opt = f.options.find((o) => String(o.value) === String(f.value));
            return (
              <span key={f.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'var(--green-50)', color: 'var(--green-800)', border: '1px solid var(--green-100)', borderRadius: 9999, padding: '0.15rem 0.3rem 0.15rem 0.6rem', fontSize: '0.72rem', fontWeight: 700 }}>
                {f.label}: {opt?.label ?? f.value}
                <button onClick={() => f.onChange(f.multi ? [] : '')} aria-label={t('ui.clearFilter', { label: f.label })}
                  style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-700)', padding: 2 }}>
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
