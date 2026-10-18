import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_AREA_COLOURS, THEME_AREA_ORDER } from '../lib/publicPortfolioCategories';
import './public-coverage-map.css';
import { mapLabelPoint } from '../lib/publicMapLabels';
import { coverageFeatures, geometryBounds, mapStyle, loadBasemap } from '../lib/maplibreCoverage';

// Reviewed WGS84 snapshot, including all 71 councils and shared linework.
const BOUNDARY_URL=`${import.meta.env.BASE_URL}data/vanuatu-area-councils-map.geojson`;
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
    unavailable:'Carte temporairement indisponible.', keyTitle:'Lieux de projets par thème',locations:'Voir les lieux de projets',expand:'Plein écran',collapse:'Fermer le plein écran',legend:'Détails de la carte',terrain:'Relief et lieux',boundaries:'Limites des conseils',zoomNote:'Dézoomez pour voir les conseils de zone.',basemapLoading:'Chargement du fond de carte…',basemapFailed:'Fond de carte indisponible. Limites simplifiées affichées.',coverage:'La couleur indique un conseil avec un lieu de projet enregistré. Les activités peuvent ne couvrir qu’une partie du conseil.',choose:'Choisir un conseil de zone',view:'Voir le projet',noLocations:'Aucun lieu de projet enregistré pour les filtres actuels.',
    keyBody:'Les zones non colorées n’ont pas de lieu de mise en œuvre enregistré.',
    themes:{adaptation:'Adaptation',mitigation:'Atténuation',both:'Adaptation et atténuation','not-recorded':'Thème non renseigné'},
    areaOne:'conseil',areaMany:'conseils',
    aria:'Carte publique de la couverture des projets',
  } : {
    overview:'Overview',reset:'Show all Vanuatu',neutral:'No recorded project location',source:'Area Council boundaries · 2025 snapshot',countNote:'Counts are Area Councils, not projects.',zoomIn:'Zoom in',zoomOut:'Zoom out',layers:'Layers',street:'Street map',satellite:'Satellite',one:'project', many:'projects', none:'no recorded implementation location',
    noneDetail:'No implementation location is recorded for this Area Council. This does not necessarily mean there is no project activity.',
    unavailable:'Map temporarily unavailable.', keyTitle:'Project locations by theme',locations:'Show project locations',expand:'Full screen',collapse:'Close full screen',legend:'Map details',terrain:'Terrain & places',boundaries:'Council boundaries',zoomNote:'Zoom out to see Area Council coverage.',basemapLoading:'Loading geographic detail…',basemapFailed:'Basemap unavailable. Showing simplified boundaries.',coverage:'Colour marks a council with a recorded project location. Activities may cover only part of that council.',choose:'Choose an Area Council',view:'View project',noLocations:'No project locations recorded for the current filters.',
    keyBody:'Uncoloured areas have no recorded implementation location.',
    themes:{adaptation:'Adaptation',mitigation:'Mitigation',both:'Adaptation & Mitigation','not-recorded':'Theme not recorded'},
    areaOne:'Area Council',areaMany:'Area Councils',
    aria:'Public project coverage map',
  };
  const wrapRef=useRef(null), expandRef=useRef(null);
  const [expanded,setExpanded]=useState(false);
  const ref=useRef(null), mapRef=useRef(null), dataRef=useRef(null), popupRef=useRef(null);
  const bordersRef=useRef(false);
  const stateRef=useRef({areas,selectedArea,onAreaSelect});
  stateRef.current={areas,selectedArea,onAreaSelect};
  const copyRef=useRef(copy); copyRef.current=copy;
  const [err,setErr]=useState('');
  const [ready,setReady]=useState(null);
  const [basemap,setBasemap]=useState('light');
  const [showBorders,setShowBorders]=useState(false);
  bordersRef.current=showBorders;
  const [retry,setRetry]=useState(0);
  const [themeCounts,setThemeCounts]=useState({});
  const [detailZoom,setDetailZoom]=useState(false);
  const [basemapState,setBasemapState]=useState('loading');
  const focusStateRef=useRef({map:null,selection:''});
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
  useEffect(()=>{
    let alive=true,resize;
    setReady(null);setErr('');
    Promise.all([import('maplibre-gl'),import('maplibre-gl/dist/maplibre-gl.css'),boundaries(),import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')]).then(([engine,,data,worker])=>{
      if(!alive||!ref.current)return;
      engine.setWorkerUrl(worker.default);dataRef.current=data;
      const map=new engine.Map({container:ref.current,style:mapStyle(null,data),center:[167.6,-16.3],zoom:5,
        minZoom:4,maxZoom:18,renderWorldCopies:false,dragRotate:false,pitchWithRotate:false,
        canvasContextAttributes:{preserveDrawingBuffer:true},attributionControl:false});
      mapRef.current=map;
      map.scrollZoom.disable();map.touchZoomRotate.disableRotation();
      map.addControl(new engine.NavigationControl({showCompass:false}),'top-left');
      map.addControl(new engine.ScaleControl({unit:'metric'}),'bottom-right');
      map.addControl(new engine.AttributionControl({compact:true}),'bottom-right');
      map.getCanvas().setAttribute('aria-label',copyRef.current.aria);
      map.on('style.load',()=>{
        if(!alive)return;
        map.setLayoutProperty('council-borders','visibility',bordersRef.current?'visible':'none');
        setReady({map});
      });
      map.on('zoomend',()=>alive&&setDetailZoom(map.getZoom()>11));
      map.on('error',event=>{
        if(!alive)return;
        if(['openmaptiles','imagery'].includes(event.sourceId)&&!map.getLayer('fallback-land')){
          map.setStyle(mapStyle(null,data));setBasemapState('failed');
        }
      });
      map.on('sourcedata',event=>{
        if(alive&&event.sourceId==='openmaptiles'&&event.isSourceLoaded)setBasemapState('ready');
      });
      map.on('click','council-fill',event=>{
        const f=event.features?.[0];if(!f)return;
        const c=copyRef.current,p=f.properties;
        const found=stateRef.current.areas.find(a=>key(a.province,a.area_council)===p.areaKey);
        popupRef.current?.remove();
        if(found?.project_count>0&&stateRef.current.onAreaSelect){
          stateRef.current.onAreaSelect({province:found.province,area_council:found.area_council});return;
        }
        const n=found?.project_count||0,names=found?.project_names||[];
        popupRef.current=new engine.Popup({maxWidth:'300px'}).setLngLat(event.lngLat).setHTML(
          `<strong>${esc(p.ADM2_EN)}</strong><br><span>${esc(p.ADM1_EN)}</span>`+
          (n?`<p><b>${n}</b> ${n===1?c.one:c.many}</p><ul>${names.map(name=>`<li>${esc(name)}</li>`).join('')}</ul>`:`<p>${esc(c.noneDetail)}</p>`)
        ).addTo(map);
      });
      map.on('mouseenter','council-fill',()=>{map.getCanvas().style.cursor='pointer';});
      map.on('mouseleave','council-fill',()=>{map.getCanvas().style.cursor='';});
      map.fitBounds(geometryBounds(data),{padding:28,duration:0});
      resize=new ResizeObserver(()=>map.resize());resize.observe(ref.current);
    }).catch(()=>{if(alive)setErr(copyRef.current.unavailable);});
    return()=>{alive=false;resize?.disconnect();popupRef.current?.remove();mapRef.current?.remove();mapRef.current=null;dataRef.current=null;};
  },[fr,retry]);
  useEffect(()=>{
    if(!mapRef.current||!dataRef.current)return;
    const map=mapRef.current,data=dataRef.current;
    const controller=new AbortController();let alive=true;
    setBasemapState('loading');
    loadBasemap(basemap,controller.signal).then(base=>{
      if(!alive)return;
      map.setStyle(mapStyle(base,data));setBasemapState('ready');
    }).catch(error=>{
      if(!alive||error.name==='AbortError')return;
      map.setStyle(mapStyle(null,data));setBasemapState('failed');
    });
    return()=>{alive=false;controller.abort();};
  },[basemap,fr,retry,Boolean(ready)]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!ready||!map?.getLayer('council-borders'))return;
    map.setLayoutProperty('council-borders','visibility',showBorders?'visible':'none');
  },[showBorders,ready]);
  useEffect(()=>{
    const map=mapRef.current,data=dataRef.current;
    if(!ready||!data||!map?.getSource('councils'))return;
    const selectedKey=selectedArea?key(selectedArea.province,selectedArea.area_council):'';
    const {collection,counts}=coverageFeatures(data,areas,selectedKey,key);
    setThemeCounts(counts);map.getSource('councils').setData(collection);
    if(map.getSource('council-labels'))map.getSource('council-labels').setData({type:'FeatureCollection',features:collection.features.map(f=>{
      const [lat,lng]=mapLabelPoint(f);
      return {type:'Feature',properties:f.properties,geometry:{type:'Point',coordinates:[lng,lat]}};
    })});
    const focus=focusStateRef.current;
    if(focus.map!==map||focus.selection!==selectedKey){
      const features=collection.features.filter(f=>selectedKey?f.properties.areaKey===selectedKey:f.properties.projectCount>0);
      if(features.length)map.fitBounds(geometryBounds({features}),{padding:40,maxZoom:9.5,duration:0});
      focusStateRef.current={map,selection:selectedKey};
    }
  },[areas,selectedArea,ready,fr]);
  const showAll=()=>{
    if(mapRef.current&&dataRef.current)mapRef.current.fitBounds(geometryBounds(dataRef.current),{padding:28,duration:0});
  };
  const recordedAreas=areas.filter(a=>a.project_count>0);
  const chosen=selectedArea&&recordedAreas.find(a=>key(a.province,a.area_council)===key(selectedArea.province,selectedArea.area_council));
  const locatedProjects=new Set(recordedAreas.flatMap(a=>a.project_ids||[]).map(String)).size;
  const activeThemes=THEME_AREA_ORDER.filter(theme=>themeCounts[theme]>0);
  const showLocations=()=>{
    if(!mapRef.current||!dataRef.current)return;
    const keys=new Set(recordedAreas.map(a=>key(a.province,a.area_council)));
    const features=dataRef.current.features.filter(f=>keys.has(key(f.properties.ADM1_EN,f.properties.ADM2_EN)));
    if(features.length)mapRef.current.fitBounds(geometryBounds({features}),{padding:36,maxZoom:10,duration:0});
  };
  const legendRows=themes=>themes.map(theme=><div key={theme}><i style={{backgroundColor:THEME_AREA_COLOURS[theme]}} aria-hidden="true"/><span>{copy.themes[theme]}</span><b>{themeCounts[theme]||0} {(themeCounts[theme]||0)===1?copy.areaOne:copy.areaMany}</b></div>);
  return <div ref={wrapRef} className={`pub-leaflet-wrap pub-coverage-map${expanded?' pub-map-expanded':''}`} role={expanded?'dialog':undefined} aria-modal={expanded?true:undefined} aria-label={copy.aria}>
    <div className="pub-map-toolbar"><button type="button" onClick={showAll} disabled={!ready}>{copy.reset}</button><button type="button" onClick={showLocations} disabled={!ready||!recordedAreas.length}>{copy.locations}</button><button ref={expandRef} type="button" aria-pressed={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?copy.collapse:copy.expand}</button></div>
    <div className="pub-map-options"><label><span>{fr?'Fond de carte':'Basemap'}</span><select aria-label={fr?'Fond de carte':'Basemap'} value={basemap} onChange={e=>setBasemap(e.target.value)}><option value="light">{fr?'Clair':'Light'}</option><option value="street">{copy.street}</option><option value="satellite">{copy.satellite}</option></select></label><label><input type="checkbox" checked={showBorders} onChange={e=>setShowBorders(e.target.checked)}/>{copy.boundaries}</label></div>
    <div className="pub-map-canvas"><div ref={ref} className="pub-leaflet pub-maplibre" aria-label={copy.aria}/>{(detailZoom||basemapState==='loading'||basemapState==='failed')&&<div className="pub-map-context-note" role="status">{detailZoom?copy.zoomNote:basemapState==='failed'?copy.basemapFailed:copy.basemapLoading}</div>}{err&&<div className="pub-map-error" role="status">{err}<button type="button" onClick={()=>setRetry(n=>n+1)}>{fr?'Réessayer':'Try again'}</button></div>}</div>
    <div className="pub-map-key"><strong>{copy.keyTitle}</strong>
      <div className="pub-map-legend">{legendRows(activeThemes)}</div>
      {!activeThemes.length&&ready&&<small role="status">{copy.noLocations}</small>}

      {recordedAreas.length>1&&onAreaSelect&&<label className="pub-map-choose"><span>{copy.choose}</span><select value={chosen?key(chosen.province,chosen.area_council):''} onChange={e=>{const a=recordedAreas.find(a=>key(a.province,a.area_council)===e.target.value);onAreaSelect?.(a?{province:a.province,area_council:a.area_council}:null);}}><option value="">—</option>{recordedAreas.map(a=><option key={key(a.province,a.area_council)} value={key(a.province,a.area_council)}>{a.area_council}, {a.province}</option>)}</select></label>}
      {chosen&&<div className="pub-map-selection" aria-live="polite"><strong>{chosen.area_council}</strong><span>{chosen.province} · {copy.themes[chosen.theme_category]||copy.themes['not-recorded']}</span><ul>{(chosen.project_names||[]).map((name,i)=><li key={`${name}-${i}`}>{name}{onViewProject&&chosen.project_ids?.[i]&&<button type="button" onClick={()=>{setExpanded(false);onViewProject(chosen.project_ids[i]);}}>{copy.view}</button>}</li>)}</ul></div>}
      <details className="pub-map-all-themes"><summary>{copy.legend}</summary><small className="pub-map-neutral">{themeCounts.none||0} {copy.areaMany} · {copy.neutral}</small>
      {projectCount!=null&&<small className="pub-map-data-note">{fr?`${locatedProjects} sur ${projectCount} projets ont un lieu enregistré par conseil de zone.`:`${locatedProjects} of ${projectCount} projects have an Area Council location recorded.`}</small>}<div className="pub-map-legend">{legendRows(THEME_AREA_ORDER.filter(t=>!activeThemes.includes(t)))}</div><small>{copy.coverage} {copy.countNote}</small><small className="pub-map-source">{copy.source}</small></details>
    </div>
  </div>;
}
