// =============================================================================
// VanuatuMap.jsx — Vanuatu mapping components.
//
// VanuatuMapMini is the live interactive coverage map used on the executive
// Overview. It connects directly to Supabase, derives Area Council coverage from
// project locations, and renders an interactive Leaflet map with street and
// satellite basemaps. The older default VanuatuMap export is retained for other
// portal screens that still use the compact province choropleth.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { projectMatches, useDashboardFilters } from '../lib/dashboardFilters';

const GEO_URL = `${import.meta.env.BASE_URL}vanuatu-provinces.geojson`;
const PROVINCE_ORDER = ['Torba', 'Sanma', 'Penama', 'Malampa', 'Shefa', 'Tafea'];
const W = 150, H = 300, PAD = 8;

// Current global COD Admin-2 layer maintained by OCHA. The second URL is the
// long-standing SPC/OCHA Vanuatu Admin-2 service and provides a resilient
// country-specific fallback if the global service is temporarily unavailable.
const AREA_COUNCIL_URLS = [
  'https://gis.unocha.org/server/rest/services/COD/GLB_COD_Admin2/MapServer/0/query?where=adm0_pcode%3D%27VU%27&outFields=adm2_name%2Cadm2_pcode%2Cadm1_name%2Cadm1_pcode&returnGeometry=true&outSR=4326&f=geojson',
  'https://services.arcgis.com/Zoi8xtp32kQcxoKu/arcgis/rest/services/vut_admbnda_adm2_spc_20180824/FeatureServer/0/query?where=1%3D1&outFields=ADM2_EN%2CADM2_PCODE%2CADM1_EN%2CADM1_PCODE&returnGeometry=true&outSR=4326&f=geojson',
];

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
let leafletPromise;

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Map is only available in the browser.'));
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
      existing.addEventListener('error', () => reject(new Error('Could not load the map library.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Could not load the map library.'));
    document.head.appendChild(script);
  });

  return leafletPromise;
}

function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(area council|council|municipality|municipal)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function firstProp(properties, names) {
  for (const name of names) {
    const value = properties?.[name];
    if (value != null && value !== '') return value;
  }
  return '';
}

function standardiseAreas(fc) {
  return {
    type: 'FeatureCollection',
    features: (fc?.features || []).map((feature) => {
      const p = feature.properties || {};
      return {
        ...feature,
        properties: {
          ...p,
          name: firstProp(p, ['name', 'adm2_name', 'ADM2_EN', 'ADM2_NAME']),
          code: firstProp(p, ['code', 'adm2_pcode', 'ADM2_PCODE']),
          province: firstProp(p, ['province', 'adm1_name', 'ADM1_EN', 'ADM1_NAME']),
          province_code: firstProp(p, ['province_code', 'adm1_pcode', 'ADM1_PCODE']),
        },
      };
    }).filter((f) => f.geometry && f.properties.name),
  };
}

async function fetchAreaCouncils(signal) {
  let lastError;
  for (const url of AREA_COUNCIL_URLS) {
    try {
      const response = await fetch(url, { signal, mode: 'cors' });
      if (!response.ok) throw new Error(`Area Council service returned ${response.status}.`);
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
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    const crosses = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng, lat, polygon) {
  if (!polygon?.length || !pointInRing(lng, lat, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(lng, lat, polygon[i])) return false;
  }
  return true;
}

function featureContainsPoint(feature, lng, lat) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  }
  return false;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[ch]));
}

function pluralProjects(count) {
  return `${count} ${count === 1 ? 'project' : 'projects'}`;
}

function projectLabel(project) {
  if (!project) return '';
  return project.code ? `${project.code} — ${project.name || ''}` : (project.name || 'Project');
}

function deriveCoverage(areas, locations) {
  const byExactName = new Map();
  for (const feature of areas?.features || []) {
    byExactName.set(normaliseName(feature.properties?.name), feature);
  }

  const projectsByArea = new Map();
  const assignedProjects = new Set();
  const siteRows = [];

  for (const row of locations || []) {
    let feature = byExactName.get(normaliseName(row.area_council));
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!feature && Number.isFinite(lat) && Number.isFinite(lng)) {
      feature = areas.features.find((candidate) => featureContainsPoint(candidate, lng, lat));
    }

    if (feature) {
      const name = feature.properties.name;
      if (!projectsByArea.has(name)) projectsByArea.set(name, new Set());
      projectsByArea.get(name).add(row.project_id);
      assignedProjects.add(row.project_id);
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      siteRows.push({ ...row, _area: feature?.properties?.name || row.area_council || '' });
    }
  }

  return { projectsByArea, assignedProjects, siteRows };
}

function areaFill(count, max) {
  if (!count) return '#ece9f2';
  const ratio = max > 1 ? (count - 1) / (max - 1) : 1;
  const stops = ['#c9bee3', '#aa98d1', '#8972bd', '#6a51a3', '#49337d'];
  return stops[Math.min(stops.length - 1, Math.floor(ratio * stops.length))];
}

const MAP_STYLES = `
  .ovx-location-card .ovx-location-layout{grid-template-columns:1fr!important}
  .ovx-location-card .ovx-location-table-wrap{display:none!important}
  .ovx-location-card .ovx-map-panel{min-height:0!important;overflow:visible!important;border:0!important;background:transparent!important}
  .merl-live-map{min-width:0}
  .merl-live-map__meta{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin:-.15rem 0 .65rem;color:#756d80;font-size:.68rem}
  .merl-live-map__status{display:inline-flex;align-items:center;gap:.38rem;font-weight:650;color:#5a5264}
  .merl-live-map__status::before{content:'';width:7px;height:7px;border-radius:50%;background:#2f9b5f;box-shadow:0 0 0 3px rgba(47,155,95,.1)}
  .merl-live-map__note{color:#91899d}
  .merl-live-map__canvas{position:relative;height:430px;min-height:360px;overflow:hidden;border:1px solid #dfdbe6;border-radius:8px;background:#eef1f4}
  .merl-live-map__target{height:100%;width:100%;background:#eef1f4}
  .merl-live-map__loading,.merl-live-map__error{position:absolute;inset:0;z-index:500;display:flex;align-items:center;justify-content:center;padding:1.25rem;text-align:center;background:rgba(248,247,251,.92);color:#6d6578;font-size:.76rem}
  .merl-live-map__error{color:#93413c}
  .merl-live-map__legend{position:absolute;left:10px;bottom:23px;z-index:450;min-width:158px;padding:.55rem .65rem;border:1px solid rgba(216,211,226,.95);border-radius:6px;background:rgba(255,255,255,.94);box-shadow:0 2px 8px rgba(35,28,48,.08);backdrop-filter:blur(5px);font-size:.62rem;color:#5e5668;pointer-events:none}
  .merl-live-map__legend b{display:block;margin-bottom:.4rem;color:#41384c;font-size:.66rem}
  .merl-live-map__legend-row{display:flex;align-items:center;gap:.38rem;margin:.22rem 0}
  .merl-live-map__swatch{width:18px;height:9px;border:1px solid rgba(62,48,82,.18);border-radius:2px}
  .merl-live-map .leaflet-container{font-family:var(--font-body,Arial,sans-serif);background:#eef1f4;outline:none}
  .merl-live-map .leaflet-control-zoom a,.merl-live-map .leaflet-control-layers{border-color:#d9d4e2!important;color:#3f354c}
  .merl-live-map .leaflet-control-layers{font-size:12px;border-radius:6px;box-shadow:0 2px 8px rgba(35,28,48,.09)}
  .merl-live-map .leaflet-popup-content-wrapper,.merl-live-map .leaflet-popup-tip{box-shadow:0 6px 22px rgba(34,27,48,.16)}
  .merl-live-map .leaflet-popup-content-wrapper{border-radius:7px}
  .merl-live-map .leaflet-popup-content{margin:12px 14px;min-width:190px;color:#443b4e;font-size:12px;line-height:1.45}
  .merl-live-map .leaflet-tooltip.merl-area-tooltip{border:0;border-radius:4px;background:#352b47;color:#fff;box-shadow:0 2px 7px rgba(0,0,0,.15);font-size:11px;font-weight:650;padding:5px 7px}
  .merl-live-map .leaflet-tooltip.merl-village-label{border:0;background:rgba(255,255,255,.88);box-shadow:none;color:#312a3a;font-size:10px;font-weight:650;padding:1px 3px;text-shadow:0 1px 0 #fff}
  .merl-live-map .leaflet-tooltip.merl-village-label::before{display:none}
  .merl-live-map__footer{display:flex;justify-content:space-between;gap:.65rem;flex-wrap:wrap;margin:.5rem 0 0;color:#8d8596;font-size:.62rem}
  .merl-live-map__footer strong{color:#655c70;font-weight:700}
  @media(max-width:760px){.merl-live-map__canvas{height:380px}.merl-live-map__legend{bottom:18px}.merl-live-map__meta{align-items:flex-start}}
`;

// Live Area Council choropleth used on Dashboard Overview.
// Signature retains the legacy props so Overview.jsx does not need a parallel
// data path; the component reads the shared dashboard filters directly.
export function VanuatuMapMini({ selected }) {
  const { filters } = useDashboardFilters();
  const { t } = useTranslation();
  const targetRef = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const areaGroupRef = useRef(null);
  const villagesGroupRef = useRef(null);
  const labelsLayerRef = useRef(null);
  const nationalBoundsRef = useRef(null);
  const lastFitRef = useRef('__initial__');
  const villageMarkersRef = useRef([]);
  const villagesEnabledRef = useRef(true);

  const [areas, setAreas] = useState(null);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchAreaCouncils(controller.signal)
      .then(setAreas)
      .catch((err) => { if (err?.name !== 'AbortError') setError(err?.message || 'Area Council boundaries could not be loaded.'); });
    return () => controller.abort();
  }, []);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      const projectResponse = await supabase
        .from('v_projects')
        .select('id,code,name,status,provinces,donor,category,start_date,end_date');
      if (projectResponse.error) throw projectResponse.error;

      const visibleProjects = (projectResponse.data || []).filter((p) => projectMatches(p, filters));
      const ids = visibleProjects.map((p) => p.id);
      let locationRows = [];
      if (ids.length) {
        const locationResponse = await supabase
          .from('v_project_locations')
          .select('id,project_id,province,island,area_council,community,latitude,longitude,intervention,status,beneficiaries,village_id')
          .in('project_id', ids);
        if (locationResponse.error) throw locationResponse.error;
        locationRows = locationResponse.data || [];
      }

      const villageResponse = await supabase
        .from('v_ref_villages')
        .select('id,name,province_code,island,area_council,latitude,longitude,source,verified');
      if (villageResponse.error) throw villageResponse.error;

      setProjects(visibleProjects);
      setLocations(locationRows);
      setVillages(villageResponse.data || []);
      setError('');
    } catch (err) {
      setError(err?.message || 'Map data could not be loaded from the MERL database.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { refreshData(); }, [refreshData, reloadKey]);

  // Keep the map current if location/reference data changes while a user has the
  // Overview open. Realtime is an enhancement; the regular Supabase reads above
  // remain the authoritative fallback if publication settings do not expose a table.
  useEffect(() => {
    let timer;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setReloadKey((n) => n + 1), 450);
    };
    const channel = supabase
      .channel('overview-live-coverage-map')
      .on('postgres_changes', { event: '*', schema: 'merl', table: 'project_locations' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'merl', table: 'ref_villages' }, schedule)
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !targetRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(targetRef.current, {
        center: [-16.2, 167.65],
        zoom: 6,
        minZoom: 5,
        maxZoom: 19,
        zoomControl: true,
        scrollWheelZoom: true,
        touchZoom: true,
        doubleClickZoom: true,
        dragging: true,
        keyboard: true,
        worldCopyJump: false,
      });

      const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Imagery &copy; Esri',
      });
      const satelliteLabels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        pane: 'overlayPane',
        attribution: 'Labels &copy; Esri',
      });
      labelsLayerRef.current = satelliteLabels;

      const areaGroup = L.layerGroup().addTo(map);
      const villagesGroup = L.layerGroup().addTo(map);
      areaGroupRef.current = areaGroup;
      villagesGroupRef.current = villagesGroup;

      L.control.layers(
        { Streets: streets, Satellite: satellite },
        { 'Area councils': areaGroup, 'Villages & project sites': villagesGroup },
        { position: 'topright', collapsed: true },
      ).addTo(map);
      L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 120 }).addTo(map);

      map.on('baselayerchange', (event) => {
        if (event.name === 'Satellite') {
          satelliteLabels.addTo(map);
        } else if (map.hasLayer(satelliteLabels)) {
          map.removeLayer(satelliteLabels);
        }
      });
      map.on('overlayadd', (event) => {
        if (event.layer === villagesGroup) villagesEnabledRef.current = true;
      });
      map.on('overlayremove', (event) => {
        if (event.layer === villagesGroup) villagesEnabledRef.current = false;
      });

      mapRef.current = map;
      setReloadKey((n) => n + 1);
    }).catch((err) => setError(err?.message || 'Interactive map could not be started.'));

    return () => {
      alive = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      areaGroupRef.current = null;
      villagesGroupRef.current = null;
    };
  }, []);

  const coverage = useMemo(() => {
    if (!areas) return { projectsByArea: new Map(), assignedProjects: new Set(), siteRows: [] };
    return deriveCoverage(areas, locations);
  }, [areas, locations]);

  const projectLookup = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const maximumAreaProjects = useMemo(() => Math.max(1, ...[...coverage.projectsByArea.values()].map((set) => set.size)), [coverage]);
  const councilsWithProjects = useMemo(() => [...coverage.projectsByArea.values()].filter((set) => set.size > 0).length, [coverage]);
  const unallocatedProjects = Math.max(0, projects.length - coverage.assignedProjects.size);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = areaGroupRef.current;
    if (!L || !map || !group || !areas) return;

    group.clearLayers();
    for (const feature of areas.features) {
      const name = feature.properties.name;
      const province = feature.properties.province;
      const projectIds = [...(coverage.projectsByArea.get(name) || new Set())];
      const count = projectIds.length;
      const layer = L.geoJSON(feature, {
        style: {
          color: count ? '#5c477d' : '#aaa2b5',
          weight: count ? 1.35 : 0.75,
          fillColor: areaFill(count, maximumAreaProjects),
          fillOpacity: count ? 0.74 : 0.38,
        },
      });
      layer.eachLayer((shape) => {
        shape.feature = feature;
        shape.bindTooltip(`${escapeHtml(name)} · ${pluralProjects(count)}`, {
          sticky: true,
          direction: 'top',
          className: 'merl-area-tooltip',
        });
        const projectLines = projectIds
          .map((id) => projectLabel(projectLookup.get(id)))
          .filter(Boolean)
          .sort()
          .map((label) => `<li>${escapeHtml(label)}</li>`)
          .join('');
        shape.bindPopup(`
          <div><strong>${escapeHtml(name)}</strong><br>
          <span style="color:#766d80">${escapeHtml(province)}</span></div>
          <div style="margin-top:6px"><strong>${pluralProjects(count)}</strong></div>
          ${projectLines ? `<ul style="margin:6px 0 0;padding-left:17px">${projectLines}</ul>` : '<div style="margin-top:5px;color:#8a8291">No projects currently mapped to this Area Council.</div>'}
        `);
        shape.on('mouseover', () => shape.setStyle({ weight: 2.1, color: '#392a56', fillOpacity: count ? 0.83 : 0.48 }));
        shape.on('mouseout', () => shape.setStyle({ weight: count ? 1.35 : 0.75, color: count ? '#5c477d' : '#aaa2b5', fillOpacity: count ? 0.74 : 0.38 }));
      });
      layer.addTo(group);
    }

    const allBounds = L.geoJSON(areas).getBounds();
    nationalBoundsRef.current = allBounds;
    const provinceName = selected || filters.province || '';
    if (lastFitRef.current !== provinceName) {
      lastFitRef.current = provinceName;
      if (provinceName) {
        const matching = areas.features.filter((f) => normaliseName(f.properties.province) === normaliseName(provinceName));
        if (matching.length) {
          map.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: matching }).getBounds(), { padding: [22, 22], maxZoom: 9 });
        }
      } else if (allBounds.isValid()) {
        map.fitBounds(allBounds, { padding: [18, 18] });
      }
    }
  }, [areas, coverage, filters.province, maximumAreaProjects, projectLookup, selected]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = villagesGroupRef.current;
    if (!L || !map || !group) return;

    const referencePoints = (villages || [])
      .map((v) => ({
        kind: 'village',
        name: v.name,
        area: v.area_council,
        island: v.island,
        lat: Number(v.latitude),
        lng: Number(v.longitude),
        verified: v.verified,
      }))
      .filter((v) => v.name && Number.isFinite(v.lat) && Number.isFinite(v.lng));

    // Project location points are a useful fallback while the dedicated village
    // reference table is being populated. They are labelled as project sites so
    // they cannot be mistaken for a complete national village gazetteer.
    const projectPoints = coverage.siteRows
      .filter((row) => row.community)
      .map((row) => ({
        kind: 'project',
        name: row.community,
        area: row._area,
        island: row.island,
        project: projectLookup.get(row.project_id),
        lat: Number(row.latitude),
        lng: Number(row.longitude),
      }));

    const points = referencePoints.length ? referencePoints : projectPoints;
    villageMarkersRef.current = points.map((point) => {
      const isVillage = point.kind === 'village';
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: isVillage ? 3.6 : 4.4,
        color: isVillage ? '#4e3a72' : '#4e5668',
        weight: 1.1,
        fillColor: isVillage ? '#ffffff' : '#e9edf2',
        fillOpacity: 0.95,
      });
      const label = isVillage ? point.name : `${point.name} · project site`;
      marker.bindTooltip(escapeHtml(label), {
        permanent: true,
        direction: 'right',
        offset: [4, 0],
        className: 'merl-village-label',
      });
      marker.bindPopup(`
        <strong>${escapeHtml(point.name)}</strong><br>
        <span style="color:#766d80">${isVillage ? 'Village' : 'Project location'}${point.area ? ` · ${escapeHtml(point.area)}` : ''}${point.island ? ` · ${escapeHtml(point.island)}` : ''}</span>
        ${point.project ? `<div style="margin-top:5px">${escapeHtml(projectLabel(point.project))}</div>` : ''}
        <div style="margin-top:5px;color:#928a99">${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}</div>
      `);
      return marker;
    });

    const sync = () => {
      group.clearLayers();
      if (!villagesEnabledRef.current || map.getZoom() < 11) return;
      for (const marker of villageMarkersRef.current) marker.addTo(group);
    };
    sync();
    map.on('zoomend', sync);
    return () => {
      map.off('zoomend', sync);
      group.clearLayers();
      villageMarkersRef.current = [];
    };
  }, [coverage.siteRows, projectLookup, villages]);

  const legendStops = useMemo(() => {
    if (maximumAreaProjects <= 1) return [{ label: 'No projects', count: 0 }, { label: '1 project', count: 1 }];
    const mid = Math.max(1, Math.ceil(maximumAreaProjects / 2));
    return [
      { label: 'No projects', count: 0 },
      { label: '1 project', count: 1 },
      ...(mid > 1 && mid < maximumAreaProjects ? [{ label: `${mid} projects`, count: mid }] : []),
      { label: `${maximumAreaProjects} projects`, count: maximumAreaProjects },
    ];
  }, [maximumAreaProjects]);

  return (
    <div className="merl-live-map">
      <style>{MAP_STYLES}</style>
      <div className="merl-live-map__meta">
        <span className="merl-live-map__status">Live MERL project coverage · {councilsWithProjects} Area Councils</span>
        <span className="merl-live-map__note">Zoom to level 11+ for village / project-location labels</span>
      </div>
      <div className="merl-live-map__canvas">
        <div ref={targetRef} className="merl-live-map__target" role="application" aria-label="Interactive Vanuatu Area Council project coverage map" />
        {loading && <div className="merl-live-map__loading">Loading live project coverage…</div>}
        {error && <div className="merl-live-map__error">{error}</div>}
        {!error && areas && (
          <div className="merl-live-map__legend" aria-hidden="true">
            <b>Projects by Area Council</b>
            {legendStops.map((stop) => (
              <div className="merl-live-map__legend-row" key={`${stop.label}-${stop.count}`}>
                <span className="merl-live-map__swatch" style={{ background: areaFill(stop.count, maximumAreaProjects) }} />
                <span>{stop.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="merl-live-map__footer">
        <span>Use <strong>+</strong>/<strong>−</strong> or pinch to zoom · drag to pan · Layers switches Streets / Satellite</span>
        <span>{unallocatedProjects ? <><strong>{unallocatedProjects}</strong> filtered {unallocatedProjects === 1 ? 'project has' : 'projects have'} no mappable Area Council location</> : 'All filtered projects with location records are spatially allocated'}</span>
      </div>
    </div>
  );
}

function ringToPath(ring, bbox) {
  const { minLon, maxLon, minLat, maxLat } = bbox;
  const sx = (W - 2 * PAD) / Math.max(1e-6, maxLon - minLon);
  const sy = (H - 2 * PAD) / Math.max(1e-6, maxLat - minLat);
  return ring.map(([lon, lat], i) => {
    const x = PAD + (lon - minLon) * sx;
    const y = PAD + (maxLat - lat) * sy;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + 'Z';
}

export default function VanuatuMap({ counts = {}, nationalCount = 0, selected, onSelect }) {
  const { t } = useTranslation();
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
    const ramp = 0.25 + 0.6 * (c / max);
    return `color-mix(in srgb, var(--green-600) ${Math.round(ramp * 100)}%, #ffffff)`;
  };

  return (
    <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
      <div style={{ flex: '0 0 auto' }}>
        {bbox ? (
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={t('map.aria')} style={{ maxWidth: '100%' }}>
            {paths.map((p) => {
              const isSel = selected === p.name;
              return (
                <path key={p.name} d={p.d}
                  fill={fill(p.name)} stroke={isSel ? 'var(--green-800)' : 'var(--white)'}
                  strokeWidth={isSel ? 2 : 1} style={{ cursor: 'pointer', opacity: hover && hover !== p.name ? 0.6 : 1, transition: 'opacity .15s' }}
                  onMouseEnter={() => setHover(p.name)} onMouseLeave={() => setHover(null)}
                  onClick={() => onSelect?.(p.name)}>
                  <title>{t('map.tooltip', { name: p.name, count: counts[p.name] || 0 })}</title>
                </path>
              );
            })}
          </svg>
        ) : (
          <div style={{ width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: '0.8rem' }}>{t('map.loading')}</div>
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
