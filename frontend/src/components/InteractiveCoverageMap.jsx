import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { projectMatches, useDashboardFilters } from '../lib/dashboardFilters';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const AREA_COUNCIL_URLS = [
  'https://gis.unocha.org/server/rest/services/COD/GLB_COD_Admin2/MapServer/0/query?where=adm0_pcode%3D%27VU%27&outFields=adm2_name%2Cadm2_pcode%2Cadm1_name%2Cadm1_pcode&returnGeometry=true&outSR=4326&f=geojson',
  'https://services.arcgis.com/Zoi8xtp32kQcxoKu/arcgis/rest/services/vut_admbnda_adm2_spc_20180824/FeatureServer/0/query?where=1%3D1&outFields=ADM2_EN%2CADM2_PCODE%2CADM1_EN%2CADM1_PCODE&returnGeometry=true&outSR=4326&f=geojson',
];

let leafletPromise;

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Interactive map is only available in the browser.'));
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET_CSS;
      css.crossOrigin = '';
      document.head.appendChild(css);
    }

    const prior = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (prior) {
      prior.addEventListener('load', () => resolve(window.L), { once: true });
      prior.addEventListener('error', () => reject(new Error('Could not load Leaflet.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Could not load Leaflet.'));
    document.head.appendChild(script);
  });

  return leafletPromise;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
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
          code: firstProp(p, ['code', 'adm2_pcode', 'ADM2_PCODE']),
          province: firstProp(p, ['province', 'adm1_name', 'ADM1_EN', 'ADM1_NAME']),
          province_code: firstProp(p, ['province_code', 'adm1_pcode', 'ADM1_PCODE']),
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
      const areas = standardiseAreas(await response.json());
      if (areas.features.length) return areas;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Area Council boundaries could not be loaded.');
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

function featureContains(feature, lng, lat) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  if (geometry.type === 'Polygon') return pointInPolygon(lng, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => pointInPolygon(lng, lat, polygon));
  return false;
}

function projectName(project) {
  if (!project) return 'Project';
  if (project.code && project.name) return `${project.code} — ${project.name}`;
  return project.name || project.code || 'Project';
}

function choroplethFill(count, max) {
  if (!count) return '#e9e6ef';
  const ratio = max <= 1 ? 1 : (count - 1) / (max - 1);
  const colours = ['#d5caea', '#b6a3dc', '#9178c6', '#6e52aa', '#4e347f'];
  return colours[Math.min(colours.length - 1, Math.floor(ratio * colours.length))];
}

function deriveCoverage(areas, locations) {
  const exact = new Map((areas?.features || []).map((feature) => [normalise(feature.properties.name), feature]));
  const projectsByArea = new Map();
  const rowsByArea = new Map();
  const assignedProjects = new Set();
  const mappedRows = [];

  for (const row of locations || []) {
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    let feature = exact.get(normalise(row.area_council));
    if (!feature && Number.isFinite(lat) && Number.isFinite(lng)) {
      feature = areas.features.find((candidate) => featureContains(candidate, lng, lat));
    }

    if (feature) {
      const area = feature.properties.name;
      if (!projectsByArea.has(area)) projectsByArea.set(area, new Set());
      if (!rowsByArea.has(area)) rowsByArea.set(area, []);
      projectsByArea.get(area).add(row.project_id);
      rowsByArea.get(area).push(row);
      assignedProjects.add(row.project_id);
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      mappedRows.push({ ...row, _area: feature?.properties?.name || row.area_council || '' });
    }
  }

  return { projectsByArea, rowsByArea, assignedProjects, mappedRows };
}

const CSS = `
  .ovx-location-card .ovx-location-layout{grid-template-columns:1fr!important}
  .ovx-location-card .ovx-location-table-wrap{display:none!important}
  .ovx-location-card .ovx-map-panel{min-height:0!important;overflow:visible!important;border:0!important;background:transparent!important}
  .coverage-map{min-width:0}
  .coverage-map__summary{display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin:-.15rem 0 .65rem;color:#756d80;font-size:.68rem}
  .coverage-map__live{display:inline-flex;align-items:center;gap:.4rem;color:#574e63;font-weight:700}
  .coverage-map__live::before{content:'';width:7px;height:7px;border-radius:50%;background:#2e9b5d;box-shadow:0 0 0 3px rgba(46,155,93,.11)}
  .coverage-map__hint{color:#968da1}
  .coverage-map__frame{position:relative;height:455px;min-height:390px;overflow:hidden;border:1px solid #ddd8e5;border-radius:9px;background:#eef1f4}
  .coverage-map__target{height:100%;width:100%;background:#eef1f4}
  .coverage-map__loading,.coverage-map__fatal{position:absolute;inset:0;z-index:650;display:flex;align-items:center;justify-content:center;padding:1.25rem;text-align:center;background:rgba(248,247,251,.9);font-size:.76rem;color:#6d6578}
  .coverage-map__fatal{color:#99453e}
  .coverage-map__legend{position:absolute;left:12px;bottom:26px;z-index:500;min-width:162px;padding:.55rem .65rem;border:1px solid rgba(213,208,223,.96);border-radius:6px;background:rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(37,29,52,.09);backdrop-filter:blur(6px);font-size:.62rem;color:#5e5668;pointer-events:none}
  .coverage-map__legend strong{display:block;margin-bottom:.42rem;color:#41384c;font-size:.66rem}
  .coverage-map__legend-row{display:flex;align-items:center;gap:.4rem;margin:.22rem 0}
  .coverage-map__swatch{width:20px;height:9px;border:1px solid rgba(62,48,82,.16);border-radius:2px}
  .coverage-map__footer{display:flex;justify-content:space-between;gap:.7rem;flex-wrap:wrap;margin:.55rem 0 0;color:#8e8697;font-size:.62rem}
  .coverage-map__footer strong{color:#63596f;font-weight:750}
  .coverage-map .leaflet-container{font-family:var(--font-body,Arial,sans-serif);background:#eef1f4;outline:none}
  .coverage-map .leaflet-control-zoom a,.coverage-map .leaflet-control-layers{border-color:#d8d3e1!important;color:#3e354b}
  .coverage-map .leaflet-control-layers{font-size:12px;border-radius:6px;box-shadow:0 2px 8px rgba(35,28,48,.1)}
  .coverage-map .leaflet-popup-content-wrapper{border-radius:7px;box-shadow:0 7px 24px rgba(34,27,48,.18)}
  .coverage-map .leaflet-popup-content{margin:12px 14px;min-width:215px;max-width:300px;color:#443b4e;font-size:12px;line-height:1.45}
  .coverage-map .leaflet-tooltip.coverage-map__area-tip{border:0;border-radius:4px;background:#332743;color:#fff;box-shadow:0 2px 7px rgba(0,0,0,.16);font-size:11px;font-weight:700;padding:5px 7px}
  .coverage-map .leaflet-tooltip.coverage-map__place-label{border:0;background:rgba(255,255,255,.9);box-shadow:none;color:#332b3d;font-size:10px;font-weight:700;padding:1px 3px;text-shadow:0 1px 0 #fff}
  .coverage-map .leaflet-tooltip.coverage-map__place-label::before{display:none}
  .coverage-map__home{background:#fff;border:0;border-radius:4px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#40364e;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 1px 5px rgba(0,0,0,.25)}
  @media(max-width:760px){.coverage-map__frame{height:390px}.coverage-map__summary{align-items:flex-start}.coverage-map__legend{bottom:22px}}
`;

export default function InteractiveCoverageMap({ selected }) {
  const { filters } = useDashboardFilters();
  const targetRef = useRef(null);
  const mapRef = useRef(null);
  const LRef = useRef(null);
  const areaLayerRef = useRef(null);
  const projectLayerRef = useRef(null);
  const villageLayerRef = useRef(null);
  const projectMarkersRef = useRef([]);
  const villageMarkersRef = useRef([]);
  const selectedProvinceRef = useRef('__unset__');
  const allBoundsRef = useRef(null);

  const [areas, setAreas] = useState(null);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [villageNotice, setVillageNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchAreaCouncils(controller.signal)
      .then((data) => setAreas(data))
      .catch((error) => { if (error?.name !== 'AbortError') setFatal(error?.message || 'Area Council boundaries could not be loaded.'); });
    return () => controller.abort();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const p = await supabase
        .from('v_projects')
        .select('id,code,name,status,provinces,donor,category,start_date,end_date');
      if (p.error) throw p.error;

      const filteredProjects = (p.data || []).filter((project) => projectMatches(project, filters));
      const ids = filteredProjects.map((project) => project.id);
      let locationRows = [];
      if (ids.length) {
        const l = await supabase
          .from('v_project_locations')
          .select('id,project_id,province,island,area_council,community,latitude,longitude,intervention,status,beneficiaries,village_id')
          .in('project_id', ids);
        if (l.error) throw l.error;
        locationRows = l.data || [];
      }

      let villageRows = [];
      const v = await supabase
        .from('v_ref_villages')
        .select('id,name,province_code,island,area_council,latitude,longitude,source,verified');
      if (v.error) {
        setVillageNotice('Village reference layer is temporarily unavailable; project sites and basemap place labels remain available.');
      } else {
        villageRows = v.data || [];
        setVillageNotice(villageRows.length ? '' : 'Village reference table is empty; basemap labels and project sites are shown until the uploaded village dataset is imported.');
      }

      setProjects(filteredProjects);
      setLocations(locationRows);
      setVillages(villageRows);
      setFatal('');
    } catch (error) {
      setFatal(error?.message || 'Live MERL map data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { refresh(); }, [refresh, reloadKey]);

  useEffect(() => {
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setReloadKey((value) => value + 1), 500);
    };
    const channel = supabase
      .channel('dashboard-coverage-map')
      .on('postgres_changes', { event: '*', schema: 'merl', table: 'project_locations' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'merl', table: 'ref_villages' }, schedule)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    loadLeaflet().then((L) => {
      if (!alive || !targetRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(targetRef.current, {
        center: [-16.25, 167.65], zoom: 6, minZoom: 5, maxZoom: 19,
        zoomControl: true, scrollWheelZoom: true, touchZoom: true,
        doubleClickZoom: true, dragging: true, keyboard: true,
      });

      const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagery &copy; Esri',
      });
      const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Labels &copy; Esri',
      });

      const areaLayer = L.layerGroup().addTo(map);
      const projectLayer = L.layerGroup().addTo(map);
      const villageLayer = L.layerGroup().addTo(map);
      areaLayerRef.current = areaLayer;
      projectLayerRef.current = projectLayer;
      villageLayerRef.current = villageLayer;

      L.control.layers(
        { 'Street map': streets, Satellite: satellite },
        { 'Area Council choropleth': areaLayer, 'Project sites': projectLayer, Villages: villageLayer },
        { position: 'topright', collapsed: true },
      ).addTo(map);
      L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 120 }).addTo(map);

      const Home = L.Control.extend({
        options: { position: 'topleft' },
        onAdd() {
          const button = L.DomUtil.create('button', 'coverage-map__home');
          button.type = 'button';
          button.title = 'Return to Vanuatu extent';
          button.setAttribute('aria-label', 'Return to Vanuatu extent');
          button.innerHTML = '⌂';
          L.DomEvent.disableClickPropagation(button);
          L.DomEvent.on(button, 'click', () => {
            if (allBoundsRef.current?.isValid()) map.fitBounds(allBoundsRef.current, { padding: [18, 18] });
          });
          return button;
        },
      });
      map.addControl(new Home());

      map.on('baselayerchange', (event) => {
        if (event.name === 'Satellite') labels.addTo(map);
        else if (map.hasLayer(labels)) map.removeLayer(labels);
      });

      mapRef.current = map;
      setReloadKey((value) => value + 1);
    }).catch((error) => setFatal(error?.message || 'Interactive map could not start.'));

    return () => {
      alive = false;
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      areaLayerRef.current = null;
      projectLayerRef.current = null;
      villageLayerRef.current = null;
    };
  }, []);

  const coverage = useMemo(() => {
    if (!areas) return { projectsByArea: new Map(), rowsByArea: new Map(), assignedProjects: new Set(), mappedRows: [] };
    return deriveCoverage(areas, locations);
  }, [areas, locations]);

  const projectLookup = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const maxCount = useMemo(() => Math.max(1, ...[...coverage.projectsByArea.values()].map((ids) => ids.size)), [coverage]);
  const councilsWithProjects = useMemo(() => [...coverage.projectsByArea.values()].filter((ids) => ids.size).length, [coverage]);
  const unallocated = Math.max(0, projects.length - coverage.assignedProjects.size);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = areaLayerRef.current;
    if (!L || !map || !group || !areas) return;

    group.clearLayers();
    for (const feature of areas.features) {
      const area = feature.properties.name;
      const province = feature.properties.province;
      const ids = [...(coverage.projectsByArea.get(area) || new Set())];
      const siteRows = coverage.rowsByArea.get(area) || [];
      const count = ids.length;
      const totalBeneficiaries = siteRows.reduce((sum, row) => sum + (Number(row.beneficiaries) || 0), 0);

      const layer = L.geoJSON(feature, {
        style: {
          color: count ? '#5a437a' : '#aaa2b4',
          weight: count ? 1.35 : 0.75,
          fillColor: choroplethFill(count, maxCount),
          fillOpacity: count ? 0.76 : 0.38,
        },
      });

      layer.eachLayer((shape) => {
        shape.bindTooltip(`${esc(area)} · ${count} ${count === 1 ? 'project' : 'projects'}`, {
          sticky: true, direction: 'top', className: 'coverage-map__area-tip',
        });
        const projectItems = ids
          .map((id) => projectLookup.get(id))
          .filter(Boolean)
          .sort((a, b) => projectName(a).localeCompare(projectName(b)))
          .map((project) => `<li>${esc(projectName(project))}</li>`)
          .join('');
        shape.bindPopup(`
          <div style="font-size:13px"><strong>${esc(area)}</strong></div>
          <div style="color:#766d80;margin-top:1px">${esc(province)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px">
            <div><strong>${count}</strong><br><span style="color:#8b8392">Projects</span></div>
            <div><strong>${siteRows.length}</strong><br><span style="color:#8b8392">Mapped sites</span></div>
          </div>
          ${totalBeneficiaries ? `<div style="margin-top:7px"><strong>${totalBeneficiaries.toLocaleString()}</strong> mapped beneficiaries</div>` : ''}
          ${projectItems ? `<div style="margin-top:8px;color:#665d70;font-weight:700">Projects operating here</div><ul style="margin:5px 0 0;padding-left:17px">${projectItems}</ul>` : '<div style="margin-top:8px;color:#8b8392">No project currently mapped to this Area Council.</div>'}
        `);
        shape.on('mouseover', () => shape.setStyle({ weight: 2.1, color: '#342347', fillOpacity: count ? 0.86 : 0.5 }));
        shape.on('mouseout', () => shape.setStyle({ weight: count ? 1.35 : 0.75, color: count ? '#5a437a' : '#aaa2b4', fillOpacity: count ? 0.76 : 0.38 }));
      });
      layer.addTo(group);
    }

    const bounds = L.geoJSON(areas).getBounds();
    allBoundsRef.current = bounds;
    const provinceName = selected || filters.province || '';
    if (selectedProvinceRef.current !== provinceName) {
      selectedProvinceRef.current = provinceName;
      if (provinceName) {
        const matches = areas.features.filter((feature) => normalise(feature.properties.province) === normalise(provinceName));
        if (matches.length) map.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: matches }).getBounds(), { padding: [22, 22], maxZoom: 9 });
      } else if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [18, 18] });
      }
    }
  }, [areas, coverage, filters.province, maxCount, projectLookup, selected]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = projectLayerRef.current;
    if (!L || !map || !group) return;

    projectMarkersRef.current = coverage.mappedRows.map((row) => {
      const project = projectLookup.get(row.project_id);
      const marker = L.circleMarker([Number(row.latitude), Number(row.longitude)], {
        radius: 4.8, color: '#3f354b', weight: 1.2, fillColor: '#ffffff', fillOpacity: 1,
      });
      marker.bindTooltip(esc(row.community || projectName(project)), { direction: 'top' });
      marker.bindPopup(`
        <div style="font-size:13px"><strong>${esc(row.community || 'Project site')}</strong></div>
        <div style="color:#766d80;margin-top:1px">${esc(row._area || row.area_council || '')}${row.island ? ` · ${esc(row.island)}` : ''}</div>
        <div style="margin-top:7px"><strong>${esc(projectName(project))}</strong></div>
        ${row.intervention ? `<div style="margin-top:5px">${esc(row.intervention)}</div>` : ''}
        ${row.status ? `<div style="margin-top:5px;color:#766d80">Status: ${esc(row.status)}</div>` : ''}
        ${row.beneficiaries ? `<div style="margin-top:5px;color:#766d80">Beneficiaries: ${Number(row.beneficiaries).toLocaleString()}</div>` : ''}
        <div style="margin-top:5px;color:#97909f">${Number(row.latitude).toFixed(5)}, ${Number(row.longitude).toFixed(5)}</div>
      `);
      return marker;
    });

    const sync = () => {
      group.clearLayers();
      if (map.getZoom() < 9) return;
      projectMarkersRef.current.forEach((marker) => marker.addTo(group));
    };
    sync();
    map.on('zoomend', sync);
    return () => { map.off('zoomend', sync); group.clearLayers(); projectMarkersRef.current = []; };
  }, [coverage.mappedRows, projectLookup]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = villageLayerRef.current;
    if (!L || !map || !group) return;

    villageMarkersRef.current = (villages || [])
      .map((village) => ({ ...village, lat: Number(village.latitude), lng: Number(village.longitude) }))
      .filter((village) => village.name && Number.isFinite(village.lat) && Number.isFinite(village.lng))
      .map((village) => {
        const marker = L.circleMarker([village.lat, village.lng], {
          radius: 3.3, color: '#5d477f', weight: 1, fillColor: '#fff', fillOpacity: .95,
        });
        marker.bindTooltip(esc(village.name), {
          permanent: true, direction: 'right', offset: [4, 0], className: 'coverage-map__place-label',
        });
        marker.bindPopup(`
          <strong>${esc(village.name)}</strong><br>
          <span style="color:#766d80">Village${village.area_council ? ` · ${esc(village.area_council)}` : ''}${village.island ? ` · ${esc(village.island)}` : ''}</span>
          <div style="margin-top:5px;color:#97909f">${village.lat.toFixed(5)}, ${village.lng.toFixed(5)}</div>
        `);
        return marker;
      });

    const sync = () => {
      group.clearLayers();
      if (map.getZoom() < 11) return;
      villageMarkersRef.current.forEach((marker) => marker.addTo(group));
    };
    sync();
    map.on('zoomend', sync);
    return () => { map.off('zoomend', sync); group.clearLayers(); villageMarkersRef.current = []; };
  }, [villages]);

  const legend = useMemo(() => {
    if (maxCount <= 1) return [{ label: '0 projects', count: 0 }, { label: '1 project', count: 1 }];
    const middle = Math.max(2, Math.ceil(maxCount / 2));
    return [
      { label: '0 projects', count: 0 },
      { label: '1 project', count: 1 },
      ...(middle < maxCount ? [{ label: `${middle} projects`, count: middle }] : []),
      { label: `${maxCount} projects`, count: maxCount },
    ];
  }, [maxCount]);

  return (
    <div className="coverage-map">
      <style>{CSS}</style>
      <div className="coverage-map__summary">
        <span className="coverage-map__live">Live project coverage · {councilsWithProjects} Area Councils</span>
        <span className="coverage-map__hint">Project sites from zoom 9 · village labels from zoom 11</span>
      </div>
      <div className="coverage-map__frame">
        <div ref={targetRef} className="coverage-map__target" role="application" aria-label="Interactive Vanuatu Area Council project choropleth map" />
        {loading && !fatal && <div className="coverage-map__loading">Updating live MERL coverage…</div>}
        {fatal && <div className="coverage-map__fatal">{fatal}</div>}
        {!fatal && areas && (
          <div className="coverage-map__legend" aria-hidden="true">
            <strong>Projects by Area Council</strong>
            {legend.map((item) => (
              <div className="coverage-map__legend-row" key={`${item.label}-${item.count}`}>
                <span className="coverage-map__swatch" style={{ background: choroplethFill(item.count, maxCount) }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="coverage-map__footer">
        <span>Pinch/scroll to zoom · drag to pan · Layers switches Street/Satellite and map overlays</span>
        <span>
          {unallocated
            ? <><strong>{unallocated}</strong> filtered {unallocated === 1 ? 'project is' : 'projects are'} not yet linked to a mappable Area Council</>
            : 'All filtered projects with location records are spatially allocated'}
        </span>
        {villageNotice && <span>{villageNotice}</span>}
      </div>
    </div>
  );
}
