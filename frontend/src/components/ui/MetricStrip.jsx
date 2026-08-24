// MetricStrip — one grouped row for Level-2/3 supporting metrics: a single
// bordered strip with dot separators instead of one card per number. Use
// this instead of StatTile when several related counts don't individually
// need a full card (spec: "Portfolio Summary: 14 Active Projects · 6
// Provinces · 42 Indicators · 18,430 Beneficiaries").
//
//   <MetricStrip title="Portfolio Summary" items={[
//     { label: 'Active', value: 14 },
//     { label: 'At Risk / Delayed', value: 3, tone: 'warning' },
//   ]} />
const TONE_COLOR = {
  success: 'var(--green-700)',
  warning: '#8a6416',
  danger:  'var(--red-600)',
};

export default function MetricStrip({ title, items, style }) {
  return (
    <div className="db-card" style={style}>
      {title && <h3 className="db-h">{title}</h3>}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '0.6rem' }}>
        {items.map((it, i) => (
          <span key={it.label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.6rem' }}>
            {i > 0 && <span aria-hidden="true" style={{ color: 'var(--border-strong)' }}>·</span>}
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.35rem' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 800, color: it.tone ? TONE_COLOR[it.tone] : 'var(--text-1)' }}>
                {it.value}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{it.label}</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
