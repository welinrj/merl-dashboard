import { useState, useEffect, useMemo } from 'react';
import { FileBarChart, Download, Printer, Loader2, CheckCircle, FileText, Plane, CalendarDays, CalendarRange, CalendarClock, BookMarked, ChevronDown, ChevronRight, PenLine } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { signPhotoPaths } from '../lib/photoUrls';
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

// All report types are auto-populated from the Strategic Results Framework and
// share the same section set; they differ only in title and reporting period.
const REPORT_SECTIONS = ['Executive Summary','Key Achievements','Introduction','Activity Overview','Progress & Accomplishment','Budget Utilisation','Challenges & Limitations','Activities Conducted (BTOR)','Lessons Learned','Next Steps','Activity Reports','Photo Documentation'];
// A Back to Office Report is a field/mission record with its own structure.
const BTOR_SECTIONS = ['Mission Details','Purpose & Objectives','Activities Conducted','Key Findings & Outcomes','Stakeholders Engaged','Challenges & Limitations','Follow-up Actions','Photo Documentation','Sign-off'];

const REPORT_TYPES = [
  { id:'btor',      label:'Back to Office Report', Icon:Plane,
    desc:'Field/mission report — who went, when, where, why, what was done, key findings and follow-up actions.',
    sections:BTOR_SECTIONS },
  { id:'monthly',   label:'Monthly Report', Icon:CalendarDays,
    desc:'Auto-populated monthly progress across all activities — accomplishments, budget, challenges and next steps.',
    sections:REPORT_SECTIONS },
  { id:'quarterly', label:'Quarterly Report', Icon:CalendarRange,
    desc:'Auto-populated DoCC quarterly report — accomplishments, budget utilisation, challenges, BTOR, lessons, and next steps.',
    sections:REPORT_SECTIONS },
  { id:'halfyear',  label:'Half-Year Report', Icon:CalendarClock,
    desc:'Six-monthly progress consolidation against the Strategic Results Framework.',
    sections:REPORT_SECTIONS },
  { id:'annual',    label:'Annual Report', Icon:BookMarked,
    desc:'Year-end progress and results achievement across all themes and focus areas.',
    sections:REPORT_SECTIONS },
];

// Reporting-period options per report kind, generated relative to today.
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function recentMonths(n = 12) {
  const out = []; const d = new Date(); d.setDate(1);
  for (let i = 0; i < n; i++) { out.push(`${MONTHS[d.getMonth()]} ${d.getFullYear()}`); d.setMonth(d.getMonth() - 1); }
  return out;
}
function recentQuarters(n = 8) {
  const out = []; const now = new Date(); let y = now.getFullYear(); let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) { out.push(`Q${q} ${y}`); q--; if (q < 1) { q = 4; y--; } }
  return out;
}
function recentHalves(n = 4) {
  const out = []; const now = new Date(); let y = now.getFullYear(); let h = now.getMonth() < 6 ? 1 : 2;
  for (let i = 0; i < n; i++) { out.push(`H${h} ${y}`); h--; if (h < 1) { h = 2; y--; } }
  return out;
}
function recentYears(n = 4) {
  const out = []; const y = new Date().getFullYear();
  for (let i = 0; i < n; i++) out.push(`${y - i} Annual`);
  return out;
}
function periodsFor(id) {
  switch (id) {
    case 'monthly':   return recentMonths();
    case 'btor':      return recentMonths();
    case 'halfyear':  return recentHalves();
    case 'annual':    return recentYears();
    case 'quarterly':
    default:          return recentQuarters();
  }
}

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

// ── Editable narrative + sign-off (persisted per report identity) ────────────
const SIGNOFF_DEFAULTS_KEY = 'merl:signoffDefaults';
const ovKey = (id) => `merl:reportOverrides:${id}`;
const loadJson = (k, fb) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } };
const saveJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore quota */ } };
const fmtLongDate = (d) => { try { return new Date(d).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }); } catch { return d; } };
const splitParas = (s) => String(s || '').split(/\n\n+/).map(x => x.trim()).filter(Boolean);

// Merge the officer's edits + sign-off details onto the auto-generated report.
function applyOverrides(report, ov) {
  if (!report) return report;
  const r = { ...report, meta: { ...report.meta } };
  if (ov.execSummary && ov.execSummary.trim()) r.executiveSummary = splitParas(ov.execSummary);
  if (ov.introduction && ov.introduction.trim()) r.introduction = splitParas(ov.introduction);
  if (ov.challenges && ov.challenges.trim()) r.challenges = { ...r.challenges, narrative: splitParas(ov.challenges) };
  r.meta.docRef = (ov.docRef || '').trim();
  const reportDate = ov.reportDate ? fmtLongDate(ov.reportDate) : r.meta.dateGenerated;
  const prepName = (ov.preparedBy || '').trim();
  if (prepName) r.meta.preparedBy = ov.preparedTitle ? `${prepName}, ${ov.preparedTitle.trim()}` : prepName;
  r.signoff = {
    date: reportDate,
    roles: [
      { role: 'Prepared by', name: prepName, title: (ov.preparedTitle || '').trim() },
      { role: 'Reviewed by', name: (ov.reviewedBy || '').trim(), title: (ov.reviewedTitle || '').trim() },
      { role: 'Approved by', name: (ov.approvedBy || '').trim(), title: (ov.approvedTitle || '').trim() },
    ],
  };
  // Back to Office Report mission fields (only rendered for the BTOR layout).
  if (r.btorMeta) {
    const bm = { ...r.btorMeta };
    const csv = (s) => s.split(',').map(x => x.trim()).filter(Boolean);
    if (ov.btorOfficers && ov.btorOfficers.trim()) bm.officers = csv(ov.btorOfficers);
    if (ov.btorDesignation && ov.btorDesignation.trim()) bm.designation = ov.btorDesignation.trim();
    if (ov.btorDateFrom) bm.dateFrom = fmtLongDate(ov.btorDateFrom);
    if (ov.btorDateTo) bm.dateTo = fmtLongDate(ov.btorDateTo);
    if (ov.btorDestination && ov.btorDestination.trim()) bm.destinations = csv(ov.btorDestination);
    if (ov.btorPurpose && ov.btorPurpose.trim()) bm.purpose = ov.btorPurpose.trim();
    if (ov.btorFindings && ov.btorFindings.trim()) bm.findings = ov.btorFindings.trim();
    if (ov.btorStakeholders && ov.btorStakeholders.trim()) bm.stakeholders = ov.btorStakeholders.trim();
    if (ov.btorFollowUp && ov.btorFollowUp.trim()) bm.followUp = ov.btorFollowUp.split(/\n+/).map(s => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
    r.btorMeta = bm;
  }
  return r;
}

export default function Reports() {
  const [live, setLive]         = useState(null);
  const [srfLive, setSrfLive]   = useState([]);   // live SRF activities (Framework tab)
  const [reportActs, setReportActs] = useState([]); // activities extracted from submitted reports
  const [photos, setPhotos]     = useState([]);
  const [activityReports, setActivityReports] = useState([]);
  const [selected, setSelected] = useState(REPORT_TYPES[0]);
  const [project, setProject]   = useState('');
  const [period, setPeriod]     = useState(() => periodsFor(REPORT_TYPES[0].id)[0]);
  const [state, setState]       = useState('idle'); // idle | generating | ready
  const [editOpen, setEditOpen] = useState(false);
  const [overrides, setOverrides] = useState({});   // narrative + sign-off edits

  // Overrides are keyed by report identity (type + period + component) so each
  // report keeps its own edits; sign-off names are seeded from the last-used
  // defaults so officers don't re-type them for every period.
  const identity = `${selected.id}|${period}|${project}`;
  useEffect(() => {
    const stored = loadJson(ovKey(identity), null);
    if (stored) { setOverrides(stored); return; }
    const d = loadJson(SIGNOFF_DEFAULTS_KEY, {});
    setOverrides({
      docRef: '', reportDate: new Date().toISOString().slice(0, 10),
      preparedBy: d.preparedBy || '', preparedTitle: d.preparedTitle || 'Senior Monitoring & Evaluation Officer',
      reviewedBy: d.reviewedBy || '', reviewedTitle: d.reviewedTitle || '',
      approvedBy: d.approvedBy || '', approvedTitle: d.approvedTitle || '',
    });
  }, [identity]);
  useEffect(() => { saveJson(ovKey(identity), overrides); }, [identity, overrides]);
  useEffect(() => {
    saveJson(SIGNOFF_DEFAULTS_KEY, {
      preparedBy: overrides.preparedBy, preparedTitle: overrides.preparedTitle,
      reviewedBy: overrides.reviewedBy, reviewedTitle: overrides.reviewedTitle,
      approvedBy: overrides.approvedBy, approvedTitle: overrides.approvedTitle,
    });
  }, [overrides.preparedBy, overrides.preparedTitle, overrides.reviewedBy, overrides.reviewedTitle, overrides.approvedBy, overrides.approvedTitle]);
  const setOv = (k, v) => setOverrides(o => ({ ...o, [k]: v }));

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
      const [acts, phs, reps, rActs] = await Promise.all([
        supabase.from('v_srf_activities').select('id,name,code,theme,status,focus_area,indicator,budget_vuv,progress,risk,target_2030'),
        supabase.from('v_srf_activity_photos').select('*').order('sort_order'),
        supabase.from('v_srf_activity_reports').select('*').order('created_at', { ascending: false }),
        supabase.from('v_project_report_activities').select('*'),
      ]);
      if (cancelled || acts.error) return;
      if (acts.data?.length) setSrfLive(acts.data);        // drives live status/budget in reports
      if (!rActs.error) setReportActs(rActs.data ?? []);   // drives period-scoped "activities conducted"
      const byId = {};
      (acts.data ?? []).forEach(a => { byId[a.id] = a; });
      if (!phs.error && phs.data?.length) {
        const signed = await signPhotoPaths(phs.data.map(p => p.storage_path));
        if (cancelled) return;
        const out = phs.data.map(p => {
          const a = byId[p.activity_id] || {};
          return {
            id: p.id,
            url: signed.get(p.storage_path) || '',
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
    () => buildQuarterlyReport({ period, live: live ?? undefined, photos, reports: activityReports, kind: selected.id, activities: srfLive, reportActivities: reportActs, project }),
    [selected.id, period, live, photos, activityReports, srfLive, reportActs, project],
  );

  // The auto-generated narrative seeds the editor; the officer's edits + sign-off
  // are merged in to produce the report shown in the preview and exports.
  const autoText = {
    execSummary: (quarterlyReport?.executiveSummary || []).join('\n\n'),
    introduction: (quarterlyReport?.introduction || []).join('\n\n'),
    challenges: (quarterlyReport?.challenges?.narrative || []).join('\n\n'),
  };
  const bm = quarterlyReport?.btorMeta || {};
  const autoBtor = {
    btorOfficers: (bm.officers || []).join(', '),
    btorDesignation: bm.designation || '',
    btorDestination: (bm.destinations || []).join(', '),
    btorPurpose: bm.purpose || '',
    btorFindings: bm.findings || '',
    btorStakeholders: bm.stakeholders || '',
    btorFollowUp: (bm.followUp || []).join('\n'),
  };
  const isBtor = selected.id === 'btor';
  const finalReport = useMemo(() => applyOverrides(quarterlyReport, overrides), [quarterlyReport, overrides]);

  const [wordState, setWordState] = useState('idle'); // idle | working
  const exportWord = async () => {
    if (!finalReport) return;
    setWordState('working');
    try {
      const { buildQuarterlyDocxBlob } = await import('../quarterlyReportDocx');
      const blob = await buildQuarterlyDocxBlob(finalReport);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${finalReport.meta.title.replace(/[^\w]+/g, '_')}_${period.replace(/\s+/g, '_')}.docx`;
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
            <button key={rt.id} onClick={() => { setSelected(rt); setPeriod(periodsFor(rt.id)[0]); setState('idle'); }}
              style={{
                textAlign:'left', padding:'0.875rem 1rem', borderRadius:8, cursor:'pointer',
                border:'1.5px solid', transition:'all 0.15s',
                background: selected.id===rt.id ? 'var(--white)' : 'transparent',
                borderColor: selected.id===rt.id ? 'var(--green-600)' : 'var(--border)',
                boxShadow: selected.id===rt.id ? 'var(--shadow-sm)' : 'none',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'0.25rem' }}>
                <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:30, height:30, borderRadius:8, flexShrink:0,
                  background: selected.id===rt.id ? 'var(--green-600)' : 'var(--green-50)',
                  color: selected.id===rt.id ? '#fff' : 'var(--green-700)',
                  border: selected.id===rt.id ? 'none' : '1px solid var(--green-100)' }}>
                  <rt.Icon size={16} strokeWidth={2} />
                </span>
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
                  {periodsFor(selected.id).map(p => <option key={p}>{p}</option>)}
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

            {/* Editable narrative + sign-off (optional; overrides the auto-draft) */}
            <div style={{ marginBottom:'1.25rem', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
              <button type="button" onClick={() => setEditOpen(o => !o)}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.65rem 0.85rem', background:'var(--green-50)', border:'none', cursor:'pointer', textAlign:'left' }}>
                {editOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
                <PenLine size={14} style={{ color:'var(--green-700)' }}/>
                <span style={{ fontWeight:700, fontSize:'0.85rem', color:'var(--text-1)' }}>Edit narrative &amp; sign-off</span>
                <span style={{ fontSize:'0.7rem', color:'var(--text-3)', marginLeft:'auto' }}>optional</span>
              </button>
              {editOpen && (
                <div style={{ padding:'0.85rem', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                    <div>
                      <label className="field-label">Document reference</label>
                      <input className="field-input" value={overrides.docRef || ''} onChange={e => setOv('docRef', e.target.value)} placeholder="e.g. DoCC/QR/2026/Q3"/>
                    </div>
                    <div>
                      <label className="field-label">Report date</label>
                      <input type="date" className="field-input" value={overrides.reportDate || ''} onChange={e => setOv('reportDate', e.target.value)}/>
                    </div>
                  </div>
                  {[['prepared','Prepared by'],['reviewed','Reviewed by'],['approved','Approved by']].map(([k, label]) => (
                    <div key={k} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                      <div>
                        <label className="field-label">{label} — name</label>
                        <input className="field-input" value={overrides[`${k}By`] || ''} onChange={e => setOv(`${k}By`, e.target.value)} placeholder="Full name"/>
                      </div>
                      <div>
                        <label className="field-label">{label} — title / unit</label>
                        <input className="field-input" value={overrides[`${k}Title`] || ''} onChange={e => setOv(`${k}Title`, e.target.value)} placeholder="Position / unit"/>
                      </div>
                    </div>
                  ))}
                  {isBtor && (
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                        <div>
                          <label className="field-label">Officer(s) — comma separated</label>
                          <input className="field-input" value={overrides.btorOfficers ?? autoBtor.btorOfficers} onChange={e => setOv('btorOfficers', e.target.value)} placeholder="Names of mission officers"/>
                        </div>
                        <div>
                          <label className="field-label">Designation / unit</label>
                          <input className="field-input" value={overrides.btorDesignation ?? autoBtor.btorDesignation} onChange={e => setOv('btorDesignation', e.target.value)} placeholder="e.g. Adaptation Division"/>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.75rem' }}>
                        <div><label className="field-label">Mission from</label><input type="date" className="field-input" value={overrides.btorDateFrom || ''} onChange={e => setOv('btorDateFrom', e.target.value)}/></div>
                        <div><label className="field-label">Mission to</label><input type="date" className="field-input" value={overrides.btorDateTo || ''} onChange={e => setOv('btorDateTo', e.target.value)}/></div>
                        <div><label className="field-label">Destination(s)</label><input className="field-input" value={overrides.btorDestination ?? autoBtor.btorDestination} onChange={e => setOv('btorDestination', e.target.value)} placeholder="Location(s)"/></div>
                      </div>
                    </>
                  )}
                  {(isBtor
                    ? [['btorPurpose','Purpose & objectives', autoBtor.btorPurpose],['btorFindings','Key findings & outcomes', autoBtor.btorFindings],['btorStakeholders','Stakeholders engaged', autoBtor.btorStakeholders],['btorFollowUp','Follow-up actions (one per line)', autoBtor.btorFollowUp],['challenges','Challenges & limitations', autoText.challenges]]
                    : [['execSummary','Executive Summary', autoText.execSummary],['introduction','Introduction', autoText.introduction],['challenges','Challenges & Limitations', autoText.challenges]]
                  ).map(([k, label, auto]) => (
                    <div key={k}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                        <label className="field-label" style={{ margin:0 }}>{label}</label>
                        <button type="button" onClick={() => setOv(k, undefined)}
                          style={{ fontSize:'0.68rem', color:'var(--green-700)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Reset to auto</button>
                      </div>
                      <textarea className="field-input" rows={4} value={overrides[k] ?? auto} onChange={e => setOv(k, e.target.value)}
                        style={{ resize:'vertical', lineHeight:1.5, fontFamily:'var(--font-ui)', minHeight:80 }}
                        placeholder="Separate paragraphs with a blank line"/>
                    </div>
                  ))}
                  <div style={{ fontSize:'0.7rem', color:'var(--text-3)' }}>
                    Edits are saved on this device per report period and merged into the preview and Word / PDF exports. Leave blank to use the auto-generated draft.
                  </div>
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:'0.625rem' }}>
              <button onClick={generate} className="btn-primary" style={{ flex:1, padding:'0.625rem', fontSize:'0.875rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
                {state==='generating' ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' }}/> Generating…</> :
                 state==='ready' ? <><CheckCircle size={14}/> Regenerate</> :
                 <><FileBarChart size={14}/> Generate Preview</>}
              </button>
              {state==='ready' && (
                <>
                  <button
                    onClick={exportWord} disabled={wordState==='working'}
                    className="btn-secondary" style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.625rem 1rem', fontSize:'0.875rem' }}>
                    {wordState==='working'
                      ? <><Loader2 size={14} style={{ animation:'spin 1s linear infinite' }}/> Word…</>
                      : <><FileText size={14}/> Word</>}
                  </button>
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
                ) : finalReport ? (
                  <QuarterlyReportPreview report={finalReport}/>
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
