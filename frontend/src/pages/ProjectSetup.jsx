import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { dbErrorMessage, isMissingRpcArgument } from '../lib/dbError';
import PageHeader from '../components/ui/PageHeader';
import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST } from '../constants/vanuatuGeo';
import { fmtDate, fmtNum } from '../lib/locale';
import { portfolioBeneficiaries } from '../lib/docc/projectAnalysis';
import { projectColor } from '../components/PublicProjectResults';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const field = { display: 'flex', flexDirection: 'column', gap: '.3rem' };
const today = () => new Date().toISOString().slice(0, 10);

const blankProfile = () => ({
  name: '', acronym: '', description: '', status: 'pipeline', category: '', lead_agency: '',
  executing_agency: '', implementing_partners: [], donor: '', funding_window: '', currency: 'VUV',
  budget_vuv: '', start_date: '', end_date: '', approval_date: '', project_type: '',
  primary_climate_theme: '', coverage_type: '', provinces: [], islands: [], area_councils: [], communities: [],
  project_manager: '', me_officer: '', finance_officer: '', project_manager_id: null, me_officer_id: null, finance_officer_id: null,
  est_direct_beneficiaries: '', est_indirect_beneficiaries: '', expected_primary_outcome: '',
});
const profileFromProject = (p) => ({
  ...blankProfile(),
  name: p?.name || '', acronym: p?.acronym || '', description: p?.description || '', status: p?.status || 'pipeline',
  category: p?.category || '', lead_agency: p?.lead_agency || '', executing_agency: p?.executing_agency || '',
  implementing_partners: p?.implementing_partners || [], donor: p?.donor || '', funding_window: p?.funding_window || '',
  currency: p?.currency || 'VUV', budget_vuv: p?.budget_vuv ?? '', start_date: p?.start_date || '', end_date: p?.end_date || '',
  approval_date: p?.approval_date || '', project_type: p?.project_type || '', primary_climate_theme: p?.primary_climate_theme || '',
  coverage_type: p?.coverage_type || '', provinces: p?.provinces || [], islands: p?.islands || [], area_councils: p?.area_councils || [], communities: p?.communities || [],
  project_manager: p?.project_manager || p?.project_manager_name || '', me_officer: p?.me_officer || p?.me_officer_name || '', finance_officer: p?.finance_officer || p?.finance_officer_name || '',
  project_manager_id: p?.project_manager_id || null, me_officer_id: p?.me_officer_id || null, finance_officer_id: p?.finance_officer_id || null,
  est_direct_beneficiaries: p?.est_direct_beneficiaries ?? '', est_indirect_beneficiaries: p?.est_indirect_beneficiaries ?? '',
  expected_primary_outcome: p?.expected_primary_outcome || '',
});

const WORKSPACE_TABS = [
  ['overview', 'Overview'], ['framework', 'Results Framework'], ['activities', 'Activities'],
  ['reporting', 'Reporting Calendar'], ['finance', 'Finance'], ['beneficiaries', 'Beneficiaries'],
  ['risks', 'Risks & Issues'], ['geography', 'Geography'], ['documents', 'Documents & Evidence'], ['history', 'History'],
];

const latestBy = (rows, dateKey = 'created_at') => [...rows].sort((a, b) => String(b?.[dateKey] || '').localeCompare(String(a?.[dateKey] || '')))[0] || null;
const money = (v) => { const n = Number(v || 0); return n ? `VT ${n.toLocaleString('en-US')}` : '—'; };
function Stat({ label, value, note }) { return <div className="pw-stat"><span>{label}</span><b>{value}</b>{note && <small>{note}</small>}</div>; }
function Empty({ children }) { return <div className="pw-empty">{children}</div>; }
function Info({ label, value }) { return <div className="pw-field"><span>{label}</span><b>{value || '—'}</b></div>; }
function Table({ columns, rows }) { return <div className="pw-table-wrap"><table className="pw-table"><thead><tr>{columns.map(c => <th key={c.label}>{c.label}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={r.id || i}>{columns.map(c => <td key={c.label}>{c.get(r)}</td>)}</tr>)}</tbody></table></div>; }

export default function ProjectSetup({ user }) {
  const canEditProfile = EDITOR_ROLES.includes(user?.role);
  const [mode, setMode] = useState('manage');
  const [form, setForm] = useState(blankProfile);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(() => { try { return localStorage.getItem('merl.selectedProject') || ''; } catch { return ''; } });
  const [tab, setTab] = useState('overview');
  const [ctx, setCtx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const project = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId]);
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const setMulti = (k) => (e) => setForm((s) => ({ ...s, [k]: Array.from(e.target.selectedOptions).map((o) => o.value) }));

  const loadProjects = useCallback(async (preferredId = null) => {
    setError('');
    const { data, error: e } = await supabase.from('v_projects').select('*').order('code');
    if (e) { setError(e.message || 'Could not load projects.'); return; }
    const list = data || []; setProjects(list);
    const preferred = preferredId || projectId;
    if (preferred && list.some(p => p.id === preferred)) setProjectId(preferred);
    else if (list.length) setProjectId(list[0].id);
  }, [projectId]);

  useEffect(() => { loadProjects(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (projectId) try { localStorage.setItem('merl.selectedProject', projectId); } catch {} }, [projectId]);

  const loadContext = useCallback(async (pid) => {
    if (!pid) { setCtx(null); setLoading(false); return; }
    setLoading(true); setError('');
    const reads = await Promise.all([
      supabase.from('v_objectives').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_outcomes').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_outputs').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_project_indicators').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_project_activities').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_reporting_periods').select('*').eq('project_id', pid).order('period_end', { ascending: false }),
      supabase.from('v_financial_progress').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
      supabase.from('v_beneficiaries').select('*').eq('project_id', pid),
      supabase.from('v_risks_issues').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
      supabase.from('v_project_locations').select('*').eq('project_id', pid),
      supabase.from('v_indicator_progress').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
      supabase.from('v_evidence').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
    ]);
    const failed = reads.find(r => r.error);
    if (failed) { setError(failed.error.message || 'Could not load the project workspace.'); setLoading(false); return; }
    const [objectives, outcomes, outputs, indicators, activities, periods, finance, beneficiaries, risks, locations, progress, evidence] = reads.map(r => r.data || []);
    setCtx({ objectives, outcomes, outputs, indicators, activities, periods, finance, beneficiaries, risks, locations, progress, evidence });
    setLoading(false);
  }, []);
  useEffect(() => { if (mode === 'manage') loadContext(projectId); }, [projectId, mode, loadContext]);

  const openRegister = () => { setForm(blankProfile()); setSavedNotice(null); setMode('register'); };
  const openEdit = () => { if (!project) return; setForm(profileFromProject(project)); setSavedNotice(null); setMode('edit'); };
  const backToManage = () => { setMode('manage'); setSavedNotice(null); };

  const saveProfile = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Project title is required.'); return; }
    const budget = toNum(form.budget_vuv);
    if (budget != null && budget < 0) { toast.error('Approved budget cannot be negative.'); return; }
    if (form.start_date && form.end_date && form.end_date < form.start_date) { toast.error('End date cannot be earlier than start date.'); return; }
    const editingId = mode === 'edit' ? projectId : null;
    setSaving(true);
    const args = {
      p_id: editingId, p_name: form.name.trim(), p_acronym: toNull(form.acronym?.trim()),
      p_description: toNull(form.description?.trim()), p_status: form.status,
      p_category: toNull(form.category?.trim()), p_lead_agency: toNull(form.lead_agency?.trim()),
      p_executing_agency: toNull(form.executing_agency?.trim()), p_implementing_partners: toArr(form.implementing_partners),
      p_donor: toNull(form.donor), p_funding_window: toNull(form.funding_window?.trim()), p_currency: form.currency || 'VUV',
      p_budget_vuv: budget, p_start_date: toNull(form.start_date), p_end_date: toNull(form.end_date), p_approval_date: toNull(form.approval_date),
      p_project_type: toNull(form.project_type?.trim()), p_primary_climate_theme: toNull(form.primary_climate_theme?.trim()),
      p_coverage_type: toNull(form.coverage_type), p_provinces: toArr(form.provinces), p_islands: toArr(form.islands),
      p_area_councils: toArr(form.area_councils), p_communities: toArr(form.communities),
      p_project_manager_id: form.project_manager_id, p_me_officer_id: form.me_officer_id, p_finance_officer_id: form.finance_officer_id,
      p_est_direct_beneficiaries: toNum(form.est_direct_beneficiaries), p_est_indirect_beneficiaries: toNum(form.est_indirect_beneficiaries),
      p_expected_primary_outcome: toNull(form.expected_primary_outcome?.trim()),
      p_project_manager: toNull(form.project_manager?.trim()), p_me_officer: toNull(form.me_officer?.trim()), p_finance_officer: toNull(form.finance_officer?.trim()),
    };
    let { data, error } = await supabase.rpc('upsert_project', args);
    if (isMissingRpcArgument(error, 'p_project_manager')) {
      const { p_project_manager: _pm, p_me_officer: _me, p_finance_officer: _fo, ...older } = args;
      ({ data, error } = await supabase.rpc('upsert_project', older));
    }
    setSaving(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    const id = data || editingId;
    setSavedNotice({ id, name: form.name.trim(), edited: !!editingId });
    toast.success(editingId ? 'Project profile updated.' : 'Project registered successfully.');
    await loadProjects(id); setProjectId(id); setMode('manage'); await loadContext(id);
  };

  return <div className="page-pad pw" style={{ maxWidth: 1360, margin: '0 auto' }}>
    <style>{`
      .pw-switch{display:flex;gap:.4rem;margin:.6rem 0 1rem;border-bottom:1px solid var(--border)}.pw-switch button,.pw-tabs button{border:0;background:none;padding:.65rem .75rem;font:inherit;font-size:.8rem;font-weight:700;color:var(--text-3);cursor:pointer;border-bottom:2px solid transparent}.pw-switch button.active,.pw-tabs button.active{color:var(--green-700);border-bottom-color:var(--green-600)}
      .pw-toolbar{display:flex;gap:.65rem;align-items:end;justify-content:space-between;flex-wrap:wrap;margin-bottom:.8rem}.pw-project-select{min-width:320px;max-width:720px;flex:1}.pw-project-banner{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.8rem;padding:.8rem 1rem;border:1px solid var(--project-ink);border-left:5px solid var(--project-ink);border-radius:11px;background:var(--project-bg)}.pw-project-banner strong{color:var(--project-ink)}.pw-tabs{display:flex;gap:.1rem;overflow:auto;border-bottom:1px solid var(--border);margin-bottom:1rem}.pw-card{background:var(--white);border:1px solid var(--border);border-radius:12px;padding:1rem;margin-bottom:.9rem}.pw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.7rem}.pw-stat{padding:.9rem;border:1px solid var(--border);border-radius:10px;background:#fff}.pw-stat span{display:block;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3);font-weight:700}.pw-stat b{display:block;margin-top:.3rem;font-size:1.35rem;color:var(--text-1)}.pw-stat small{display:block;margin-top:.2rem;color:var(--text-3)}
      .pw-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}.pw-field{padding:.55rem 0;border-bottom:1px solid var(--border)}.pw-field span{display:block;font-size:.65rem;text-transform:uppercase;color:var(--text-3);font-weight:700}.pw-field b{display:block;margin-top:.25rem;font-size:.84rem;font-weight:600}.pw-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:10px}.pw-table{width:100%;border-collapse:collapse;font-size:.8rem}.pw-table th,.pw-table td{padding:.6rem .7rem;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}.pw-table th{position:sticky;top:0;background:var(--green-50);font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3)}.pw-table tbody tr:last-child td{border-bottom:0}.pw-empty{padding:1.5rem;text-align:center;color:var(--text-3);border:1px dashed var(--border);border-radius:10px}.pw-actions{display:flex;gap:.5rem;flex-wrap:wrap}.pw-action{display:inline-flex;align-items:center;padding:.5rem .7rem;border:1px solid var(--border);border-radius:8px;background:#fff;text-decoration:none;color:var(--green-700);font-size:.76rem;font-weight:700}.pw-alert{padding:.75rem .9rem;border:1px solid #f2b8b5;background:#fff5f5;border-radius:10px;color:#9f2f2a;margin-bottom:.8rem}.pw-success{padding:.75rem .9rem;border:1px solid #86efac;background:#f0fdf4;border-radius:10px;color:#166534;margin-bottom:.8rem}.ps-grid h3{grid-column:1/-1;margin:.8rem 0 0;font-size:.76rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)}
      @media(max-width:900px){.pw-grid{grid-template-columns:repeat(2,1fr)}.pw-fields{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.pw-grid,.pw-fields{grid-template-columns:1fr}.pw-project-select{min-width:100%}.pw-project-banner{align-items:flex-start;flex-direction:column}.ps-grid{grid-template-columns:1fr!important}.ps-grid>*{grid-column:1!important}}
    `}</style>
    <PageHeader title="Projects" subtitle="Register once, then plan, monitor, report and review each project from one connected workspace." />
    {savedNotice && <div className="pw-success"><strong>{savedNotice.name}</strong> {savedNotice.edited ? 'was updated.' : 'was registered.'}</div>}
    <div className="pw-switch" role="tablist" aria-label="Project tasks">
      <button className={mode === 'manage' ? 'active' : ''} onClick={backToManage}>Manage projects</button>
      {canEditProfile && <button className={mode === 'register' ? 'active' : ''} onClick={openRegister}>Register new project</button>}
      {canEditProfile && project && <button className={mode === 'edit' ? 'active' : ''} onClick={openEdit}>Edit selected project</button>}
    </div>

    {mode === 'manage' ? <>
      {error && <div className="pw-alert">{error} <button className="btn btn-secondary" onClick={() => loadContext(projectId)}>Retry</button></div>}
      <div className="pw-toolbar">
        <label className="pw-project-select"><span className="field-label">Project</span><select className="field-input" value={projectId} onChange={e => setProjectId(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
        <div className="pw-actions"><Link className="pw-action" to={`/analytics/project-portfolio?project=${projectId}`}>Analyse project</Link><Link className="pw-action" to={`/analytics/results?project=${projectId}`}>Results & indicators</Link><Link className="pw-action" to={`/merl-reporting?project=${projectId}`}>Enter MERL report</Link>{canEditProfile && <button className="pw-action" type="button" onClick={openEdit}>Edit profile</button>}</div>
      </div>
      {project && <div className="pw-project-banner" style={projectColor(project)}><div><strong>{project.code} — {project.name}</strong><div style={{fontSize:'.75rem',marginTop:'.2rem'}}>{project.status || 'Status not set'} · {project.category || 'Theme not set'}</div></div><div style={{fontSize:'.72rem'}}>Project identity color — not a performance rating</div></div>}
      {loading && <div className="pw-empty">Loading project workspace…</div>}
      {!loading && project && ctx && <><div className="pw-tabs" role="tablist" aria-label="Project workspace sections">{WORKSPACE_TABS.map(([k,l]) => <button key={k} className={tab===k?'active':''} onClick={() => setTab(k)}>{l}</button>)}</div><ProjectTab tab={tab} p={project} d={ctx} /></>}
      {!loading && !projects.length && <Empty>No projects are available to this account.</Empty>}
    </> : <ProfileForm mode={mode} v={form} set={set} setMulti={setMulti} save={saveProfile} saving={saving} cancel={backToManage} />}
  </div>;
}

function ProjectTab({ tab, p, d }) {
  const latestFinance = latestBy(d.finance);
  const openRisks = d.risks.filter(r => !['closed','resolved'].includes(r.status));
  const overdueReports = d.periods.filter(r => r.period_end && r.period_end.slice(0,10) < today() && r.submission_status !== 'approved');
  if (tab === 'overview') return <><div className="pw-grid"><Stat label="Project status" value={OPT.labelOf?.(OPT.DOCC_PROJECT_STATUS, p.status) || p.status || '—'} /><Stat label="Results framework" value={`${d.indicators.length} indicators`} note={`${d.objectives.length} objectives · ${d.outputs.length} outputs`} /><Stat label="Reporting" value={`${overdueReports.length} overdue`} note={`${d.periods.filter(x=>x.submission_status==='approved').length} approved periods`} /><Stat label="Open risks" value={openRisks.length} note={`${openRisks.filter(r=>['high','critical'].includes(String(r.risk_rating).toLowerCase())).length} high/critical`} /></div><div className="pw-card"><h2>Project profile</h2><div className="pw-fields"><Info label="Code" value={p.code} /><Info label="Project" value={p.name} /><Info label="Status" value={p.status} /><Info label="Theme / sector" value={p.category} /><Info label="Donor" value={p.donor} /><Info label="Budget" value={money(p.budget_vuv)} /><Info label="Start date" value={fmtDate(p.start_date)} /><Info label="End date" value={fmtDate(p.end_date)} /><Info label="Provinces" value={(p.provinces||[]).join(', ')} /><Info label="Project Manager" value={p.project_manager || p.project_manager_name} /><Info label="DoCC M&E Officer" value={p.me_officer || p.me_officer_name} /><Info label="Finance Officer" value={p.finance_officer || p.finance_officer_name} /></div>{p.description && <p style={{lineHeight:1.55}}>{p.description}</p>}</div></>;
  if (tab === 'framework') return <div className="pw-card"><h2>Results framework</h2>{!d.indicators.length && !d.outputs.length ? <Empty>No framework records yet.</Empty> : <Table columns={[{label:'Level',get:r=>r.level},{label:'Code',get:r=>r.code},{label:'Statement / indicator',get:r=>r.text},{label:'Target',get:r=>r.target}]} rows={[...d.objectives.map(x=>({id:x.id,level:'Objective',code:x.code,text:x.statement,target:'—'})),...d.outcomes.map(x=>({id:x.id,level:'Outcome',code:x.code,text:x.statement,target:'—'})),...d.outputs.map(x=>({id:x.id,level:'Output',code:x.code,text:x.statement,target:'—'})),...d.indicators.map(x=>({id:x.id,level:'Indicator',code:x.code,text:x.name,target:x.target_value??'—'}))]} />}<div className="pw-actions" style={{marginTop:'.8rem'}}><Link className="pw-action" to={`/analytics/results?project=${p.id}`}>Open editable results framework</Link></div></div>;
  if (tab === 'activities') return <div className="pw-card"><h2>Activities & workplan</h2>{d.activities.length ? <Table columns={[{label:'Code',get:r=>r.code},{label:'Activity',get:r=>r.name},{label:'Status',get:r=>r.status||'—'},{label:'Progress',get:r=>r.physical_progress_pct!=null?`${r.physical_progress_pct}%`:'—'},{label:'Due',get:r=>fmtDate(r.planned_end_date)},{label:'Next action',get:r=>r.next_action||'—'}]} rows={d.activities} /> : <Empty>No activities recorded.</Empty>}</div>;
  if (tab === 'reporting') return <div className="pw-card"><h2>Reporting calendar</h2>{d.periods.length ? <Table columns={[{label:'Period',get:r=>r.period_label},{label:'Type',get:r=>r.period_type||'—'},{label:'Due',get:r=>fmtDate(r.period_end)},{label:'Status',get:r=>r.submission_status},{label:'Reporting officer',get:r=>r.reporting_officer_name||'—'},{label:'Reviewer comments',get:r=>r.review_comments||'—'}]} rows={d.periods} /> : <Empty>No reporting periods configured.</Empty>}<div className="pw-actions" style={{marginTop:'.8rem'}}><Link className="pw-action" to={`/merl-reporting?project=${p.id}`}>Open reporting workspace</Link></div></div>;
  if (tab === 'finance') return <><div className="pw-grid"><Stat label="Approved budget" value={money(latestFinance?.approved_budget ?? p.budget_vuv)} /><Stat label="Cumulative expenditure" value={money(latestFinance?.cumulative_expenditure)} /><Stat label="Remaining balance" value={money(latestFinance?.remaining_balance)} /><Stat label="Utilisation" value={latestFinance?.utilisation_pct!=null?`${Math.round(latestFinance.utilisation_pct)}%`:'—'} /></div><div className="pw-card">{d.finance.length ? <Table columns={[{label:'Period',get:r=>r.reporting_period||'—'},{label:'Budget',get:r=>money(r.approved_budget)},{label:'Expenditure',get:r=>money(r.cumulative_expenditure)},{label:'Committed',get:r=>money(r.funds_committed)},{label:'Funds received',get:r=>money(r.funds_received)},{label:'Utilisation',get:r=>r.utilisation_pct!=null?`${Math.round(r.utilisation_pct)}%`:'—'}]} rows={d.finance} /> : <Empty>No financial progress recorded.</Empty>}</div></>;
  if (tab === 'beneficiaries') { const total=portfolioBeneficiaries(d.beneficiaries)??0; const s=k=>d.beneficiaries.reduce((a,r)=>a+(Number(r[k])||0),0); return <><div className="pw-grid"><Stat label="Direct beneficiaries" value={fmtNum(total)} /><Stat label="Female" value={fmtNum(s('female'))} /><Stat label="Male" value={fmtNum(s('male'))} /><Stat label="PWD" value={fmtNum(s('persons_with_disability'))} /></div><div className="pw-card">{d.beneficiaries.length ? <Table columns={[{label:'Period',get:r=>r.reporting_period||'—'},{label:'Location',get:r=>r.location||'—'},{label:'Direct',get:r=>fmtNum(r.total_direct||0)},{label:'Youth',get:r=>fmtNum(r.youth||0)},{label:'Indirect',get:r=>fmtNum(r.indirect||0)},{label:'Double-counting check',get:r=>r.double_counting_check?'Completed':'Not recorded'}]} rows={d.beneficiaries} /> : <Empty>No beneficiary records.</Empty>}</div></>; }
  if (tab === 'risks') return <div className="pw-card"><h2>Risk and issue register</h2>{d.risks.length ? <Table columns={[{label:'ID',get:r=>r.code},{label:'Type',get:r=>r.type},{label:'Description',get:r=>r.description},{label:'Rating',get:r=>r.risk_rating||'—'},{label:'Owner',get:r=>r.responsible_person||'—'},{label:'Due',get:r=>fmtDate(r.due_date)},{label:'Status',get:r=>r.status||'—'},{label:'Latest update',get:r=>r.latest_update||'—'}]} rows={d.risks} /> : <Empty>No risks or issues recorded.</Empty>}</div>;
  if (tab === 'geography') return <div className="pw-card"><h2>Geographic coverage</h2>{d.locations.length ? <Table columns={[{label:'Province',get:r=>r.province||'—'},{label:'Island',get:r=>r.island||'—'},{label:'Area Council',get:r=>r.area_council||'—'},{label:'Community',get:r=>r.community||'—'},{label:'Beneficiaries',get:r=>fmtNum(r.beneficiaries||0)},{label:'Coordinates',get:r=>r.latitude!=null&&r.longitude!=null?`${r.latitude}, ${r.longitude}`:'Missing'}]} rows={d.locations} /> : <Empty>No verified project locations are recorded.</Empty>}</div>;
  if (tab === 'documents') return <div className="pw-card"><h2>Documents & evidence</h2>{d.evidence.length ? <Table columns={[{label:'Period',get:r=>r.reporting_period||'—'},{label:'Title',get:r=>r.title||r.file_name||'Evidence'},{label:'Type',get:r=>r.evidence_type||r.type||'—'},{label:'Verification',get:r=>r.verification_status||'—'},{label:'Added',get:r=>fmtDate(r.created_at)}]} rows={d.evidence} /> : <Empty>No evidence records have been attached.</Empty>}<div className="pw-actions" style={{marginTop:'.8rem'}}><Link className="pw-action" to={`/merl-reporting?project=${p.id}&module=evidence`}>Add / review evidence</Link></div></div>;
  if (tab === 'history') return <div className="pw-card"><h2>Project reporting history</h2>{d.periods.length ? <Table columns={[{label:'Period',get:r=>r.period_label},{label:'Status',get:r=>r.submission_status},{label:'Submitted',get:r=>fmtDate(r.submitted_at)},{label:'Approved',get:r=>fmtDate(r.approved_at)},{label:'Reviewer comments',get:r=>r.review_comments||'—'},{label:'Updated',get:r=>fmtDate(r.updated_at)}]} rows={d.periods} /> : <Empty>No reporting history yet.</Empty>}</div>;
  return null;
}

function ProfileForm({ mode, v, set, setMulti, save, saving, cancel }) {
  const editing = mode === 'edit';
  return <form onSubmit={save}><div className="pw-card"><h2 style={{marginTop:0}}>{editing ? 'Edit project profile' : 'Register new project'}</h2>{editing && <p style={{fontSize:'.78rem',color:'var(--text-3)'}}>Updates are enforced server-side: Project Managers may update only assigned projects; DoCC M&E Officers and System Administrators may update portfolio-wide.</p>}<div className="ps-grid" style={{ display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'.8rem' }}>
    <label style={{...field,gridColumn:'1 / -1'}}><span className="field-label">Project Title *</span><input className="field-input" value={v.name} onChange={set('name')} required /></label>
    <label style={field}><span className="field-label">Acronym</span><input className="field-input" value={v.acronym} onChange={set('acronym')} /></label>
    <label style={field}><span className="field-label">Status</span><select className="field-input" value={v.status} onChange={set('status')}>{OPT.DOCC_PROJECT_STATUS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
    <label style={{...field,gridColumn:'1 / -1'}}><span className="field-label">Description</span><textarea className="field-input" rows={3} value={v.description} onChange={set('description')} /></label>
    <h3>Classification & expected result</h3><label style={field}><span className="field-label">Theme / Sector</span><input className="field-input" value={v.category} onChange={set('category')} /></label><label style={field}><span className="field-label">Project Type</span><input className="field-input" value={v.project_type} onChange={set('project_type')} /></label><label style={{...field,gridColumn:'1 / -1'}}><span className="field-label">Expected Primary Outcome</span><input className="field-input" value={v.expected_primary_outcome} onChange={set('expected_primary_outcome')} /></label>
    <h3>Institutions</h3><label style={field}><span className="field-label">Lead Department / Agency</span><input className="field-input" value={v.lead_agency} onChange={set('lead_agency')} /></label><label style={field}><span className="field-label">Executing Agency</span><input className="field-input" value={v.executing_agency} onChange={set('executing_agency')} /></label><label style={field}><span className="field-label">Project Manager</span><input className="field-input" value={v.project_manager} onChange={set('project_manager')} /></label><label style={field}><span className="field-label">DoCC M&E Officer</span><input className="field-input" value={v.me_officer} onChange={set('me_officer')} /></label><label style={field}><span className="field-label">Finance Officer</span><input className="field-input" value={v.finance_officer} onChange={set('finance_officer')} /></label>
    <h3>Funding & timeline</h3><label style={field}><span className="field-label">Donor / Source of Funding</span><select className="field-input" value={v.donor} onChange={set('donor')}><option value="">Select</option>{OPT.DONOR.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label style={field}><span className="field-label">Funding Window</span><input className="field-input" value={v.funding_window} onChange={set('funding_window')} /></label><label style={field}><span className="field-label">Approved Budget</span><input className="field-input" type="number" min="0" value={v.budget_vuv} onChange={set('budget_vuv')} /></label><label style={field}><span className="field-label">Currency</span><select className="field-input" value={v.currency} onChange={set('currency')}>{OPT.CURRENCY.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label style={field}><span className="field-label">Start Date</span><input className="field-input" type="date" value={v.start_date} onChange={set('start_date')} /></label><label style={field}><span className="field-label">End Date</span><input className="field-input" type="date" value={v.end_date} onChange={set('end_date')} /></label><label style={field}><span className="field-label">Approval Date</span><input className="field-input" type="date" value={v.approval_date} onChange={set('approval_date')} /></label>
    <h3>Geographic coverage</h3><label style={field}><span className="field-label">Coverage Type</span><select className="field-input" value={v.coverage_type} onChange={set('coverage_type')}><option value="">Select</option>{OPT.COVERAGE_TYPE.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label style={field}><span className="field-label">Provinces</span><select multiple className="field-input" style={{minHeight:105}} value={v.provinces} onChange={setMulti('provinces')}>{PROVINCE_LIST.map(p=><option key={p} value={p}>{p}</option>)}</select></label><label style={field}><span className="field-label">Islands</span><input className="field-input" value={(v.islands||[]).join(', ')} readOnly title="Maintain detailed locations in the Geography workspace." /></label><label style={field}><span className="field-label">Area Councils</span><input className="field-input" value={(v.area_councils||[]).join(', ')} readOnly title="Maintain detailed locations in the Geography workspace." /></label>
    <h3>Expected beneficiaries</h3><label style={field}><span className="field-label">Direct Beneficiaries</span><input className="field-input" type="number" min="0" value={v.est_direct_beneficiaries} onChange={set('est_direct_beneficiaries')} /></label><label style={field}><span className="field-label">Indirect Beneficiaries</span><input className="field-input" type="number" min="0" value={v.est_indirect_beneficiaries} onChange={set('est_indirect_beneficiaries')} /></label>
  </div></div><div style={{display:'flex',justifyContent:'flex-end',gap:'.6rem'}}><button type="button" className="btn btn-secondary" disabled={saving} onClick={cancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save project changes' : 'Register project'}</button></div></form>;
}
