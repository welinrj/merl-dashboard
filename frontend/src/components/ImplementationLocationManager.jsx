import {useEffect,useMemo,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {supabase} from '../supabaseClient';
import {dbErrorMessage} from '../lib/dbError';

const categories=[
 ['ecosystems','Ecosystems & nature-based solutions','Écosystèmes et solutions fondées sur la nature'],
 ['livelihoods','Livelihoods, food & agriculture','Moyens de subsistance, alimentation et agriculture'],
 ['climate-risk','Climate information & disaster risk','Information climatique et risques de catastrophe'],
 ['infrastructure','Infrastructure & technology','Infrastructures et technologie'],
 ['governance','Governance, policy & planning','Gouvernance, politiques et planification'],
 ['capacity','Capacity, awareness & inclusion','Capacités, sensibilisation et inclusion'],
 ['finance','Climate finance & fund systems','Finance climatique et systèmes de fonds'],
 ['learning-delivery','Learning, monitoring & project delivery','Apprentissage, suivi et mise en œuvre'],
 ['beneficiaries','Beneficiaries & resilience outcomes','Bénéficiaires et résultats de résilience'],
 ['other','Other recorded outcomes','Autres résultats enregistrés'],
];

export default function ImplementationLocationManager({projects,indicators,activities,projectFilter}) {
 const {i18n}=useTranslation();const fr=i18n.resolvedLanguage?.startsWith('fr');
 const [open,setOpen]=useState(false);
 const [picked,setPicked]=useState('');
 const projectId=projectFilter!=='all'&&projects.some(p=>p.id===projectFilter)?projectFilter:projects.some(p=>p.id===picked)?picked:projects[0]?.id||'';
 if(!projects.length)return null;
 return <details className="rf2-note" style={{padding:'12px',margin:'12px 0',border:'1px solid var(--border)',borderRadius:10,background:'var(--surface-1)'}} open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary style={{cursor:'pointer',fontWeight:700,minHeight:36,alignContent:'center'}}>{fr?'Associer des lieux aux activités et indicateurs':'Assign locations to activities and indicators'}</summary>
  {open&&<div style={{display:'grid',gap:12,marginTop:8}}>
   <p style={{margin:0}}>{fr?'Associez chaque activité ou indicateur aux conseils de zone où il est mis en œuvre. Ces liens ne constituent pas une preuve de réalisation.':'Link each activity or indicator to the Area Councils where it is implemented. Location assignments do not establish achievement.'}</p>
   <label style={{display:'grid',gap:5}}>{fr?'Projet':'Project'}<select className="field-input" value={projectId} onChange={e=>setPicked(e.target.value)} disabled={projectFilter!=='all'&&projects.some(p=>p.id===projectFilter)}>{projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
   <ProjectAssignments key={projectId} projectId={projectId} project={projects.find(p=>p.id===projectId)} indicators={indicators.filter(i=>i.project_id===projectId)} activities={activities.filter(a=>a.project_id===projectId)} fr={fr}/>
  </div>}
 </details>;
}

function ProjectAssignments({projectId,project,indicators,activities,fr}){
 const [model,setModel]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
 const [kind,setKind]=useState('indicator'),[itemId,setItemId]=useState(''),[query,setQuery]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);setError('');supabase.rpc('get_implementation_location_assignments',{p_project_id:projectId}).then(({data,error})=>{if(!alive)return;if(error){setError(dbErrorMessage(error));setModel(null);}else setModel(data);setLoading(false);}).catch(e=>{if(alive){setError(dbErrorMessage(e));setLoading(false);}});return()=>{alive=false;};},[projectId,revision]);
 const all=kind==='indicator'?indicators:activities;
 const items=useMemo(()=>all.filter(row=>`${row.code||''} ${row.name||''}`.toLowerCase().includes(query.toLowerCase().trim())||row.id===itemId),[all,query,itemId]);
 const item=all.find(row=>row.id===itemId);
 const assignments=model?.assignments||[];
 return <>
  {loading?<p role="status">{fr?'Chargement…':'Loading locations…'}</p>:error?<div role="alert">{error} <button type="button" className="btn btn-secondary" onClick={()=>setRevision(n=>n+1)}>{fr?'Réessayer':'Retry'}</button></div>:model&&<>
   {!model.councils?.length&&<p role="status">{fr?'Aucun conseil de zone enregistré pour ce projet.':'No Area Councils are registered for this project.'} <a href={`#/project-setup?project=${encodeURIComponent(projectId)}`}>{fr?'Enregistrer les lieux du projet':'Register project locations first'}</a>.</p>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%,220px),1fr))',gap:10}}>
    <label style={{display:'grid',gap:5}}>{fr?'Type':'Record type'}<select className="field-input" value={kind} onChange={e=>{setKind(e.target.value);setItemId('');setQuery('');}}><option value="indicator">{fr?'Indicateur':'Indicator'}</option><option value="activity">{fr?'Activité':'Activity'}</option></select></label>
    <label style={{display:'grid',gap:5}}>{fr?'Rechercher':'Search records'}<input className="field-input" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={fr?'Nom ou code':'Name or code'}/></label>
   </div>
   <label style={{display:'grid',gap:5}}>{fr?'Activité ou indicateur':'Activity or indicator'}<select className="field-input" value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">{fr?'Choisir…':'Choose a record…'}</option>{items.map(row=><option key={row.id} value={row.id}>{row.code?row.code+' — ':''}{row.name} ({assignments.filter(a=>a.kind===kind&&a.item_id===row.id).length} {fr?'lieux':'locations'})</option>)}</select></label>
   {item&&<AssignmentEditor key={kind+itemId+revision} fr={fr} projectId={projectId} project={project} kind={kind} item={item} councils={model.councils||[]} current={assignments.filter(a=>a.kind===kind&&a.item_id===itemId)} onSaved={()=>setRevision(n=>n+1)}/>}
   <p style={{fontSize:'.8rem',margin:0}}>{fr?'Les affectations sont enregistrées dans MERL. Un administrateur doit publier le portail public pour les afficher.':'Assignments are saved internally. An administrator must use Publish to Public Portal to display them on the public map.'}</p>
  </>}
 </>;
}
function AssignmentEditor({fr,projectId,project,kind,item,councils,current,onSaved}){
 const [selected,setSelected]=useState(current.map(a=>String(a.council_id))),[category,setCategory]=useState(current[0]?.category_key||''),[search,setSearch]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const available=new Set(councils.map(c=>String(c.id)));
 const valid=selected.filter(id=>available.has(id));
 const toggle=id=>{setSaved(false);setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);};
 const save=async()=>{if(saving)return;setSaving(true);setError('');try{const {error}=await supabase.rpc('save_implementation_locations',{p_project_id:projectId,p_kind:kind,p_item_id:item.id,p_council_ids:valid.map(Number),p_category_key:kind==='activity'?category:null});if(error)throw error;setSaved(true);onSaved();}catch(e){setError(dbErrorMessage(e));}finally{setSaving(false);}};
 return <div style={{display:'grid',gap:10,border:'1px solid var(--border)',padding:12,borderRadius:8}}>
  <strong>{item.name}</strong>
  {kind==='activity'&&<label style={{display:'grid',gap:5}}>{fr?'Domaine thématique':'Thematic area'}<select className="field-input" value={category} onChange={e=>{setCategory(e.target.value);setSaved(false);}}><option value="">{fr?'Choisir…':'Choose thematic area…'}</option>{categories.map(([k,en,f])=><option key={k} value={k}>{fr?f:en}</option>)}</select></label>}
  {kind==='indicator'&&<small>{fr?'Le domaine est repris de la catégorie de l’indicateur publié.':'The thematic area follows the existing published indicator category.'}</small>}
  <label style={{display:'grid',gap:5}}>{fr?'Rechercher un conseil':'Search Area Councils'}<input className="field-input" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={fr?'Nom ou province':'Council or province'}/></label>
  <div role="group" aria-label={fr?'Conseils de zone':'Area Councils'} style={{maxHeight:300,overflowY:'auto',border:'1px solid var(--border)',borderRadius:6,padding:8}}>
   {councils.filter(c=>`${c.name} ${c.province}`.toLowerCase().includes(search.toLowerCase().trim())).map(c=><label key={c.id} style={{display:'flex',alignItems:'center',gap:8,minHeight:40}}><input type="checkbox" checked={selected.includes(String(c.id))} onChange={()=>toggle(String(c.id))}/><span>{c.name} · {c.province}</span></label>)}
   {!councils.length&&<small>{fr?'Aucun lieu disponible':'No locations available'}</small>}
  </div>
  <small>{valid.length} {fr?'conseils sélectionnés':'Area Councils selected'}{current.length>0&&` · ${current.filter(a=>a.published).length} ${fr?'déjà publiés':'previously published'}`}</small>
  {selected.length!==valid.length&&<small role="alert">{fr?'Les lieux qui ne sont plus enregistrés seront retirés à l’enregistrement.':'Previously assigned councils no longer registered for the project will be removed on save.'}</small>}
  {['CBIT-VU','BOLD-VU'].includes(project?.code)&&<small>{fr?'Les restrictions de publication de ce projet restent applicables.':'Existing public disclosure restrictions for this project still apply.'}</small>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button type="button" className="btn btn-secondary" onClick={()=>{setSelected([]);setSaved(false);}} disabled={saving}>{fr?'Tout désélectionner':'Clear selection'}</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving||(kind==='activity'&&!category)||(!councils.length&&!current.length)}>{saving?(fr?'Enregistrement…':'Saving…'):(fr?'Enregistrer les lieux':'Save locations')}</button></div>
  {error&&<p role="alert">{error}</p>}{saved&&<p role="status">{fr?'Lieux enregistrés.':'Locations saved.'}</p>}
 </div>;
}
