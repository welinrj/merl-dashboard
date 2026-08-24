// Shared KPI / stat tile — one consistent "form of visualisation" for headline
// numbers across the portal (Dashboard, Analysis, Project dashboards).
//
// Stat-tile contract (design-system): a muted uppercase label, the value in INK,
// and an optional secondary line. The tile carries NO icon — a headline number
// is understood from its label, and an icon beside every metric is decoration,
// not communication. Colour appears only as a small status mark, and only when
// the metric genuinely carries that state; it is never the value's own colour.
// Values use the font's default proportional figures (not tabular-nums, which
// looks loose at display sizes).
import React from 'react';

const STATUS_DOT = { green: '#1a8c4e', amber: '#d99a2b', red: '#b3402f', none: '#9a9186' };
// Status is never conveyed by colour alone (WCAG 1.4.1) — the dot carries a
// screen-reader label, and the tile's own sub-line carries the plain-text detail.
const STATUS_LABEL = { green: 'On track', amber: 'Needs attention', red: 'Critical', none: 'No data' };

/**
 * @param {object} props
 * @param {string} props.label            short uppercase label
 * @param {React.ReactNode} props.value   the headline number/text (rendered in ink)
 * @param {React.ReactNode} [props.sub]   optional secondary line (muted)
 * @param {'green'|'amber'|'red'|'none'} [props.status]  shows a small status dot by the label
 * @param {object} [props.style]          extra styles merged onto the tile
 */
export default function StatTile({ label, value, sub, status, style }) {
  return (
    <div
      className="stat-tile"
      style={{
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-card)',
        padding: '0.9rem 1rem',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minHeight: 16 }}>
        {status && (
          <span
            role="img"
            aria-label={STATUS_LABEL[status] || STATUS_LABEL.none}
            style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[status] || STATUS_DOT.none, flexShrink: 0 }}
          />
        )}
        <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)', lineHeight: 1.1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.35 }}>{sub}</div>
      )}
    </div>
  );
}
