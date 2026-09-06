import { useEffect, useRef, useState } from 'react';

const LEAFLET_JS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const BOUNDARY_URL='https://services.arcgis.com/Zoi8xtp32kQcxoKu/arcgis/rest/services/vut_admbnda_adm2_spc_20180824/FeatureServer/0/query?where=1%3D1&outFields=ADM2_EN%2CADM2_PCODE%2CADM1_EN&returnGeometry=true&outSR=4326&f=geojson';
const PALETTE=['#4f86c6','#d97757','#5aa879','#9b6fc4','#d6a53f','#3d9fa3','#c8648a','#7b8f45','#6f78bd','#cf6e42','#4c9b83','#8a63ad'];
let promise;
function leaflet(){
  if(window.L) return Promise.resolve(window.L);
  if(promise) return promise;
  promise=new Promise((resolve,reject)=>{
    if(!document.querySelector(`link[href="${LEAFLET_CSS}"]`)){const l=document.createElement('link');l.rel='stylesheet';l.href=LEAFLET_CSS;document.head.appendChild(l);}
    const old=document.querySelector(`script[src="${LEAFLET_JS}"]`); if(old){old.addEventListener('load',()=>resolve(window.L),{once:true}); return;}
    const s=document.createElement('script');s.src=LEAFLET_JS;s.onload=()=>resolve(window.L);s.onerror=reject;document.head.appendChild(s);
  });
  return promise;
}
const norm=(v)=>String(v||'').toLowerCase().replace(/\b(area council|council)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const hash=(s)=>{let h=0;for(const c of s)h=((h<<5)-h)+c.charCodeAt(0);return Math.abs(h);};
const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

export default function PublicCoverageMap({areas=[]}){
  const ref=useRef(null), mapRef=useRef(null), layerRef=useRef(null);
  const [err,setErr]=useState('');
  useEffect(()=>{let alive=true; Promise.all([leaflet(),fetch(BOUNDARY_URL).then(r=>r.json())]).then(([L,data])=>{
    if(!alive||!ref.current) return;
    if(mapRef.current) mapRef.current.remove();
    const map=L.map(ref.current,{center:[-16.3,167.6],zoom:6,minZoom:5,maxZoom:18,scrollWheelZoom:true});
    const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery &copy; Esri'});
    L.control.layers({'Street map':street,'Satellite':sat},{},{position:'topright',collapsed:true}).addTo(map);
    L.control.scale({imperial:false,position:'bottomright'}).addTo(map);
    const lookup=new Map(areas.map(a=>[norm(a.area_council),a]));
    const geo=L.geoJSON(data,{style:(f)=>{const name=f.properties?.ADM2_EN||'';const rec=lookup.get(norm(name));const fill=PALETTE[hash(name)%PALETTE.length];return {color:'#21465a',weight:rec?1.4:.7,fillColor:fill,fillOpacity:rec?.project_count?0.72:0.12};},onEachFeature:(f,l)=>{const name=f.properties?.ADM2_EN||'';const province=f.properties?.ADM1_EN||'';const rec=lookup.get(norm(name));const n=rec?.project_count||0; const names=rec?.project_names||[];l.bindTooltip(`${esc(name)} · ${n} ${n===1?'project':'projects'}`,{sticky:true});l.bindPopup(`<strong>${esc(name)}</strong><br><span style="color:#6b7280">${esc(province)}</span><div style="margin-top:6px"><b>${n}</b> ${n===1?'project':'projects'}</div>${names.length?`<ul style="padding-left:16px;margin:6px 0 0">${names.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`);}}).addTo(map);
    layerRef.current=geo; const b=geo.getBounds();if(b.isValid())map.fitBounds(b,{padding:[12,12]}); mapRef.current=map;
  }).catch(()=>alive&&setErr('Map temporarily unavailable.'));
  return()=>{alive=false;if(mapRef.current){mapRef.current.remove();mapRef.current=null;}};
  },[areas]);
  return <div className="pub-leaflet-wrap"><div ref={ref} className="pub-leaflet" aria-label="Public project coverage map"/>{err&&<div className="pub-map-error">{err}</div>}<div className="pub-map-key"><strong>Area Council project coverage</strong><span>Coloured areas have approved projects.</span></div></div>;
}
