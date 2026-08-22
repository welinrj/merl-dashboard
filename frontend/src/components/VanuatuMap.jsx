// =============================================================================
// VanuatuMap.jsx — lightweight Vanuatu province choropleth built from the
// bundled public/vanuatu-provinces.geojson (6 Polygon features, NAME_1). No map
// library: coordinates are linearly projected into an SVG viewBox and shaded by
// project count. Province cards sit beside the map (matching the sample), and
// clicking a province (map or card) filters the dashboard.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';

const GEO_URL = `${import.meta.env.BASE_URL}vanuatu-provinces.geojson`;
const PROVINCE_ORDER = ['Torba', 'Sanma', 'Penama', 'Malampa', 'Shefa', 'Tafea'];

const W = 150, H = 300, PAD = 8;

function ringToPath(ring, bbox) {
  const { minLon, maxLon, minLat, maxLat } = bbox;
  const sx = (W - 2 * PAD) / Math.max(1e-6, maxLon - minLon);
  const sy = (H - 2 * PAD) / Math.max(1e-6, maxLat - minLat);
  return ring.map(([lon, lat], i) => {
    const x = PAD + (lon - minLon) * sx;
    const y = PAD + (maxLat - lat) * sy; // flip
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + 'Z';
}

export default function VanuatuMap({ counts = {}, selected, onSelect }) {
  const [features, setFeatures] = useState(null);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch(GEO_URL).then((r) => r.json()).then((d) => { if (alive) setFeatures(d.features || []); }).catch(() => setFeatures([]));
    return () => { alive = false; };
  }, []);

  const { paths, bbox } = useMemo(() => {
    if (!features || !features.length) return { paths: [], bbox: null };
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    const rings = features.map((f) => {
      const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
      const outer = polys.map((poly) => poly[0]);
      outer.flat().forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
      });
      return { name: f.properties?.NAME_1, outer };
    });
    const bb = { minLon, maxLon, minLat, maxLat };
    return { paths: rings.map((r) => ({ name: r.name, d: r.outer.map((ring) => ringToPath(ring, bb)).join(' ') })), bbox: bb };
  }, [features]);

  const max = Math.max(1, ...Object.values(counts));
  const fill = (name) => {
    const c = counts[name] || 0;
    if (c === 0) return 'var(--surface-2)';
    const t = 0.25 + 0.6 * (c / max); // 0.25..0.85 intensity
    return `color-mix(in srgb, var(--green-600) ${Math.round(t * 100)}%, #ffffff)`;
  };

  return (
    <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 auto' }}>
        {bbox ? (
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Projects by province map of Vanuatu" style={{ maxWidth: '100%' }}>
            {paths.map((p) => {
              const isSel = selected === p.name;
              return (
                <path key={p.name} d={p.d}
                  fill={fill(p.name)} stroke={isSel ? 'var(--green-800)' : 'var(--white)'}
                  strokeWidth={isSel ? 2 : 1} style={{ cursor: 'pointer', opacity: hover && hover !== p.name ? 0.6 : 1, transition: 'opacity .15s' }}
                  onMouseEnter={() => setHover(p.name)} onMouseLeave={() => setHover(null)}
                  onClick={() => onSelect?.(p.name)}>
                  <title>{p.name}: {counts[p.name] || 0} project(s)</title>
                </path>
              );
            })}
          </svg>
        ) : (
          <div style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>Map…</div>
        )}
      </div>
      <div style={{ flex: '1 1 140px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', alignContent: 'start' }}>
        {PROVINCE_ORDER.map((name) => {
          const c = counts[name] || 0;
          const isSel = selected === name;
          return (
            <button key={name} onClick={() => onSelect?.(name)}
              onMouseEnter={() => setHover(name)} onMouseLeave={() => setHover(null)}
              aria-pressed={isSel}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem',
                padding: '0.4rem 0.55rem', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${isSel ? 'var(--green-500)' : 'var(--border)'}`,
                background: isSel ? 'var(--green-50)' : 'var(--white)',
              }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', fontWeight: 600 }}>{name}</span>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-1)' }}>{c}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
