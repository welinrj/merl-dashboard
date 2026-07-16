import { useState, useEffect, useMemo } from 'react';
import { FileBarChart, Download, Printer, Loader2, CheckCircle, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { buildQuarterlyReport } from '../quarterlyReport';
import QuarterlyReportPreview from '../components/QuarterlyReportPreview';

const pct = (a,b) => b ? Math.round((a/b)*100) : 0;
const TRAFFIC = { green:'#1a8c4e', amber:'#c97b00', red:'#c0392b' };
const TRAFFIC_BG  = { green:'#d1fae5', amber:'#fef3c7', red:'#fee2e2' };
const TRAFFIC_TXT = { green:'#065f46', amber:'#92400e', red:'#991b1b' };
const TRAFFIC_LABEL = { green:'On Track', amber:'At Risk', red:'Off Track' };

// Traffic light from progress toward target — same rule used on
// Dashboard / Projects / Analysis so reports agree with the rest of the app.
function trafficFor(baseline, current, target) {
  const b = Number(baseline ?? 0), t = Number(target ?? 0);
  const c = current == null ? b : Number(current);
  if (t === b) return 'green';
  const p = (c - b) / (t - b);
  if (p >= 0.7) return 'green';
  if (p >= 0.35) return 'amber';
  return 'red';
}

// merl.indicators is linked to a domain, not to an individual project, so a
// project filter only narrows indicators when the source data actually
// carries a project_code (currently just the demo/mock data).
function normaliseLive(projectRows, indicatorRows, budgetRows) {
  const projects = projectRows.map(p => ({
    code: p.code, name: p.name, category: p.category,
    budget_vuv: Number(p.budget_vuv ?? 0), spent_vuv: Number(p.spent_vuv ?? 0),
  }));
  const indicators = indicatorRows.map(r => ({
    id: r.id, code: r.code, name: r.name,
    baseline: Number(r.baseline_value ?? 0),
    current:  r.current_value == null ? Number(r.baseline_value ?? 0) : Number(r.current_value),
    target:   Number(r.target_value ?? 0),
    traffic:  trafficFor(r.baseline_value, r.current_value, r.target_value),
  }));
  const budgetRowsOut = budgetRows.map(b => ({
    label: b.domain, budget_vuv: Number(b.budget_vuv ?? 0), spent_vuv: Number(b.spent_vuv ?? 0),
  }));
  return { projects, indicators, budgetRows: budgetRowsOut };
}

const EMPTY_DATA = { projects: [], indicators: [], budgetRows: [] };

// SRF activity status → report traffic-light key.
const SRF_TO_KEY = { on_track:'green', at_risk:'amber', no_progress:'red', unrated:'none' };

const REPORT_TYPES = [
  { id:'quarterly', label:'Quarterly Progress Report', icon:'📅',
    desc:'Auto-populated DoCC quarterly report — accomplishments, budget utilisation, challenges, BTOR, lessons, and next steps. Exports to Word.',
    sections:['Executive Summary','Key Achievements','Introduction','Activity Overview','Quarterly Accomplishment','Budget Utilisation','Challenges & Limitations','Activities Conducted (BTOR)','Lessons Learned','Next Steps','Activity Reports','Photo Documentation'] },
  { id:'annual',    label:'Annual Results Report', icon:'📆',
    desc:'Year-end outcomes and results achievement against the RBM framework.',
    sections:['Year Highlights','Outcomes Assessment','Output Delivery','Indicator Dashboard','Financial Summary','Lessons Learned'] },
  { id:'midterm',   label:'Mid-Term Review', icon:'🔍',
    desc:'Independent assessment of project relevance, effectiveness, and efficiency at the midpoint.',
    sections:['Scope & Methodology','Relevance','Effectiveness','Efficiency','Sustainability','GEDSI Analysis','Recommendations'] },
  { id:'endline',   label:'End-of-Project Evaluation', icon:'✅',
    desc:'Final summative evaluation covering all OECD-DAC criteria and theory of change.',
    sections:['Findings by DAC Criteria','Results Against Theory of Change','Beneficiary Perspectives','Value for Money','Final Recommendations'] },
  { id:'adhoc',     label:'Ad-Hoc Indicator Status', icon:'📊',
    desc:'On-demand snapshot of selected indicators with traffic-light ratings and notes.',
    sections:['Selected Indicators','Traffic Light Status','Data Quality Notes','Contextual Analysis'] },
];

const PERIODS = ['Q1 2026','Q4 2025','Q3 2025','Q2 2025','2025 Annual','2024 Annual'];

function ReportPreview({ type, indicators, budgetRows }) {
  const now = new Date().toLocaleDateString('en-VU', { year:'numeric', month:'long', day:'numeric' });

  return (
    <div className="report-print-area" style={{ fontFamily:'var(--font-ui)', fontSize:'0.8125rem', background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
      {/* Report header */}
      <div style={{ background:'var(--green-900)', color:'#fff', padding:'1.5rem 2rem' }}>
        <div style={{ fontSize:'0.625rem', letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.5)', marginBottom:'0.375rem' }}>
          Republic of Vanuatu · Department of Climate Change
        </div>
        <div style={{ fontFamily:'var(--font-display)', fontSize:'1.25rem', fontWeight:600, marginBottom:'0.25rem', letterSpacing:'-0.01em' }}>
          L&amp;D Fund MERL Dashboard
        </div>
        <div style={{ fontSize:'0.9375rem', fontWeight:600, color:'rgba(255,255,255,0.85)' }}>{type.label}</div>
        <div style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.4)', marginTop:'0.25rem' }}>Generated: {now} · DRAFT</div>
      </div>

      {/* Sections */}
      <div style={{ maxHeight:380, overflowY:'auto', padding:'1.5rem 2rem' }} className="scrollbar-thin">
        {type.sections.map((sec, i) => (
          <div key={i} style={{ marginBottom:'1.5rem' }}>
            <div style={{ fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--green-700)', marginBottom:'0.625rem', paddingBottom:'0.375rem', borderBottom:'1px solid var(--green-50)' }}>
              {i+1}. {sec}
            </div>

            {(sec.toLowerCase().includes('indicator') || sec.toLowerCase().includes('dashboard') || sec.toLowerCase().includes('traffic')) && (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
                <thead>
                  <tr style={{ background:'var(--green-50)' }}>
                    {['Indicator','Baseline','Current','Target','%','Status'].map(h => (
                      <th key={h} style={{ padding:'0.375rem 0.75rem', textAlign:'left', color:'var(--text-3)', fontWeight:700, fontSize:'0.625rem', letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {indicators.slice(0,5).map(ind => (
                    <tr key={ind.id ?? ind.code} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'0.4rem 0.75rem', color:'var(--text-1)', fontWeight:500 }}>{ind.name}</td>
                      <td style={{ padding:'0.4rem 0.75rem', color:'var(--text-3)', fontFamily:'var(--font-mono)' }}>{ind.baseline}</td>
                      <td style={{ padding:'0.4rem 0.75rem', fontFamily:'var(--font-mono)', fontWeight:700 }}>{ind.current}</td>
                      <td style={{ padding:'0.4rem 0.75rem', color:'var(--text-3)', fontFamily:'var(--font-mono)' }}>{ind.target}</td>
                      <td style={{ padding:'0.4rem 0.75rem', fontFamily:'var(--font-mono)', fontWeight:700 }}>{pct(ind.current,ind.target)}%</td>
                      <td style={{ padding:'0.4rem 0.75rem' }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'0.25rem', background:TRAFFIC_BG[ind.traffic], color:TRAFFIC_TXT[ind.traffic], borderRadius:9999, padding:'0.1rem 0.5rem', fontSize:'0.625rem', fontWeight:700, textTransform:'uppercase' }}>
                          <span style={{ width:4, height:4, borderRadius:'50%', background:TRAFFIC[ind.traffic] }}/>{TRAFFIC_LABEL[ind.traffic]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {sec.toLowerCase().includes('budget') || sec.toLowerCase().includes('financial') ? (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
                <thead>
                  <tr style={{ background:'var(--green-50)' }}>
                    {['Component','Budget (VUV)','Spent (VUV)','%'].map(h => (
                      <th key={h} style={{ padding:'0.375rem 0.75rem', textAlign:'left', color:'var(--text-3)', fontWeight:700, fontSize:'0.625rem', letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {budgetRows.map(b => (
                    <tr key={b.label} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'0.4rem 0.75rem', color:'var(--text-1)', fontWeight:500 }}>{b.label}</td>
                      <td style={{ padding:'0.4rem 0.75rem', fontFamily:'var(--font-mono)', color:'var(--text-2)' }}>VUV {(b.budget_vuv/1e6).toFixed(0)}M</td>
                      <td style={{ padding:'0.4rem 0.75rem', fontFamily:'var(--font-mono)', fontWeight:700 }}>VUV {(b.spent_vuv/1e6).toFixed(0)}M</td>
                      <td style={{ padding:'0.4rem 0.75rem', fontFamily:'var(--font-mono)', fontWeight:700 }}>{pct(b.spent_vuv,b.budget_vuv)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : !sec.toLowerCase().includes('indicator') && !sec.toLowerCase().includes('dashboard') && !sec.toLowerCase().includes('traffic') && (
              <p style={{ color:'var(--text-3)', fontStyle:'italic', fontSize:'0.75rem', margin:0 }}>
                [Content for this section is populated from the M&amp;E database upon generation.]
              </p>
            )}
          </div>
        ))}
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:'0.75rem', fontSize:'0.6875rem', color:'var(--text-3)', textAlign:'center' }}>
          L&amp;D Fund MERL Dashboard · DoCC · Vanuatu · Confidential — For official use only
        </div>
      </div>
    </div>
  );
}

function exportExcel({ type, projectLabel, period, indicators, budgetRows }) {
  const wb = XLSX.utils.book_new();

  const indSheet = XLSX.utils.json_to_sheet(indicators.map(i => ({
    Code: i.code, Indicator: i.name, Baseline: i.baseline, Current: i.current,
    Target: i.target, '% of target': pct(i.current, i.target), Status: TRAFFIC_LABEL[i.traffic],
  })));
  XLSX.utils.book_append_sheet(wb, indSheet, 'Indicators');

  const budSheet = XLSX.utils.json_to_sheet(budgetRows.map(b => ({
    Component: b.label, 'Budget (VUV)': b.budget_vuv, 'Spent (VUV)': b.spent_vuv,
    '% utilised': pct(b.spent_vuv, b.budget_vuv),
  })));
  XLSX.utils.book_append_sheet(wb, budSheet, 'Budget');

  const fname = `${type.id}-report_${projectLabel}_${period}`.replace(/\s+/g, '_') + '.xlsx';
  XLSX.writeFile(wb, fname);
}

export default function Reports() {
  const [live, setLive]         = useState(null);
  const [photos, setPhotos]     = useState([]);
  const [activityReports, setActivityReports] = useState([]);
  const [selected, setSelected] = useState(REPORT_TYPES[0]);
  const [project, setProject]   = useState('');
  const [period, setPeriod]     = useState('Q1 2026');
  const [state, setState]       = useState('idle'); // idle | generating | ready

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [proj, ind, bud] = await Promise.all([
        supabase.from('v_projects').select('*').order('code'),
        supabase.from('v_indicator_status').select('*').order('code'),
        supabase.from('v_domain_budget').select('*').order('domain'),
      ]);
      if (cancelled) return;
      if (proj.error || ind.error || bud.error || !ind.data?.length) return;
      setLive(normaliseLive(proj.data ?? [], ind.data, bud.data ?? []));
    })();
    return () => { cancelled = true; };
  }, []);

  // Activity photos (uploaded on the Framework tab) for the Photo Documentation
  // section. Fetched independently so photos appear even when live indicator
  // data is unavailable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [acts, phs, reps] = await Promise.all([
        supabase.from('v_srf_activities').select('id,name,code,theme,status'),
        supabase.from('v_srf_activity_photos').select('*').order('sort_order'),
        supabase.from('v_srf_activity_reports').select('*').order('created_at', { ascending: false }),
      ]);
      if (cancelled || acts.error) return;
      const byId = {};
      (acts.data ?? []).forEach(a => { byId[a.id] = a; });
      if (!phs.error && phs.data?.length) {
        const out = phs.data.map(p => {
          const a = byId[p.activity_id] || {};
          return {
            id: p.id,
            url: supabase.storage.from('activity-photos').getPublicUrl(p.storage_path).data?.publicUrl || '',
            caption: p.caption || '',
            activity: a.name || '',
            code: a.code || '',
            theme: a.theme || '',
            statusKey: SRF_TO_KEY[a.status] || 'none',
          };
        }).filter(p => p.url);
        setPhotos(out);
      }
      if (!reps.error && reps.data?.length) {
        setActivityReports(reps.data.map(r => {
          const a = byId[r.activity_id] || {};
          return { id: r.id, activity: a.name || '', fileName: r.file_name, kind: r.file_type, summary: r.summary || '' };
        }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const { projects, indicators, budgetRows } = live ?? EMPTY_DATA;

  // Only narrows the indicator set when the underlying rows actually carry a
  // project_code (true for the demo data; live indicators are domain-scoped).
  const previewIndicators = (project && indicators.some(i => i.project_code === project))
    ? indicators.filter(i => i.project_code === project)
    : indicators.slice(0, 8);

  // Assemble the quarterly report object (auto-populated) for preview + Word.
  const quarterlyReport = useMemo(
    () => (selected.id === 'quarterly'
      ? buildQuarterlyReport({ period, live: live ?? undefined, photos, reports: activityReports })
      : null),
    [selected.id, period, live, photos, activityReports],
  );

  const [wordState, setWordState] = useState('idle'); // idle | working
  const exportWord = async () => {
    if (!quarterlyReport) return;
    setWordState('working');
    try {
      const { buildQuarterlyDocxBlob } = await import('../quarterlyReportDocx');
      const blob = await buildQuarterlyDocxBlob(quarterlyReport);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quarterlyReport.meta.title.replace(/[^\w]+/g, '_')}_${period.replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setWordState('idle');
    }
  };

  const generate = () => {
    setState('generating');
    setTimeout(() => setState('ready'), 900);
  };

  const projectLabel = project || 'All_Components';

  return (
    <div style={{ padding:'2rem 2.5rem', maxWidth:1400 }} className="animate-fade-up">
      <div style={{ marginBottom:'1.75rem' }}>
        <div className="section-label" style={{ marginBottom:'0.375rem' }}>Reporting Centre</div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.875rem', fontWeight:600, color:'var(--text-1)', letterSpacing:'-0.025em', margin:0 }}>
          M&amp;E Reports
        </h1>
        <p style={{ fontSize:'0.875rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
          Generate, preview, and export TOR-aligned MERL reports · {live ? 'Live data' : 'Sample data (offline)'}
        </p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:'1.5rem' }}>

        {/* Report type list */}
        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <div className="section-label" style={{ marginBottom:'0.5rem' }}>Report Type</div>
          {REPORT_TYPES.map(rt => (
            <button key={rt.id} onClick={() => { setSelected(rt); setState('idle'); }}
              style={{
                textAlign:'left', padding:'0.875rem 1rem', borderRadius:8, cursor:'pointer',
                border:'1.5px solid', transition:'all 0.15s',
                background: selected.id===rt.id ? 'var(--white)' : 'transparent',
                borderColor: selected.id===rt.id ? 'var(--green-600)' : 'var(--border)',
                boxShadow: selected.id===rt.id ? 'var(--shadow-sm)' : 'none',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.25rem' }}>
                <span style={{ fontSize:'1rem' }}>{rt.icon}</span>
                <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-1)' }}>{rt.label}</span>
              </div>
              <p style={{ fontSize:'0.75rem', color:'var(--text-3)', margin:0, lineHeight:1.5 }}>{rt.desc}</p>
            </button>
          ))}
        </div>

        {/* Config + preview */}
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>

          {/* Config card */}
          <div className="card">
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)', marginBottom:'1.25rem' }}>
              Configure Report
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem', marginBottom:'1.25rem' }}>
              <div>
                <label className="field-label">Component (optional)</label>
                <select value={project} onChange={e=>setProject(e.target.value)} className="field-input">
                  <option value="">All Components</option>
                  {projects.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Reporting Period</label>
                <select value={period} onChange={e=>setPeriod(e.target.value)} className="field-input">
                  {PERIODS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginBottom:'1.25rem' }}>
              <div className="section-label" style={{ marginBottom:'0.5rem' }}>Sections included</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem' }}>
                {selected.sections.map(s => (
                  <span key={s} style={{ background:'var(--green-50)', color:'var(--green-700)', border:'1px solid var(--green-100)', borderRadius:4, padding:'0.15rem 0.625rem', fontSize:'0.6875rem', fontWeight:600 }}>{s}</span>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:'0.625rem' }}>
              <button onClick={generate} className="btn-primary" style={{ flex:1, padding:'0.625rem', fontSize:'0.875rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
                {state==='generating' ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' }}/> Generating…</> :
                 state==='ready' ? <><CheckCircle size={14}/> Regenerate</> :
                 <><FileBarChart size={14}/> Generate Preview</>}
              </button>
              {state==='ready' && (
                <>
                  {selected.id === 'quarterly' && (
                    <button
                      onClick={exportWord} disabled={wordState==='working'}
                      className="btn-secondary" style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.625rem 1rem', fontSize:'0.875rem' }}>
                      {wordState==='working'
                        ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' }}/> Word…</>
                        : <><FileText size={14}/> Word</>}
                    </button>
                  )}
                  <button
                    onClick={() => exportExcel({ type: selected, projectLabel, period, indicators: previewIndicators, budgetRows })}
                    className="btn-secondary" style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.625rem 1rem', fontSize:'0.875rem' }}>
                    <Download size={14}/> Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="btn-secondary" style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.625rem 1rem', fontSize:'0.875rem' }}>
                    <Printer size={14}/> PDF
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Preview */}
          {state !== 'idle' && (
            <div className="card animate-fade" style={{ padding:0, overflow:'hidden' }}>
              <div className="no-print" style={{ padding:'1rem 1.5rem', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:600, color:'var(--text-1)' }}>
                  Report Preview
                </span>
                {state==='ready' && (
                  <span style={{ display:'flex', alignItems:'center', gap:'0.35rem', background:'#d1fae5', color:'#065f46', borderRadius:9999, padding:'0.2rem 0.75rem', fontSize:'0.6875rem', fontWeight:700 }}>
                    <CheckCircle size={11}/> Ready
                  </span>
                )}
              </div>
              <div style={{ padding:'1.5rem' }}>
                {state==='generating' ? (
                  <div style={{ textAlign:'center', padding:'3rem 0', color:'var(--text-3)' }}>
                    <Loader2 size={24} style={{ margin:'0 auto 0.75rem', animation:'spin 1s linear infinite', display:'block' }}/>
                    <p style={{ margin:0, fontSize:'0.875rem' }}>Compiling report data…</p>
                  </div>
                ) : selected.id === 'quarterly' && quarterlyReport ? (
                  <QuarterlyReportPreview report={quarterlyReport}/>
                ) : (
                  <ReportPreview type={selected} indicators={previewIndicators} budgetRows={budgetRows}/>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media print {
          body * { visibility: hidden; }
          .report-print-area, .report-print-area * { visibility: visible; }
          .report-print-area { position: absolute; left: 0; top: 0; width: 100%; max-height: none; }
        }
      `}</style>
    </div>
  );
}
