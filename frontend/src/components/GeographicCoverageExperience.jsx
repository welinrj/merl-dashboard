import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const AREA_COUNCIL_URLS = [
  'https://gis.unocha.org/server/rest/services/COD/GLB_COD_Admin2/MapServer/0/query?where=adm0_pcode%3D%27VU%27&outFields=adm2_name%2Cadm2_pcode%2Cadm1_name%2Cadm1_pcode&returnGeometry=true&outSR=4326&f=geojson',
  'https://services.arcgis.com/Zoi8xtp32kQcxoKu/arcgis/rest/services/vut_admbnda_adm2_spc_20180824/FeatureServer/0/query?where=1%3D1&outFields=ADM2_EN%2CADM2_PCODE%2CADM1_EN%2CADM1_PCODE&returnGeometry=true&outSR=4326&f=geojson',
];
const PROVINCES = ['Torba', 'Sanma', 'Penama', 'Malampa', 'Shefa', 'Tafea'];

let leafletPromise;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      link.crossOrigin = '';
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load the mapping library.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Could not load the mapping library.'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

function canonicalProvince(value) {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return '';
  if (key === 'national') return 'National';
  return PROVINCES.find((p) => p.toLowerCase() === key) || value;
}

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(area council|council|municipality|municipal)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function firstProp(properties, names) {
  for (const name of names) {
    const value = properties?.[name];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

function standardiseAreas(collection) {
  return {
    type: 'FeatureCollection',
    features: (collection?.features || []).map((feature) => {
      const p = feature.properties || {};
      return {
        ...feature,
        properties: {
          ...p,
          name: firstProp(p, ['name', 'adm2_name', 'ADM2_EN', 'ADM2_NAME']),
          province: canonicalProvince(firstProp(p, ['province', 'adm1_name', 'ADM1_EN', 'ADM1_NAME'])),
        },
      };
    }).filter((feature) => feature.geometry && feature.properties.name),
  };
}

async function fetchAreaCouncils(signal) {
  let lastError;
  for (const url of AREA_COUNCIL_URLS) {
    try {
      const response = await fetch(url, { signal, mode: 'cors' });
      if (!response.ok) throw new Error(`Area Council boundary service returned ${response.status}.`);
      const data = standardiseAreas(await response.json());
      if (data.features.length) return data;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Area Council boundaries are unavailable.');
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]); const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]); const yj = Number(ring[j][1]);
    const cross = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (cross) inside = !inside;
  }
  return inside;
}
function pointInPolygon(lng, lat, polygon) {
  if (!polygon?.length || !pointInRing(lng, lat, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) if (pointInRing(lng, lat, polygon[i])) return false;
  return true;
}
function featureContains(feature, lng, lat) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  return false;
}

function areaFill(count, max) {
  if (!count) return '#ece9f2';
  const ratio = max <= 1 ? 1 : (count - 1) / (max - 1);
  const stops = ['#d9d0ea', '#b9a8d8', '#927ac2', '#7155a8', '#4e347d'];
  return stops[Math.min(stops.length - 1, Math.floor(ratio * stops.length))];
}

function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

const CSS = `
  /* Replace the legacy Geographic dashboard shell around this component. */
  .db-card:has(+ .db-card .geo-experience){display:none!important}
  .db-card:has(.geo-experience){padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
  .db-card:has(.geo-experience)>div:first-child{display:none!important}
  .db-card:has(.geo-experience)+.db-2,.db-card:has(.geo-experience)+.db-2+.db-card{display:none!important}

  .geo-experience{display:flex;flex-direction:column;gap:14px;color:var(--text-1)}
  .geo-summary,.geo-toolbar,.geo-panel{background:#fff;border:1px solid var(--border);border-radius:10px}
  .geo-summary{padding:18px 20px}
  .geo-summary__head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}
  .geo-summary__head h2{margin:0;font-size:1rem;font-weight:760;color:#2d2735}
  .geo-summary__head p{margin:4px 0 0;font-size:.73rem;color:var(--text-3);line-height:1.45}
  .geo-summary__quality{font-size:.72rem;color:var(--text-2);white-space:nowrap}
  .geo-summary__quality strong{font-size:.92rem;color:var(--green-700)}
  .geo-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid #eeeaf2}
  .geo-metric{padding:14px 16px 2px 0;min-width:0}
  .geo-metric+.geo-metric{padding-left:16px;border-left:1px solid #eeeaf2}
  .geo-metric__value{font-family:var(--font-display);font-size:1.45rem;font-weight:800;letter-spacing:-.025em;color:#33284a}
  .geo-metric__label{margin-top:3px;font-size:.67rem;color:var(--text-3);line-height:1.3}

  .geo-toolbar{display:flex;align-items:end;gap:12px;padding:12px 14px}
  .geo-filter{flex:1 1 210px;min-width:0}
  .geo-filter label{display:block;margin-bottom:4px;font-size:.62rem;font-weight:700;color:#777080}
  .geo-filter select{width:100%;height:38px;padding:0 10px;border:1px solid #ddd9e3;border-radius:7px;background:#fff;color:#3f3948;font:inherit;font-size:.75rem}
  .geo-reset{height:38px;padding:0 12px;border:0;background:none;color:var(--green-700);font-size:.72rem;font-weight:700;cursor:pointer}
  .geo-reset:disabled{opacity:.4;cursor:default}

  .geo-main{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(270px,.65fr);gap:14px;align-items:stretch}
  .geo-panel{padding:16px}
  .geo-panel__title{margin:0;font-size:.9rem;font-weight:750;color:#302a38}
  .geo-panel__sub{margin:4px 0 12px;font-size:.68rem;color:var(--text-3);line-height:1.45}
  .geo-map{position:relative;height:510px;border:1px solid #ddd8e5;border-radius:8px;overflow:hidden;background:#edf1f4}
  .geo-map__target{width:100%;height:100%}
  .geo-map__loading,.geo-map__error{position:absolute;inset:0;z-index:700;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;background:rgba(248,248,250,.91);font-size:.75rem;color:#716978}
  .geo-map__error{color:#97433c}
  .geo-map__legend{position:absolute;left:12px;bottom:26px;z-index:500;padding:8px 9px;border:1px solid rgba(216,210,224,.95);border-radius:6px;background:rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(39,31,52,.08);font-size:.61rem;color:#645c6c;pointer-events:none}
  .geo-map__legend strong{display:block;margin-bottom:5px;font-size:.64rem;color:#403748}
  .geo-map__legend-row{display:flex;gap:6px;align-items:center;margin:3px 0}
  .geo-map__swatch{width:19px;height:9px;border:1px solid rgba(53,42,70,.16);border-radius:2px}
  .geo-map .leaflet-container{font-family:var(--font-body,Arial,sans-serif);background:#edf1f4;outline:none}
  .geo-map .leaflet-control-layers{font-size:12px;border-radius:6px}
  .geo-map .leaflet-popup-content-wrapper{border-radius:7px}
  .geo-map .leaflet-popup-content{margin:12px 14px;min-width:205px;font-size:12px;line-height:1.45;color:#433b4b}
  .geo-map .leaflet-tooltip.geo-area-tip{border:0;border-radius:4px;background:#342944;color:#fff;font-size:11px;font-weight:700;padding:5px 7px}
  .geo-map .leaflet-tooltip.geo-village-label{border:0;background:rgba(255,255,255,.9);box-shadow:none;color:#332b3d;font-size:10px;font-weight:700;padding:1px 3px;text-shadow:0 1px 0 #fff}
  .geo-map .leaflet-tooltip.geo-village-label::before{display:none}

  .geo-area-list{display:flex;flex-direction:column;gap:2px}
  .geo-area-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 0;border-bottom:1px solid #efedf2}
  .geo-area-row:last-child{border-bottom:0}
  .geo-area-name{font-size:.75rem;font-weight:680;color:#443d4c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .geo-area-meta{margin-top:2px;font-size:.62rem;color:#96909c}
  .geo-area-count{text-align:right;font-family:var(--font-display);font-size:.9rem;font-weight:800;color:#3e3158}
  .geo-area-count span{display:block;margin-top:1px;font-family:var(--font-body);font-size:.58rem;font-weight:500;color:#9a94a0}
  .geo-gap{margin:10px 0 4px;padding:9px 10px;border-left:3px solid #d49a27;background:#fff9eb;font-size:.66rem;line-height:1.45;color:#69552a}

  .geo-lower{display:grid;grid-template-columns:1.2fr .8fr;gap:14px}
  .geo-prov-row{display:grid;grid-template-columns:90px minmax(0,1fr) 84px;gap:10px;align-items:center;padding:7px 0}
  .geo-prov-name{font-size:.71rem;font-weight:680;color:#4b4453}
  .geo-bar{height:7px;border-radius:4px;background:#efedf3;overflow:hidden}
  .geo-bar>span{display:block;height:100%;background:#7659ad}
  .geo-prov-value{text-align:right;font-size:.66rem;color:#7d7585}
  .geo-prov-value strong{color:#403748}

  .geo-quality-row{margin:9px 0 12px}
  .geo-quality-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:4px;font-size:.69rem;color:#655d6d}
  .geo-quality-head strong{color:#403748}
  .geo-quality-track{height:7px;border-radius:4px;background:#efedf3;overflow:hidden}
  .geo-quality-track>span{display:block;height:100%;background:#665094}

  .geo-table-wrap{overflow:auto;border:1px solid #e8e5ec;border-radius:8px;margin-top:10px}
  .geo-table{width:100%;border-collapse:collapse;font-size:.7rem}
  .geo-table th{padding:8px 10px;background:#faf9fb;border-bottom:1px solid #e9e6ed;text-align:left;font-size:.6rem;font-weight:750;color:#837c89;white-space:nowrap}
  .geo-table td{padding:9px 10px;border-bottom:1px solid #f0eef2;color:#574f60;vertical-align:top}
  .geo-table tbody tr:last-child td{border-bottom:0}
  .geo-project{font-weight:700;color:#3f3748}
  .geo-muted{color:#9a94a0}

  @media(max-width:980px){.geo-main,.geo-lower{grid-template-columns:1fr}.geo-metrics{grid-template-columns:repeat(3,1fr)}.geo-metric:nth-child(4){border-left:0;padding-left:0}.geo-map{height:460px}}
  @media(max-width:700px){.geo-summary__head{flex-direction:column}.geo-metrics{grid-template-columns:repeat(2,1fr)}.geo-metric{border-left:0!important;padding-left:0!important}.geo-toolbar{align-items:stretch;flex-direction:column}.geo-filter{flex-basis:auto}.geo-map{height:390px}}
`;

export default function GeographicCoverageExperience() {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const areaLayerRef = useRef(null);
  const siteLayerRef = useRef(null);
  const villageLayerRef = useRef(null);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [villages, setVillages] = useState([]);
  const [areas, setAreas] = useState(null);
  const [province, setProvince] = useState('');
  const [projectId, setProjectId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const [p, l, v] = await Promise.all([
        supabase.from('v_projects').select('id,code,name,status,provinces'),
        supabase.from('v_project_locations').select('id,project_id,province,island,area_council,community,beneficiaries,latitude,longitude,intervention,status'),
        supabase.from('v_ref_villages').select('id,name,island,area_council,latitude,longitude,verified'),
      ]);
      if (!active) return;
      if (p.error) setError(p.error.message);
      else if (l.error) setError(l.error.message);
      setProjects(p.data || []);
      setLocations((l.data || []).map((row) => ({ ...row, province: canonicalProvince(row.province) })));
      setVillages(v.error ? [] : (v.data || []));
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAreaCouncils(controller.signal).then(setAreas).catch((err) => {
      if (err?.name !== 'AbortError') setError(err?.message || 'Area Council boundaries could not be loaded.');
    });
    return () => controller.abort();
  }, []);

  const filteredProjects = useMemo(() => projectId ? projects.filter((p) => p.id === projectId) : projects, [projectId, projects]);
  const allowedProjects = useMemo(() => new Set(filteredProjects.map((p) => p.id)), [filteredProjects]);
  const filteredLocations = useMemo(() => locations.filter((row) =>
    allowedProjects.has(row.project_id) && (!province || row.province === province)), [allowedProjects, locations, province]);

  const projectLookup = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const coverage = useMemo(() => {
    const projectsByArea = new Map();
    const rowsByArea = new Map();
    const assignedProjects = new Set();
    if (!areas) return { projectsByArea, rowsByArea, assignedProjects };
    const exact = new Map(areas.features.map((feature) => [normalise(feature.properties.name), feature]));

    for (const row of filteredLocations) {
      const lat = Number(row.latitude); const lng = Number(row.longitude);
      let feature = exact.get(normalise(row.area_council));
      if (!feature && Number.isFinite(lat) && Number.isFinite(lng)) {
        feature = areas.features.find((candidate) => featureContains(candidate, lng, lat));
      }
      if (!feature) continue;
      const name = feature.properties.name;
      if (!projectsByArea.has(name)) projectsByArea.set(name, new Set());
      if (!rowsByArea.has(name)) rowsByArea.set(name, []);
      projectsByArea.get(name).add(row.project_id);
      rowsByArea.get(name).push(row);
      assignedProjects.add(row.project_id);
    }
    return { projectsByArea, rowsByArea, assignedProjects };
  }, [areas, filteredLocations]);

  const areaRows = useMemo(() => [...coverage.projectsByArea.entries()].map(([name, ids]) => {
    const rows = coverage.rowsByArea.get(name) || [];
    const feature = areas?.features.find((f) => f.properties.name === name);
    return {
      name,
      province: feature?.properties.province || '',
      projects: ids.size,
      sites: rows.length,
      beneficiaries: rows.reduce((sum, row) => sum + (Number(row.beneficiaries) || 0), 0),
    };
  }).sort((a, b) => b.projects - a.projects || b.sites - a.sites || a.name.localeCompare(b.name)), [areas, coverage]);

  const metrics = useMemo(() => {
    const mappedProjects = new Set(filteredLocations.map((row) => row.project_id));
    const provinces = new Set(filteredLocations.map((row) => row.province).filter((p) => PROVINCES.includes(p)));
    const geocoded = filteredLocations.filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))).length;
    return {
      projects: mappedProjects.size,
      sites: filteredLocations.length,
      provinces: provinces.size,
      areas: areaRows.length,
      geocoded,
      geocodedPct: pct(geocoded, filteredLocations.length),
    };
  }, [areaRows.length, filteredLocations]);

  const provinceRows = useMemo(() => PROVINCES.map((name) => {
    const rows = filteredLocations.filter((row) => row.province === name);
    return {
      name,
      projects: new Set(rows.map((row) => row.project_id)).size,
      sites: rows.length,
      beneficiaries: rows.reduce((sum, row) => sum + (Number(row.beneficiaries) || 0), 0),
    };
  }).filter((row) => row.sites || row.projects), [filteredLocations]);

  const quality = useMemo(() => {
    const total = filteredLocations.length;
    const complete = (key) => filteredLocations.filter((row) => row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '').length;
    const coords = filteredLocations.filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude))).length;
    return [
      ['Coordinates', coords, total],
      ['Province', complete('province'), total],
      ['Area Council', complete('area_council'), total],
      ['Island', complete('island'), total],
      ['Community / village', complete('community'), total],
    ];
  }, [filteredLocations]);

  const projectRows = useMemo(() => filteredProjects.map((project) => {
    const rows = filteredLocations.filter((row) => row.project_id === project.id);
    const provinces = [...new Set(rows.map((r) => r.province).filter(Boolean))];
    const acs = [...new Set(rows.map((r) => r.area_council).filter(Boolean))];
    const geocoded = rows.filter((r) => Number.isFinite(Number(r.latitude)) && Number.isFinite(Number(r.longitude))).length;
    return { project, rows, provinces, acs, geocoded, beneficiaries: rows.reduce((s, r) => s + (Number(r.beneficiaries) || 0), 0) };
  }).filter((row) => row.rows.length), [filteredLocations, filteredProjects]);

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !mapEl.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { center: [-16.2, 167.7], zoom: 6, minZoom: 5, maxZoom: 19, zoomControl: true, scrollWheelZoom: true, touchZoom: true });
      const street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri' });
      const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Labels &copy; Esri' });
      areaLayerRef.current = L.layerGroup().addTo(map);
      siteLayerRef.current = L.layerGroup().addTo(map);
      villageLayerRef.current = L.layerGroup().addTo(map);
      L.control.layers({ 'Street map': street, Satellite: satellite }, { 'Area Councils': areaLayerRef.current, 'Project sites': siteLayerRef.current, Villages: villageLayerRef.current }, { collapsed: true, position: 'topright' }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomright', maxWidth: 120 }).addTo(map);
      map.on('baselayerchange', (event) => {
        if (event.name === 'Satellite') labels.addTo(map);
        else if (map.hasLayer(labels)) map.removeLayer(labels);
      });
      mapRef.current = map;
    }).catch((err) => setError(err.message));
    return () => { alive = false; if (mapRef.current) mapRef.current.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const L = LRef.current; const map = mapRef.current; const group = areaLayerRef.current;
    if (!L || !map || !group || !areas) return;
    group.clearLayers();
    const maxCount = Math.max(1, ...areaRows.map((row) => row.projects));
    const displayFeatures = province ? areas.features.filter((f) => f.properties.province === province) : areas.features;
    for (const feature of displayFeatures) {
      const row = areaRows.find((item) => item.name === feature.properties.name);
      const count = row?.projects || 0;
      const layer = L.geoJSON(feature, { style: { color: count ? '#5d477e' : '#a9a2b2', weight: count ? 1.35 : .75, fillColor: areaFill(count, maxCount), fillOpacity: count ? .77 : .34 } });
      layer.eachLayer((shape) => {
        shape.bindTooltip(`${esc(feature.properties.name)} · ${count} ${count === 1 ? 'project' : 'projects'}`, { sticky: true, direction: 'top', className: 'geo-area-tip' });
        const ids = [...(coverage.projectsByArea.get(feature.properties.name) || new Set())];
        const list = ids.map((id) => projectLookup.get(id)).filter(Boolean).map((p) => `<li>${esc(p.code ? `${p.code} — ${p.name}` : p.name)}</li>`).join('');
        shape.bindPopup(`<strong>${esc(feature.properties.name)}</strong><br><span style="color:#7f7788">${esc(feature.properties.province)}</span><div style="margin-top:7px"><strong>${count}</strong> ${count === 1 ? 'project' : 'projects'} · <strong>${row?.sites || 0}</strong> sites</div>${row?.beneficiaries ? `<div style="margin-top:4px">${row.beneficiaries.toLocaleString()} mapped beneficiaries</div>` : ''}${list ? `<ul style="margin:7px 0 0;padding-left:17px">${list}</ul>` : '<div style="margin-top:6px;color:#908895">No mapped project</div>'}`);
      });
      layer.addTo(group);
    }
    const bounds = L.geoJSON({ type: 'FeatureCollection', features: displayFeatures }).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], maxZoom: province ? 9 : 7 });
  }, [areaRows, areas, coverage.projectsByArea, projectLookup, province]);

  useEffect(() => {
    const L = LRef.current; const map = mapRef.current; const group = siteLayerRef.current;
    if (!L || !map || !group) return;
    const markers = filteredLocations
      .filter((row) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude)))
      .map((row) => {
        const project = projectLookup.get(row.project_id);
        const marker = L.circleMarker([Number(row.latitude), Number(row.longitude)], { radius: 4.5, color: '#453852', weight: 1.1, fillColor: '#fff', fillOpacity: 1 });
        marker.bindPopup(`<strong>${esc(row.community || 'Project site')}</strong><br><span style="color:#7f7788">${esc(project?.code || '')}${project?.name ? ` — ${esc(project.name)}` : ''}</span>${row.intervention ? `<div style="margin-top:5px">${esc(row.intervention)}</div>` : ''}${row.area_council ? `<div style="margin-top:5px;color:#8e8793">${esc(row.area_council)}</div>` : ''}`);
        return marker;
      });
    const sync = () => { group.clearLayers(); if (map.getZoom() >= 9) markers.forEach((m) => m.addTo(group)); };
    sync(); map.on('zoomend', sync); return () => { map.off('zoomend', sync); group.clearLayers(); };
  }, [filteredLocations, projectLookup]);

  useEffect(() => {
    const L = LRef.current; const map = mapRef.current; const group = villageLayerRef.current;
    if (!L || !map || !group) return;
    const markers = villages
      .map((v) => ({ ...v, lat: Number(v.latitude), lng: Number(v.longitude) }))
      .filter((v) => v.name && Number.isFinite(v.lat) && Number.isFinite(v.lng))
      .map((v) => {
        const marker = L.circleMarker([v.lat, v.lng], { radius: 3, color: '#5d477e', weight: 1, fillColor: '#fff', fillOpacity: .95 });
        marker.bindTooltip(esc(v.name), { permanent: true, direction: 'right', offset: [4, 0], className: 'geo-village-label' });
        return marker;
      });
    const sync = () => { group.clearLayers(); if (map.getZoom() >= 11) markers.forEach((m) => m.addTo(group)); };
    sync(); map.on('zoomend', sync); return () => { map.off('zoomend', sync); group.clearLayers(); };
  }, [villages]);

  const maxProvinceProjects = Math.max(1, ...provinceRows.map((row) => row.projects));
  const unassignedProjects = Math.max(0, metrics.projects - coverage.assignedProjects.size);
  const clearFilters = () => { setProvince(''); setProjectId(''); };

  return (
    <div className="geo-experience">
      <style>{CSS}</style>

      <section className="geo-summary">
        <div className="geo-summary__head">
          <div>
            <h2>Geographic Coverage</h2>
            <p>Live portfolio footprint by Province, Area Council and project site. Area Council colours represent the number of projects operating within each boundary.</p>
          </div>
          <div className="geo-summary__quality"><strong>{metrics.geocodedPct}%</strong> of displayed sites geocoded</div>
        </div>
        <div className="geo-metrics">
          <div className="geo-metric"><div className="geo-metric__value">{metrics.projects}</div><div className="geo-metric__label">Projects with mapped locations</div></div>
          <div className="geo-metric"><div className="geo-metric__value">{metrics.sites}</div><div className="geo-metric__label">Project sites</div></div>
          <div className="geo-metric"><div className="geo-metric__value">{metrics.provinces}</div><div className="geo-metric__label">Provinces represented</div></div>
          <div className="geo-metric"><div className="geo-metric__value">{metrics.areas}</div><div className="geo-metric__label">Area Councils with projects</div></div>
          <div className="geo-metric"><div className="geo-metric__value">{metrics.geocoded}</div><div className="geo-metric__label">Geo-tagged sites</div></div>
        </div>
      </section>

      <div className="geo-toolbar" aria-label="Geographic filters">
        <div className="geo-filter">
          <label htmlFor="geo-province">Province</label>
          <select id="geo-province" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">All provinces</option>
            {PROVINCES.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>
        <div className="geo-filter">
          <label htmlFor="geo-project">Project</label>
          <select id="geo-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">All projects</option>
            {projects.slice().sort((a, b) => String(a.code || a.name).localeCompare(String(b.code || b.name))).map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
          </select>
        </div>
        <button className="geo-reset" type="button" onClick={clearFilters} disabled={!province && !projectId}>Reset filters</button>
      </div>

      <div className="geo-main">
        <section className="geo-panel">
          <h3 className="geo-panel__title">Interactive Area Council coverage map</h3>
          <p className="geo-panel__sub">Zoom and pan freely. Switch to satellite imagery from Layers. Project sites appear from zoom 9 and village labels from zoom 11 when reference village data is available.</p>
          <div className="geo-map">
            <div ref={mapEl} className="geo-map__target" role="application" aria-label="Interactive Area Council project choropleth map" />
            {loading && !error && <div className="geo-map__loading">Loading live geographic coverage…</div>}
            {error && <div className="geo-map__error">{error}</div>}
            {!error && areas && <div className="geo-map__legend"><strong>Projects by Area Council</strong>{[0, 1, Math.max(2, Math.ceil(Math.max(1, ...areaRows.map((r) => r.projects)) / 2)), Math.max(1, ...areaRows.map((r) => r.projects))].filter((v, i, a) => a.indexOf(v) === i).map((count) => <div className="geo-map__legend-row" key={count}><span className="geo-map__swatch" style={{ background: areaFill(count, Math.max(1, ...areaRows.map((r) => r.projects))) }} /><span>{count} {count === 1 ? 'project' : 'projects'}</span></div>)}</div>}
          </div>
        </section>

        <aside className="geo-panel">
          <h3 className="geo-panel__title">Area Council coverage</h3>
          <p className="geo-panel__sub">Ranked by unique projects, then mapped sites.</p>
          {unassignedProjects > 0 && <div className="geo-gap"><strong>{unassignedProjects} mapped {unassignedProjects === 1 ? 'project is' : 'projects are'} not yet assigned to an Area Council.</strong><br />Coordinates can still place a site spatially when they fall inside a recognised boundary.</div>}
          <div className="geo-area-list">
            {areaRows.length ? areaRows.slice(0, 12).map((row) => <div className="geo-area-row" key={row.name}><div><div className="geo-area-name">{row.name}</div><div className="geo-area-meta">{row.province || 'Province not recorded'} · {row.sites} {row.sites === 1 ? 'site' : 'sites'}{row.beneficiaries ? ` · ${row.beneficiaries.toLocaleString()} beneficiaries` : ''}</div></div><div className="geo-area-count">{row.projects}<span>{row.projects === 1 ? 'project' : 'projects'}</span></div></div>) : <p className="geo-muted" style={{ fontSize: '.72rem' }}>No Area Council coverage is available for the current filter.</p>}
          </div>
        </aside>
      </div>

      <div className="geo-lower">
        <section className="geo-panel">
          <h3 className="geo-panel__title">Project coverage by Province</h3>
          <p className="geo-panel__sub">Unique projects operating in each Province; site count is shown at right.</p>
          {provinceRows.map((row) => <div className="geo-prov-row" key={row.name}><div className="geo-prov-name">{row.name}</div><div className="geo-bar"><span style={{ width: `${(row.projects / maxProvinceProjects) * 100}%` }} /></div><div className="geo-prov-value"><strong>{row.projects}</strong> projects · {row.sites} sites</div></div>)}
          {!provinceRows.length && <p className="geo-muted" style={{ fontSize: '.72rem' }}>No provincial locations match the current filter.</p>}
        </section>

        <section className="geo-panel">
          <h3 className="geo-panel__title">Geographic data completeness</h3>
          <p className="geo-panel__sub">Shows where location records still need strengthening before geographic reporting is complete.</p>
          {quality.map(([label, complete, total]) => <div className="geo-quality-row" key={label}><div className="geo-quality-head"><span>{label}</span><strong>{pct(complete, total)}%</strong></div><div className="geo-quality-track"><span style={{ width: `${pct(complete, total)}%` }} /></div></div>)}
        </section>
      </div>

      <section className="geo-panel">
        <h3 className="geo-panel__title">Project location register</h3>
        <p className="geo-panel__sub">A compact audit of the geographic records currently feeding this dashboard.</p>
        <div className="geo-table-wrap">
          <table className="geo-table">
            <thead><tr><th>Project</th><th>Province</th><th>Sites</th><th>Area Councils</th><th>Geo-tagged</th><th>Mapped beneficiaries</th></tr></thead>
            <tbody>{projectRows.map((row) => <tr key={row.project.id}><td><span className="geo-project">{row.project.code || '—'}</span><br /><span className="geo-muted">{row.project.name}</span></td><td>{row.provinces.join(', ') || '—'}</td><td>{row.rows.length}</td><td>{row.acs.length}</td><td>{row.geocoded}/{row.rows.length}</td><td>{row.beneficiaries ? row.beneficiaries.toLocaleString() : '—'}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
