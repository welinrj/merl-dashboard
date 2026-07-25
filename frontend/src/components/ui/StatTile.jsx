// Shared KPI / stat tile — one consistent "form of visualisation" for headline
// numbers across the portal (Dashboard, Analysis, Project dashboards), replacing
// the three divergent per-page tiles that made KPIs look inconsistent.
//
// Stat-tile contract (design-system): a muted uppercase label, the value in INK
// (colour is reserved for a small status mark or a left accent — never the
// number itself), and an optional secondary line. Values use the font's default
// proportional figures (not tabular-nums, which looks loose at display sizes).
import React from 'react';

const STATUS_DOT = { green: '#1a8c4e', amber: '#d99a2b', red: '#b3402f', none: '#9a9186' };

/**
 * @param {object} props
 * @param {string} props.label            short uppercase label
 * @param {React.ReactNode} props.value   the headline number/text (rendered in ink)
 * @param {React.ReactNode} [props.sub]   optional secondary line (muted)
 * @param {'green'|'amber'|'red'|'none'} [props.status]  shows a small status dot by the label
 * @param {React.ComponentType<{size?:number}>} [props.icon]  optional leading icon
 * @param {string} [props.accent]         optional accent colour (left border + icon chip)
 * @param {string} [props.accentBg]       optional icon-chip background (defaults to a teal tint)
 * @param {object} [props.style]          extra styles merged onto the tile
 */
export default function StatTile({ label, value, sub, status, icon: Icon, accent, accentBg, style }) {
  return (
    <div
      className="stat-tile"
      style={{
        background: 'var(--white)',
        border: '1px solid var(--border)',
        borderLeft: accent ? `3px solid ${accent}` : '1px solid var(--border)',
        borderRadius: 12,
        padding: '0.9rem 1rem',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minHeight: 20 }}>
        {Icon && (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 7, background: accentBg || 'var(--green-50)', color: accent || 'var(--green-700)', flexShrink: 0 }}>
            <Icon size={14} />
          </span>
        )}
        {status && (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[status] || STATUS_DOT.none, flexShrink: 0 }} />
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
