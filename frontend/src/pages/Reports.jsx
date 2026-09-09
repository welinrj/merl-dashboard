import { useCallback, useEffect, useMemo, useState } from 'react';
import { Printer } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import PageHeader from '../components/ui/PageHeader';
import { portfolioBeneficiaries } from '../lib/docc/projectAnalysis';
import { fmtDateTime, fmtNum } from '../lib/locale';
import { localised, i18nCols } from '../lib/contentLocale';
import { readPortfolio, latestApprovedPeriod } from '../lib/portfolioRead';

const REPORT_TYPES = [
  ['project','Project Progress Report'], ['portfolio','Portfolio Performance Report'],
  ['indicator','Indicator Performance Report'], ['financial','Financial Performance Report'],
  ['geographic','Geographic / Provincial Report'], ['donor','Funding Partner / Donor Report'],
];
const sum = (rows, f) => rows.reduce((a,r)=>a+(Number(f(r))||0),0);
const money = v => `VT ${(Number(v)||0).toLocaleString('en-US')}`;
const pct = v => v == null ? '—' : `${Math.round(Number(v))}%`;
function latestByProject(rows) { const m=new Map(); for(const r of rows){const p=m.get(r.project_id); if(!p || String(r.created_at||'')>String(p.created_at||''))m.set(r.project_id,r);} return m; }
function csvCell(v){const s=String(v??''); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s;}
function downloadCsv(name, rows){if(!rows.length)return; const keys=Object.keys(rows[0]); const csv=[keys.join(','),...rows.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=name; a.click(); URL.revokeObjectURL(a.href);}

export default function Reports(){
  const [d,setD]=useState(null); const [error,setError]=useState(''); const [reload,setReload]=useState(0);
  const [type,setType]=useState('project'); const [projectId,setProjectId]=useState(''); const [province,setProvince]=useState(''); const [donor,setDonor]=useState(''); const [approvedOnly,setApprovedOnly]=useState(true); const [runs,setRuns]=useState([]);
  const loadRuns=useCallback(async()=>{const {data}=await supabase.from('v_report_runs').select('*').order('generated_at',{ascending:false}).limit(20); setRuns(data||[]);},[]);
  useEffect(()=>{loadRuns();},[loadRuns]);
  useEffect(()=>{let alive=true;(async()=>{setError(''); try{
    const q=(v,cols='*')=>localised(()=>supabase.from(v).select(cols==='*'?'*':i18nCols(cols)));
    const snap=await readPortfolio({
      projects:()=>q('v_projects','id,code,name,status,budget_vuv,spent_vuv,provinces,donor,category,start_date,end_date,description,expected_primary_outcome'),
      financial:()=>q('v_financial_progress','*'), risks:()=>q('v_risks_issues','*'), beneficiaries:()=>q('v_beneficiaries','*'), activities:()=>q('v_project_activities','*'), indicators:()=>q('v_project_indicators','*'), progress:()=>q('v_indicator_progress','*'), reporting:()=>q('v_reporting_periods','*'), locations:()=>q('v_project_locations','*'), learning:()=>q('v_learning_updates','*'), outputs:()=>q('v_outputs','*'),
    });
    if(!alive)return; setD({...snap.data,loadedAt:snap.loadedAt}); if(snap.data.projects.length && !projectId)setProjectId(snap.data.projects[0].id);
  }catch(e){if(alive)setError(e.message||'Could not load report data.');}})(); return()=>{alive=false;};},[reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const approvedKeys=useMemo(()=>{const s=new Set(); (d?.reporting||[]).forEach(r=>{if(r.submission_status==='approved')s.add(`${r.project_id}::${r.period_label}`)}); return s;},[d]);
  const scoped=useMemo(()=>{if(!d)return null; const isApproved=r=>!r.reporting_period || approvedKeys.has(`${r.project_id}::${r.reporting_period}`); const filt=rows=>approvedOnly?rows.filter(isApproved):rows; return {...d,financial:filt(d.financial),beneficiaries:filt(d.beneficiaries),progress:filt(d.progress),learning:filt(d.learning)};},[d,approvedOnly,approvedKeys]);
  const donors=useMemo(()=>[...new Set((d?.projects||[]).map(p=>p.donor).filter(Boolean))].sort(),[d]);
  const provinces=['TORBA','SANMA','PENAMA','MALAMPA','SHEFA','TAFEA'];
  if(error)return <div className="page-pad" style={{maxWidth:960,margin:'0 auto'}}><PageHeader title="Reports" subtitle="Generate consistent reports from the standard MERL dataset."/><div className="rp-error">{error}<button className="btn btn-secondary" onClick={()=>setReload(n=>n+1)}>Retry</button></div></div>;
  if(!scoped)return <div className="page-pad"><p>Loading reports…</p></div>;

  const project=scoped.projects.find(p=>p.id===projectId); const latestFin=latestByProject(scoped.financial); const approvedAsAt=latestApprovedPeriod(scoped.reporting); const generatedAt=new Date();
  const scopeProjects=type==='project'?scoped.projects.filter(p=>p.id===projectId):type==='donor'?scoped.projects.filter(p=>!donor||p.donor===donor):type==='geographic'?scoped.projects.filter(p=>!province||(p.provinces||[]).includes(province)):scoped.projects;
  const ids=new Set(scopeProjects.map(p=>p.id)); const within=rows=>rows.filter(r=>ids.has(r.project_id));
  const indicators=within(scoped.indicators), progress=within(scoped.progress), finance=within(scoped.financial), beneficiaries=within(scoped.beneficiaries), risks=within(scoped.risks), locations=within(scoped.locations), activities=within(scoped.activities), outputs=within(scoped.outputs), reporting=within(scoped.reporting);
  const latestProg=new Map(); progress.forEach(r=>{const p=latestProg.get(r.indicator_id); if(!p||String(r.created_at||r.reporting_period||'')>String(p.created_at||p.reporting_period||''))latestProg.set(r.indicator_id,r);});
  const approvedPeriods=reporting.filter(r=>r.submission_status==='approved').length; const highRisks=risks.filter(r=>['high','critical'].includes(String(r.risk_rating||'').toLowerCase())&&!['closed','resolved'].includes(r.status)).length; const totalBudget=sum(scopeProjects,p=>p.budget_vuv); const totalExp=[...latestFin.values()].filter(r=>ids.has(r.project_id)).reduce((a,r)=>a+(Number(r.cumulative_expenditure)||0),0); const bene=portfolioBeneficiaries(beneficiaries)||0;

  const exportRows=()=>{
    if(type==='indicator')return indicators.map(i=>{const r=latestProg.get(i.id)||{}; return {project:scopeProjects.find(p=>p.id===i.project_id)?.name||'',code:i.code,indicator:i.name,baseline:i.baseline_value??'',target:i.target_value??'',actual:r.cumulative_actual??'',achievement_pct:r.achievement_pct??'',status:r.performance_status??'',period:r.reporting_period??''};});
    if(type==='financial')return scopeProjects.map(p=>{const f=latestFin.get(p.id)||{}; return {code:p.code,project:p.name,budget:p.budget_vuv||0,cumulative_expenditure:f.cumulative_expenditure||0,remaining_balance:f.remaining_balance??'',utilisation_pct:f.utilisation_pct??''};});
    if(type==='geographic')return locations.map(r=>({project:scopeProjects.find(p=>p.id===r.project_id)?.name||'',province:r.province||'',island:r.island||'',area_council:r.area_council||'',community:r.community||'',latitude:r.latitude??'',longitude:r.longitude??''}));
    return scopeProjects.map(p=>({code:p.code,project:p.name,status:p.status,donor:p.donor||'',provinces:(p.provinces||[]).join('; '),budget:p.budget_vuv||0,beneficiaries:portfolioBeneficiaries(scoped.beneficiaries.filter(b=>b.project_id===p.id))||0,approved_periods:scoped.reporting.filter(r=>r.project_id===p.id&&r.submission_status==='approved').length}));
  };
  const generate=async()=>{await supabase.rpc('log_report_run',{p_report_type:type,p_report_label:REPORT_TYPES.find(r=>r[0]===type)?.[1]||type,p_project_id:type==='project'?(projectId||null):null,p_reporting_period:null,p_params:{province:type==='geographic'?(province||null):null,donor:type==='donor'?(donor||null):null,approved_only:approvedOnly}}); loadRuns(); window.print();};

  return <div className="page-pad rpt" style={{maxWidth:1100,margin:'0 auto'}}><style>{`
    .rpt-controls{display:grid;grid-template-columns:1.2fr 1.4fr 1fr auto;gap:.65rem;align-items:end;background:#fff;border:1px solid var(--border);border-radius:12px;padding:.9rem;margin-bottom:1rem}.rpt-actions{display:flex;gap:.45rem;flex-wrap:wrap}.rpt-doc{background:#fff;border:1px solid var(--border);border-radius:12px;padding:1.4rem}.rpt-head{display:flex;justify-content:space-between;gap:1rem;border-bottom:2px solid var(--green-600);padding-bottom:.8rem;margin-bottom:.9rem}.rpt-meta{font-size:.75rem;color:var(--text-3);line-height:1.6}.rpt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:.6rem;margin:.8rem 0}.rpt-kpi{padding:.8rem;border:1px solid var(--border);border-radius:9px}.rpt-kpi span{display:block;font-size:.65rem;text-transform:uppercase;color:var(--text-3);font-weight:700}.rpt-kpi b{display:block;margin-top:.25rem;font-size:1.2rem}.rpt-t{width:100%;border-collapse:collapse;font-size:.78rem}.rpt-t th,.rpt-t td{padding:.5rem .6rem;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}.rpt-t th{font-size:.64rem;text-transform:uppercase;background:var(--green-50);color:var(--text-3)}.rpt-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:9px;margin-top:.7rem}.rpt-note{padding:.7rem;background:#f8fafc;border-radius:8px;color:var(--text-3);font-size:.72rem;margin:.7rem 0}.rp-error{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:1rem;border:1px solid #fecaca;background:#fff7f7;border-radius:10px}@media(max-width:820px){.rpt-controls{grid-template-columns:1fr 1fr}.rpt-kpis{grid-template-columns:1fr 1fr}}@media(max-width:520px){.rpt-controls,.rpt-kpis{grid-template-columns:1fr}}@media print{body *{visibility:hidden!important}.rpt-print,.rpt-print *{visibility:visible!important}.rpt-print{position:absolute;left:0;top:0;width:100%;border:0}.rpt-noprint{display:none!important}}
  `}</style><div className="rpt-noprint"><PageHeader title="Reports" subtitle="Generate project and portfolio reports from one authoritative MERL dataset."/><div className="rpt-controls">
    <label><span className="field-label">Report type</span><select className="field-input" value={type} onChange={e=>setType(e.target.value)}>{REPORT_TYPES.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
    {type==='project'?<label><span className="field-label">Project</span><select className="field-input" value={projectId} onChange={e=>setProjectId(e.target.value)}>{scoped.projects.map(p=><option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>:type==='geographic'?<label><span className="field-label">Province</span><select className="field-input" value={province} onChange={e=>setProvince(e.target.value)}><option value="">All provinces</option>{provinces.map(p=><option key={p}>{p}</option>)}</select></label>:type==='donor'?<label><span className="field-label">Funding partner</span><select className="field-input" value={donor} onChange={e=>setDonor(e.target.value)}><option value="">All partners</option>{donors.map(x=><option key={x}>{x}</option>)}</select></label>:<div/>}
    <label style={{display:'flex',alignItems:'center',gap:'.45rem',fontSize:'.78rem'}}><input type="checkbox" checked={approvedOnly} onChange={e=>setApprovedOnly(e.target.checked)}/> Approved reporting only</label>
    <div className="rpt-actions"><button className="btn btn-secondary" onClick={()=>downloadCsv(`merl-${type}-${new Date().toISOString().slice(0,10)}.csv`,exportRows())}>Export CSV</button><button className="btn btn-primary" onClick={generate}><Printer size={15}/> Print / PDF</button></div>
  </div></div>
  <article className="rpt-doc rpt-print"><div className="rpt-head"><div><h1 style={{margin:0,fontSize:'1.45rem'}}>{REPORT_TYPES.find(r=>r[0]===type)?.[1]}</h1><div className="rpt-meta">Department of Climate Change · MERL Portal<br/>Generated {fmtDateTime(generatedAt)} · Data as at {approvedAsAt||'No approved reporting period'}<br/>Scope: {approvedOnly?'Approved reporting records only':'All accessible reporting records'}</div></div>{project&&type==='project'&&<div style={{textAlign:'right'}}><b>{project.code}</b><br/>{project.name}</div>}</div>
  <div className="rpt-note">Methodology: project inventory comes from the MERL project register. Results, beneficiaries and financial progress are restricted to approved reporting periods when the approved-only control is enabled. Missing records are shown as missing, not converted into zero progress.</div>
  <div className="rpt-kpis"><K label="Projects" value={fmtNum(scopeProjects.length)}/><K label="Approved periods" value={fmtNum(approvedPeriods)}/><K label="Beneficiaries" value={fmtNum(bene)}/><K label="High / critical open risks" value={fmtNum(highRisks)}/></div>
  <div className="rpt-kpis"><K label="Approved budget" value={money(totalBudget)}/><K label="Cumulative expenditure" value={money(totalExp)}/><K label="Budget utilisation" value={totalBudget?pct(totalExp/totalBudget*100):'—'}/><K label="Outputs" value={fmtNum(outputs.length)}/></div>
  <ReportBody type={type} projects={scopeProjects} indicators={indicators} latestProg={latestProg} latestFin={latestFin} activities={activities} risks={risks} locations={locations}/>
  </article>
  <div className="rpt-noprint" style={{marginTop:'1rem'}}><h2 style={{fontSize:'1rem'}}>Report library</h2>{runs.length?<div className="rpt-table-wrap"><table className="rpt-t"><thead><tr><th>Generated</th><th>Report</th><th>Project</th><th>Period / parameters</th></tr></thead><tbody>{runs.map(r=><tr key={r.id}><td>{fmtDateTime(r.generated_at)}</td><td>{r.report_label||r.report_type}</td><td>{r.project_code||'Portfolio'}</td><td>{r.reporting_period||JSON.stringify(r.params||{})}</td></tr>)}</tbody></table></div>:<p style={{color:'var(--text-3)'}}>No report generations logged yet.</p>}</div>
  </div>;
}
function K({label,value}){return <div className="rpt-kpi"><span>{label}</span><b>{value}</b></div>;}
function ReportBody({type,projects,indicators,latestProg,latestFin,activities,risks,locations}){
  if(type==='indicator')return <T cols={['Project','Indicator','Baseline','Target','Actual','Achievement','Status']} rows={indicators.map(i=>{const r=latestProg.get(i.id)||{}; const p=projects.find(x=>x.id===i.project_id); return [p?.name||'—',`${i.code} — ${i.name}`,i.baseline_value??'—',i.target_value??'—',r.cumulative_actual??'—',pct(r.achievement_pct),r.performance_status||'Not reported'];})}/>;
  if(type==='financial')return <T cols={['Project','Budget','Expenditure','Balance','Utilisation']} rows={projects.map(p=>{const f=latestFin.get(p.id)||{};return [p.name,money(f.approved_budget??p.budget_vuv),money(f.cumulative_expenditure),money(f.remaining_balance),pct(f.utilisation_pct)];})}/>;
  if(type==='geographic')return <T cols={['Project','Province','Island','Area Council','Community','Coordinates']} rows={locations.map(r=>[projects.find(p=>p.id===r.project_id)?.name||'—',r.province||'—',r.island||'—',r.area_council||'—',r.community||'—',r.latitude!=null&&r.longitude!=null?`${r.latitude}, ${r.longitude}`:'Missing'])}/>;
  return <><h2 style={{fontSize:'1rem'}}>Project summary</h2><T cols={['Code','Project','Status','Donor','Coverage','Budget']} rows={projects.map(p=>[p.code,p.name,p.status,p.donor||'—',(p.provinces||[]).join(', ')||'National / unspecified',money(p.budget_vuv)])}/><h2 style={{fontSize:'1rem',marginTop:'1rem'}}>Implementation and risks</h2><T cols={['Project','Activities','Completed','Open risks']} rows={projects.map(p=>[p.name,activities.filter(a=>a.project_id===p.id).length,activities.filter(a=>a.project_id===p.id&&a.status==='completed').length,risks.filter(r=>r.project_id===p.id&&!['closed','resolved'].includes(r.status)).length])}/></>;
}
function T({cols,rows}){return <div className="rpt-table-wrap"><table className="rpt-t"><thead><tr>{cols.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v}</td>)}</tr>):<tr><td colSpan={cols.length}>No matching records.</td></tr>}</tbody></table></div>;}
