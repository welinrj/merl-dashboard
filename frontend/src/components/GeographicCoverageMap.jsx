import { useEffect, useMemo, useRef, useState } from 'react';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
// Local WGS84 GeoJSON derived from the AC Boundaries 2025 feature layer.
// Keeping the reviewed boundary snapshot with the portal prevents upstream
// service changes or outages from silently changing the dashboard map.
const BOUNDARY_URL = `${import.meta.env.BASE_URL}data/vanuatu-area-councils-2025.geojson`;

const BASEMAPS = {
  streets: {
    label: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' },
  },
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: 'Imagery &copy; Esri' },
  },
  terrain: {
    label: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    options: { maxZoom: 19, attribution: 'Tiles &copy; Esri' },
  },
};

const BREAKS = [
  { min: 0, max: 0, label: '0', color: '#f1f5f9' },
  { min: 1, max: 1, label: '1', color: '#ffd43b' },
  { min: 2, max: 3, label: '2–3', color: '#ff922b' },
  { min: 4, max: 5, label: '4–5', color: '#f03e3e' },
  { min: 6, max: Infinity, label: '6+', color: '#7b2cbf' },
];

// Published project names are canonical. Some operational names differ from
// the 2025 boundary labels, so only explicit, audited aliases are allowed.
// Do not use fuzzy cross-island matching: it can place a project in the wrong AC.
const ALIASES = new Map([
  ['yarsu', ['south epi', 'epi']],
  ['west coast santo', ['west santo', 'west coast']],
  ['north west santo', ['north west']],
  ['south maewo', ['maewo']],
  ['south tanna', ['south west tanna']],
  ['west ambrym', ['west ambrym']],
  ['futuna', ['futuna']],
  ['torres', ['torres']],
  ['mota', ['mota']],
]);

let leafletPromise;
let boundaryPromise;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const old = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (old) {
      old.addEventListener('load', () => resolve(window.L), { once: true });
      old.addEventListener('error', () => reject(new Error('Map library unavailable')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    script.onerror = () => { leafletPromise = null; reject(new Error('Map library unavailable')); };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function loadBoundaries() {
  if (!boundaryPromise) {
    boundaryPromise = fetch(BOUNDARY_URL)
      .then((response) => {
        if (!response.ok) throw new Error('Area Council boundaries unavailable');
        return response.json();
      })
      .catch((error) => { boundaryPromise = null; throw error; });
  }
  return boundaryPromise;
}

const norm = (value) => String(value || '')
  .toLowerCase()
  .replace(/\b(area council|council)\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const normProvince = (value) => norm(value).replace(/\s+/g, '');
const key = (province, area) => `${normProvince(province)}|${norm(area)}`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

function colourFor(count) {
  return BREAKS.find((item) => count >= item.min && count <= item.max)?.color || BREAKS[0].color;
}

function projectName(project) {
  if (!project) return 'Unknown project';
  return project.code ? `${project.code} — ${project.name}` : project.name;
}

const activityStarted = (activity) => ['in_progress', 'completed', 'delayed', 'on_hold'].includes(String(activity?.status || '').toLowerCase());
const activityLabel = (activity) => {
  const status = String(activity?.status || 'not reported').replaceAll('_', ' ');
  const progress = activity?.physical_progress_pct == null ? '' : ` · ${activity.physical_progress_pct}%`;
  const where = [activity?.community, activity?.island].filter(Boolean).join(', ');
  return `${activity?.code ? `${activity.code} — ` : ''}${activity?.name || 'Activity'} · ${status}${progress}${where ? ` · ${where}` : ''}`;
};

export function sameArea(left, right) {
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const aa = ALIASES.get(a) || [];
  const bb = ALIASES.get(b) || [];
  return aa.includes(b) || bb.includes(a);
}

function aggregateAreas(areas, projects, activities) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const grouped = new Map();
  for (const area of areas) {
    if (!area?.area_council_name || area.coverage_status === 'not_covered') continue;
    const k = key(area.province_code, area.area_council_name);
    if (!grouped.has(k)) grouped.set(k, {
      province: area.province_code || '',
      area: area.area_council_name,
      projectIds: new Set(),
      projects: [],
    });
    const item = grouped.get(k);
    if (area.project_id && !item.projectIds.has(area.project_id)) {
      item.projectIds.add(area.project_id);
      item.projects.push(projectsById.get(area.project_id) || { id: area.project_id, name: 'Project record' });
    }
  }
  return [...grouped.values()].map((item) => {
    const areaActivities = activities.filter((activity) =>
      item.projectIds.has(activity.project_id)
      && normProvince(activity.province) === normProvince(item.province)
      && sameArea(activity.area_council, item.area));
    const implemented = areaActivities.filter(activityStarted);
    return {
      ...item,
      project_count: item.projectIds.size,
      activities: areaActivities,
      implemented_activities: implemented,
      activity_count: implemented.length,
    };
  });
}

function findRecord(records, province, areaName) {
  const provinceKey = normProvince(province);
  const areaKey = norm(areaName);
  const sameProvince = records.filter((record) => normProvince(record.province) === provinceKey);
  const exact = sameProvince.find((record) => norm(record.area) === areaKey);
  if (exact) return exact;

  const aliases = ALIASES.get(areaKey) || [];
  const aliasMatch = sameProvince.find((record) => aliases.includes(norm(record.area)) || (ALIASES.get(norm(record.area)) || []).includes(areaKey));
  if (aliasMatch) return aliasMatch;

  return null;
}

function checkboxControl(L, map, stateRef) {
  const Control = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const div = L.DomUtil.create('div', 'geo-layer-control leaflet-bar');
      div.innerHTML = `
        <label><input type="checkbox" data-layer="sites" checked> <span class="geo-dot"></span> Area Council coverage centres</label>
        <label><input type="checkbox" data-layer="choropleth" checked> <span class="geo-square"></span> Choropleth</label>
        <label><input type="checkbox" data-layer="labels"> Area Council labels</label>`;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      div.addEventListener('change', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        stateRef.current[input.dataset.layer] = input.checked;
        stateRef.current.redraw?.();
      });
      return div;
    },
  });
  return new Control().addTo(map);
}

export default function GeographicCoverageMap({ areas = [], projects = [], activities = [], province = '' }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const boundaryLayerRef = useRef(null);
  const markerLayerRef = useRef(null);
  const labelLayerRef = useRef(null);
  const tileRef = useRef(null);
  const dataRef = useRef(null);
  const stateRef = useRef({ sites: true, choropleth: true, labels: false, redraw: null });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [basemap, setBasemap] = useState('streets');
  const [metric, setMetric] = useState('projects');

  const aggregated = useMemo(() => aggregateAreas(areas, projects, activities), [areas, projects, activities]);
  const mappedProjectIds = useMemo(() => new Set(areas.filter((a) => a.coverage_status !== 'not_covered').map((a) => a.project_id).filter(Boolean)), [areas]);
  const mappedActivityCount = useMemo(() => aggregated.reduce((n, row) => n + row.activity_count, 0), [aggregated]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadLeaflet(), loadBoundaries()])
      .then(([L, data]) => {
        if (!alive || !mapEl.current) return;
        dataRef.current = data;
        const map = L.map(mapEl.current, {
          center: [-16.3, 167.6], zoom: 6, minZoom: 5, maxZoom: 18,
          scrollWheelZoom: true, zoomControl: true,
        });
        tileRef.current = L.tileLayer(BASEMAPS.streets.url, BASEMAPS.streets.options).addTo(map);
        L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);
        checkboxControl(L, map, stateRef);
        mapRef.current = map;
        setReady(true);
        setError('');
      })
      .catch(() => alive && setError('Map temporarily unavailable. Check the network connection and try again.'));

    return () => {
      alive = false;
      if (mapRef.current) mapRef.current.remove();
      mapRef.current = null;
      boundaryLayerRef.current = null;
      markerLayerRef.current = null;
      labelLayerRef.current = null;
      tileRef.current = null;
      dataRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.L) return;
    const L = window.L;
    if (tileRef.current) mapRef.current.removeLayer(tileRef.current);
    const config = BASEMAPS[basemap];
    tileRef.current = L.tileLayer(config.url, config.options).addTo(mapRef.current);
    tileRef.current.bringToBack();
  }, [basemap, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current || !dataRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;

    const redraw = () => {
      if (boundaryLayerRef.current) map.removeLayer(boundaryLayerRef.current);
      if (markerLayerRef.current) map.removeLayer(markerLayerRef.current);
      if (labelLayerRef.current) map.removeLayer(labelLayerRef.current);

      const selectedProvince = normProvince(province);
      const featureCollection = {
        ...dataRef.current,
        features: (dataRef.current.features || []).filter((feature) =>
          !selectedProvince || normProvince(feature.properties?.ADM1_EN) === selectedProvince),
      };

      const markerLayer = L.layerGroup();
      const labelLayer = L.layerGroup();
      const boundaryLayer = L.geoJSON(featureCollection, {
        style: (feature) => {
          const rec = findRecord(aggregated, feature.properties?.ADM1_EN, feature.properties?.ADM2_EN);
          const count = metric === 'activities' ? (rec?.activity_count || 0) : (rec?.project_count || 0);
          return {
            color: '#ffffff',
            weight: count ? 1.4 : 0.8,
            fillColor: stateRef.current.choropleth ? colourFor(count) : '#dbe4ea',
            fillOpacity: stateRef.current.choropleth ? 1 : 0.2,
          };
        },
        onEachFeature: (feature, layer) => {
          const areaName = feature.properties?.ADM2_EN || '';
          const provinceName = feature.properties?.ADM1_EN || '';
          const rec = findRecord(aggregated, provinceName, areaName);
          const projectCount = rec?.project_count || 0;
          const activityCount = rec?.activity_count || 0;
          const names = rec?.projects?.map(projectName) || [];
          const areaActivities = rec?.implemented_activities || [];
          const metricCount = metric === 'activities' ? activityCount : projectCount;
          const metricWord = metric === 'activities' ? (metricCount === 1 ? 'activity' : 'activities') : (metricCount === 1 ? 'project' : 'projects');
          layer.bindTooltip(`${esc(areaName)} · ${metricCount} ${metricWord}`, { sticky: true });
          const groupedActivities = areaActivities.reduce((mapByProject, activity) => {
            const project = rec?.projects?.find((item) => item.id === activity.project_id);
            const label = projectName(project || { name: 'Project record' });
            if (!mapByProject.has(label)) mapByProject.set(label, []);
            mapByProject.get(label).push(activity);
            return mapByProject;
          }, new Map());
          const activityHtml = groupedActivities.size
            ? [...groupedActivities.entries()].map(([project, rows]) => `<div style="margin-top:8px"><b>${esc(project)}</b><ul style="padding-left:16px;margin:4px 0 0">${rows.map((activity) => `<li>${esc(activityLabel(activity))}</li>`).join('')}</ul></div>`).join('')
            : '<div style="margin-top:8px;color:#64748b">No started/completed activity records are linked to this Area Council yet.</div>';
          layer.bindPopup(`<strong>${esc(rec?.area || areaName)}</strong><br><span style="color:#64748b">${esc(provinceName)}</span><div style="margin-top:6px"><b>${projectCount}</b> ${projectCount === 1 ? 'project' : 'projects'} · <b>${activityCount}</b> activities underway/completed</div>${names.length ? `<div style="margin-top:8px"><b>Projects</b><ul style="padding-left:16px;margin:4px 0 0">${names.map((name) => `<li>${esc(name)}</li>`).join('')}</ul></div>` : '<div style="margin-top:8px;color:#64748b">No verified project coverage record for this Area Council.</div>'}<div style="margin-top:8px"><b>Activities being implemented</b>${activityHtml}</div>`);

          const centre = layer.getBounds?.().getCenter?.();
          if (centre && projectCount && stateRef.current.sites) {
            const marker = L.circleMarker(centre, {
              radius: Math.min(10, 5 + Math.sqrt(projectCount)),
              color: '#ffffff', weight: 2, fillColor: '#0b5fff', fillOpacity: 1,
            });
            marker.bindTooltip(`${esc(rec?.area || areaName)} · ${projectCount} ${projectCount === 1 ? 'project' : 'projects'} · ${activityCount} activities`);
            marker.bindPopup(`<strong>${esc(rec?.area || areaName)}</strong><br>${names.map((name) => esc(name)).join('<br>')}<div style="margin-top:6px;color:#64748b">Marker is the Area Council polygon centre, not a GPS activity location.</div>`);
            marker.addTo(markerLayer);
          }
          if (centre && stateRef.current.labels) {
            L.marker(centre, {
              interactive: false,
              icon: L.divIcon({ className: 'geo-area-label', html: `<span>${esc(areaName)}</span>`, iconSize: null }),
            }).addTo(labelLayer);
          }
        },
      }).addTo(map);

      boundaryLayerRef.current = boundaryLayer;
      markerLayerRef.current = markerLayer;
      labelLayerRef.current = labelLayer;
      if (stateRef.current.sites) markerLayer.addTo(map);
      if (stateRef.current.labels) labelLayer.addTo(map);

      const bounds = boundaryLayer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16] });
    };

    stateRef.current.redraw = redraw;
    redraw();
    return () => { stateRef.current.redraw = null; };
  }, [aggregated, province, ready, metric]);

  const printMap = () => {
    window.setTimeout(() => window.print(), 150);
  };

  return (
    <section className="db-card geo-map-print" style={{ marginTop: '1rem', padding: 0, overflow: 'hidden' }} aria-label="Vanuatu Area Council project map">
      <style>{`
        .geo-map-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;padding:1rem 1rem .75rem}
        .geo-map-head h3{margin:0;font-size:1rem}.geo-map-head p{margin:.2rem 0 0;color:var(--text-3);font-size:.75rem}
        .geo-map-actions{display:flex;gap:.45rem;flex-wrap:wrap;justify-content:flex-end}.geo-map-actions button{border:1px solid var(--border);background:#fff;border-radius:8px;padding:.48rem .7rem;font:inherit;font-size:.74rem;font-weight:700;color:var(--text-2);cursor:pointer}.geo-map-actions button.active{background:#1768df;color:#fff;border-color:#1768df}.geo-print-btn{background:#1768df!important;color:#fff!important;border-color:#1768df!important}
        .geo-map-wrap{position:relative;min-height:520px;background:#dfeaf1}.geo-map-canvas{height:520px;width:100%}.geo-map-error{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:2rem;text-align:center;background:#f8fafc;color:#64748b;font-size:.82rem;z-index:500}
        .geo-layer-control{background:rgba(255,255,255,.96)!important;border:1px solid rgba(15,23,42,.15)!important;border-radius:8px!important;box-shadow:0 2px 8px rgba(15,23,42,.12)!important;padding:.55rem .65rem!important;display:grid;gap:.35rem;min-width:150px}.geo-layer-control label{display:flex;align-items:center;gap:.38rem;font:600 .72rem/1.2 system-ui;color:#334155;cursor:pointer}.geo-layer-control input{margin:0}.geo-dot{width:9px;height:9px;border-radius:999px;background:#0b5fff;display:inline-block}.geo-square{width:10px;height:10px;background:#f03e3e;display:inline-block}.geo-audit-note{margin:.65rem 1rem 0;padding:.65rem .75rem;border-radius:8px;background:#fff8e1;border:1px solid #ffe08a;color:#7a4b00;font-size:.74rem}.geo-metric{display:flex;gap:.35rem;margin-top:.5rem}.geo-metric button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:.35rem .62rem;font:700 .7rem system-ui;color:#475569;cursor:pointer}.geo-metric button.active{background:#111827;color:#fff;border-color:#111827}
        .geo-legend{position:absolute;right:12px;top:12px;z-index:490;background:rgba(255,255,255,.96);border:1px solid rgba(15,23,42,.12);border-radius:8px;padding:.7rem .75rem;box-shadow:0 2px 8px rgba(15,23,42,.12);min-width:155px;font-size:.7rem;color:#475569}.geo-legend strong{display:block;color:#1e293b;font-size:.73rem;margin-bottom:.45rem}.geo-legend-row{display:flex;align-items:center;gap:.45rem;margin:.25rem 0}.geo-legend-swatch{width:19px;height:13px;border:1px solid rgba(15,23,42,.08);display:inline-block}.geo-legend hr{border:0;border-top:1px solid #e2e8f0;margin:.5rem 0}.geo-area-label{background:transparent!important;border:0!important}.geo-area-label span{display:inline-block;transform:translate(-50%,-50%);white-space:nowrap;font:700 10px/1.1 system-ui;color:#17324d;text-shadow:0 1px 0 #fff,1px 0 0 #fff,0 -1px 0 #fff,-1px 0 0 #fff}
        @media(max-width:700px){.geo-map-head{flex-direction:column}.geo-map-actions{justify-content:flex-start}.geo-map-wrap,.geo-map-canvas{height:460px;min-height:460px}.geo-legend{top:auto;bottom:12px;right:10px}.geo-layer-control{font-size:.68rem}}
        @media print{
          body *{visibility:hidden!important}
          .geo-map-print,.geo-map-print *{visibility:visible!important}
          .geo-map-print{position:absolute!important;left:0!important;top:0!important;width:100%!important;border:0!important;box-shadow:none!important;margin:0!important;background:#fff!important}
          .geo-map-actions,.leaflet-control-zoom,.leaflet-control-attribution{display:none!important}
          .geo-map-wrap,.geo-map-canvas{height:700px!important;min-height:700px!important}
          .geo-legend{break-inside:avoid}
          @page{size:landscape;margin:10mm}
        }
      `}</style>
      <div className="geo-map-head">
        <div>
          <h3>Vanuatu Area Council Project & Activity Coverage{province ? ` · ${province}` : ''}</h3>
          <p>Area Council polygons use the 2025 boundary update and verified coverage records. Point markers show polygon centres for navigation only, not GPS project locations.</p>
          <div className="geo-metric" aria-label="Choropleth metric">
            <button type="button" className={metric === 'projects' ? 'active' : ''} onClick={() => setMetric('projects')} aria-pressed={metric === 'projects'}>Projects</button>
            <button type="button" className={metric === 'activities' ? 'active' : ''} onClick={() => setMetric('activities')} aria-pressed={metric === 'activities'}>Implemented activities</button>
          </div>
        </div>
        <div className="geo-map-actions" aria-label="Map controls">
          {Object.entries(BASEMAPS).map(([id, config]) => (
            <button key={id} type="button" className={basemap === id ? 'active' : ''} onClick={() => setBasemap(id)} aria-pressed={basemap === id}>{config.label}</button>
          ))}
          <button type="button" className="geo-print-btn" onClick={printMap}>Print map</button>
        </div>
      </div>
      <div className="geo-audit-note">Mapped Area Council coverage: <strong>{mappedProjectIds.size}</strong> of <strong>{projects.length}</strong> projects. Activities shown only when a project activity record has an Area Council and its status indicates implementation has started; missing location data is never guessed. <strong>{mappedActivityCount}</strong> such activity records are currently mapped.</div>
      <div className="geo-map-wrap">
        <div ref={mapEl} className="geo-map-canvas" aria-label="Interactive choropleth map of Vanuatu Area Council project sites" />
        {error && <div className="geo-map-error" role="alert">{error}</div>}
        <div className="geo-legend" aria-label="Map legend">
          <strong>{metric === 'activities' ? 'Implemented activities' : 'Projects'}<br />(by Area Council)</strong>
          {BREAKS.map((item) => <div className="geo-legend-row" key={item.label}><span className="geo-legend-swatch" style={{ background: item.color }} /> <span>{item.label}</span></div>)}
          <hr />
          <div className="geo-legend-row"><span className="geo-dot" /> <span>Area Council coverage centre</span></div>
        </div>
      </div>
    </section>
  );
}
