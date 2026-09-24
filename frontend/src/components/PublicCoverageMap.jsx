import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { THEME_AREA_COLOURS, THEME_AREA_ORDER } from '../lib/publicPortfolioCategories';

const LEAFLET_JS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
// Use the reviewed 2025 WGS84 snapshot bundled with the portal. This keeps the
// 71 Area Council names stable and avoids an upstream map service changing them.
const BOUNDARY_URL=`${import.meta.env.BASE_URL}data/vanuatu-area-councils-2025.geojson`;
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
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const key=(province,area)=>`${norm(province)}|${norm(area)}`;
let boundaryPromise;
function boundaries(){
  if(!boundaryPromise) boundaryPromise=fetch(BOUNDARY_URL).then(r=>{if(!r.ok)throw new Error('Boundaries unavailable');return r.json();}).catch(e=>{boundaryPromise=null;throw e;});
  return boundaryPromise;
}

export default function PublicCoverageMap({areas=[],selectedArea=null,onAreaSelect}){
  const { i18n } = useTranslation();
  const fr = i18n.resolvedLanguage?.startsWith('fr');
  const copy = fr ? {
    one:'projet', many:'projets', none:'aucun lieu de mise en œuvre enregistré',
    noneDetail:'Aucun lieu de mise en œuvre n’est enregistré pour ce conseil de zone. Cela ne signifie pas nécessairement qu’il n’y a aucune activité de projet.',
    unavailable:'Carte temporairement indisponible.', keyTitle:'Zones par thème officiel',
    keyBody:'Les zones non colorées n’ont pas de lieu de mise en œuvre enregistré.',
    themes:{adaptation:'Adaptation',mitigation:'Atténuation',both:'Adaptation et atténuation','not-recorded':'Thème non renseigné'},
    areaOne:'zone',areaMany:'zones',
    aria:'Carte publique de la couverture des projets',
  } : {
    one:'project', many:'projects', none:'no recorded implementation location',
    noneDetail:'No implementation location is recorded for this Area Council. This does not necessarily mean there is no project activity.',
    unavailable:'Map temporarily unavailable.', keyTitle:'Areas by official thematic area',
    keyBody:'Uncoloured areas have no recorded implementation location.',
    themes:{adaptation:'Adaptation',mitigation:'Mitigation',both:'Adaptation & Mitigation','not-recorded':'Theme not recorded'},
    areaOne:'area',areaMany:'areas',
    aria:'Public project coverage map',
  };
  const ref=useRef(null), mapRef=useRef(null), layerRef=useRef(null), dataRef=useRef(null);
  const stateRef=useRef({areas,selectedArea,onAreaSelect});
  stateRef.current={areas,selectedArea,onAreaSelect};
  const copyRef=useRef(copy); copyRef.current=copy;
  const [err,setErr]=useState('');
  const [ready,setReady]=useState(false);
  useEffect(()=>{let alive=true;Promise.all([leaflet(),boundaries()]).then(([L,data])=>{
    if(!alive||!ref.current)return;
    dataRef.current=data;
    const map=L.map(ref.current,{center:[-16.3,167.6],zoom:6,minZoom:5,maxZoom:18,scrollWheelZoom:true});
    const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery &copy; Esri'});
    L.control.layers({'Street map':street,'Satellite':sat},{},{position:'topright',collapsed:true}).addTo(map);
    L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
    mapRef.current=map;setErr('');setReady(true);
    const b=L.geoJSON(data).getBounds();if(b.isValid())map.fitBounds(b,{padding:[12,12]});
  }).catch(()=>alive&&setErr(copyRef.current.unavailable));
  return()=>{alive=false;if(mapRef.current){mapRef.current.remove();mapRef.current=null;}layerRef.current=null;dataRef.current=null;};
  },[]);
  useEffect(()=>{
    if(!ready||!mapRef.current||!dataRef.current||!window.L)return;
    const L=window.L,map=mapRef.current,c=copyRef.current;
    if(layerRef.current)map.removeLayer(layerRef.current);
    const lookup=new Map(areas.map(a=>[key(a.province,a.area_council),a]));
    const selectedKey=selectedArea?key(selectedArea.province,selectedArea.area_council):'';
    const geo=L.geoJSON(dataRef.current,{style:f=>{
      const name=f.properties?.ADM2_EN||'',province=f.properties?.ADM1_EN||'';
      const rec=lookup.get(key(province,name));const selected=selectedKey===key(province,name);
      const theme=rec?.theme_category||'none';
      return {color:selected?'#173f83':'#536575',weight:selected?3:rec?.project_count?1.4:.7,fillColor:THEME_AREA_COLOURS[theme]||THEME_AREA_COLOURS['not-recorded'],fillOpacity:rec?.project_count?0.76:0.12};
    },onEachFeature:(f,l)=>{
      const name=f.properties?.ADM2_EN||'',province=f.properties?.ADM1_EN||'';
      const found=lookup.get(key(province,name));const rec=found?.project_count>0?found:null;const n=rec?.project_count||0,names=rec?.project_names||[];
      const themeLabel=rec?c.themes[rec.theme_category]||c.themes['not-recorded']:'';
      l.bindTooltip(rec ? `${esc(name)} · ${esc(themeLabel)} · ${n} ${n===1?c.one:c.many}` : `${esc(name)} · ${c.none}`,{sticky:true});
      l.bindPopup(`<strong>${esc(name)}</strong><br><span style="color:#6b7280">${esc(province)}</span>${rec?`<div style="margin-top:6px"><b>${esc(themeLabel)}</b></div><div style="margin-top:4px"><b>${n}</b> ${n===1?c.one:c.many}</div>${names.length?`<ul style="padding-left:16px;margin:6px 0 0">${names.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`:`<div style="margin-top:6px">${esc(c.noneDetail)}</div>`}`);
      if(rec) l.on('click',()=>stateRef.current.onAreaSelect?.({province,area_council:name}));
    }}).addTo(map);
    layerRef.current=geo;
  },[areas,selectedArea,ready,fr]);
  const themeCounts=areas.reduce((counts,area)=>{
    if(area.project_count>0) counts[area.theme_category||'not-recorded']=(counts[area.theme_category||'not-recorded']||0)+1;
    return counts;
  },{});
  return <div className="pub-leaflet-wrap"><div ref={ref} className="pub-leaflet" aria-label={copy.aria}/>{err&&<div className="pub-map-error">{err}</div>}<div className="pub-map-key"><strong>{copy.keyTitle}</strong><div className="pub-map-legend">{THEME_AREA_ORDER.map(theme=><div key={theme}><i style={{backgroundColor:THEME_AREA_COLOURS[theme]}} aria-hidden="true"/><span>{copy.themes[theme]}</span><b>{themeCounts[theme]||0} {(themeCounts[theme]||0)===1?copy.areaOne:copy.areaMany}</b></div>)}</div><small>{copy.keyBody}</small></div></div>;
}
