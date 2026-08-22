// =============================================================================
// ProjectSetup.jsx — DoCC Standardised MERL "Project Setup" wizard.
// Covers the setup half of the DoCC form as a stepped workflow:
//   1. Project Profile   (Form 1)  -> upsert_project
//   2. Results Framework (Form 2)  -> objective/outcome/output RPCs (0009)
//   3. Indicators        (Form 3)  -> upsert_project_indicator
//   4. Activities        (Form 5)  -> upsert_project_activity_full
//   5. Locations         (Form 7)  -> upsert_project_location
// Reads through the public.v_* views; writes through the SECURITY DEFINER RPCs.
// Shows a completion tick per section (Enter once -> structured data).
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ClipboardList, Check, Plus, Pencil, Trash2, ChevronRight, X, ArrowLeft, ArrowRight, FolderPlus,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { confirmDialog, promptDialog } from '../lib/confirm';
import * as OPT from '../constants/formOptions';
import { islandsForProvince, areaCouncilsForProvince, PROVINCE_LIST } from '../constants/vanuatuGeo';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const STEPS = [
  { key: 'profile',    label: 'Project Profile', form: 'Form 1' },
  { key: 'results',    label: 'Results Framework', form: 'Form 2' },
  { key: 'indicators', label: 'Indicators', form: 'Form 3' },
  { key: 'activities', label: 'Activities', form: 'Form 5' },
  { key: 'locations',  label: 'Locations', form: 'Form 7' },
];

const btn = (bg, extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.85rem',
  fontSize: '0.8125rem', fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer',
  color: '#fff', background: bg, ...extra,
});
const ghostBtn = { ...btn('var(--white)'), color: 'var(--text-2)', border: '1px solid var(--border)' };

export default function ProjectSetup({ user }) {
  const canEdit = EDITOR_ROLES.includes(user?.role);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(null); // null = choosing / new
  const [users, setUsers] = useState([]);
  const [step, setStep] = useState('profile');

  const [objectives, setObjectives] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [activities, setActivities] = useState([]);
  const [locations, setLocations] = useState([]);

  const project = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase.from('v_projects').select('id, code, name, status').order('code');
    setProjects(data ?? []);
    return data ?? [];
  }, []);

  useEffect(() => {
    loadProjects();
    supabase.rpc('list_assignable_users').then(({ data }) => setUsers(data ?? []));
  }, [loadProjects]);

  const loadFramework = useCallback(async (pid) => {
    if (!pid) { setObjectives([]); setOutcomes([]); setOutputs([]); setIndicators([]); setActivities([]); setLocations([]); return; }
    const [obj, oc, op, ind, act, loc] = await Promise.all([
      supabase.from('v_objectives').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_outcomes').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_outputs').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_project_indicators').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_project_activities').select('*').eq('project_id', pid).order('code'),
      supabase.from('v_project_locations').select('*').eq('project_id', pid).order('created_at'),
    ]);
    setObjectives(obj.data ?? []); setOutcomes(oc.data ?? []); setOutputs(op.data ?? []);
    setIndicators(ind.data ?? []); setActivities(act.data ?? []); setLocations(loc.data ?? []);
  }, []);

  useEffect(() => { loadFramework(projectId); }, [projectId, loadFramework]);

  const completion = {
    profile: !!project,
    results: objectives.length > 0 && outputs.length > 0,
    indicators: indicators.length > 0,
    activities: activities.length > 0,
    locations: locations.length > 0,
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const goPrev = () => setStep(STEPS[Math.max(0, stepIndex - 1)].key);
  const goNext = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].key);

  if (!canEdit) {
    return (
      <div className="page-pad" style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)' }}>Project Setup</h1>
        <p style={{ color: 'var(--text-2)' }}>You have read-only access. Project setup is available to Project Managers, M&amp;E Officers and Administrators.</p>
      </div>
    );
  }

  return (
    <div className="page-pad" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <style>{`
        .ps-steps{display:flex;gap:.4rem;flex-wrap:wrap;margin:1rem 0}
        .ps-step{display:flex;align-items:center;gap:.4rem;padding:.5rem .8rem;border-radius:9999px;border:1px solid var(--border);background:var(--white);cursor:pointer;font-size:.8125rem;font-weight:600;color:var(--text-2)}
        .ps-step.active{background:var(--green-600);color:#fff;border-color:var(--green-600)}
        .ps-tick{width:16px;height:16px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--green-100);color:var(--green-700)}
        .ps-step.active .ps-tick{background:rgba(255,255,255,.25);color:#fff}
        .ps-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem}
        .ps-full{grid-column:1 / -1}
        .ps-table{width:100%;border-collapse:collapse;font-size:.85rem}
        .ps-table th,.ps-table td{padding:.5rem .6rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .ps-table th{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)}
        .ps-card{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.75rem;margin-bottom:.5rem}
        .ps-cards{display:none}
        @media (max-width:640px){.ps-grid{grid-template-columns:1fr}.ps-desktop{display:none}.ps-cards{display:block}}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <ClipboardList size={22} style={{ color: 'var(--green-700)' }} />
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.4rem,4vw,1.9rem)', fontWeight: 700, margin: 0 }}>Project Setup</h1>
      </div>
      <p style={{ color: 'var(--text-2)', margin: '0.35rem 0 1rem', fontSize: '0.9rem' }}>
        Register a project and build its results framework, indicators, activities and locations. Periodic monitoring is entered later under MERL Reporting.
      </p>

      {/* Project selector */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 320px' }}>
          <label className="field-label">Project</label>
          <select className="field-input" value={projectId ?? ''} onChange={(e) => { setProjectId(e.target.value || null); setStep('profile'); }}>
            <option value="">— Select a project to edit —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
        <button style={btn('var(--green-700)')} onClick={() => { setProjectId(null); setStep('profile'); }}>
          <FolderPlus size={16} /> New project
        </button>
      </div>

      {/* Steps */}
      <div className="ps-steps">
        {STEPS.map((s) => {
          const done = completion[s.key];
          const disabled = s.key !== 'profile' && !project;
          return (
            <button key={s.key} className={`ps-step${step === s.key ? ' active' : ''}`}
              onClick={() => !disabled && setStep(s.key)} disabled={disabled}
              style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
              {done ? <span className="ps-tick"><Check size={11} /></span> : <span style={{ width: 16, textAlign: 'center', color: 'var(--text-3)' }}>{STEPS.indexOf(s) + 1}</span>}
              {s.label}
            </button>
          );
        })}
      </div>

      {project && (
        <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-2)' }}>
          Editing <strong>{project.code}</strong> — {project.name}
          <span style={{ marginLeft: '0.5rem', color: 'var(--text-3)' }}>({OPT.labelOf(OPT.DOCC_PROJECT_STATUS, project.status)})</span>
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
        {step === 'profile' && (
          <ProfileStep project={project} users={users}
            onSaved={async (id) => { await loadProjects(); setProjectId(id); toast.success('Project saved'); }} />
        )}
        {step === 'results' && project && (
          <ResultsStep projectId={projectId} objectives={objectives} outcomes={outcomes} outputs={outputs}
            users={users} reload={() => loadFramework(projectId)} />
        )}
        {step === 'indicators' && project && (
          <IndicatorsStep projectId={projectId} indicators={indicators} objectives={objectives}
            outcomes={outcomes} outputs={outputs} users={users} reload={() => loadFramework(projectId)} />
        )}
        {step === 'activities' && project && (
          <ActivitiesStep outputs={outputs} outcomes={outcomes} activities={activities} users={users}
            reload={() => loadFramework(projectId)} />
        )}
        {step === 'locations' && project && (
          <LocationsStep projectId={projectId} locations={locations} reload={() => loadFramework(projectId)} />
        )}
        {step !== 'profile' && !project && (
          <p style={{ color: 'var(--text-3)' }}>Save the project profile first to unlock this step.</p>
        )}
      </div>

      {/* Wizard nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
        <button style={ghostBtn} onClick={goPrev} disabled={stepIndex === 0}><ArrowLeft size={15} /> Previous</button>
        <button style={btn('var(--green-700)')} onClick={goNext} disabled={stepIndex === STEPS.length - 1 || !project}>
          Next <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ── Step 1: Project Profile ──────────────────────────────────────────────────
function ProfileStep({ project, users, onSaved }) {
  const blank = {
    name: '', acronym: '', description: '', status: 'pipeline', category: '', lead_agency: '',
    executing_agency: '', donor: '', funding_window: '', currency: 'VUV', budget_vuv: '',
    start_date: '', end_date: '', approval_date: '', project_type: '', primary_climate_theme: '',
    coverage_type: '', provinces: [], project_manager_id: '', me_officer_id: '', finance_officer_id: '',
    est_direct_beneficiaries: '', est_indirect_beneficiaries: '', expected_primary_outcome: '',
  };
  const [v, setV] = useState(blank);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!project) { setV(blank); return; }
    // Load the full row for editing.
    supabase.from('v_projects').select('*').eq('id', project.id).single().then(({ data }) => {
      if (!data) return;
      setV({
        ...blank, ...data,
        provinces: data.provinces ?? [],
        budget_vuv: data.budget_vuv ?? '', start_date: data.start_date ?? '', end_date: data.end_date ?? '',
        approval_date: data.approval_date ?? '',
        est_direct_beneficiaries: data.est_direct_beneficiaries ?? '',
        est_indirect_beneficiaries: data.est_indirect_beneficiaries ?? '',
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setMulti = (k) => (e) => setV((s) => ({ ...s, [k]: Array.from(e.target.selectedOptions).map((o) => o.value) }));

  const save = async () => {
    if (!v.name.trim()) { toast.error('Project title is required'); return; }
    setSaving(true);
    const { data, error } = await supabase.rpc('upsert_project', {
      p_id: project?.id ?? null, p_name: v.name, p_acronym: toNull(v.acronym), p_description: toNull(v.description),
      p_status: v.status, p_category: toNull(v.category), p_lead_agency: toNull(v.lead_agency),
      p_executing_agency: toNull(v.executing_agency), p_donor: toNull(v.donor), p_funding_window: toNull(v.funding_window),
      p_currency: v.currency, p_budget_vuv: toNum(v.budget_vuv), p_start_date: toNull(v.start_date),
      p_end_date: toNull(v.end_date), p_approval_date: toNull(v.approval_date), p_project_type: toNull(v.project_type),
      p_primary_climate_theme: toNull(v.primary_climate_theme), p_coverage_type: toNull(v.coverage_type),
      p_provinces: toArr(v.provinces), p_project_manager_id: toNull(v.project_manager_id),
      p_me_officer_id: toNull(v.me_officer_id), p_finance_officer_id: toNull(v.finance_officer_id),
      p_est_direct_beneficiaries: toNum(v.est_direct_beneficiaries),
      p_est_indirect_beneficiaries: toNum(v.est_indirect_beneficiaries),
      p_expected_primary_outcome: toNull(v.expected_primary_outcome),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved(data);
  };

  const userOpts = users.map((u) => ({ value: u.id, label: u.full_name }));
  return (
    <div>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Project Profile <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 1</span></h3>
      <div className="ps-grid">
        <Field className="ps-full" label="Project Title *"><input className="field-input" value={v.name} onChange={set('name')} /></Field>
        <Field label="Acronym"><input className="field-input" value={v.acronym ?? ''} onChange={set('acronym')} /></Field>
        <Field label="Status"><Select value={v.status} onChange={set('status')} options={OPT.DOCC_PROJECT_STATUS} /></Field>
        <Field className="ps-full" label="Description"><textarea className="field-input" rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>
        <Field label="Theme / Sector"><Select value={v.category ?? ''} onChange={set('category')} options={OPT.CLIMATE_THEME} allowBlank /></Field>
        <Field label="Project Type"><Select value={v.project_type ?? ''} onChange={set('project_type')} options={OPT.PROJECT_TYPE} allowBlank /></Field>
        <Field label="Lead Department / Unit"><input className="field-input" value={v.lead_agency ?? ''} onChange={set('lead_agency')} /></Field>
        <Field label="Implementing / Executing Agency"><input className="field-input" value={v.executing_agency ?? ''} onChange={set('executing_agency')} /></Field>
        <Field label="Funding Partner / Donor"><Select value={v.donor ?? ''} onChange={set('donor')} options={OPT.DONOR} allowBlank /></Field>
        <Field label="Funding Window"><input className="field-input" value={v.funding_window ?? ''} onChange={set('funding_window')} /></Field>
        <Field label="Approved Budget"><input type="number" className="field-input" value={v.budget_vuv} onChange={set('budget_vuv')} /></Field>
        <Field label="Currency"><Select value={v.currency} onChange={set('currency')} options={OPT.CURRENCY} /></Field>
        <Field label="Start Date"><input type="date" className="field-input" value={v.start_date || ''} onChange={set('start_date')} /></Field>
        <Field label="End Date"><input type="date" className="field-input" value={v.end_date || ''} onChange={set('end_date')} /></Field>
        <Field label="Approval Date"><input type="date" className="field-input" value={v.approval_date || ''} onChange={set('approval_date')} /></Field>
        <Field label="Coverage Type"><Select value={v.coverage_type ?? ''} onChange={set('coverage_type')} options={OPT.COVERAGE_TYPE} allowBlank /></Field>
        <Field label="Provinces (multi-select)">
          <select multiple className="field-input" style={{ minHeight: 96 }} value={v.provinces} onChange={setMulti('provinces')}>
            {PROVINCE_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Expected Primary Outcome"><Select value={v.expected_primary_outcome ?? ''} onChange={set('expected_primary_outcome')} options={OPT.EXPECTED_OUTCOME} allowBlank /></Field>
        <Field label="Project Manager / Focal Point"><Select value={v.project_manager_id ?? ''} onChange={set('project_manager_id')} options={userOpts} allowBlank /></Field>
        <Field label="M&E Officer"><Select value={v.me_officer_id ?? ''} onChange={set('me_officer_id')} options={userOpts} allowBlank /></Field>
        <Field label="Finance Officer"><Select value={v.finance_officer_id ?? ''} onChange={set('finance_officer_id')} options={userOpts} allowBlank /></Field>
        <Field label="Est. Direct Beneficiaries"><input type="number" className="field-input" value={v.est_direct_beneficiaries} onChange={set('est_direct_beneficiaries')} /></Field>
        <Field label="Est. Indirect Beneficiaries"><input type="number" className="field-input" value={v.est_indirect_beneficiaries} onChange={set('est_indirect_beneficiaries')} /></Field>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <button style={btn('var(--green-700)')} onClick={save} disabled={saving}>{saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}</button>
      </div>
    </div>
  );
}

// ── Step 2: Results Framework (Objective → Outcome → Output) ─────────────────
function ResultsStep({ projectId, objectives, outcomes, outputs, reload }) {
  const addObjective = async () => {
    const s = await promptDialog({ title:'New objective', label:'Objective statement', multiline:true, required:true,
      placeholder:'e.g. Strengthen community resilience to climate hazards' });
    if (s == null) return;
    const { error } = await supabase.rpc('create_objective', { p_project_id: projectId, p_statement: s });
    if (error) { toast.error(error.message); return; } reload();
  };
  const addOutcome = async (objId) => {
    const s = await promptDialog({ title:'New outcome', label:'Outcome statement', multiline:true, required:true });
    if (s == null) return;
    const { error } = await supabase.rpc('create_outcome', { p_objective_id: objId, p_statement: s });
    if (error) { toast.error(error.message); return; } reload();
  };
  const addOutput = async (ocId) => {
    const s = await promptDialog({ title:'New output', label:'Output statement', multiline:true, required:true });
    if (s == null) return;
    const { error } = await supabase.rpc('create_output', { p_outcome_id: ocId, p_statement: s });
    if (error) { toast.error(error.message); return; } reload();
  };
  const editNode = async (kind, row) => {
    const s = await promptDialog({ title:`Edit ${kind}`, label:`${kind[0].toUpperCase()}${kind.slice(1)} statement`,
      multiline:true, required:true, defaultValue: row.statement });
    if (s == null) return;
    const rpc = kind === 'objective' ? 'update_objective' : kind === 'outcome' ? 'update_outcome' : 'update_output';
    const { error } = await supabase.rpc(rpc, { p_id: row.id, p_statement: s });
    if (error) { toast.error(error.message); return; } reload();
  };
  const delNode = async (kind, row) => {
    if (!(await confirmDialog({ title:`Delete ${kind}`, message:`Delete ${kind} ${row.code}? Child records are removed too. This cannot be undone.`, confirmLabel:'Delete' }))) return;
    const rpc = kind === 'objective' ? 'delete_objective' : kind === 'outcome' ? 'delete_outcome' : 'delete_output';
    const { error } = await supabase.rpc(rpc, { p_id: row.id });
    if (error) { toast.error(error.message); return; } reload();
  };
  const rowStyle = { display: 'flex', alignItems: 'flex-start', gap: '0.4rem', padding: '0.3rem 0' };
  const codeChip = (c, bg) => ({ fontSize: '0.68rem', fontWeight: 700, color: '#fff', background: bg, padding: '0.12rem 0.4rem', borderRadius: 6, flexShrink: 0, marginTop: 2 });
  const actions = (kind, row) => (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
      <button onClick={() => editNode(kind, row)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={13} /></button>
      <button onClick={() => delNode(kind, row)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={13} /></button>
    </span>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Results Framework <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 2</span></h3>
        <button style={btn('var(--green-700)')} onClick={addObjective}><Plus size={14} /> Objective</button>
      </div>
      {objectives.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No objectives yet. Add the first project objective.</p>}
      {objectives.map((obj) => (
        <div key={obj.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.75rem', marginBottom: '0.6rem' }}>
          <div style={rowStyle}>
            <span style={codeChip(obj.code, 'var(--green-700)')}>{obj.code}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{obj.statement}</span>
            {actions('objective', obj)}
          </div>
          <div style={{ marginLeft: '1rem', borderLeft: '2px solid var(--border)', paddingLeft: '0.7rem' }}>
            {outcomes.filter((oc) => oc.objective_id === obj.id).map((oc) => (
              <div key={oc.id} style={{ marginTop: '0.35rem' }}>
                <div style={rowStyle}>
                  <span style={codeChip(oc.code, '#2563eb')}>{oc.code}</span>
                  <span style={{ fontSize: '0.83rem' }}>{oc.statement}</span>
                  {actions('outcome', oc)}
                </div>
                <div style={{ marginLeft: '1rem', borderLeft: '2px solid var(--border)', paddingLeft: '0.7rem' }}>
                  {outputs.filter((op) => op.outcome_id === oc.id).map((op) => (
                    <div key={op.id} style={rowStyle}>
                      <span style={codeChip(op.code, '#7c3aed')}>{op.code}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{op.statement}</span>
                      {actions('output', op)}
                    </div>
                  ))}
                  <button onClick={() => addOutput(oc.id)} style={{ ...ghostBtn, padding: '0.2rem 0.5rem', marginTop: '0.25rem', fontSize: '0.72rem' }}><Plus size={12} /> Output</button>
                </div>
              </div>
            ))}
            <button onClick={() => addOutcome(obj.id)} style={{ ...ghostBtn, padding: '0.25rem 0.55rem', marginTop: '0.4rem', fontSize: '0.75rem' }}><Plus size={12} /> Outcome</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 3: Indicators ───────────────────────────────────────────────────────
function IndicatorsStep({ projectId, indicators, objectives, outcomes, outputs, users, reload }) {
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:'Delete indicator', message:`Delete indicator ${row.code}? This cannot be undone.`, confirmLabel:'Delete' }))) return;
    const { error } = await supabase.rpc('delete_project_indicator', { p_id: row.id });
    if (error) return toast.error(error.message); reload();
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Indicators <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 3</span></h3>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> Indicator</button>
      </div>
      {indicators.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No indicators yet.</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>Code</th><th>Name</th><th>Level</th><th>Baseline</th><th>Target</th><th></th></tr></thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td><td>{i.name}</td>
                  <td>{OPT.labelOf(OPT.INDICATOR_LEVEL, i.indicator_level)}</td>
                  <td>{i.baseline_value ?? '—'}</td><td>{i.target_value ?? '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} /></button>
                    <button onClick={() => del(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {indicators.length > 0 && (
        <div className="ps-cards">
          {indicators.map((i) => (
            <div className="ps-card" key={i.id}>
              <strong>{i.code}</strong> · {i.name}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Baseline {i.baseline_value ?? '—'} → Target {i.target_value ?? '—'}</div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button onClick={() => setEditing(i)} style={btn('#475569', { padding: '0.3rem 0.6rem' })}><Pencil size={13} /> Edit</button>
                <button onClick={() => del(i)} style={btn('#dc2626', { padding: '0.3rem 0.6rem' })}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <IndicatorForm projectId={projectId} initial={editing} objectives={objectives} outcomes={outcomes}
          outputs={outputs} users={users} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function IndicatorForm({ projectId, initial, objectives, outcomes, outputs, users, onClose, onSaved }) {
  const base = {
    name: '', indicator_level: '', definition: '', unit: '', baseline_value: '', baseline_year: '',
    target_value: '', target_date: '', frequency: '', data_source: '', collection_method: '',
    means_of_verification: '', verification_method: '', disaggregation: '', assumptions: '',
    responsible_officer_id: '', objective_id: '', outcome_id: '', output_id: '', is_qualitative: false, higher_is_better: true,
  };
  const [v, setV] = useState({ ...base, ...(initial?.id ? initial : {}) });
  useEffect(() => setV({ ...base, ...(initial?.id ? initial : {}) }), [initial?.id]); // eslint-disable-line
  const set = (k, t) => (e) => setV((s) => ({ ...s, [k]: t === 'checkbox' ? e.target.checked : e.target.value }));
  const userOpts = users.map((u) => ({ value: u.id, label: u.full_name }));

  const save = async () => {
    if (!v.name.trim()) return toast.error('Indicator name is required');
    const { error } = await supabase.rpc('upsert_project_indicator', {
      p_id: initial?.id ?? null, p_project_id: projectId, p_name: v.name, p_unit: toNull(v.unit),
      p_baseline_value: toNum(v.baseline_value), p_target_value: toNum(v.target_value),
      p_means_of_verification: toNull(v.means_of_verification), p_frequency: toNull(v.frequency),
      p_indicator_level: toNull(v.indicator_level), p_definition: toNull(v.definition),
      p_baseline_year: toNum(v.baseline_year), p_target_date: toNull(v.target_date),
      p_data_source: toNull(v.data_source), p_collection_method: toNull(v.collection_method),
      p_responsible_officer_id: toNull(v.responsible_officer_id), p_disaggregation: toNull(v.disaggregation),
      p_verification_method: toNull(v.verification_method), p_assumptions: toNull(v.assumptions),
      p_objective_id: toNull(v.objective_id), p_outcome_id: toNull(v.outcome_id), p_output_id: toNull(v.output_id),
      p_is_qualitative: !!v.is_qualitative, p_higher_is_better: !!v.higher_is_better,
    });
    if (error) return toast.error(error.message);
    onSaved();
  };
  return (
    <Modal title={`${initial?.id ? 'Edit' : 'Add'} indicator`} onClose={onClose} onSave={save} saveLabel={initial?.id ? 'Save' : 'Add'}>
      <Field className="ps-full" label="Indicator Name *"><input className="field-input" value={v.name} onChange={set('name')} /></Field>
      <Field label="Level"><Select value={v.indicator_level ?? ''} onChange={set('indicator_level')} options={OPT.INDICATOR_LEVEL} allowBlank /></Field>
      <Field label="Unit of Measurement"><input className="field-input" value={v.unit ?? ''} onChange={set('unit')} /></Field>
      <Field className="ps-full" label="Definition"><textarea className="field-input" rows={2} value={v.definition ?? ''} onChange={set('definition')} /></Field>
      <Field label="Baseline Value"><input type="number" className="field-input" value={v.baseline_value ?? ''} onChange={set('baseline_value')} /></Field>
      <Field label="Baseline Year"><input type="number" className="field-input" value={v.baseline_year ?? ''} onChange={set('baseline_year')} /></Field>
      <Field label="Final Target"><input type="number" className="field-input" value={v.target_value ?? ''} onChange={set('target_value')} /></Field>
      <Field label="Target Date"><input type="date" className="field-input" value={v.target_date || ''} onChange={set('target_date')} /></Field>
      <Field label="Reporting Frequency"><Select value={v.frequency ?? ''} onChange={set('frequency')} options={OPT.REPORTING_FREQUENCY} allowBlank /></Field>
      <Field label="Responsible Officer"><Select value={v.responsible_officer_id ?? ''} onChange={set('responsible_officer_id')} options={userOpts} allowBlank /></Field>
      <Field label="Data Source"><input className="field-input" value={v.data_source ?? ''} onChange={set('data_source')} /></Field>
      <Field label="Data Collection Method"><input className="field-input" value={v.collection_method ?? ''} onChange={set('collection_method')} /></Field>
      <Field label="Required Disaggregation"><input className="field-input" value={v.disaggregation ?? ''} onChange={set('disaggregation')} /></Field>
      <Field label="Verification Method"><input className="field-input" value={v.verification_method ?? ''} onChange={set('verification_method')} /></Field>
      <Field label="Linked Objective"><Select value={v.objective_id ?? ''} onChange={set('objective_id')} options={objectives.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field label="Linked Outcome"><Select value={v.outcome_id ?? ''} onChange={set('outcome_id')} options={outcomes.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field label="Linked Output"><Select value={v.output_id ?? ''} onChange={set('output_id')} options={outputs.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field className="ps-full" label="Assumptions / Comments"><textarea className="field-input" rows={2} value={v.assumptions ?? ''} onChange={set('assumptions')} /></Field>
      <Field label="Qualitative indicator"><input type="checkbox" checked={!!v.is_qualitative} onChange={set('is_qualitative', 'checkbox')} style={{ width: 18, height: 18 }} /></Field>
      <Field label="Higher value is better"><input type="checkbox" checked={!!v.higher_is_better} onChange={set('higher_is_better', 'checkbox')} style={{ width: 18, height: 18 }} /></Field>
    </Modal>
  );
}

// ── Step 4: Activities ───────────────────────────────────────────────────────
function ActivitiesStep({ outputs, outcomes, activities, users, reload }) {
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:'Delete activity', message:`Delete activity ${row.code}? This cannot be undone.`, confirmLabel:'Delete' }))) return;
    const { error } = await supabase.rpc('delete_project_activity', { p_id: row.id });
    if (error) return toast.error(error.message); reload();
  };
  if (outputs.length === 0) return <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Add at least one Output in the Results Framework before creating activities.</p>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Activities <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 5</span></h3>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> Activity</button>
      </div>
      {activities.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No activities yet.</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>Code</th><th>Title</th><th>Output</th><th>Status</th><th>Progress</th><th></th></tr></thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td><td>{a.name}</td><td>{a.output_code}</td>
                  <td>{OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</td>
                  <td>{a.physical_progress_pct != null ? `${a.physical_progress_pct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} /></button>
                    <button onClick={() => del(a)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {activities.length > 0 && (
        <div className="ps-cards">
          {activities.map((a) => (
            <div className="ps-card" key={a.id}>
              <strong>{a.code}</strong> · {a.name}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{a.output_code} · {OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button onClick={() => setEditing(a)} style={btn('#475569', { padding: '0.3rem 0.6rem' })}><Pencil size={13} /> Edit</button>
                <button onClick={() => del(a)} style={btn('#dc2626', { padding: '0.3rem 0.6rem' })}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <ActivityForm initial={editing} outputs={outputs} outcomes={outcomes} users={users}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function ActivityForm({ initial, outputs, outcomes, users, onClose, onSaved }) {
  const base = {
    name: '', output_id: outputs[0]?.id ?? '', outcome_id: '', description: '', responsible_officer_id: '',
    responsible_org: '', status: 'not_started', province: '', island: '', area_council: '', community: '',
    planned_start_date: '', planned_end_date: '', actual_start_date: '', actual_end_date: '',
    planned_budget: '', actual_expenditure: '', physical_progress_pct: '', key_achievement: '',
    issue_delay: '', next_action: '', next_action_due: '',
  };
  const [v, setV] = useState({ ...base, ...(initial?.id ? initial : {}) });
  useEffect(() => setV({ ...base, ...(initial?.id ? initial : {}) }), [initial?.id]); // eslint-disable-line
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setProvince = (e) => setV((s) => ({ ...s, province: e.target.value, island: '', area_council: '' }));
  const userOpts = users.map((u) => ({ value: u.id, label: u.full_name }));

  const save = async () => {
    if (!v.name.trim()) return toast.error('Activity title is required');
    if (!v.output_id) return toast.error('Select the parent output');
    const { error } = await supabase.rpc('upsert_project_activity_full', {
      p_id: initial?.id ?? null, p_output_id: v.output_id, p_name: v.name, p_description: toNull(v.description),
      p_responsible_officer_id: toNull(v.responsible_officer_id), p_status: v.status, p_outcome_id: toNull(v.outcome_id),
      p_responsible_org: toNull(v.responsible_org), p_province: toNull(v.province), p_island: toNull(v.island),
      p_area_council: toNull(v.area_council), p_community: toNull(v.community),
      p_planned_start_date: toNull(v.planned_start_date), p_planned_end_date: toNull(v.planned_end_date),
      p_actual_start_date: toNull(v.actual_start_date), p_actual_end_date: toNull(v.actual_end_date),
      p_planned_budget: toNum(v.planned_budget), p_actual_expenditure: toNum(v.actual_expenditure),
      p_physical_progress_pct: toNum(v.physical_progress_pct), p_key_achievement: toNull(v.key_achievement),
      p_issue_delay: toNull(v.issue_delay), p_next_action: toNull(v.next_action), p_next_action_due: toNull(v.next_action_due),
    });
    if (error) return toast.error(error.message);
    onSaved();
  };
  return (
    <Modal title={`${initial?.id ? 'Edit' : 'Add'} activity`} onClose={onClose} onSave={save} saveLabel={initial?.id ? 'Save' : 'Add'}>
      <Field className="ps-full" label="Activity Title *"><input className="field-input" value={v.name} onChange={set('name')} /></Field>
      <Field label="Linked Output *"><Select value={v.output_id} onChange={set('output_id')} options={outputs.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} /></Field>
      <Field label="Linked Outcome"><Select value={v.outcome_id ?? ''} onChange={set('outcome_id')} options={outcomes.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field className="ps-full" label="Description"><textarea className="field-input" rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>
      <Field label="Responsible Organisation"><input className="field-input" value={v.responsible_org ?? ''} onChange={set('responsible_org')} /></Field>
      <Field label="Responsible Officer"><Select value={v.responsible_officer_id ?? ''} onChange={set('responsible_officer_id')} options={userOpts} allowBlank /></Field>
      <Field label="Status"><Select value={v.status} onChange={set('status')} options={OPT.ACTIVITY_STATUS} /></Field>
      <Field label="Physical Progress %"><input type="number" className="field-input" value={v.physical_progress_pct ?? ''} onChange={set('physical_progress_pct')} /></Field>
      <Field label="Province"><Select value={v.province ?? ''} onChange={setProvince} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} allowBlank /></Field>
      <Field label="Island"><Select value={v.island ?? ''} onChange={set('island')} options={islandsForProvince(v.province).map((i) => ({ value: i, label: i }))} allowBlank /></Field>
      <Field label="Area Council"><Select value={v.area_council ?? ''} onChange={set('area_council')} options={areaCouncilsForProvince(v.province).map((a) => ({ value: a, label: a }))} allowBlank /></Field>
      <Field label="Community"><input className="field-input" value={v.community ?? ''} onChange={set('community')} /></Field>
      <Field label="Planned Start"><input type="date" className="field-input" value={v.planned_start_date || ''} onChange={set('planned_start_date')} /></Field>
      <Field label="Planned End"><input type="date" className="field-input" value={v.planned_end_date || ''} onChange={set('planned_end_date')} /></Field>
      <Field label="Planned Budget"><input type="number" className="field-input" value={v.planned_budget ?? ''} onChange={set('planned_budget')} /></Field>
      <Field label="Actual Expenditure"><input type="number" className="field-input" value={v.actual_expenditure ?? ''} onChange={set('actual_expenditure')} /></Field>
      <Field className="ps-full" label="Key Achievement"><textarea className="field-input" rows={2} value={v.key_achievement ?? ''} onChange={set('key_achievement')} /></Field>
      <Field label="Next Action"><input className="field-input" value={v.next_action ?? ''} onChange={set('next_action')} /></Field>
      <Field label="Next Action Due"><input type="date" className="field-input" value={v.next_action_due || ''} onChange={set('next_action_due')} /></Field>
    </Modal>
  );
}

// ── Step 5: Locations ────────────────────────────────────────────────────────
function LocationsStep({ projectId, locations, reload }) {
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:'Delete location', message:'Delete this location? This cannot be undone.', confirmLabel:'Delete' }))) return;
    const { error } = await supabase.rpc('delete_project_location', { p_id: row.id });
    if (error) return toast.error(error.message); reload();
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Geographic Implementation <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 7</span></h3>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> Location</button>
      </div>
      {locations.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No locations yet.</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>Province</th><th>Island</th><th>Area Council</th><th>Community</th><th>Beneficiaries</th><th></th></tr></thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id}>
                  <td>{l.province || '—'}</td><td>{l.island || '—'}</td><td>{l.area_council || '—'}</td>
                  <td>{l.community || '—'}</td><td>{l.beneficiaries ?? '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} /></button>
                    <button onClick={() => del(l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {locations.length > 0 && (
        <div className="ps-cards">
          {locations.map((l) => (
            <div className="ps-card" key={l.id}>
              <strong>{l.province || '—'}</strong> · {l.island || '—'} · {l.community || '—'}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button onClick={() => setEditing(l)} style={btn('#475569', { padding: '0.3rem 0.6rem' })}><Pencil size={13} /> Edit</button>
                <button onClick={() => del(l)} style={btn('#dc2626', { padding: '0.3rem 0.6rem' })}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing !== null && (
        <LocationForm projectId={projectId} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function LocationForm({ projectId, initial, onClose, onSaved }) {
  const base = { province: '', island: '', area_council: '', community: '', latitude: '', longitude: '', intervention: '', status: '', beneficiaries: '' };
  const [v, setV] = useState({ ...base, ...(initial?.id ? initial : {}) });
  useEffect(() => setV({ ...base, ...(initial?.id ? initial : {}) }), [initial?.id]); // eslint-disable-line
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setProvince = (e) => setV((s) => ({ ...s, province: e.target.value, island: '', area_council: '' }));
  const save = async () => {
    const { error } = await supabase.rpc('upsert_project_location', {
      p_id: initial?.id ?? null, p_project_id: projectId, p_province: toNull(v.province), p_island: toNull(v.island),
      p_area_council: toNull(v.area_council), p_community: toNull(v.community), p_latitude: toNum(v.latitude),
      p_longitude: toNum(v.longitude), p_intervention: toNull(v.intervention), p_status: toNull(v.status),
      p_beneficiaries: toNum(v.beneficiaries),
    });
    if (error) return toast.error(error.message);
    onSaved();
  };
  return (
    <Modal title={`${initial?.id ? 'Edit' : 'Add'} location`} onClose={onClose} onSave={save} saveLabel={initial?.id ? 'Save' : 'Add'}>
      <Field label="Province"><Select value={v.province ?? ''} onChange={setProvince} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} allowBlank /></Field>
      <Field label="Island"><Select value={v.island ?? ''} onChange={set('island')} options={islandsForProvince(v.province).map((i) => ({ value: i, label: i }))} allowBlank /></Field>
      <Field label="Area Council"><Select value={v.area_council ?? ''} onChange={set('area_council')} options={areaCouncilsForProvince(v.province).map((a) => ({ value: a, label: a }))} allowBlank /></Field>
      <Field label="Community / Site"><input className="field-input" value={v.community ?? ''} onChange={set('community')} /></Field>
      <Field label="Latitude"><input type="number" className="field-input" value={v.latitude ?? ''} onChange={set('latitude')} /></Field>
      <Field label="Longitude"><input type="number" className="field-input" value={v.longitude ?? ''} onChange={set('longitude')} /></Field>
      <Field className="ps-full" label="Intervention / Activity"><input className="field-input" value={v.intervention ?? ''} onChange={set('intervention')} /></Field>
      <Field label="Implementation Status"><input className="field-input" value={v.status ?? ''} onChange={set('status')} /></Field>
      <Field label="Beneficiaries"><input type="number" className="field-input" value={v.beneficiaries ?? ''} onChange={set('beneficiaries')} /></Field>
    </Modal>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────
function Field({ label, children, className }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
function Select({ value, onChange, options, allowBlank }) {
  return (
    <select className="field-input" value={value} onChange={onChange}>
      {allowBlank && <option value="">—</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
function Modal({ title, children, onClose, onSave, saveLabel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }} onClick={onClose}>
      <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 760, padding: '1.2rem', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <strong style={{ fontSize: '1rem' }}>{title}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={18} /></button>
        </div>
        <div className="ps-grid">{children}</div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button style={btn('var(--green-700)')} onClick={onSave}>{saveLabel}</button>
          <button style={ghostBtn} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
