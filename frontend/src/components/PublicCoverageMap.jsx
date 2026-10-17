import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_AREA_COLOURS, THEME_AREA_ORDER } from '../lib/publicPortfolioCategories';
import './public-coverage-map.css';
import { mapLabelPoint, ISLAND_GROUPS } from '../lib/publicMapLabels';

const LEAFLET_JS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
// Use the reviewed 2025 WGS84 snapshot bundled with the portal. This keeps the
// 71 Area Council names stable and avoids an upstream map service changing them.
const BOUNDARY_URL=`${import.meta.env.BASE_URL}data/vanuatu-area-councils-map.geojson`;
let promise;
function leaflet(){
  if(window.L) return Promise.resolve(window.L);
  if(promise) return promise;
  promise=new Promise((resolve,reject)=>{
    if(!document.querySelector(`link[href="${LEAFLET_CSS}"]`)){const l=document.createElement('link');l.rel='stylesheet';l.href=LEAFLET_CSS;document.head.appendChild(l);}
    const old=document.querySelector(`script[src="${LEAFLET_JS}"]`); if(old){old.addEventListener('load',()=>resolve(window.L),{once:true}); return;}
    const s=document.createElement('script');s.src=LEAFLET_JS;s.onload=()=>resolve(window.L);s.onerror=()=>{promise=null;reject(new Error('Map library unavailable'));};document.head.appendChild(s);
  });
  return promise;
}
const norm=(v)=>String(v||'').toLowerCase().replace(/\b(area council|council)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const AREA_ALIASES=new Map(Object.entries({
  'vanua lava':'east vanualava',
  'west vanua lava':'west vanualava',
  'merelava merig':'merelava merig',
  'north west santo':'northwest santo',
  'south east santo':'southeast santo',
  'south santo 1':'south santo one 1',
  'south santo 2':'south santo two 2',
  'central pentecost 1':'central pentecost one cp1',
  'central pentecost 2':'central pentecost two cp2',
  'north east malekula':'northeast malekula',
  'north west malekula':'northwest malekula',
  'south east malekula':'southeast malekula',
  'south west malekula':'southwest malekula',
  'south east ambrym':'southeast ambrym',
  'north west efate':'northwest efate',
  'nguna pele':'nguna pele',
  'makira mataso':'makira mataso',
  'tongariki buninga':'tongariki buninga',
  'south east tanna':'southeast tanna',
  'south west tanna':'southwest tanna'
}));
const canonicalArea=(v)=>AREA_ALIASES.get(norm(v))||norm(v);
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const key=(province,area)=>`${norm(province)}|${canonicalArea(area)}`;
let boundaryPromise;
function boundaries(){
  if(!boundaryPromise) boundaryPromise=fetch(BOUNDARY_URL).then(async r=>{
    if(!r.ok) throw new Error('Boundaries unavailable');
    const data=await r.json();
    const features=Array.isArray(data?.features)?data.features:[];
    const counts=features.reduce((acc,feature)=>{
      const province=String(feature?.properties?.ADM1_EN||'').toUpperCase();
      if(province) acc[province]=(acc[province]||0)+1;
      return acc;
    },{});
    const expected={TORBA:9,SANMA:11,PENAMA:10,MALAMPA:10,SHEFA:19,TAFEA:12};
    const valid=features.length===71 && Object.entries(expected).every(([province,count])=>counts[province]===count);
    if(!valid) throw new Error('Area Council boundary dataset is incomplete');
    return data;
  }).catch(e=>{boundaryPromise=null;throw e;});
  return boundaryPromise;
}

export default function PublicCoverageMap({areas=[],selectedArea=null,onAreaSelect,onViewProject,projectCount=null}){
  const { i18n } = useTranslation();
  const fr = i18n.resolvedLanguage?.startsWith('fr');
  const copy = fr ? {
    overview:'Vue d’ensemble',reset:'Voir tout le Vanuatu',neutral:'Aucun lieu de projet enregistré',source:'Limites des conseils de zone · instantané 2025',countNote:'Les nombres représentent des conseils de zone, pas des projets.',zoomIn:'Agrandir',zoomOut:'Réduire',layers:'Couches',street:'Plan',satellite:'Satellite',one:'projet', many:'projets', none:'aucun lieu de mise en œuvre enregistré',
    noneDetail:'Aucun lieu de mise en œuvre n’est enregistré pour ce conseil de zone. Cela ne signifie pas nécessairement qu’il n’y a aucune activité de projet.',
    unavailable:'Carte temporairement indisponible.', keyTitle:'Lieux de projets par thème',locations:'Voir les lieux de projets',expand:'Plein écran',collapse:'Fermer le plein écran',legend:'Détails de la carte',coverage:'La couleur indique un conseil avec un lieu de projet enregistré. Les activités peuvent ne couvrir qu’une partie du conseil.',choose:'Choisir un conseil de zone',view:'Voir le projet',noLocations:'Aucun lieu de projet enregistré pour les filtres actuels.',
    keyBody:'Les zones non colorées n’ont pas de lieu de mise en œuvre enregistré.',
    themes:{adaptation:'Adaptation',mitigation:'Atténuation',both:'Adaptation et atténuation','not-recorded':'Thème non renseigné'},
    areaOne:'conseil',areaMany:'conseils',
    aria:'Carte publique de la couverture des projets',
  } : {
    overview:'Overview',reset:'Show all Vanuatu',neutral:'No recorded project location',source:'Area Council boundaries · 2025 snapshot',countNote:'Counts are Area Councils, not projects.',zoomIn:'Zoom in',zoomOut:'Zoom out',layers:'Layers',street:'Street map',satellite:'Satellite',one:'project', many:'projects', none:'no recorded implementation location',
    noneDetail:'No implementation location is recorded for this Area Council. This does not necessarily mean there is no project activity.',
    unavailable:'Map temporarily unavailable.', keyTitle:'Project locations by theme',locations:'Show project locations',expand:'Full screen',collapse:'Close full screen',legend:'Map details',coverage:'Colour marks a council with a recorded project location. Activities may cover only part of that council.',choose:'Choose an Area Council',view:'View project',noLocations:'No project locations recorded for the current filters.',
    keyBody:'Uncoloured areas have no recorded implementation location.',
    themes:{adaptation:'Adaptation',mitigation:'Mitigation',both:'Adaptation & Mitigation','not-recorded':'Theme not recorded'},
    areaOne:'Area Council',areaMany:'Area Councils',
    aria:'Public project coverage map',
  };
  const wrapRef=useRef(null), expandRef=useRef(null);
  const [expanded,setExpanded]=useState(false);
  const ref=useRef(null), mapRef=useRef(null), layerRef=useRef(null), dataRef=useRef(null);
  const stateRef=useRef({areas,selectedArea,onAreaSelect});
  stateRef.current={areas,selectedArea,onAreaSelect};
  const copyRef=useRef(copy); copyRef.current=copy;
  const [err,setErr]=useState('');
  const [ready,setReady]=useState(null);
  const [themeCounts,setThemeCounts]=useState({});
  useEffect(()=>{
    if(!expanded)return;
    const previous=document.activeElement;
    expandRef.current?.focus();
    const handleKey=e=>{
      if(e.key==='Escape'){setExpanded(false);return;}
      if(e.key==='Tab'){
        const nodes=[...wrapRef.current.querySelectorAll('button:not(:disabled),a[href],input,select,summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',handleKey);
    return()=>{document.removeEventListener('keydown',handleKey);previous?.focus();};
  },[expanded]);
  useEffect(()=>{let alive=true;let resize;setReady(null);Promise.all([leaflet(),boundaries()]).then(([L,data])=>{
    if(!alive||!ref.current)return;
    dataRef.current=data;
    const map=L.map(ref.current,{center:[-16.3,167.6],zoom:6,zoomControl:false,zoomSnap:.25,zoomDelta:.5,minZoom:5,maxZoom:18,scrollWheelZoom:true});
    L.control.zoom({zoomInTitle:copy.zoomIn,zoomOutTitle:copy.zoomOut}).addTo(map);
    const overview=L.layerGroup().addTo(map);
    map.createPane('councilLand');map.getPane('councilLand').style.zIndex='250';
    map.createPane('councilBorders');map.getPane('councilBorders').style.zIndex='450';
    map.getPane('councilBorders').style.pointerEvents='none';
    L.geoJSON(data.display.land,{pane:'councilLand',interactive:false,style:{stroke:false,fillColor:'#f5f4eb',fillOpacity:1}}).addTo(overview);
    const labels=L.layerGroup(data.display.provinceLabels.map(f=>L.marker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{interactive:false,keyboard:false,icon:L.divIcon({className:'pub-map-province',html:esc(f.properties.name),iconSize:[80,24],iconAnchor:[-10,12]})})));
    const islandLabels=L.layerGroup(ISLAND_GROUPS.map(([name,pattern])=>{
      const features=data.features.filter(f=>pattern.test(f.properties.ADM2_EN));
      if(!features.length)return null;
      const feature=features.reduce((a,b)=>L.geoJSON(a).getBounds().getNorthEast().distanceTo(L.geoJSON(a).getBounds().getSouthWest())>L.geoJSON(b).getBounds().getNorthEast().distanceTo(L.geoJSON(b).getBounds().getSouthWest())?a:b);
      return L.marker(mapLabelPoint(feature),{interactive:false,keyboard:false,icon:L.divIcon({className:'pub-map-island',html:esc(name),iconSize:[110,24],iconAnchor:[-8,12]})});
    }).filter(Boolean));
    const councilLabels=L.layerGroup(data.features.map(f=>L.marker(mapLabelPoint(f),{interactive:false,keyboard:false,icon:L.divIcon({className:'pub-map-council',html:esc(f.properties.ADM2_EN),iconSize:[120,32],iconAnchor:[60,16]})})));
    const updateLabels=()=>{
      for(const [layer,visible] of [[labels,map.getZoom()<7],[islandLabels,map.getZoom()>=7&&map.getZoom()<9],[councilLabels,map.getZoom()>=9]]){
        if(visible&&!map.hasLayer(layer))layer.addTo(map);
        else if(!visible&&map.hasLayer(layer))map.removeLayer(layer);
      }
    };
    map.on('zoomend baselayerchange',updateLabels);
    L.geoJSON(data.display.boundaries,{pane:'councilBorders',interactive:false,style:{className:'pub-map-boundaries',color:'#728994',weight:.65,opacity:.75,fill:false,lineJoin:'round',lineCap:'round'}}).addTo(map);
    const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'});
    const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery &copy; Esri'});
    const layers=L.control.layers({[copy.overview]:overview,[copy.street]:street,[copy.satellite]:sat},{},{position:'topright',collapsed:true}).addTo(map);
    const toggle=layers.getContainer().querySelector('.leaflet-control-layers-toggle');
    if(toggle){toggle.title=copy.layers;toggle.setAttribute('aria-label',copy.layers);}
    L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
    mapRef.current=map;setErr('');setReady(map);
    const b=L.geoJSON(data).getBounds();if(b.isValid())map.fitBounds(b,{padding:[28,28],animate:false});updateLabels();
    resize=new ResizeObserver(()=>map.invalidateSize({pan:true,animate:false}));resize.observe(ref.current);
  }).catch(()=>alive&&setErr(copyRef.current.unavailable));
  return()=>{alive=false;resize?.disconnect();if(mapRef.current){mapRef.current.remove();mapRef.current=null;}layerRef.current=null;dataRef.current=null;};
  },[fr]);
  useEffect(()=>{
    if(!ready||ready!==mapRef.current||!dataRef.current||!window.L)return;
    const L=window.L,map=mapRef.current,c=copyRef.current;
    if(layerRef.current)map.removeLayer(layerRef.current);
    const lookup=new Map(areas.map(a=>[key(a.province,a.area_council),a]));
    const selectedKey=selectedArea?key(selectedArea.province,selectedArea.area_council):'';
    const themeFor=(rec)=>['adaptation','mitigation','both','not-recorded'].includes(rec?.theme_category)
      ? rec.theme_category : 'not-recorded';
    const counts={};
    for(const feature of dataRef.current.features){
      const rec=lookup.get(key(feature.properties.ADM1_EN,feature.properties.ADM2_EN));
      const theme=rec?.project_count>0?themeFor(rec):'none';
      counts[theme]=(counts[theme]||0)+1;
    }
    setThemeCounts(counts);
    const geo=L.geoJSON(dataRef.current,{style:f=>{
      const name=f.properties?.ADM2_EN||'',province=f.properties?.ADM1_EN||'';
      const rec=lookup.get(key(province,name));const selected=selectedKey===key(province,name);
      const theme=themeFor(rec);
      return {
        className:rec?.project_count?'pub-map-recorded':'pub-map-unrecorded',
        color:'#173f63',stroke:selected,weight:2.5,opacity:1,
        fillColor:THEME_AREA_COLOURS[theme],
        fillOpacity:rec?.project_count?0.7:0,
      };
    },onEachFeature:(f,l)=>{
      const name=f.properties?.ADM2_EN||'',province=f.properties?.ADM1_EN||'';
      const found=lookup.get(key(province,name));const rec=found?.project_count>0?found:null;const n=rec?.project_count||0,names=rec?.project_names||[];
      const themeLabel=rec?c.themes[rec.theme_category]||c.themes['not-recorded']:'';
      l.bindTooltip(rec ? `${esc(name)} · ${esc(themeLabel)} · ${n} ${n===1?c.one:c.many}` : `${esc(name)} · ${c.none}`,{sticky:true});
      l.bindPopup(`<strong>${esc(name)}</strong><br><span style="color:#6b7280">${esc(province)}</span>${rec?`<div style="margin-top:6px"><b>${esc(themeLabel)}</b></div><div style="margin-top:4px"><b>${n}</b> ${n===1?c.one:c.many}</div>${names.length?`<ul style="padding-left:16px;margin:6px 0 0">${names.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`:`<div style="margin-top:6px">${esc(c.noneDetail)}</div>`}`);
      if(rec&&stateRef.current.onAreaSelect){
        l.unbindPopup();
        l.on('click',()=>stateRef.current.onAreaSelect?.({province:found.province||province,area_council:found.area_council||name}));
      }
    }});
    layerRef.current=geo.addTo(map);
  },[areas,selectedArea,ready,fr]);
  const showAll=()=>{
    if(mapRef.current&&dataRef.current&&window.L){
      mapRef.current.fitBounds(window.L.geoJSON(dataRef.current.display.land).getBounds(),{padding:[28,28],animate:false});
    }
  };
  const recordedAreas=areas.filter(a=>a.project_count>0);
  const chosen=selectedArea&&recordedAreas.find(a=>key(a.province,a.area_council)===key(selectedArea.province,selectedArea.area_council));
  const locatedProjects=new Set(recordedAreas.flatMap(a=>a.project_ids||[]).map(String)).size;
  const activeThemes=THEME_AREA_ORDER.filter(theme=>themeCounts[theme]>0);
  const showLocations=()=>{
    if(!mapRef.current||!dataRef.current)return;
    const keys=new Set(recordedAreas.map(a=>key(a.province,a.area_council)));
    const features=dataRef.current.features.filter(f=>keys.has(key(f.properties.ADM1_EN,f.properties.ADM2_EN)));
    if(features.length)mapRef.current.fitBounds(window.L.geoJSON(features).getBounds(),{padding:[36,36],maxZoom:10,animate:false});
  };
  const legendRows=themes=>themes.map(theme=><div key={theme}><i style={{backgroundColor:THEME_AREA_COLOURS[theme]}} aria-hidden="true"/><span>{copy.themes[theme]}</span><b>{themeCounts[theme]||0} {(themeCounts[theme]||0)===1?copy.areaOne:copy.areaMany}</b></div>);
  return <div ref={wrapRef} className={`pub-leaflet-wrap pub-coverage-map${expanded?' pub-map-expanded':''}`} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={copy.aria}>
    <div className="pub-map-toolbar"><button type="button" onClick={showAll} disabled={!ready}>{copy.reset}</button><button type="button" onClick={showLocations} disabled={!ready||!recordedAreas.length}>{copy.locations}</button><button ref={expandRef} type="button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?copy.collapse:copy.expand}</button></div>
    <div className="pub-map-canvas"><div ref={ref} className="pub-leaflet" aria-label={copy.aria}/>{err&&<div className="pub-map-error" role="status">{err}</div>}</div>
    <div className="pub-map-key"><strong>{copy.keyTitle}</strong>
      <div className="pub-map-legend">{legendRows(activeThemes)}</div>
      {!activeThemes.length&&ready&&<small role="status">{copy.noLocations}</small>}

      <small className="pub-map-neutral">{themeCounts.none||0} {copy.areaMany} · {copy.neutral}</small>
      {projectCount!=null&&<small className="pub-map-data-note">{fr?`${locatedProjects} sur ${projectCount} projets ont un lieu enregistré par conseil de zone.`:`${locatedProjects} of ${projectCount} projects have an Area Council location recorded.`}</small>}
      {recordedAreas.length>0&&onAreaSelect&&<label className="pub-map-choose"><span>{copy.choose}</span><select value={chosen?key(chosen.province,chosen.area_council):''} onChange={e=>{const a=recordedAreas.find(a=>key(a.province,a.area_council)===e.target.value);onAreaSelect?.(a?{province:a.province,area_council:a.area_council}:null);}}><option value="">—</option>{recordedAreas.map(a=><option key={key(a.province,a.area_council)} value={key(a.province,a.area_council)}>{a.area_council}, {a.province}</option>)}</select></label>}
      {chosen&&<div className="pub-map-selection" aria-live="polite"><strong>{chosen.area_council}</strong><span>{chosen.province} · {copy.themes[chosen.theme_category]||copy.themes['not-recorded']}</span><ul>{(chosen.project_names||[]).map((name,i)=><li key={`${name}-${i}`}>{name}{onViewProject&&chosen.project_ids?.[i]&&<button type="button" onClick={()=>{setExpanded(false);onViewProject(chosen.project_ids[i]);}}>{copy.view}</button>}</li>)}</ul></div>}
      <details className="pub-map-all-themes"><summary>{copy.legend}</summary><div className="pub-map-legend">{legendRows(THEME_AREA_ORDER.filter(t=>!activeThemes.includes(t)))}</div><small>{copy.coverage} {copy.countNote}</small><small className="pub-map-source">{copy.source}</small></details>
    </div>
  </div>;
}
