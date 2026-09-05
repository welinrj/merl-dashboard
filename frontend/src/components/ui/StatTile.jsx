// Shared headline metric tile. The tile keeps a quiet product hierarchy:
// sentence-case label, one strong value and an optional explanatory line.
// Colour is reserved for a small semantic state marker, never decoration.
import React from 'react';

const STATUS_DOT = { green: '#1a8c4e', amber: '#d99a2b', red: '#b3402f', none: '#9a9186' };
const STATUS_LABEL = { green: 'On track', amber: 'Needs attention', red: 'Critical', none: 'No data' };

export default function StatTile({ label, value, sub, status, placeholder = false, style }) {
  return (
    <div className="stat-tile" style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minHeight: 16 }}>
        {status && (
          <span
            role="img"
            aria-label={STATUS_LABEL[status] || STATUS_LABEL.none}
            style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[status] || STATUS_DOT.none, flexShrink: 0 }}
          />
        )}
        <span style={{
          fontSize: '0.72rem', fontWeight: 650, letterSpacing: 0, textTransform: 'none',
          color: 'var(--text-2)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>
      <div style={placeholder
        ? { fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-3)', lineHeight: 1.25, minWidth: 0 }
        : { fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-1)', lineHeight: 1.1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', lineHeight: 1.35 }}>{sub}</div>
      )}
    </div>
  );
}
