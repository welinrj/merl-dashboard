import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
import { confirmDialog } from '../lib/confirm';
import { projectColor } from '../components/PublicProjectResults';
import { portfolioBeneficiaries } from '../lib/docc/projectAnalysis';
import * as OPT from '../constants/formOptions';

const empty = { projects: [], objectives: [], outcomes: [], outputs: [], indicators: [], progress: [], reporting: [], beneficiaries: [] };
const blank = () => ({ kind: '', id: null, projectId: '', statement: '', parentId: '', name: '', unit: '', baseline: '', target: '', frequency: '' });
const kinds = ['objective', 'outcome', 'output', 'indicator'];
const plural = { objective: 'objectives', outcome: 'outcomes', output: 'outputs', indicator: 'indicators' };
const number = v => v === '' || v == null ? null : Number(v);
const display = v => v === '' || v == null ? '—' : String(v);
const title = kind => kind.charAt(0).toUpperCase() + kind.slice(1);
const pct = v => v == null || !Number.isFinite(Number(v)) ? '—' : `${Math.round(Number(v))}%`;

function buildRows(data) {
  const projects = new Map(data.projects.map(p => [p.id, p]));
  const objectives = new Map(data.objectives.map(r => [r.id, r]));
  const outcomes = new Map(data.outcomes.map(r => [r.id, r]));
  const outputs = new Map(data.outputs.map(r => [r.id, r]));
  const rows = [];
  const shown = { objective: new Set(), outcome: new Set(), output: new Set(), indicator: new Set() };
  const add = (kind, record) => {
    const project = projects.get(record.project_id); if (!project) return;
    const output = kind === 'output' ? record : kind === 'indicator' ? outputs.get(record.output_id) : null;
    const outcome = kind === 'outcome' ? record : output ? outcomes.get(output.outcome_id) : kind === 'indicator' ? outcomes.get(record.outcome_id) : null;
    const objective = kind === 'objective' ? record : outcome ? objectives.get(outcome.objective_id) : kind === 'indicator' ? objectives.get(record.objective_id) : null;
    const chain = { project, objective, outcome, output, indicator: kind === 'indicator' ? record : null };
    rows.push(chain); kinds.forEach(level => chain[level] && shown[level].add(chain[level].id));
  };
  data.indicators.forEach(r => add('indicator', r));
  data.outputs.forEach(r => !shown.output.has(r.id) && add('output', r));
  data.outcomes.forEach(r => !shown.outcome.has(r.id) && add('outcome', r));
  data.objectives.forEach(r => !shown.objective.has(r.id) && add('objective', r));
  data.projects.forEach(project => { if (!rows.some(r => r.project.id === project.id)) rows.push({ project, objective:null, outcome:null, output:null, indicator:null }); });
  return rows.sort((a,b) => `${a.project.code||''} ${a.project.name}`.localeCompare(`${b.project.code||''} ${b.project.name}`));
}

export default function ResultsWorkspace({ user }) {
  const { i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('progress');
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [permissionError, setPermissionError] = useState('');
  const [editableIds, setEditableIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState(() => params.get('project') || 'all');
  const [expandedProject, setExpandedProject] = useState(() => params.get('project') || '');
  const [editing, setEditing] = useState(blank), [saving, setSaving] = useState(false), [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(n => n + 1);

  useEffect(() => {
    const requested = params.get('project');
    if (requested) { setProjectFilter(requested); setExpandedProject(requested); }
  }, [params]);

  useEffect(() => {
    let alive = true; setLoading(true); setError('');
    Promise.all([
      localised(() => supabase.from('v_projects').select(i18nCols('id, code, acronym, name, status, description, expected_primary_outcome')).order('code')),
      localised(() => supabase.from('v_objectives').select('*').order('code')),
      localised(() => supabase.from('v_outcomes').select('*').order('code')),
      localised(() => supabase.from('v_outputs').select('*').order('code')),
      localised(() => supabase.from('v_project_indicators').select('*').order('code')),
      localised(() => supabase.from('v_indicator_progress').select('*').order('created_at', { ascending:false })),
      supabase.from('v_reporting_periods').select('*'),
      supabase.from('v_beneficiaries').select('*'),
      supabase.rpc('list_results_framework_editable_projects'),
    ]).then(responses => {
      if (!alive) return;
      const failed = responses.slice(0,8).find(r => r.error); if (failed) throw failed.error;
      const [projects, objectives, outcomes, outputs, indicators, progress, reporting, beneficiaries] = responses.slice(0,8).map(r => r.data || []);
      setData({ projects, objectives, outcomes, outputs, indicators, progress, reporting, beneficiaries });
      const permission = responses[8];
      setEditableIds(new Set(permission.error ? [] : (permission.data || []).map(r => r.project_id)));
      setPermissionError(permission.error ? 'Editing permissions could not be verified. The framework remains read-only.' : '');
      setLoading(false);
    }).catch(err => { if (alive) { setError(dbErrorMessage(err)); setLoading(false); } });
    return () => { alive = false; };
  }, [i18n.resolvedLanguage, reloadKey, user?.id]);

  const approvedPeriods = useMemo(() => new Set(data.reporting.filter(r => r.submission_status === 'approved').map(r => `${r.project_id}::${r.period_label}`)), [data.reporting]);
  const approvedProgress = useMemo(() => data.progress.filter(r => !r.reporting_period || approvedPeriods.has(`${r.project_id}::${r.reporting_period}`)), [data.progress, approvedPeriods]);
  const approvedBeneficiaries = useMemo(() => data.beneficiaries.filter(r => !r.reporting_period || approvedPeriods.has(`${r.project_id}::${r.reporting_period}`)), [data.beneficiaries, approvedPeriods]);
  const latestProgress = useMemo(() => { const m=new Map(); approvedProgress.forEach(r => { const p=m.get(r.indicator_id); const a=r.created_at||r.reporting_period||''; const b=p?.created_at||p?.reporting_period||''; if(!p||a>b)m.set(r.indicator_id,r); }); return m; }, [approvedProgress]);
  const projectSummaries = useMemo(() => data.projects.map(project => {
    const indicators = data.indicators.filter(i => i.project_id === project.id);
    const values = indicators.map(i => latestProgress.get(i.id)?.achievement_pct).filter(v => v != null && Number.isFinite(Number(v))).map(Number);
    const periods = data.reporting.filter(r => r.project_id === project.id && r.submission_status === 'approved').sort((a,b)=>String(b.period_end||'').localeCompare(String(a.period_end||'')));
    return { project, indicators, reported:values.length, progress:values.length?values.reduce((a,b)=>a+b,0)/values.length:null, lastPeriod:periods[0]?.period_label||null, beneficiaries:portfolioBeneficiaries(approvedBeneficiaries.filter(b=>b.project_id===project.id))||0 };
  }), [data.projects, data.indicators, data.reporting, latestProgress, approvedBeneficiaries]);
  const visibleProjects = useMemo(() => projectSummaries.filter(s => (projectFilter==='all'||s.project.id===projectFilter) && (!search.trim() || `${s.project.code||''} ${s.project.acronym||''} ${s.project.name}`.toLowerCase().includes(search.toLowerCase()))), [projectSummaries, projectFilter, search]);

  const rows = useMemo(() => buildRows(data), [data]);
  const filteredRows = useMemo(() => rows.filter(r => (projectFilter==='all'||r.project.id===projectFilter) && (!search.trim() || [r.project.code,r.project.acronym,r.project.name,...kinds.flatMap(k=>[r[k]?.code,r[k]?.statement,r[k]?.name])].join(' ').toLowerCase().includes(search.toLowerCase()))), [rows, projectFilter, search]);
  const canEdit = projectId => !loading && !saving && editableIds.has(projectId);
  const editorProject = data.projects.find(p => p.id === editing.projectId);
  const records = kind => data[plural[kind]].filter(r => r.project_id === editing.projectId);
  const parents = kind => kind === 'outcome' ? records('objective').map(r=>({id:r.id,label:`${r.code} — ${r.statement}`})) : kind === 'output' ? records('outcome').map(r=>({id:r.id,label:`${r.code} — ${r.statement}`})) : kind === 'indicator' ? kinds.slice(0,3).flatMap(level=>records(level).map(r=>({id:`${level}:${r.id}`,label:`${r.code} — ${r.statement}`}))) : [];
  const openNew = (projectId, kind, parentId='') => { if(canEdit(projectId)){setView('framework');setEditing({...blank(),projectId,kind,parentId});} };
  const openExisting = (projectId, kind, record) => {
    if(!canEdit(projectId)||!record||record.project_id!==projectId)return;
    setView('framework'); setEditing({...blank(),kind,id:record.id,projectId,statement:record.statement||'',name:record.name||'',unit:record.unit||'',baseline:record.baseline_value??'',target:record.target_value??'',frequency:record.frequency||'',parentId:kind==='outcome'?record.objective_id||'':kind==='output'?record.outcome_id||'':kind==='indicator'?record.output_id?`output:${record.output_id}`:record.outcome_id?`outcome:${record.outcome_id}`:record.objective_id?`objective:${record.objective_id}`:'':''});
  };
  const cancel=()=>setEditing(blank()); const change=(key,val)=>setEditing(s=>({...s,[key]:val}));

  const saveEdit = async e => {
    e.preventDefault(); if(saving||!editableIds.has(editing.projectId)||!kinds.includes(editing.kind))return;
    const current=editing.id?data[plural[editing.kind]].find(r=>r.id===editing.id&&r.project_id===editing.projectId):null;
    if(editing.id&&!current){toast.error('The selected record is no longer available. Refresh and try again.');return;}
    const parent=editing.parentId;
    if(!editing.id&&['outcome','output','indicator'].includes(editing.kind)&&!parent){toast.error('Select a parent result.');return;}
    if(parent){const [level,id]=editing.kind==='indicator'?parent.split(':'):[editing.kind==='outcome'?'objective':'outcome',parent];if(!data[plural[level]]?.some(r=>r.id===id&&r.project_id===editing.projectId)){toast.error('Select a parent from the same project.');return;}}
    if(editing.kind==='indicator'&&[editing.baseline,editing.target].some(v=>v!==''&&!Number.isFinite(Number(v)))){toast.error('Baseline and target must be valid numbers.');return;}
    setSaving(true);
    try{
      let result;
      if(editing.kind==='objective') result=current?await supabase.rpc('update_objective',{p_id:current.id,p_statement:editing.statement,p_climate_theme:current.climate_theme??null,p_expected_outcome:current.expected_outcome??null,p_notes:current.notes??null,p_status:'draft'}):await supabase.rpc('create_objective',{p_project_id:editing.projectId,p_statement:editing.statement,p_climate_theme:null,p_expected_outcome:null,p_notes:null});
      else if(editing.kind==='outcome') result=current?await supabase.rpc('update_outcome',{p_id:current.id,p_statement:editing.statement,p_responsible_officer_id:current.responsible_officer_id??null,p_status:'draft'}):await supabase.rpc('create_outcome',{p_objective_id:parent,p_statement:editing.statement,p_responsible_officer_id:null});
      else if(editing.kind==='output') result=current?await supabase.rpc('update_output',{p_id:current.id,p_statement:editing.statement,p_responsible_officer_id:current.responsible_officer_id??null,p_status:'draft'}):await supabase.rpc('create_output',{p_outcome_id:parent,p_statement:editing.statement,p_responsible_officer_id:null});
      else { const [level,linkedId]=parent?parent.split(':'):[null,null]; result=await supabase.rpc('upsert_project_indicator',{p_id:editing.id,p_project_id:editing.projectId,p_name:editing.name,p_unit:editing.unit||null,p_baseline_value:number(editing.baseline),p_target_value:number(editing.target),p_means_of_verification:current?.means_of_verification??null,p_frequency:editing.frequency||null,p_indicator_level:current?.indicator_level??null,p_definition:current?.definition??null,p_baseline_year:current?.baseline_year??null,p_target_date:current?.target_date??null,p_data_source:current?.data_source??null,p_collection_method:current?.collection_method??null,p_responsible_officer_id:current?.responsible_officer_id??null,p_disaggregation:current?.disaggregation??null,p_verification_method:current?.verification_method??null,p_assumptions:current?.assumptions??null,p_objective_id:level==='objective'?linkedId:null,p_outcome_id:level==='outcome'?linkedId:null,p_output_id:level==='output'?linkedId:null,p_is_qualitative:current?.is_qualitative??false,p_higher_is_better:current?.higher_is_better??true,p_responsible_officer:current?.responsible_officer??null}); }
      if(result?.error)throw result.error; toast.success('Results framework saved.'); cancel(); reload();
    }catch(err){toast.error(dbErrorMessage(err));}finally{setSaving(false);}
  };

  const remove = async (projectId, kind, record) => {
    if(saving||!editableIds.has(projectId)||record.project_id!==projectId)return;
    const children=kind==='objective'?data.outcomes.some(r=>r.objective_id===record.id)||data.indicators.some(r=>r.objective_id===record.id):kind==='outcome'?data.outputs.some(r=>r.outcome_id===record.id)||data.indicators.some(r=>r.outcome_id===record.id):kind==='output'?data.indicators.some(r=>r.output_id===record.id):false;
    if(children){toast.error('This record has linked children. Remove or reassign those records first.');return;}
    const ok=await confirmDialog({title:`Delete ${record.code||title(kind)}?`,message:'This cannot be undone. Linked reporting records must be removed or reassigned first.',confirmLabel:'Delete'}); if(!ok)return;
    setSaving(true); try{const rpc=kind==='indicator'?'delete_project_indicator':`delete_${kind}`;const {error:err}=await supabase.rpc(rpc,{p_id:record.id});if(err)throw err;toast.success(`${title(kind)} deleted.`);cancel();reload();}catch(err){toast.error(dbErrorMessage(err));}finally{setSaving(false);}
  };

  const selectProject = id => { setProjectFilter(id); setExpandedProject(id==='all'?'':id); setParams(id==='all'?{}:{project:id},{replace:true}); };
  const rowActions=(projectId,kind,record)=>canEdit(projectId)?<span className="rf-actions"><button type="button" onClick={()=>openExisting(projectId,kind,record)}>Edit</button><button type="button" className="danger" onClick={()=>remove(projectId,kind,record)}>Delete</button></span>:null;
  const cell=(row,kind)=><td>{row[kind]?<><span className="rf-code">{row[kind].code}</span><div>{row[kind].statement||row[kind].name}</div>{rowActions(row.project.id,kind,row[kind])}</>:'—'}</td>;

  return <div className="page-pad rf" style={{maxWidth:1420,margin:'0 auto'}}><style>{`
    .rf-head{display:flex;justify-content:space-between;gap:1rem;align-items:end;flex-wrap:wrap}.rf-views{display:flex;gap:.25rem;border-bottom:1px solid var(--border);margin:.7rem 0 1rem}.rf-views button{border:0;border-bottom:2px solid transparent;background:none;padding:.65rem .75rem;font:inherit;font-size:.8rem;font-weight:700;color:var(--text-3);cursor:pointer}.rf-views button.active{color:var(--green-700);border-bottom-color:var(--green-600)}.rf-tools{display:grid;grid-template-columns:1.5fr 1fr auto;gap:.6rem;align-items:end;margin-bottom:1rem}.rf-project-list{display:grid;gap:.7rem}.rf-project{border:1px solid var(--border);border-left:5px solid var(--project-ink);border-radius:11px;background:#fff;overflow:hidden}.rf-project-main{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:1rem;align-items:center;width:100%;border:0;background:var(--project-bg);padding:.85rem 1rem;text-align:left;font:inherit;cursor:pointer;color:var(--text-1)}.rf-project-main strong{display:block}.rf-project-main small{display:block;margin-top:.2rem;color:var(--text-3)}.rf-metric{text-align:right}.rf-metric b{display:block;font-size:1rem;color:var(--project-ink)}.rf-metric span{font-size:.66rem;color:var(--text-3)}.rf-detail{padding:1rem;border-top:1px solid var(--border)}.rf-detail h3{font-size:.83rem;margin:.9rem 0 .45rem}.rf-result-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.55rem}.rf-result-card{border:1px solid var(--border);border-radius:9px;padding:.65rem}.rf-result-card span{display:block;font-size:.65rem;color:var(--text-3);text-transform:uppercase}.rf-result-card b{display:block;margin-top:.25rem}.rf-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:11px;background:#fff}.rf-table{width:100%;border-collapse:collapse;font-size:.78rem}.rf-table th,.rf-table td{padding:.6rem .65rem;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;min-width:150px}.rf-table th{position:sticky;top:0;background:var(--green-50);z-index:2;font-size:.64rem;text-transform:uppercase;color:var(--text-3)}.rf-code{display:inline-block;font-size:.66rem;font-weight:800;color:var(--green-700);margin-bottom:.2rem}.rf-actions{display:flex;gap:.25rem;margin-top:.4rem}.rf-actions button,.rf-add button{border:1px solid var(--border);border-radius:6px;background:#fff;padding:.25rem .4rem;font:inherit;font-size:.65rem;font-weight:700;cursor:pointer}.rf-actions .danger{color:#b91c1c}.rf-directory{margin-bottom:1rem}.rf-directory-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.5rem}.rf-project-card{display:flex;justify-content:space-between;gap:.5rem;border:1px solid var(--project-ink);border-left:5px solid var(--project-ink);border-radius:9px;background:var(--project-bg);color:var(--project-ink);padding:.65rem;text-align:left;font:inherit;cursor:pointer}.rf-project-card small{display:block;opacity:.8}.rf-edit-badge{font-size:.62rem;font-weight:800}.rf-editor{border:1px solid var(--border);border-radius:11px;background:#fff;padding:.9rem;margin-bottom:1rem}.rf-editor-head{display:flex;justify-content:space-between;gap:1rem;align-items:end;flex-wrap:wrap}.rf-editor-select{max-width:520px}.rf-add{display:flex;gap:.35rem;flex-wrap:wrap;margin:.6rem 0}.rf-edit-form{border-top:1px solid var(--border);margin-top:.7rem;padding-top:.7rem}.rf-edit-form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem}.rf-form-full{grid-column:1/-1}.rf-edit-form label{display:flex;flex-direction:column;gap:.25rem;font-size:.72rem;font-weight:700}.rf-hint{font-size:.75rem;color:var(--text-3)}.rf-empty{padding:1.5rem;text-align:center;color:var(--text-3)}@media(max-width:800px){.rf-tools{grid-template-columns:1fr}.rf-project-main{grid-template-columns:1fr 1fr}.rf-result-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.rf-project-main,.rf-result-grid,.rf-edit-form-grid{grid-template-columns:1fr}.rf-metric{text-align:left}}
  `}</style>
  <div className="rf-head"><div><h1 style={{margin:0}}>Results & Indicators</h1><p style={{margin:'.3rem 0 0',color:'var(--text-3)'}}>Track approved project results and maintain the results framework from the same workspace.</p></div></div>
  <div className="rf-views"><button className={view==='progress'?'active':''} onClick={()=>setView('progress')}>Project results & progress</button><button className={view==='framework'?'active':''} onClick={()=>setView('framework')}>Results framework</button></div>
  <div className="rf-tools"><label><span className="field-label">Search</span><input className="field-input" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Project, result or indicator"/></label><label><span className="field-label">Project</span><select className="field-input" value={projectFilter} onChange={e=>selectProject(e.target.value)}><option value="all">All projects</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.code?`${p.code} — `:''}{p.name}</option>)}</select></label><button className="btn btn-secondary" onClick={()=>{setSearch('');selectProject('all')}}>Reset</button></div>
  {loading&&<div className="rf-empty">Loading results…</div>}{error&&<div className="rf-empty" role="alert">{error}</div>}
  {!loading&&!error&&view==='progress'&&<div className="rf-project-list">{visibleProjects.length?visibleProjects.map(s=><ProjectProgress key={s.project.id} summary={s} open={expandedProject===s.project.id} toggle={()=>setExpandedProject(expandedProject===s.project.id?'':s.project.id)} data={data} latest={latestProgress} approvedBeneficiaries={approvedBeneficiaries}/>):<div className="rf-empty">No projects match the current filters.</div>}</div>}
  {!loading&&!error&&view==='framework'&&<>
    <section className="rf-directory"><div className="rf-directory-grid">{data.projects.map(p=><button type="button" key={p.id} className="rf-project-card" style={projectColor(p)} onClick={()=>{selectProject(p.id);if(canEdit(p.id))setEditing({...blank(),projectId:p.id});}}><span><strong>{p.name}</strong><small>{p.code||p.acronym||'No code'}</small></span>{editableIds.has(p.id)&&<span className="rf-edit-badge">Editable</span>}</button>)}</div></section>
    {permissionError&&<p role="alert" className="rf-hint">{permissionError}</p>}
    {editableIds.size>0&&<section className="rf-editor"><div className="rf-editor-head"><div><h2 style={{margin:0,fontSize:'1rem'}}>Edit Results Framework</h2><p className="rf-hint">Only authorised projects are editable. Add, edit or delete records here; project codes are generated automatically.</p></div><select className="field-input rf-editor-select" value={editing.projectId} onChange={e=>setEditing({...blank(),projectId:e.target.value})}><option value="">Select a project to edit</option>{data.projects.filter(p=>editableIds.has(p.id)).map(p=><option key={p.id} value={p.id}>{p.code?`${p.code} — `:''}{p.name}</option>)}</select></div>{editorProject&&<div className="rf-add">{kinds.map(kind=><button type="button" key={kind} disabled={saving} onClick={()=>openNew(editorProject.id,kind)}>+ Add {kind}</button>)}</div>}{editing.kind&&editorProject&&editableIds.has(editing.projectId)&&<Editor editing={editing} change={change} parents={parents(editing.kind)} saving={saving} saveEdit={saveEdit} cancel={cancel}/>}</section>}
    <div className="rf-table-wrap"><table className="rf-table"><thead><tr><th>Project</th><th>Objective</th><th>Outcome</th><th>Output</th><th>Indicator</th><th>Baseline</th><th>Target</th><th>Unit</th><th>Reporting Frequency</th></tr></thead><tbody>{filteredRows.map((r,idx)=><tr key={`${r.project.id}-${r.indicator?.id||r.output?.id||r.outcome?.id||r.objective?.id||idx}`}><td style={projectColor(r.project)}><span className="rf-code">{r.project.code||r.project.acronym||'NO CODE'}</span><strong>{r.project.name}</strong>{canEdit(r.project.id)&&<div className="rf-add">{kinds.map(kind=><button key={kind} type="button" onClick={()=>openNew(r.project.id,kind)}>+ {title(kind)}</button>)}</div>}</td>{cell(r,'objective')}{cell(r,'outcome')}{cell(r,'output')}<td>{r.indicator?<><span className="rf-code">{r.indicator.code}</span><div>{r.indicator.name}</div>{rowActions(r.project.id,'indicator',r.indicator)}</>:'—'}</td><td>{display(r.indicator?.baseline_value)}</td><td>{display(r.indicator?.target_value)}</td><td>{display(r.indicator?.unit)}</td><td>{r.indicator?.frequency?OPT.labelOf(OPT.REPORTING_FREQUENCY,r.indicator.frequency):'—'}</td></tr>)}</tbody></table>{!filteredRows.length&&<div className="rf-empty">No framework rows match the current filters.</div>}</div>
  </>}
  </div>;
}

function ProjectProgress({ summary, open, toggle, data, latest, approvedBeneficiaries }) {
  const p=summary.project; const outputs=data.outputs.filter(r=>r.project_id===p.id); const outcomes=data.outcomes.filter(r=>r.project_id===p.id); const objectives=data.objectives.filter(r=>r.project_id===p.id); const indicators=summary.indicators;
  const onTrack=indicators.filter(i=>['on_track','target_achieved'].includes(latest.get(i.id)?.performance_status)).length;
  const atRisk=indicators.filter(i=>['attention_required','off_track'].includes(latest.get(i.id)?.performance_status)).length;
  return <article className="rf-project" style={projectColor(p)}><button className="rf-project-main" onClick={toggle} aria-expanded={open}><span><strong>{p.name}</strong><small>{p.code||p.acronym||'No code'} · {p.status||'Status not set'}</small></span><span className="rf-metric"><b>{pct(summary.progress)}</b><span>Average approved progress</span></span><span className="rf-metric"><b>{summary.reported}/{indicators.length}</b><span>Indicators reported</span></span><span className="rf-metric"><b>{fmtInt(summary.beneficiaries)}</b><span>Approved direct beneficiaries</span></span></button>{open&&<div className="rf-detail">
    <div className="rf-result-grid"><Metric label="Latest approved period" value={summary.lastPeriod||'Not yet approved'}/><Metric label="Indicators on track" value={`${onTrack} / ${indicators.length}`}/><Metric label="Indicators at risk / off track" value={`${atRisk}`}/><Metric label="Results framework" value={`${objectives.length} objectives · ${outputs.length} outputs`}/></div>
    <h3>Expected project result</h3><p>{p.expected_primary_outcome||p.description||'No expected primary outcome has been recorded.'}</p>
    <h3>Outputs</h3>{outputs.length?<ul>{outputs.map(o=><li key={o.id}><b>{o.code}</b> — {o.statement}</li>)}</ul>:<p className="rf-hint">No outputs recorded.</p>}
    <h3>Indicators and approved progress</h3><div className="rf-table-wrap"><table className="rf-table"><thead><tr><th>Indicator</th><th>Baseline</th><th>Target</th><th>Actual</th><th>Achievement</th><th>Status</th><th>Period</th></tr></thead><tbody>{indicators.length?indicators.map(i=>{const r=latest.get(i.id);return <tr key={i.id}><td><span className="rf-code">{i.code}</span><br/>{i.name}</td><td>{display(i.baseline_value)}</td><td>{display(i.target_value)}</td><td>{display(r?.cumulative_actual)}</td><td>{pct(r?.achievement_pct)}</td><td>{r?.performance_status||'Not reported'}</td><td>{r?.reporting_period||'—'}</td></tr>}):<tr><td colSpan="7">No indicators recorded.</td></tr>}</tbody></table></div>
  </div>}</article>;
}
function Metric({label,value}){return <div className="rf-result-card"><span>{label}</span><b>{value}</b></div>;}
function fmtInt(v){return new Intl.NumberFormat('en-US').format(Number(v)||0);}

function Editor({editing,change,parents,saving,saveEdit,cancel}){
  return <form className="rf-edit-form" onSubmit={saveEdit}><h3>{editing.id?'Edit':'Add'} {editing.kind}</h3><p className="rf-hint">Framework changes are saved as draft planning records and remain subject to the normal review process.</p><div className="rf-edit-form-grid">{editing.kind!=='indicator'?<label className="rf-form-full">Statement<textarea className="field-input" rows={3} value={editing.statement} onChange={e=>change('statement',e.target.value)} required/></label>:<><label className="rf-form-full">Indicator name<input className="field-input" value={editing.name} onChange={e=>change('name',e.target.value)} required/></label><label>Baseline<input className="field-input" type="number" step="any" value={editing.baseline} onChange={e=>change('baseline',e.target.value)}/></label><label>Target<input className="field-input" type="number" step="any" value={editing.target} onChange={e=>change('target',e.target.value)}/></label><label>Unit<input className="field-input" value={editing.unit} onChange={e=>change('unit',e.target.value)}/></label><label>Reporting frequency<select className="field-input" value={editing.frequency} onChange={e=>change('frequency',e.target.value)}><option value="">Select</option>{OPT.REPORTING_FREQUENCY.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label></>}{(editing.kind==='indicator'||(editing.kind!=='objective'&&!editing.id))&&<label className="rf-form-full">Parent result<select className="field-input" value={editing.parentId} onChange={e=>change('parentId',e.target.value)} required><option value="">Select a parent</option>{parents.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}</div><div style={{display:'flex',justifyContent:'flex-end',gap:'.5rem',marginTop:'.7rem'}}><button type="button" className="btn btn-secondary" onClick={cancel} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving?'Saving…':'Save'}</button></div></form>;
}
