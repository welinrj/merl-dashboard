import { THEME_AREA_COLOURS } from './publicPortfolioCategories';

export const BASEMAP_URLS = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  street: 'https://tiles.openfreemap.org/styles/liberty',
};

export const BASEMAP_IDS = ['light', 'street', 'terrain', 'satellite', 'ocean'];

// Only bounded network reads: the local council map remains available offline.
export async function loadBasemap(name, signal) {
  if (name === 'ocean') return {
    version:8,
    sources:{ocean:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}'],tileSize:256,maxzoom:10,attribution:'Tiles © Esri, Garmin, GEBCO, NOAA NGDC, and other contributors'}},
    layers:[{id:'ocean-basemap',type:'raster',source:'ocean'}],
  };
  if (name === 'satellite' || name === 'terrain') {
    const imagery = name === 'satellite';
    const source = imagery ? 'imagery' : 'terrain';
    return {
      version: 8,
      sources: { [source]: { type: 'raster', tiles: [`https://server.arcgisonline.com/ArcGIS/rest/services/${imagery ? 'World_Imagery' : 'World_Topo_Map'}/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19,
        attribution: imagery ? 'Imagery © Esri, Vantor, Earthstar Geographics, and the GIS User Community' : 'Tiles © Esri, HERE, Garmin, Intermap, GEBCO, USGS, FAO, NPS, NRCan, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, © OpenStreetMap contributors, and the GIS User Community' } },
      layers: [{ id: source, type: 'raster', source }],
    };
  }
  const response = await fetch(BASEMAP_URLS[name] || BASEMAP_URLS.light, { signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
  if (!response.ok) throw new Error('Basemap unavailable');
  return response.json();
}

export function geometryBounds(collection) {
  const bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
  const visit = coords => {
    if (typeof coords[0] === 'number') {
      bounds[0][0] = Math.min(bounds[0][0], coords[0]); bounds[0][1] = Math.min(bounds[0][1], coords[1]);
      bounds[1][0] = Math.max(bounds[1][0], coords[0]); bounds[1][1] = Math.max(bounds[1][1], coords[1]);
    } else coords.forEach(visit);
  };
  for (const feature of collection.features || []) if (feature.geometry?.coordinates) visit(feature.geometry.coordinates);
  return Number.isFinite(bounds[0][0]) ? bounds : [[166, -21], [171, -13]];
}

export function coverageFeatures(data, areas, selectedKey, key) {
  const lookup = new Map(areas.map(a => [key(a.province, a.area_council), a]));
  const counts = {};
  const features = data.features.map((feature, id) => {
    const areaKey = key(feature.properties.ADM1_EN, feature.properties.ADM2_EN);
    const record = lookup.get(areaKey);
    const projectCount = Number(record?.project_count) || 0;
    const category = Object.hasOwn(THEME_AREA_COLOURS, record?.theme_category) ? record.theme_category : 'not-recorded';
    const theme = projectCount > 0 ? category : 'none';
    counts[theme] = (counts[theme] || 0) + 1;
    return { ...feature, id, properties: { ...feature.properties, areaKey, projectCount, theme,
      colour: THEME_AREA_COLOURS[category], selected: projectCount > 0 && areaKey === selectedKey } };
  });
  return { collection: { type: 'FeatureCollection', features }, counts };
}

export function mapStyle(base, data) {
  const empty = { type: 'FeatureCollection', features: [] };
  const sources = {
    ...(base?.sources || {}),
    'council-land': { type: 'geojson', data: data.display.land },
    councils: { type: 'geojson', data: { type: 'FeatureCollection', features: data.features }, tolerance: 0 },
    'shared-borders': { type: 'geojson', data: data.display.boundaries, tolerance: 0 },
    'council-labels': { type: 'geojson', data: empty },
  };
  const layers = (base?.layers?.map(layer => {
    if (layer.id === 'water' && layer.type === 'fill') return { ...layer, paint: { ...layer.paint, 'fill-color': '#d6e8f0' } };
    if (layer.type === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': '#e5e8da' } };
    return layer;
  }) || [
    { id: 'ocean', type: 'background', paint: { 'background-color': '#d6e8f0' } },
    { id: 'fallback-land', type: 'fill', source: 'council-land', paint: { 'fill-color': '#e5e8da' } },
  ]);
  // Put thematic fills under geographic labels, without polygon outlines that
  // double up on shared edges. Detailed coastline comes from the basemap.
  const firstLabel = layers.findIndex(layer => layer.type === 'symbol');
  const overlays = [
    { id: 'council-fill', type: 'fill', source: 'councils', maxzoom: 11.01, paint: {
      'fill-color': ['coalesce', ['get', 'colour'], '#94a3b8'],
      'fill-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.72, ['boolean', ['get', 'popFill'], false], base?.sources?.imagery ? 0.7 : 0.78, ['>', ['coalesce', ['get', 'projectCount'], 0], 0], base?.sources?.imagery ? 0.48 : 0.55, 0],
      'fill-antialias': true,
    } },
    { id: 'council-borders', type: 'line', source: 'shared-borders', maxzoom: 11.01, layout: { visibility: 'none', 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': base?.sources?.imagery ? '#edf7fa' : '#466478', 'line-width': ['interpolate',['linear'],['zoom'],5,0.55,10,1.2], 'line-opacity': 0.65 } },
    { id:'recorded-council-edge',type:'line',source:'councils',maxzoom:11.01,filter:['>', ['coalesce',['get','projectCount'],0],0],layout:{'line-join':'round'},paint:{'line-color':['coalesce',['get','edgeColour'],['get','colour']],'line-opacity':['case',['has','edgeColour'],0.95,0.75],'line-width':['case',['has','edgeColour'],['interpolate',['linear'],['zoom'],5,1.4,10,2.4],['interpolate',['linear'],['zoom'],5,0.7,10,1.5]]} },
    { id: 'selected-council', type: 'line', source: 'councils', maxzoom: 11.01, filter: ['==', ['get', 'selected'], true], paint: { 'line-color': base?.sources?.imagery ? '#7bd5cd' : '#163d57', 'line-width': 3 } },
  ];
  layers.splice(firstLabel < 0 ? layers.length : firstLabel, 0, ...overlays);
  if (base?.glyphs) layers.push({ id: 'council-names', type: 'symbol', source: 'council-labels', minzoom: 8, maxzoom: 11.01,
    layout: { 'text-field': ['get', 'ADM2_EN'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate',['linear'],['zoom'],8,11,11,14], 'text-max-width': 10, 'text-padding': 9, 'symbol-sort-key':['case',['boolean',['get','selected'],false],0,['>', ['coalesce',['get','projectCount'],0],0],1,2] },
    paint: { 'text-color': '#24465b', 'text-halo-color': '#fff', 'text-halo-width': 1.7 },
  });
  return { ...(base || {}), version: 8, sources, layers };
}
