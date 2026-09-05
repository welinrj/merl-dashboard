// =============================================================================
// VanuatuMap.jsx — compatibility entry point for MERL mapping components.
//
// VanuatuMapMini now points to the production interactive Area Council
// choropleth. The default export remains the compact province map used by older
// screens, so the rest of the portal does not need route/component changes.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import InteractiveCoverageMap from './InteractiveCoverageMap';

export const VanuatuMapMini = InteractiveCoverageMap;

const GEO_URL = `${import.meta.env.BASE_URL}vanuatu-provinces.geojson`;
const PROVINCE_ORDER = ['Torba', 'Sanma', 'Penama', 'Malampa', 'Shefa', 'Tafea'];
const W = 150;
const H = 300;
const PAD = 8;

function ringToPath(ring, bbox) {
  const { minLon, maxLon, minLat, maxLat } = bbox;
  const sx = (W - 2 * PAD) / Math.max(1e-6, maxLon - minLon);
  const sy = (H - 2 * PAD) / Math.max(1e-6, maxLat - minLat);
  return ring.map(([lon, lat], index) => {
    const x = PAD + (lon - minLon) * sx;
    const y = PAD + (maxLat - lat) * sy;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + 'Z';
}

export default function VanuatuMap({ counts = {}, nationalCount = 0, selected, onSelect }) {
  const { t } = useTranslation();
  const [features, setFeatures] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(GEO_URL)
      .then((response) => response.json())
      .then((data) => { if (alive) setFeatures(data.features || []); })
      .catch(() => { if (alive) setFeatures([]); });
    return () => { alive = false; };
  }, []);

  const { paths, bbox } = useMemo(() => {
    if (!features?.length) return { paths: [], bbox: null };
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;

    const rings = features.map((feature) => {
      const geometry = feature.geometry;
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      const outer = polygons.map((polygon) => polygon[0]);
      outer.flat().forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
      return { name: feature.properties?.NAME_1, outer };
    });

    const bounds = { minLon, maxLon, minLat, maxLat };
    return {
      paths: rings.map((row) => ({
        name: row.name,
        d: row.outer.map((ring) => ringToPath(ring, bounds)).join(' '),
      })),
      bbox: bounds,
    };
  }, [features]);

  const max = Math.max(1, ...Object.values(counts));
  const fill = (name) => {
    const count = counts[name] || 0;
    if (!count) return 'var(--surface-2)';
    const intensity = 0.25 + 0.6 * (count / max);
    return `color-mix(in srgb, var(--green-600) ${Math.round(intensity * 100)}%, #ffffff)`;
  };

  return (
    <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 auto' }}>
        {bbox ? (
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t('map.aria')} style={{ maxWidth: '100%' }}>
            {paths.map((path) => {
              const isSelected = selected === path.name;
              return (
                <path
                  key={path.name}
                  d={path.d}
                  fill={fill(path.name)}
                  stroke={isSelected ? 'var(--green-800)' : 'var(--white)'}
                  strokeWidth={isSelected ? 2 : 1}
                  style={{ cursor: 'pointer', opacity: hover && hover !== path.name ? 0.6 : 1, transition: 'opacity .15s' }}
                  onMouseEnter={() => setHover(path.name)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelect?.(path.name)}
                >
                  <title>{t('map.tooltip', { name: path.name, count: counts[path.name] || 0 })}</title>
                </path>
              );
            })}
          </svg>
        ) : (
          <div style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>
            {t('map.loading')}
          </div>
        )}
      </div>

      <div style={{ flex: '1 1 140px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', alignContent: 'start' }}>
        {PROVINCE_ORDER.map((name) => {
          const count = counts[name] || 0;
          const isSelected = selected === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect?.(name)}
              onMouseEnter={() => setHover(name)}
              onMouseLeave={() => setHover(null)}
              aria-pressed={isSelected}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.55rem', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${isSelected ? 'var(--green-500)' : 'var(--border)'}`,
                background: isSelected ? 'var(--green-50)' : 'var(--white)',
              }}
            >
              <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 600 }}>{name}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-1)' }}>{count}</span>
            </button>
          );
        })}
        {nationalCount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.55rem', borderRadius: 8, border: '1px dashed var(--border)', background: 'var(--surface-1)' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 600 }}>{t('map.national')}</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-1)' }}>{nationalCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
