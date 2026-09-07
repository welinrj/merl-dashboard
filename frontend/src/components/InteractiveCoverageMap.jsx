import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { projectMatches, useDashboardFilters } from '../lib/dashboardFilters';
import {
  AREA_COLORS, VANUATU_BOUNDS, normalise, provinceName, coordinate,
  areaKey, areaColor, deriveCoverage, projectName, escapeHtml,
} from '../lib/coverageMapCore';
import './coverage-map.css';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const AREA_COUNCIL_URLS = [
  'https://gis.unocha.org/server/rest/services/COD/GLB_COD_Admin2/MapServer/0/query?where=adm0_pcode%3D%27VU%27&outFields=adm2_name%2Cadm2_pcode%2Cadm1_name%2Cadm1_pcode&returnGeometry=true&outSR=4326&f=geojson',
  'https://services.arcgis.com/Zoi8xtp32kQcxoKu/arcgis/rest/services/vut_admbnda_adm2_spc_20180824/FeatureServer/0/query?where=1%3D1&outFields=ADM2_EN%2CADM2_PCODE%2CADM1_EN%2CADM1_PCODE&returnGeometry=true&outSR=4326&f=geojson',
];
let leafletPromise;

function loadLeaflet() {
  if (typeof window === 'undefined') return Promise.reject(new Error('The map requires a browser.'));
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
        const css = document.createElement('link');
        css.rel = 'stylesheet'; css.href = LEAFLET_CSS; css.crossOrigin = '';
        document.head.appendChild(css);
      }
      const script = document.querySelector(`script[src="${LEAFLET_JS}"]`) || document.createElement('script');
      const onLoad = () => window.L ? resolve(window.L) : reject(new Error('The mapping library did not initialise.'));
      const onError = () => reject(new Error('Could not load the mapping library.'));
      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (!script.isConnected) {
        script.src = LEAFLET_JS; script.crossOrigin = '';
        document.head.appendChild(script);
      }
    }).catch(error => { leafletPromise = null; throw error; });
  }
  return leafletPromise;
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
    features: (collection?.features || []).map(feature => {
      const p = feature.properties || {};
      return { ...feature, properties: {
        ...p,
        name: firstProp(p, ['name', 'adm2_name', 'ADM2_EN', 'ADM2_NAME']),
        code: firstProp(p, ['code', 'adm2_pcode', 'ADM2_PCODE']),
        province: provinceName(firstProp(p, ['province', 'adm1_name', 'ADM1_EN', 'ADM1_NAME'])),
        province_code: firstProp(p, ['province_code', 'adm1_pcode', 'ADM1_PCODE']),
      } };
    }).filter(feature => feature.geometry && feature.properties.name),
  };
}
async function fetchAreaCouncils(signal) {
  let lastError;
  for (const url of AREA_COUNCIL_URLS) {
    try {
      const response = await fetch(url, { signal, mode: 'cors' });
      if (!response.ok) throw new Error(`Boundary service returned ${response.status}.`);
      const areas = standardiseAreas(await response.json());
      if (areas.features.length) return areas;
      throw new Error('The boundary service returned no Area Councils.');
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError || new Error('Area Council boundaries could not be loaded.');
}
const emptyCoverage = () => ({ projectsByArea: new Map(), rowsByArea: new Map(), assignedProjects: new Set(), mappedRows: [], unassignedRows: [] });

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
  const allBoundsRef = useRef(null);
  const selectedProvinceRef = useRef('__unset__');
  const [mapReady, setMapReady] = useState(false);
  const [areas, setAreas] = useState(null);
  const [projects, setProjects] = useState([]);
  const [locations, setLocations] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [villageNotice, setVillageNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [boundaryKey, setBoundaryKey] = useState(0);
  const [selectedArea, setSelectedArea] = useState(null);
  const [layerVisibility, setLayerVisibility] = useState({ areas: true, sites: true, villages: true });

  useEffect(() => {
    const controller = new AbortController();
    fetchAreaCouncils(controller.signal).then(setAreas).catch(error => {
      if (error?.name !== 'AbortError') setFatal(error?.message || 'Area Council boundaries could not be loaded.');
    });
    return () => controller.abort();
  }, [boundaryKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const p = await supabase.from('v_projects').select('id,code,name,status,provinces,donor,category,start_date,end_date');
      if (p.error) throw p.error;
      const filteredProjects = (p.data || []).filter(project => projectMatches(project, filters));
      const ids = filteredProjects.map(project => project.id);
      let locationRows = [];
      if (ids.length) {
        const l = await supabase.from('v_project_locations')
          .select('id,project_id,province,island,area_council,community,latitude,longitude,intervention,status,beneficiaries,village_id')
          .in('project_id', ids);
        if (l.error) throw l.error;
        locationRows = l.data || [];
      }
      const v = await supabase.from('v_ref_villages')
        .select('id,name,province_code,island,area_council,latitude,longitude,source,verified');
      setVillageNotice(v.error
        ? 'Village reference locations are temporarily unavailable. Project sites and basemap labels remain available.'
        : v.data?.length ? '' : 'Village reference locations have not yet been imported. Project sites and basemap labels remain available.');
      setProjects(filteredProjects);
      setLocations(locationRows);
      setVillages(v.error ? [] : (v.data || []));
      setFatal('');
    } catch (error) {
      setFatal(error?.message || 'Live MERL coverage could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => { void refresh(); }, [refresh, reloadKey]);

  useEffect(() => {
    let timer;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setReloadKey(value => value + 1), 500);
    };
    const channel = supabase.channel('dashboard-coverage-map')
      .on('postgres_changes', { event: '*', schema: 'merl', table: 'project_locations' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'merl', table: 'ref_villages' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'merl', table: 'projects' }, schedule)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(channel); };
  }, []);

  const fitNational = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.invalidateSize();
    const bounds = allBoundsRef.current?.isValid() ? allBoundsRef.current : VANUATU_BOUNDS;
    map.fitBounds(bounds, { padding: [18, 18], maxZoom: 7, animate: false });
  }, []);

  useEffect(() => {
    let alive = true;
    let observer;
    loadLeaflet().then(L => {
      if (!alive || !targetRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(targetRef.current, {
        center: [-16.25, 167.65], zoom: 5, minZoom: 4, maxZoom: 19,
        zoomControl: true, scrollWheelZoom: true, touchZoom: true,
        doubleClickZoom: true, dragging: true, keyboard: true,
      });
      mapRef.current = map;
      const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagery &copy; Esri',
      });
      const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Labels &copy; Esri',
      });
      areaLayerRef.current = L.layerGroup().addTo(map);
      projectLayerRef.current = L.layerGroup().addTo(map);
      villageLayerRef.current = L.layerGroup().addTo(map);
      const names = { [L.stamp(areaLayerRef.current)]: 'areas', [L.stamp(projectLayerRef.current)]: 'sites', [L.stamp(villageLayerRef.current)]: 'villages' };
      L.control.layers(
        { 'Street map': streets, Satellite: satellite },
        { 'Area Council coverage': areaLayerRef.current, 'Project sites': projectLayerRef.current, 'Village locations': villageLayerRef.current },
        { position: 'topright', collapsed: true },
      ).addTo(map);
      L.control.scale({ position: 'bottomright', imperial: false, maxWidth: 120 }).addTo(map);
      const Home = L.Control.extend({
        options: { position: 'topleft' },
        onAdd() {
          const button = L.DomUtil.create('button', 'coverage-map__home');
          button.type = 'button'; button.title = 'Show all Vanuatu';
          button.setAttribute('aria-label', 'Show all Vanuatu'); button.innerHTML = '⌂';
          L.DomEvent.disableClickPropagation(button);
          L.DomEvent.on(button, 'click', fitNational);
          return button;
        },
      });
      map.addControl(new Home());
      map.on('baselayerchange', event => {
        if (event.name === 'Satellite') labels.addTo(map);
        else if (map.hasLayer(labels)) map.removeLayer(labels);
      });
      map.on('overlayadd overlayremove', event => {
        const key = names[L.stamp(event.layer)];
        if (key) setLayerVisibility(previous => ({ ...previous, [key]: map.hasLayer(event.layer) }));
      });
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
        observer.observe(targetRef.current);
      }
      map.whenReady(() => { if (alive) setMapReady(true); });
    }).catch(error => { if (alive) setFatal(error?.message || 'Interactive map could not start.'); });
    return () => {
      alive = false;
      observer?.disconnect();
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null; LRef.current = null;
      areaLayerRef.current = null; projectLayerRef.current = null; villageLayerRef.current = null;
    };
  }, [fitNational]);

  const coverage = useMemo(() => areas ? deriveCoverage(areas, locations) : emptyCoverage(), [areas, locations]);
  const projectLookup = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects]);
  const councilsWithProjects = [...coverage.projectsByArea.values()].filter(ids => ids.size).length;
  const unallocated = Math.max(0, projects.length - coverage.assignedProjects.size);
  const provinceFilter = selected || filters.province || '';

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    const group = areaLayerRef.current;
    if (!mapReady || !L || !map || !group || !areas) return;
    group.clearLayers();
    for (const feature of areas.features) {
      const key = areaKey(feature);
      const name = feature.properties.name;
      const province = feature.properties.province;
      const ids = [...(coverage.projectsByArea.get(key) || new Set())];
      const rows = coverage.rowsByArea.get(key) || [];
      const count = ids.length;
      const fill = areaColor(feature, count);
      const base = { color: count ? '#6d6279' : '#a8a3b1', weight: 1, fillColor: fill, fillOpacity: count ? .76 : .42 };
      const layer = L.geoJSON(feature, { style: base });
      layer.eachLayer(shape => {
        shape.bindTooltip(`${escapeHtml(name)} · ${count} ${count === 1 ? 'project' : 'projects'}`, {
          sticky: true, direction: 'top', className: 'coverage-map__area-tip',
        });
        const projectItems = ids.map(id => projectLookup.get(id)).filter(Boolean)
          .sort((a, b) => projectName(a).localeCompare(projectName(b)))
          .map(project => `<li>${escapeHtml(projectName(project))}</li>`).join('');
        const beneficiaries = rows.reduce((sum, row) => sum + (Number(row.beneficiaries) || 0), 0);
        // Preserve the project list in the popup for the existing area-linked
        // Portfolio Performance bridge. No separate or duplicate data is made.
        shape.bindPopup(`
          <div style="font-size:13px"><strong>${escapeHtml(name)}</strong></div>
          <div style="color:#766d80;margin-top:1px">${escapeHtml(province)}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px">
            <div><strong>${count}</strong><br><span style="color:#8b8392">Projects</span></div>
            <div><strong>${rows.length}</strong><br><span style="color:#8b8392">Mapped sites</span></div>
          </div>
          ${beneficiaries ? `<div style="margin-top:7px"><strong>${beneficiaries.toLocaleString()}</strong> mapped beneficiaries</div>` : ''}
          ${projectItems ? `<div style="margin-top:8px;color:#665d70;font-weight:700">Projects operating here</div><ul style="margin:5px 0 0;padding-left:17px">${projectItems}</ul>` : '<div style="margin-top:8px;color:#8b8392">No project currently mapped to this Area Council.</div>'}
        `);
        shape.on('click', () => setSelectedArea({ key, name, province, count, sites: rows.length, fill }));
        shape.on('mouseover', () => shape.setStyle({ weight: 2, color: '#30264b', fillOpacity: count ? .86 : .55 }));
        shape.on('mouseout', () => shape.setStyle(base));
      });
      layer.addTo(group);
    }
    const bounds = L.geoJSON(areas).getBounds();
    allBoundsRef.current = bounds.isValid() ? bounds : null;
    // Refit only when the geographic filter changes. Live data refreshes must
    // not unexpectedly move a map that the user has zoomed or panned.
    if (selectedProvinceRef.current !== provinceFilter) {
      selectedProvinceRef.current = provinceFilter;
      map.invalidateSize();
      if (provinceFilter) {
        const matches = areas.features.filter(feature => normalise(provinceName(feature.properties.province)) === normalise(provinceName(provinceFilter)));
        if (matches.length) map.fitBounds(L.geoJSON({ type: 'FeatureCollection', features: matches }).getBounds(), { padding: [24, 24], maxZoom: 9, animate: false });
        else fitNational();
      } else fitNational();
    }
  }, [mapReady, areas, coverage, provinceFilter, projectLookup, fitNational]);

  useEffect(() => {
    const L = LRef.current; const map = mapRef.current; const group = projectLayerRef.current;
    if (!mapReady || !L || !map || !group) return;
    projectMarkersRef.current = coverage.mappedRows.map(row => {
      const project = projectLookup.get(row.project_id);
      const marker = L.circleMarker([row.latitude, row.longitude], {
        radius: 5, color: '#30264b', weight: 1.5, fillColor: '#fff', fillOpacity: 1,
      });
      marker.bindTooltip(escapeHtml(row.community || projectName(project)), { direction: 'top' });
      marker.bindPopup(`
        <div style="font-size:13px"><strong>${escapeHtml(row.community || 'Project site')}</strong></div>
        <div style="color:#766d80;margin-top:1px">${escapeHtml(row._area || row.area_council || '')}${row.island ? ` · ${escapeHtml(row.island)}` : ''}</div>
        <div style="margin-top:7px"><strong>${escapeHtml(projectName(project))}</strong></div>
        ${row.intervention ? `<div style="margin-top:5px">${escapeHtml(row.intervention)}</div>` : ''}
        ${row.status ? `<div style="margin-top:5px;color:#766d80">Status: ${escapeHtml(row.status)}</div>` : ''}
        ${row.beneficiaries ? `<div style="margin-top:5px;color:#766d80">Beneficiaries: ${Number(row.beneficiaries).toLocaleString()}</div>` : ''}
        <div style="margin-top:5px;color:#97909f">${row.latitude.toFixed(5)}, ${row.longitude.toFixed(5)}</div>
      `);
      return marker;
    });
    const sync = () => {
      group.clearLayers();
      if (map.getZoom() >= 9) projectMarkersRef.current.forEach(marker => marker.addTo(group));
    };
    sync(); map.on('zoomend', sync);
    return () => { map.off('zoomend', sync); group.clearLayers(); projectMarkersRef.current = []; };
  }, [mapReady, coverage.mappedRows, projectLookup]);

  useEffect(() => {
    const L = LRef.current; const map = mapRef.current; const group = villageLayerRef.current;
    if (!mapReady || !L || !map || !group) return;
    villageMarkersRef.current = (villages || []).map(village => ({
      ...village, lat: coordinate(village.latitude, 'lat'), lng: coordinate(village.longitude, 'lng'),
    })).filter(village => village.name && village.lat !== null && village.lng !== null).map(village => {
      const marker = L.circleMarker([village.lat, village.lng], { radius: 3.3, color: '#5d477f', weight: 1, fillColor: '#fff', fillOpacity: .95 });
      marker.bindTooltip(escapeHtml(village.name), { permanent: true, direction: 'right', offset: [4, 0], className: 'coverage-map__place-label' });
      marker.bindPopup(`<strong>${escapeHtml(village.name)}</strong><br><span style="color:#766d80">Village${village.area_council ? ` · ${escapeHtml(village.area_council)}` : ''}${village.island ? ` · ${escapeHtml(village.island)}` : ''}</span><div style="margin-top:5px;color:#97909f">${village.lat.toFixed(5)}, ${village.lng.toFixed(5)}</div>`);
      return marker;
    });
    const sync = () => {
      group.clearLayers();
      if (map.getZoom() >= 11) villageMarkersRef.current.forEach(marker => marker.addTo(group));
    };
    sync(); map.on('zoomend', sync);
    return () => { map.off('zoomend', sync); group.clearLayers(); villageMarkersRef.current = []; };
  }, [mapReady, villages]);

  const retry = () => { setFatal(''); setBoundaryKey(value => value + 1); setReloadKey(value => value + 1); };
  return (
    <div className="coverage-map">
      <div className="coverage-map__summary">
        <span><strong>{councilsWithProjects} Area Councils</strong> with linked projects · {projects.length} filtered projects</span>
        <div className="coverage-map__actions">
          <button type="button" className="coverage-map__action" onClick={fitNational}>Show all Vanuatu</button>
          {loading && <span>Updating…</span>}
        </div>
      </div>
      <div className="coverage-map__frame">
        <div ref={targetRef} className="coverage-map__target" role="application" aria-label="Interactive Vanuatu Area Council project coverage map" />
        {(!mapReady || (loading && !areas)) && !fatal && <div className="coverage-map__loading">Loading Vanuatu map…</div>}
        {fatal && <div className="coverage-map__fatal"><div>{fatal}<div style={{ marginTop: 12 }}><button type="button" className="coverage-map__action" onClick={retry}>Retry map</button></div></div></div>}
        {!fatal && areas && (
          <div className="coverage-map__legend">
            <strong>Area Council coverage</strong>
            <div className="coverage-map__legend-row"><span className="coverage-map__swatch" style={{ background: `linear-gradient(90deg, ${AREA_COLORS.slice(0, 4).join(', ')})` }} />Council with linked projects</div>
            <div className="coverage-map__legend-row"><span className="coverage-map__swatch" style={{ background: '#e5e7eb' }} />No linked project records</div>
            <div className="coverage-map__legend-row"><span className="coverage-map__swatch" style={{ background: '#fff', borderRadius: '50%', width: 10, height: 10, flexBasis: 10, border: '1.5px solid #30264b' }} />Project site (zoom 9+)</div>
            <div className="coverage-map__legend-note">Colours distinguish councils, not progress. Select an area for its project total.</div>
            {selectedArea && <div className="coverage-map__legend-note"><strong>{selectedArea.name}</strong>{selectedArea.count} {selectedArea.count === 1 ? 'project' : 'projects'} · {selectedArea.sites} mapped sites</div>}
          </div>
        )}
      </div>
      <div className="coverage-map__footer">
        <span>Pinch/scroll to zoom · drag to pan · Layers switches Street/Satellite and map overlays. Project sites appear from zoom 9; reference village labels from zoom 11.</span>
        {unallocated > 0 && <span className="coverage-map__notice"><strong>{unallocated}</strong> filtered {unallocated === 1 ? 'project is' : 'projects are'} not yet linked to a mappable Area Council. These projects remain in the portfolio totals.</span>}
        {villageNotice && <span>{villageNotice}</span>}
      </div>
    </div>
  );
}
