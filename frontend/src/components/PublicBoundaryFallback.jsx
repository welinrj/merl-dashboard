import { useMemo } from 'react';
import { geometryBounds } from '../lib/maplibreCoverage';

function boundaryPath({ type, coordinates }) {
  const line = points => points.map(([lng, lat], i) => `${i ? 'L' : 'M'}${lng.toFixed(5)},${(-lat).toFixed(5)}`).join('');
  if (type === 'Polygon') return coordinates.map(ring => line(ring) + 'Z').join('');
  if (type === 'MultiPolygon') return coordinates.flatMap(polygon => polygon.map(ring => line(ring) + 'Z')).join('');
  if (type === 'LineString') return line(coordinates);
  if (type === 'MultiLineString') return coordinates.map(line).join('');
  return '';
}

export default function PublicBoundaryFallback({ data, collection, locationsOnly, showBorders, onSelect, label }) {
  const land = useMemo(() => boundaryPath(data.display.land.geometry), [data]);
  const borders = useMemo(() => boundaryPath(data.display.boundaries.geometry), [data]);
  const paths = useMemo(() => data.features.map(f => boundaryPath(f.geometry)), [data]);
  const recorded = collection.features.filter(feature => feature.properties.projectCount > 0);
  const selected = recorded.filter(feature => feature.properties.selected);
  const focus = locationsOnly === null && selected.length ? selected : locationsOnly && recorded.length ? recorded : data.features;
  const [[west, south], [east, north]] = geometryBounds({ features: focus });
  const padding = Math.max(east - west, north - south, 0.15) * 0.1;
  const viewBox = [west - padding, -north - padding, east - west + padding * 2, north - south + padding * 2].join(' ');

  return <svg className="pub-map-boundary-fallback" viewBox={viewBox} aria-label={label}>
    <path d={land} fill="#f2f3ed" stroke="#66808a" strokeWidth="0.7" vectorEffect="non-scaling-stroke" fillRule="evenodd" />
    {showBorders && <path d={borders} fill="none" stroke="#66808a" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />}
    {recorded.map(({ id, properties }) => {
      const select = () => onSelect?.(properties.areaKey);
      return <path key={properties.areaKey} d={paths[id]} fill={properties.colour} fillOpacity={properties.selected ? 0.82 : 0.6}
        stroke={properties.selected ? '#163d57' : properties.colour} strokeWidth={properties.selected ? 2 : 1}
        fillRule="evenodd" vectorEffect="non-scaling-stroke" role={onSelect ? 'button' : undefined}
        tabIndex={onSelect ? 0 : undefined} aria-label={`${properties.ADM2_EN}, ${properties.ADM1_EN}`}
        onClick={onSelect ? select : undefined} onKeyDown={onSelect ? event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
        } : undefined}>
        <title>{properties.ADM2_EN}</title>
      </path>;
    })}
  </svg>;
}
