// MapPinPicker.jsx — put a village on the map when it isn't in the list.
//
// Draws the same bundled province outlines the rest of the portal uses, with no
// tile server behind it. That is deliberate: this form is filled in on a phone
// in Torba as often as at a desk in Port Vila, and a map that needs a tile fetch
// per pan is a map that does not work in the field. It costs recognisable
// imagery — you are placing a pin against a coastline, not a satellite photo —
// which is why the village dropdown carries the common case and this is the
// fallback, and why the coordinate boxes stay editable beside it.
//
// The projection is the one VanuatuMap already uses: longitude scaled by
// cos(latitude) so the islands keep their proportions, latitude negated so north
// is up. Both directions are exact, so a click maps back to a real coordinate.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, ArrowLeft } from './icons';

const GEO_URL = `${import.meta.env.BASE_URL}vanuatu-provinces.geojson`;

// Vanuatu's full extent, from the bundled outlines.
const COUNTRY = { minLon: 166.5, maxLon: 169.95, minLat: -20.3, maxLat: -13.0 };
const K = Math.cos((-16.7 * Math.PI) / 180); // longitude compression at mid-latitude

const px = (lon) => lon * K;
const py = (lat) => -lat;
const unPx = (x) => x / K;
const unPy = (y) => -y;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Viewport covering a lon/lat box, padded, in projected units. */
function boxToView(box, pad = 0.12) {
  const x0 = px(box.minLon), x1 = px(box.maxLon);
  const y0 = py(box.maxLat), y1 = py(box.minLat);
  const w = Math.max(x1 - x0, 0.02), h = Math.max(y1 - y0, 0.02);
  const p = Math.max(w, h) * pad;
  return { x: x0 - p, y: y0 - p, w: w + p * 2, h: h + p * 2 };
}

/** Every ring of a feature as an SVG path, in projected units. */
function featurePath(geometry) {
  if (!geometry) return '';
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polys.map((poly) => poly.map((ring) => ring.map(([lon, lat], i) =>
    `${i === 0 ? 'M' : 'L'}${px(lon).toFixed(4)},${py(lat).toFixed(4)}`).join(' ') + 'Z').join(' ')).join(' ');
}

function featureBox(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const poly of polys) for (const ring of poly) for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

/**
 * @param {number|null} latitude       current pin, if any
 * @param {number|null} longitude
 * @param {Function} onChange          ({latitude, longitude}) as the pin moves
 * @param {string} [province]          zoom here on open, e.g. 'SANMA'
 * @param {Array} [villages]           gazetteer villages to show for context
 */
export default function MapPinPicker({ latitude, longitude, onChange, province, villages = [] }) {
  const { t } = useTranslation();
  const svgRef = useRef(null);
  const [features, setFeatures] = useState(null);
  const [view, setView] = useState(() => boxToView(COUNTRY));
  const drag = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(GEO_URL).then((r) => r.json())
      .then((d) => { if (alive) setFeatures(d.features ?? []); })
      .catch(() => setFeatures([]));
    return () => { alive = false; };
  }, []);

  const shapes = useMemo(() => (features ?? []).map((f) => ({
    name: f.properties?.NAME_1 ?? '',
    d: featurePath(f.geometry),
    box: featureBox(f.geometry),
  })), [features]);

  // Open on the province already chosen in the form — most of the work of
  // finding a village is getting to the right island, and the form knows.
  const zoomedTo = useRef(null);
  useEffect(() => {
    if (!shapes.length) return;
    // An existing pin wins: the officer is adjusting, not starting.
    if (latitude != null && longitude != null && zoomedTo.current === null) {
      zoomedTo.current = 'pin';
      setView(boxToView({
        minLon: longitude - 0.15, maxLon: longitude + 0.15,
        minLat: latitude - 0.15, maxLat: latitude + 0.15,
      }, 0));
      return;
    }
    if (!province || zoomedTo.current === province) return;
    const hit = shapes.find((s) => s.name.toUpperCase() === String(province).toUpperCase());
    if (hit) { zoomedTo.current = province; setView(boxToView(hit.box)); }
  }, [shapes, province, latitude, longitude]);

  const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

  /** Pointer position → lon/lat, via the SVG's own coordinate space. */
  const toLonLat = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    // preserveAspectRatio="none" is not used, so the viewBox is letterboxed to
    // fit; work out the drawn area rather than assuming it fills the element.
    const scale = Math.min(r.width / view.w, r.height / view.h);
    const drawnW = view.w * scale, drawnH = view.h * scale;
    const offX = (r.width - drawnW) / 2, offY = (r.height - drawnH) / 2;
    const x = view.x + (clientX - r.left - offX) / scale;
    const y = view.y + (clientY - r.top - offY) / scale;
    return {
      longitude: Number(clamp(unPx(x), -180, 180).toFixed(5)),
      latitude: Number(clamp(unPy(y), -90, 90).toFixed(5)),
    };
  }, [view]);

  const zoom = useCallback((factor, at) => {
    setView((v) => {
      const w = clamp(v.w * factor, 0.004, boxToView(COUNTRY).w * 1.5);
      const h = w * (v.h / v.w);
      // Keep the point under the cursor fixed, so zooming feels like a map.
      const fx = at ? (at.x - v.x) / v.w : 0.5;
      const fy = at ? (at.y - v.y) / v.h : 0.5;
      return { x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy, w, h };
    });
  }, []);

  const onWheel = (e) => {
    e.preventDefault();
    const svg = svgRef.current;
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / view.w, r.height / view.h);
    const at = {
      x: view.x + (e.clientX - r.left - (r.width - view.w * scale) / 2) / scale,
      y: view.y + (e.clientY - r.top - (r.height - view.h * scale) / 2) / scale,
    };
    zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, at);
  };

  const onPointerDown = (e) => {
    // Left button / touch only.
    if (e.button != null && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;   // a click is not a drag
    d.moved = true;
    const svg = svgRef.current;
    const r = svg.getBoundingClientRect();
    const scale = Math.min(r.width / view.w, r.height / view.h);
    setView((v) => ({ ...v, x: v.x - dx / scale, y: v.y - dy / scale }));
    drag.current = { x: e.clientX, y: e.clientY, moved: true };
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (d?.moved) return;                              // panned, did not place
    const point = toLonLat(e.clientX, e.clientY);
    if (point) onChange(point);
  };

  // Keyboard: the map is a convenience over two number inputs that stay
  // editable, but it should not be a mouse-only control.
  const onKeyDown = (e) => {
    const step = view.w / 25;
    const nudge = (dx, dy) => {
      e.preventDefault();
      if (latitude == null || longitude == null) {
        const c = { longitude: unPx(view.x + view.w / 2), latitude: unPy(view.y + view.h / 2) };
        onChange({ longitude: Number(c.longitude.toFixed(5)), latitude: Number(c.latitude.toFixed(5)) });
        return;
      }
      onChange({
        longitude: Number(clamp(longitude + dx * step / K, -180, 180).toFixed(5)),
        latitude: Number(clamp(latitude - dy * step, -90, 90).toFixed(5)),
      });
    };
    if (e.key === 'ArrowLeft') nudge(-1, 0);
    else if (e.key === 'ArrowRight') nudge(1, 0);
    else if (e.key === 'ArrowUp') nudge(0, -1);
    else if (e.key === 'ArrowDown') nudge(0, 1);
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoom(1 / 1.4); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoom(1.4); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChange({
        longitude: Number(unPx(view.x + view.w / 2).toFixed(5)),
        latitude: Number(unPy(view.y + view.h / 2).toFixed(5)),
      });
    }
  };

  const reset = () => {
    zoomedTo.current = null;
    const hit = province && shapes.find((s) => s.name.toUpperCase() === String(province).toUpperCase());
    setView(boxToView(hit ? hit.box : COUNTRY));
  };

  // Only villages that have somewhere to be drawn.
  const pinnedVillages = villages.filter((v) => v.latitude != null && v.longitude != null);
  // Dots and the pin must not grow as you zoom in.
  const unit = view.w / 100;

  if (features === null) {
    return <div className="mp-frame mp-loading">{t('map.loading')}</div>;
  }

  return (
    <div className="mp-wrap">
      <div className="mp-frame">
        <svg
          ref={svgRef}
          viewBox={viewBox}
          className="mp-svg"
          role="application"
          tabIndex={0}
          aria-label={t('map.pickerAria')}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; }}
          onKeyDown={onKeyDown}
        >
          <rect x={view.x} y={view.y} width={view.w} height={view.h} className="mp-sea" />
          {shapes.map((s) => (
            <path key={s.name} d={s.d} className="mp-land"
              data-selected={province && s.name.toUpperCase() === String(province).toUpperCase() ? 'true' : undefined} />
          ))}

          {pinnedVillages.map((v) => (
            <g key={v.id} className="mp-village">
              <circle cx={px(Number(v.longitude))} cy={py(Number(v.latitude))} r={unit * 0.7} />
              <title>{v.name}</title>
            </g>
          ))}

          {latitude != null && longitude != null && (
            <g className="mp-pin" aria-hidden="true">
              <circle cx={px(longitude)} cy={py(latitude)} r={unit * 2.4} className="mp-pin-halo" />
              <circle cx={px(longitude)} cy={py(latitude)} r={unit * 1.1} className="mp-pin-dot" />
            </g>
          )}
        </svg>

        <div className="mp-controls">
          <button type="button" onClick={() => zoom(1 / 1.5)} aria-label={t('map.zoomIn')} title={t('map.zoomIn')}>
            <Plus size={14} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoom(1.5)} aria-label={t('map.zoomOut')} title={t('map.zoomOut')}>
            <span aria-hidden="true" className="mp-minus">−</span>
          </button>
          <button type="button" onClick={reset} aria-label={t('map.resetView')} title={t('map.resetView')}>
            <ArrowLeft size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="mp-hint">
        {latitude != null && longitude != null
          ? t('map.pinAt', { lat: Number(latitude).toFixed(4), lon: Number(longitude).toFixed(4) })
          : t('map.clickToPin')}
      </p>
    </div>
  );
}
