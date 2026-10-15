// Shared headline metric tile. The tile keeps a quiet product hierarchy:
// sentence-case label, one strong value and an optional explanatory line.
// Colour is reserved for a small semantic state marker, never decoration.
import React from 'react';
import { useTranslation } from 'react-i18next';

const STATUS_DOT = { green: '#1a8c4e', amber: '#d99a2b', red: '#b3402f', none: '#9a9186' };
const STATUS_LABEL = { green:'status.on_track', amber:'status.attention', red:'status.critical', none:'status.no_data' };

export default function StatTile({ label, value, sub, status, placeholder = false, style, icon: Icon }) {
  const { t } = useTranslation();
  return (
    <div className="stat-tile island-metric" style={style}>
      {Icon && <span className="merl-card-icon"><Icon size={26} /></span>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minHeight: 16 }}>
        {status && (
          <span
            role="img"
            aria-label={t(STATUS_LABEL[status] || STATUS_LABEL.none)}
            style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[status] || STATUS_DOT.none, flexShrink: 0 }}
          />
        )}
        <span className="stat-tile-label">
          {label}
        </span>
      </div>
      <div className={`stat-tile-value${placeholder ? ' is-placeholder' : ''}`}>
        {value}
      </div>
      {sub && (
        <div className="stat-tile-sub">{sub}</div>
      )}
    </div>
  );
}
