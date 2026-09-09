import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Printer } from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import { VanuatuMapMini } from '../components/VanuatuMap';
import { useDashboardFilters, projectMatches, STATUS_BUCKETS, STATUS_BUCKET_LABEL } from '../lib/dashboardFilters';
import { portfolioBeneficiaries } from '../lib/docc/projectAnalysis';
import { fmtDate, fmtNum } from '../lib/locale';
import { readPortfolio, latestApprovedPeriod, restrictToApprovedPeriods } from '../lib/portfolioRead';
import {
  projectStatusSummary, indicatorSummary, financialSummary, reportingSummary,
  riskSummary, physicalFinancialVariance,
} from '../lib/portfolioMetrics';

const PROJECT_TONES = { on_track:'#16a34a', at_risk:'#d97706', not_started:'#64748b', completed:'#7c3aed', cancelled:'#991b1b', unknown:'#94a3b8' };
const money = v => { const n=Number(v||0); if(n>=1e9)return `VT ${(n/1e9).toFixed(2)}B`; if(n>=1e6)return `VT ${(n/1e6).toFixed(2)}M`; if(n>=1e3)return `VT ${(n/1e3).toFixed(1)}K`; return `VT ${fmtNum(n)}`; };
const percent = v => v == null || !Number.isFinite(Number(v)) ? '—' : `${Math.round(Number(v))}%`;

export default function Overview() {
  const nav=useNavigate();
  const { filters,setFilter,reset,active }=useDashboardFilters();
  const [snapshot,setSnapshot]=useState(null),[fatal,setFatal]=useState(null),[reload,setReload]=useState(0);
  const previous=useRef(null);

  useEffect(()=>{let alive=true;(async()=>{
    setFatal(null);
    const q=(view,columns)=>()=>supabase.from(view).select(columns);
    try{
      const result=await readPortfolio({
        projects:q('v_projects','id,code,name,status,budget_vuv,spent_vuv,provinces,donor,category,start_date,end_date,updated_at'),
        financial:q('v_financial_progress','project_id,approved_budget,cumulative_expenditure,remaining_balance,utilisation_pct,funds_received,funds_committed,reporting_period,created_at'),
        risks:q('v_risks_issues','project_id,risk_rating,status,due_date'),
        beneficiaries:q('v_beneficiaries','project_id,total_direct,female,male,other_gender,youth,persons_with_disability,indirect,reporting_period'),
        activities:q('v_project_activities','project_id,status,physical_progress_pct,planned_end_date,next_action,next_action_due'),
        indicators:q('v_project_indicators','project_id,id'),
        progress:q('v_indicator_progress','project_id,indicator_id,achievement_pct,performance_status,reporting_period,created_at'),
        reporting:q('v_reporting_periods','project_id,period_label,period_end,submission_status,approved_at,updated_at'),
        locations:q('v_project_locations','project_id,province,island,area_council,community,latitude,longitude'),
      },previous.current);
      if(!alive)return; previous.current=result; setSnapshot(result);
    }catch(e){if(alive)setFatal(e);}
  })();return()=>{alive=false;};},[reload]);

  if(fatal&&!snapshot)return <State title="Dashboard data could not be loaded" body={fatal.message} action="Retry" onAction={()=>setReload(n=>n+1)} warning/>;
  if(!snapshot)return <Loading/>;
  const d=snapshot.data;
  if(!d.projects.length)return <State title="No projects registered" body="Register the first project to begin portfolio monitoring." action="Register project" onAction={()=>nav('/project-setup')}/>;

  const options=useMemo(()=>({
    years:[...new Set(d.projects.flatMap(p=>[p.start_date,p.end_date].filter(Boolean).map(x=>String(new Date(x).getFullYear()))))].sort().reverse(),
    themes:[...new Set(d.projects.map(p=>p.category).filter(Boolean))].sort(),
    donors:[...new Set(d.projects.map(p=>p.donor).filter(Boolean))].sort(),
    provinces:[...new Set(d.projects.flatMap(p=>p.provinces||[]))].sort(),
  }),[d.projects]);
  const projects=d.projects.filter(p=>projectMatches(p,filters));
  const ids=new Set(projects.map(p=>p.id)); const inScope=rows=>rows.filter(r=>ids.has(r.project_id));
  const reporting=inScope(d.reporting);
  const approvedReporting=reporting.filter(r=>r.submission_status==='approved');
  const progress=restrictToApprovedPeriods(inScope(d.progress),reporting);
  const financial=restrictToApprovedPeriods(inScope(d.financial),reporting);
  const beneficiaries=restrictToApprovedPeriods(inScope(d.beneficiaries),reporting);
  const activities=inScope(d.activities), indicators=inScope(d.indicators), risks=inScope(d.risks), locations=inScope(d.locations);
  const status=projectStatusSummary(projects), indicator=indicatorSummary(indicators,progress), finance=financialSummary(projects,financial), reports=reportingSummary(reporting), risk=riskSummary(risks), variance=physicalFinancialVariance(projects,activities,financial);
  const bene=portfolioBeneficiaries(beneficiaries)||0;
  const gender=k=>beneficiaries.reduce((a,r)=>a+(Number(r[k])||0),0);
  const female=gender('female'),male=gender('male'),youth=gender('youth'),pwd=gender('persons_with_disability');
  const delayedActivities=activities.filter(a=>a.status!=='completed'&&a.planned_end_date&&a.planned_end_date.slice(0,10)<new Date().toISOString().slice(0,10)).length;
  const provinceCounts={}; locations.forEach(r=>{if(r.province)provinceCounts[r.province]=(provinceCounts[r.province]||0)+1;});
  if(!Object.keys(provinceCounts).length) projects.forEach(p=>(p.provinces||[]).forEach(x=>provinceCounts[x]=(provinceCounts[x]||0)+1));
  const fresh=latestApprovedPeriod(d.reporting);
  const attention=[
    ['Overdue reporting',reports.overdue,'/analytics/reporting',reports.overdue?'critical':'clear'],
    ['Pending approval',reports.pendingApproval,'/review',reports.pendingApproval?'warning':'clear'],
    ['At-risk projects',status.at_risk,'/analytics/portfolio',status.at_risk?'warning':'clear'],
    ['High / critical open risks',risk.high+risk.critical,'/analytics/risks',risk.high+risk.critical?'critical':'clear'],
    ['Overdue activities',delayedActivities,'/project-setup',delayedActivities?'warning':'clear'],
    ['Off-track indicators',indicator.statuses.off_track,'/analytics/results',indicator.statuses.off_track?'critical':'clear'],
  ];

  return <div className="ov2"><style>{`
    .ov2{max-width:1440px;margin:0 auto;padding:1rem;color:var(--text-1)}.ov2-head{display:flex;justify-content:space-between;align-items:end;gap:1rem;margin-bottom:.8rem}.ov2-head h1{margin:0;font-size:1.8rem}.ov2-head p{margin:.25rem 0 0;color:var(--text-3);font-size:.8rem}.ov2-actions{display:flex;gap:.45rem}.ov2-stale{display:flex;justify-content:space-between;gap:1rem;align-items:center;padding:.65rem .8rem;margin-bottom:.75rem;border:1px solid #f59e0b;background:#fffbeb;border-radius:9px;color:#92400e;font-size:.76rem}.ov2-filter{display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) auto;gap:.55rem;align-items:end;background:#fff;border:1px solid var(--border);border-radius:12px;padding:.75rem;margin-bottom:.8rem}.ov2-filter label span{display:block;margin-bottom:.25rem;font-size:.62rem;text-transform:uppercase;color:var(--text-3);font-weight:800}.ov2-filter select{width:100%;min-height:39px;border:1px solid var(--border);border-radius:8px;padding:.4rem .55rem;background:#fff}.ov2-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.65rem;margin-bottom:.8rem}.ov2-kpi{position:relative;min-height:112px;border:1px solid var(--border);border-radius:12px;background:#fff;padding:.8rem;overflow:hidden;text-align:left}.ov2-kpi button{position:absolute;inset:0;border:0;background:transparent;cursor:pointer}.ov2-kpi span{display:block;font-size:.65rem;text-transform:uppercase;color:var(--text-3);font-weight:800}.ov2-kpi b{display:block;margin:.35rem 0;font-size:1.6rem}.ov2-kpi small{display:block;color:var(--text-3);font-size:.68rem}.ov2-grid{display:grid;grid-template-columns:1fr 1fr;gap:.8rem;margin-bottom:.8rem}.ov2-card{border:1px solid var(--border);border-radius:12px;background:#fff;padding:.9rem;min-width:0}.ov2-card h2{margin:0 0 .75rem;font-size:.95rem}.ov2-statuses{display:grid;grid-template-columns:repeat(2,1fr);gap:.45rem}.ov2-status{display:flex;align-items:center;gap:.55rem;border:1px solid var(--border);border-radius:9px;background:#fff;padding:.6rem;cursor:pointer;text-align:left}.ov2-dot{width:9px;height:9px;border-radius:50%;flex:none}.ov2-status span{flex:1;font-size:.75rem}.ov2-status b{font-size:1rem}.ov2-attn{display:grid;grid-template-columns:repeat(3,1fr);gap:.45rem}.ov2-attn button{border:1px solid var(--border);border-radius:9px;background:#fff;padding:.65rem;text-align:left;cursor:pointer}.ov2-attn b{display:block;font-size:1.25rem}.ov2-attn span{font-size:.7rem;color:var(--text-2)}.ov2-attn .critical b{color:#b91c1c}.ov2-attn .warning b{color:#b45309}.ov2-attn .clear b{color:#15803d}.ov2-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:9px}.ov2-table{width:100%;border-collapse:collapse;font-size:.75rem}.ov2-table th,.ov2-table td{padding:.55rem .6rem;border-bottom:1px solid var(--border);text-align:left}.ov2-table th{background:var(--green-50);font-size:.62rem;text-transform:uppercase;color:var(--text-3)}.ov2-progress{height:8px;border-radius:99px;background:#eef2f7;overflow:hidden;margin:.45rem 0}.ov2-progress span{display:block;height:100%;background:var(--green-600)}.ov2-map{min-height:280px;border:1px solid var(--border);border-radius:9px;overflow:hidden}.ov2-method{font-size:.68rem;color:var(--text-3);line-height:1.5;margin-top:.55rem}.ov2-state{display:flex;min-height:55vh;align-items:center;justify-content:center}.ov2-state>div{max-width:600px;padding:1.2rem;border:1px solid var(--border);border-radius:12px;background:#fff;text-align:center}.ov2-skel{height:120px;border-radius:12px;background:#eef2f7}@media(max-width:1180px){.ov2-kpis{grid-template-columns:repeat(3,1fr)}.ov2-filter{grid-template-columns:repeat(3,1fr)}}@media(max-width:800px){.ov2-grid{grid-template-columns:1fr}.ov2-kpis{grid-template-columns:repeat(2,1fr)}.ov2-attn{grid-template-columns:repeat(2,1fr)}.ov2-filter{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.ov2-head{align-items:flex-start;flex-direction:column}.ov2-filter,.ov2-kpis,.ov2-attn,.ov2-statuses{grid-template-columns:1fr}.ov2-actions{width:100%}.ov2-actions button{flex:1}}
  `}</style>
  <div className="ov2-head"><div><h1>Dashboard Overview</h1><p>Portfolio monitoring, evaluation and reporting · Approved data as at <b>{fresh?fmtDate(fresh):'not yet available'}</b></p></div><div className="ov2-actions"><button className="btn btn-secondary" onClick={()=>setReload(n=>n+1)}>Refresh</button><button className="btn btn-primary" onClick={()=>window.print()}><Printer size={14}/> Export</button></div></div>
  {snapshot.stale&&<div className="ov2-stale"><span><AlertTriangle size={14}/> Showing the last successful snapshot from {fmtDate(snapshot.loadedAt)} because {snapshot.failedSources.join(', ')} could not refresh.</span><button className="btn btn-secondary" onClick={()=>setReload(n=>n+1)}>Retry</button></div>}
  <div className="ov2-filter"><F label="Financial year" value={filters.fy} values={options.years} onChange={v=>setFilter('fy',v)}/><F label="Status" value={filters.status} values={Object.keys(STATUS_BUCKETS)} labels={STATUS_BUCKET_LABEL} onChange={v=>setFilter('status',v)}/><F label="Theme" value={filters.theme} values={options.themes} onChange={v=>setFilter('theme',v)}/><F label="Province" value={filters.province} values={options.provinces} onChange={v=>setFilter('province',v)}/><F label="Partner" value={filters.partner} values={options.donors} onChange={v=>setFilter('partner',v)}/><button className="btn btn-secondary" disabled={!active} onClick={reset}>Reset</button></div>
  <div className="ov2-kpis"><K label="Projects" value={fmtNum(status.total)} note={`${status.active} active · ${status.completed} completed`} go={()=>nav('/project-setup')}/><K label="Overall progress" value={percent(indicator.averageAchievementPct)} note={`${indicator.reported} / ${indicator.total} indicators reported`} go={()=>nav('/analytics/results')}/><K label="Budget utilisation" value={percent(finance.utilisationPct)} note={`${money(finance.expenditure)} / ${money(finance.approvedBudget)}`} go={()=>nav('/analytics/financial')}/><K label="Direct beneficiaries" value={fmtNum(bene)} note={`${fmtNum(female)} female · ${fmtNum(male)} male`} go={()=>nav('/project-setup')}/><K label="Overdue reports" value={fmtNum(reports.overdue)} note={`${reports.pendingApproval} pending approval`} go={()=>nav('/analytics/reporting')}/><K label="Open risks" value={fmtNum(risk.open)} note={`${risk.high+risk.critical} high / critical`} go={()=>nav('/analytics/risks')}/></div>
  <div className="ov2-grid"><section className="ov2-card"><h2>Projects by status</h2><div className="ov2-statuses">{['on_track','at_risk','not_started','completed','cancelled','unknown'].map(key=><button className="ov2-status" key={key} onClick={()=>key==='unknown'?nav('/analytics/portfolio'):setFilter('status',key)}><i className="ov2-dot" style={{background:PROJECT_TONES[key]}}/><span>{STATUS_BUCKET_LABEL[key]||'Other / Unclassified'}</span><b>{status[key]}</b></button>)}</div><div className="ov2-method">Status grouping is shared across the portal. Project identity colors are separate from performance colors.</div></section><section className="ov2-card"><h2>Needs attention</h2><div className="ov2-attn">{attention.map(([label,value,to,tone])=><button key={label} className={tone} onClick={()=>nav(to)}><b>{fmtNum(value)}</b><span>{label}</span></button>)}</div></section></div>
  <div className="ov2-grid"><section className="ov2-card"><h2>Implementation versus finance</h2><div style={{display:'grid',gap:'.7rem'}}><Progress label="Physical progress" value={variance.physicalPct}/><Progress label="Financial utilisation" value={variance.financialPct}/></div><div className="ov2-method">Physical progress averages recorded activity completion. Financial utilisation is cumulative expenditure divided by approved budget. Their difference ({variance.variancePctPoints==null?'—':`${Math.round(variance.variancePctPoints)} percentage points`}) is a management signal, not a performance score.</div><div style={{marginTop:'.8rem'}}><b>Beneficiary disaggregation</b><div className="ov2-table-wrap" style={{marginTop:'.45rem'}}><table className="ov2-table"><tbody><tr><td>Female</td><td>{fmtNum(female)}</td><td>Male</td><td>{fmtNum(male)}</td></tr><tr><td>Youth</td><td>{fmtNum(youth)}</td><td>Persons with disability</td><td>{fmtNum(pwd)}</td></tr></tbody></table></div></div></section><section className="ov2-card"><h2>Geographic coverage</h2><div className="ov2-map"><VanuatuMapMini counts={provinceCounts} selected={filters.province} onSelect={p=>setFilter('province',p)}/></div><div className="ov2-method">Map counts use verified project-location records where available, with registered province coverage as the fallback.</div></section></div>
  <section className="ov2-card"><h2>Reporting calendar and approvals</h2><div className="ov2-table-wrap"><table className="ov2-table"><thead><tr><th>Project</th><th>Reporting period</th><th>Due</th><th>Status</th></tr></thead><tbody>{[...reporting].sort((a,b)=>String(a.period_end||'').localeCompare(String(b.period_end||''))).slice(0,8).map((r,i)=><tr key={`${r.project_id}-${r.period_label}-${i}`}><td>{projects.find(p=>p.id===r.project_id)?.name||'—'}</td><td>{r.period_label||'—'}</td><td>{fmtDate(r.period_end)}</td><td>{r.submission_status||'—'}</td></tr>)}</tbody></table></div><button className="btn btn-secondary" style={{marginTop:'.7rem'}} onClick={()=>nav('/analytics/reporting')}>View reporting analysis <ArrowRight size={13}/></button><div className="ov2-method">Approved periods in current scope: {approvedReporting.length}. Data failures are never shown as zero; the last successful snapshot is retained and labelled stale.</div></section>
  </div>;
}
function F({label,value,values,labels,onChange}){return <label><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}><option value="">All</option>{values.map(v=><option key={v} value={v}>{labels?.[v]||v}</option>)}</select></label>;}
function K({label,value,note,go}){return <div className="ov2-kpi"><span>{label}</span><b>{value}</b><small>{note}</small><button aria-label={`Open ${label}`} onClick={go}/></div>;}
function Progress({label,value}){const safe=value==null?0:Math.min(100,Math.max(0,Number(value)));return <div><div style={{display:'flex',justifyContent:'space-between',fontSize:'.75rem'}}><span>{label}</span><b>{percent(value)}</b></div><div className="ov2-progress"><span style={{width:`${safe}%`}}/></div></div>;}
function Loading(){return <div className="ov2"><div className="ov2-head"><div><h1>Dashboard Overview</h1><p>Loading live portfolio information…</p></div></div><div className="ov2-kpis">{Array.from({length:6}).map((_,i)=><div className="ov2-skel" key={i}/>)}</div></div>;}
function State({title,body,action,onAction,warning}){return <div className="ov2 ov2-state"><div>{warning&&<AlertTriangle size={22}/>}<h2>{title}</h2><p>{body}</p><button className="btn btn-primary" onClick={onAction}>{action}</button></div></div>;}
