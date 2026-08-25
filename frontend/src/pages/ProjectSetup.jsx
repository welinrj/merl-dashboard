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
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Check, Plus, Pencil, Trash2, ChevronRight, ChevronDown, X, ArrowLeft, ArrowRight,
  CheckCircle2, AlertTriangle,
} from '../components/ui/icons';
import { supabase } from '../supabaseClient';
import { confirmDialog } from '../lib/confirm';
import { dbErrorMessage } from '../lib/dbError';
import PageHeader from '../components/ui/PageHeader';
import * as OPT from '../constants/formOptions';
import { islandsForProvince, areaCouncilsForProvince, PROVINCE_LIST } from '../constants/vanuatuGeo';
import { useTranslation } from 'react-i18next';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const STEPS = [
  { key: 'profile',    label: 'ps.projectProfile', form: 'Form 1' },
  { key: 'results',    label: 'ps.resultsFramework', form: 'Form 2' },
  { key: 'indicators', label: 'ps.indicators', form: 'Form 3' },
  { key: 'activities', label: 'ps.activities', form: 'Form 5' },
  { key: 'locations',  label: 'ps.locations', form: 'Form 7' },
];

const btn = (bg, extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.85rem',
  fontSize: '0.8125rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none', cursor: 'pointer',
  color: '#fff', background: bg, ...extra,
});
const ghostBtn = { ...btn('var(--white)'), color: 'var(--text-2)', border: '1px solid var(--border)' };
// These buttons are styled with inline style objects, which cannot express a
// :disabled rule — so a disabled button kept rendering at full strength and read
// as clickable. Spread this alongside the base style whenever `disabled` is set.
const disabledBtn = { opacity: 0.45, cursor: 'not-allowed' };
// Compact text-style row actions (edit/delete on cards) — a filled button per
// row reads heavier than these actions need (spec §11/§12).
const rowGhost = (extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.4rem',
  fontSize: '0.78rem', fontWeight: 600, borderRadius: 'var(--radius-control)', border: 'none',
  cursor: 'pointer', color: 'var(--text-2)', background: 'none', ...extra,
});

export default function ProjectSetup({ user }) {
  const { t } = useTranslation();
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

  // Deep-link from Global Search (§59): ?project=<id> selects that project.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const pid = searchParams.get('project');
    if (pid && projects.some((p) => p.id === pid)) {
      setProjectId(pid);
      setStep('results');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, projects, setSearchParams]);

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
  const setupPct = Math.round((Object.values(completion).filter(Boolean).length / STEPS.length) * 100);

  // Readiness for MERL reporting (§16): concrete, clickable setup issues.
  const issues = useMemo(() => {
    if (!project) return [];
    const out = [];
    if (objectives.length === 0) out.push({ label: t('ps.addObjective'), step: 'results' });
    if (outcomes.length === 0) out.push({ label: t('ps.addOutcome'), step: 'results' });
    if (outputs.length === 0) out.push({ label: t('ps.addOutput'), step: 'results' });
    if (indicators.length === 0) out.push({ label: t('ps.addIndicator'), step: 'indicators' });
    const noBaseline = indicators.filter((i) => i.baseline_value == null).length;
    if (noBaseline) out.push({ label: t('ps.missingBaseline', { count: noBaseline }), step: 'indicators' });
    const noTarget = indicators.filter((i) => i.target_value == null && !i.is_qualitative).length;
    if (noTarget) out.push({ label: t('ps.missingTarget', { count: noTarget }), step: 'indicators' });
    const noFreq = indicators.filter((i) => !i.frequency).length;
    if (noFreq) out.push({ label: t('ps.missingFreq', { count: noFreq }), step: 'indicators' });
    if (activities.length === 0) out.push({ label: t('ps.addActivity'), step: 'activities' });
    if (locations.length === 0) out.push({ label: t('ps.addLocation'), step: 'locations' });
    return out;
  }, [project, objectives, outcomes, outputs, indicators, activities, locations]);

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const goPrev = () => setStep(STEPS[Math.max(0, stepIndex - 1)].key);
  const goNext = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIndex + 1)].key);

  // Why Next is unavailable, in the user's terms — every step after the profile
  // writes against a project id, so there has to be a saved project first.
  const atLastStep = stepIndex === STEPS.length - 1;
  const nextBlockedReason = !project
    ? 'Create the project to continue.'
    : atLastStep ? 'Last step.' : null;
  const nextDisabled = atLastStep || !project;

  if (!canEdit) {
    return (
      <div className="page-pad" style={{ maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)' }}>{t('ps.projectSetup')}</h1>
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
        .ps-sec{grid-column:1 / -1;margin:1.4rem 0 0;padding-bottom:.4rem;
          border-bottom:1px solid var(--border);font-size:.75rem;font-weight:700;
          letter-spacing:.08em;text-transform:uppercase;color:var(--text-3)}
        .ps-sec-first{margin-top:0}
        .field-hint{display:block;margin-top:.25rem;font-size:.72rem;color:var(--text-3)}
        .ps-table{width:100%;border-collapse:collapse;font-size:.85rem}
        .ps-table th,.ps-table td{padding:.5rem .6rem;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}
        .ps-table th{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)}
        .ps-card{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.75rem;margin-bottom:.5rem}
        .ps-cards{display:none}
        @media (max-width:640px){.ps-grid{grid-template-columns:1fr}.ps-desktop{display:none}.ps-cards{display:block}}
      `}</style>

      <PageHeader
        title={t('ps.projectSetup')}
        subtitle="Register a project and build its results framework, indicators, activities and locations. Periodic monitoring is entered later under MERL Reporting."
        actions={project ? (
          <div style={{ textAlign: 'right', minWidth: 170 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: setupPct === 100 ? 'var(--green-700)' : 'var(--text-3)' }}>
              Setup {setupPct}% complete
            </div>
            <div style={{ width: '100%', height: 7, background: 'var(--surface-1)', borderRadius: 9999, marginTop: 5, overflow: 'hidden' }}>
              <div style={{ width: `${setupPct}%`, height: '100%', background: setupPct === 100 ? 'var(--green-600)' : 'var(--gold-500)', transition: 'width 0.25s' }} />
            </div>
          </div>
        ) : null}
      />

      {/* Project selector */}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 320px' }}>
          <label className="field-label">{t('ps.project')}</label>
          <select className="field-input" value={projectId ?? ''} onChange={(e) => { setProjectId(e.target.value || null); setStep('profile'); }}>
            <option value="">— Select a project to edit —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </div>
        <button style={btn('var(--green-700)')} onClick={() => { setProjectId(null); setStep('profile'); }}>
          <Plus size={16} /> {t('ps.newProject')}
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
              {t(s.label)}
            </button>
          );
        })}
      </div>

      {project && (
        <div style={{ marginBottom: '0.75rem', fontSize: '0.8rem', color: 'var(--text-2)' }}>
          {t('ps.editing')} <strong>{project.code}</strong> — {project.name}
          <span style={{ marginLeft: '0.5rem', color: 'var(--text-3)' }}>({OPT.labelOf(OPT.DOCC_PROJECT_STATUS, project.status)})</span>
        </div>
      )}

      {project && (
        <div className="card" style={{ padding: '0.75rem 0.9rem', marginBottom: '0.75rem', borderLeft: `3px solid ${issues.length ? 'var(--gold-500)' : 'var(--green-600)'}` }}>
          {issues.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--green-700)', fontWeight: 700, fontSize: '0.85rem' }}>
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} aria-hidden="true" /> {t('ps.readyForReporting')}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#8a6416', fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} aria-hidden="true" /> {issues.length} setup issue{issues.length === 1 ? '' : 's'} require attention
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                {issues.map((it, i) => (
                  <li key={i} style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                    <button onClick={() => setStep(it.step)}
                      style={{ background: 'none', border: 'none', padding: 0, color: 'var(--green-700)', cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>
                      {it.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
        {step === 'profile' && (
          <ProfileStep project={project} users={users}
            onSaved={async (id) => { await loadProjects(); setProjectId(id); toast.success(t('ps.projectSaved')); }} />
        )}
        {step === 'results' && project && (
          <ResultsStep projectId={projectId} objectives={objectives} outcomes={outcomes} outputs={outputs}
            indicators={indicators} activities={activities} users={users} reload={() => loadFramework(projectId)} />
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
          <p style={{ color: 'var(--text-3)' }}>{t('ps.saveProfileFirst')}</p>
        )}
      </div>

      {/* Wizard nav.
          Next is blocked until the profile is saved, because every later step
          writes against a project id. It used to render in full solid teal
          while disabled — inline styles cannot express :disabled — so it looked
          clickable and simply did nothing. Both buttons now carry a visible
          disabled state, and when Next is blocked the reason is written next to
          it rather than left for the user to work out. */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
        <button style={{ ...ghostBtn, ...(stepIndex === 0 ? disabledBtn : null) }}
          onClick={goPrev} disabled={stepIndex === 0}>
          <ArrowLeft size={15} aria-hidden="true" /> {t('ps.previous')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginLeft: 'auto' }}>
          {nextBlockedReason && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{nextBlockedReason}</span>
          )}
          <button style={{ ...btn('var(--green-700)'), ...(nextDisabled ? disabledBtn : null) }}
            onClick={goNext} disabled={nextDisabled} title={nextBlockedReason || undefined}>
            {t('ps.next')} <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Project Profile ──────────────────────────────────────────────────
function ProfileStep({ project, users, onSaved }) {
  const { t } = useTranslation();
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
    if (!v.name.trim()) { toast.error(t('ps.projectTitleRequired')); return; }
    if (toNum(v.budget_vuv) != null && toNum(v.budget_vuv) < 0) {
      toast.error(t('ps.budgetNegative')); return;
    }
    setSaving(true);
    const { data, error } = await supabase.rpc('upsert_project', {
      p_id: project?.id ?? null, p_name: v.name, p_acronym: toNull(v.acronym), p_description: toNull(v.description),
      p_status: v.status, p_category: toNull(v.category), p_lead_agency: toNull(v.lead_agency),
      p_executing_agency: toNull(v.executing_agency), p_donor: toNull(v.donor), p_funding_window: toNull(v.funding_window),
      p_currency: v.currency, p_budget_vuv: toNum(v.budget_vuv) ?? 0, p_start_date: toNull(v.start_date),
      p_end_date: toNull(v.end_date), p_approval_date: toNull(v.approval_date), p_project_type: toNull(v.project_type),
      p_primary_climate_theme: toNull(v.primary_climate_theme), p_coverage_type: toNull(v.coverage_type),
      p_provinces: toArr(v.provinces), p_project_manager_id: toNull(v.project_manager_id),
      p_me_officer_id: toNull(v.me_officer_id), p_finance_officer_id: toNull(v.finance_officer_id),
      p_est_direct_beneficiaries: toNum(v.est_direct_beneficiaries),
      p_est_indirect_beneficiaries: toNum(v.est_indirect_beneficiaries),
      p_expected_primary_outcome: toNull(v.expected_primary_outcome),
    });
    setSaving(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    onSaved(data);
  };

  const userOpts = users.map((u) => ({ value: u.id, label: u.full_name }));
  return (
    <div>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>{t('ps.projectProfile')} <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 1</span></h3>
      <div className="ps-grid">
        <h4 className="ps-sec ps-sec-first">{t('ps.identification')}</h4>
        <Field className="ps-full" label={t('ps.projectTitleReq')}><input className="field-input" value={v.name} onChange={set('name')} /></Field>
        <Field label={t('ps.acronym')}><input className="field-input" value={v.acronym ?? ''} onChange={set('acronym')} /></Field>
        <Field label={t('ps.status')}><Select value={v.status} onChange={set('status')} options={OPT.DOCC_PROJECT_STATUS} /></Field>
        <Field className="ps-full" label={t('ps.description')}><textarea className="field-input" rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>

        <h4 className="ps-sec">{t('ps.classification')}</h4>
        <Field label={t('ps.themeSector')}><Select value={v.category ?? ''} onChange={set('category')} options={OPT.CLIMATE_THEME} allowBlank /></Field>
        <Field label={t('ps.projectType')}><Select value={v.project_type ?? ''} onChange={set('project_type')} options={OPT.PROJECT_TYPE} allowBlank /></Field>
        <Field label={t('ps.expectedPrimaryOutcome')}><Select value={v.expected_primary_outcome ?? ''} onChange={set('expected_primary_outcome')} options={OPT.EXPECTED_OUTCOME} allowBlank /></Field>

        <h4 className="ps-sec">{t('ps.implementingInstitutions')}</h4>
        <Field label={t('ps.leadDept')}><input className="field-input" value={v.lead_agency ?? ''} onChange={set('lead_agency')} /></Field>
        <Field label={t('ps.executingAgency')}><input className="field-input" value={v.executing_agency ?? ''} onChange={set('executing_agency')} /></Field>

        <h4 className="ps-sec">{t('ps.funding')}</h4>
        <Field label={t('ps.donor')}><Select value={v.donor ?? ''} onChange={set('donor')} options={OPT.DONOR} allowBlank /></Field>
        <Field label={t('ps.fundingWindow')}><input className="field-input" value={v.funding_window ?? ''} onChange={set('funding_window')} /></Field>
        <Field label={t('ps.approvedBudget')}><input type="number" min="0" className="field-input" value={v.budget_vuv} onChange={set('budget_vuv')} /></Field>
        <Field label={t('ps.currency')}><Select value={v.currency} onChange={set('currency')} options={OPT.CURRENCY} /></Field>

        <h4 className="ps-sec">{t('ps.timeline')}</h4>
        <Field label={t('ps.startDate')}><input type="date" className="field-input" value={v.start_date || ''} onChange={set('start_date')} /></Field>
        <Field label={t('ps.endDate')}><input type="date" className="field-input" value={v.end_date || ''} onChange={set('end_date')} /></Field>
        <Field label={t('ps.approvalDate')}><input type="date" className="field-input" value={v.approval_date || ''} onChange={set('approval_date')} /></Field>

        <h4 className="ps-sec">{t('ps.geographicCoverage')}</h4>
        <Field label={t('ps.coverageType')}><Select value={v.coverage_type ?? ''} onChange={set('coverage_type')} options={OPT.COVERAGE_TYPE} allowBlank /></Field>
        <Field label={t('ps.provinces')} hint={t('ps.multiSelectHint')}>
          <select multiple className="field-input" style={{ minHeight: 96 }} value={v.provinces} onChange={setMulti('provinces')}>
            {PROVINCE_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>

        <h4 className="ps-sec">{t('ps.responsibleOfficers')}</h4>
        <Field label={t('ps.projectManager')}><Select value={v.project_manager_id ?? ''} onChange={set('project_manager_id')} options={userOpts} allowBlank /></Field>
        <Field label={t('ps.meOfficer')}><Select value={v.me_officer_id ?? ''} onChange={set('me_officer_id')} options={userOpts} allowBlank /></Field>
        <Field label={t('ps.financeOfficer')}><Select value={v.finance_officer_id ?? ''} onChange={set('finance_officer_id')} options={userOpts} allowBlank /></Field>

        <h4 className="ps-sec">{t('ps.expectedReach')}</h4>
        <Field label={t('ps.estDirect')}><input type="number" min="0" className="field-input" value={v.est_direct_beneficiaries} onChange={set('est_direct_beneficiaries')} /></Field>
        <Field label={t('ps.estIndirect')}><input type="number" min="0" className="field-input" value={v.est_indirect_beneficiaries} onChange={set('est_indirect_beneficiaries')} /></Field>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <button style={{ ...btn('var(--green-700)'), ...(saving ? disabledBtn : null) }} onClick={save} disabled={saving}>{saving ? 'Saving…' : project ? 'Save changes' : 'Create project'}</button>
      </div>
    </div>
  );
}

// ── Step 2: Results Framework (Objective → Outcome → Output) ─────────────────
function ResultsStep({ projectId, objectives, outcomes, outputs, indicators = [], activities = [], users = [], reload }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState({});
  const [editing, setEditing] = useState(null); // { kind, parentId, row }
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));
  const openAdd = (kind, parentId) => setEditing({ kind, parentId, row: null });
  const openEdit = (kind, row) => setEditing({ kind, row });
  const delNode = async (kind, row) => {
    if (!(await confirmDialog({ title:`Delete ${kind}`, message:`Delete ${kind} ${row.code}? Child records are removed too. This cannot be undone.`, confirmLabel:t('ps.deleteLbl') }))) return;
    const rpc = kind === 'objective' ? 'delete_objective' : kind === 'outcome' ? 'delete_outcome' : 'delete_output';
    const { error } = await supabase.rpc(rpc, { p_id: row.id });
    if (error) { toast.error(dbErrorMessage(error)); return; } reload();
  };
  const rowStyle = { display: 'flex', alignItems: 'flex-start', gap: '0.4rem', padding: '0.3rem 0' };
  const codeChip = (c, bg) => ({ fontSize: '0.68rem', fontWeight: 700, color: '#fff', background: bg, padding: '0.12rem 0.4rem', borderRadius: 6, flexShrink: 0, marginTop: 2 });
  const actions = (kind, row) => (
    <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
      <button onClick={() => openEdit(kind, row)} aria-label={`Edit ${kind} ${row.code}`} title={`Edit ${kind}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
      <button onClick={() => delNode(kind, row)} aria-label={`Delete ${kind} ${row.code}`} title={`Delete ${kind}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
    </span>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('ps.resultsFramework')} <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 2</span></h3>
        <button style={btn('var(--green-700)')} onClick={() => openAdd('objective')}><Plus size={14} /> {t('ps.objective')}</button>
      </div>
      {objectives.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noObjectives')}</p>}
      {objectives.map((obj) => {
        const isCollapsed = collapsed[obj.id];
        const ocCount = outcomes.filter((oc) => oc.objective_id === obj.id).length;
        return (
        <div key={obj.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '0.6rem 0.75rem', marginBottom: '0.6rem' }}>
          <div style={rowStyle}>
            <button onClick={() => toggle(obj.id)} aria-label={isCollapsed ? 'Expand' : 'Collapse'} aria-expanded={!isCollapsed}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, marginTop: 1, flexShrink: 0 }}>
              {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            </button>
            <span style={codeChip(obj.code, 'var(--green-700)')}>{obj.code}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{obj.statement}</span>
            {isCollapsed && ocCount > 0 && <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 3 }}>{ocCount} outcome{ocCount === 1 ? '' : 's'}</span>}
            {actions('objective', obj)}
          </div>
          {!isCollapsed && (
          <div style={{ marginLeft: '1rem', borderLeft: '2px solid var(--border)', paddingLeft: '0.7rem' }}>
            {outcomes.filter((oc) => oc.objective_id === obj.id).map((oc) => (
              <div key={oc.id} style={{ marginTop: '0.35rem' }}>
                <div style={rowStyle}>
                  <span style={codeChip(oc.code, '#2563eb')}>{oc.code}</span>
                  <span style={{ fontSize: '0.83rem' }}>{oc.statement}</span>
                  {actions('outcome', oc)}
                </div>
                <div style={{ marginLeft: '1rem', borderLeft: '2px solid var(--border)', paddingLeft: '0.7rem' }}>
                  {outputs.filter((op) => op.outcome_id === oc.id).map((op) => {
                    const ic = indicators.filter((i) => i.output_id === op.id).length;
                    const ac = activities.filter((a) => a.output_id === op.id).length;
                    return (
                    <div key={op.id} style={rowStyle}>
                      <span style={codeChip(op.code, '#7c3aed')}>{op.code}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{op.statement}</span>
                      {(ic > 0 || ac > 0) && (
                        <span style={{ fontSize: '0.64rem', color: 'var(--text-3)', marginTop: 3, whiteSpace: 'nowrap' }}>
                          {ic} ind · {ac} act
                        </span>
                      )}
                      {actions('output', op)}
                    </div>
                    );
                  })}
                  <button onClick={() => openAdd('output', oc.id)} style={{ ...ghostBtn, padding: '0.2rem 0.5rem', marginTop: '0.25rem', fontSize: '0.72rem' }}><Plus size={12} /> {t('ps.output')}</button>
                </div>
              </div>
            ))}
            <button onClick={() => openAdd('outcome', obj.id)} style={{ ...ghostBtn, padding: '0.25rem 0.55rem', marginTop: '0.4rem', fontSize: '0.75rem' }}><Plus size={12} /> {t('ps.outcome')}</button>
          </div>
          )}
        </div>
        );
      })}
      {editing && (
        <ResultModal editing={editing} projectId={projectId} users={users}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
      )}
    </div>
  );
}

// Objective / Outcome / Output form modal (§18-20), using the existing
// create_/update_ RPC parameters (climate theme, expected outcome, notes,
// responsible officer, status). No schema change required.
function ResultModal({ editing, projectId, users, onClose, onSaved }) {
  const { t } = useTranslation();
  const { kind, parentId, row } = editing;
  const base = kind === 'objective'
    ? { statement: '', climate_theme: '', expected_outcome: '', notes: '', status: '' }
    : { statement: '', responsible_officer_id: '', status: '' };
  const [v, setV] = useState({ ...base, ...(row?.id ? row : {}) });
  const dirty = useDirty(v);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    if (!v.statement.trim()) { toast.error(t('ps.statementRequired')); return; }
    const S = v.statement.trim();
    let res;
    if (kind === 'objective') {
      res = row?.id
        ? await supabase.rpc('update_objective', { p_id: row.id, p_statement: S, p_climate_theme: v.climate_theme || null, p_expected_outcome: v.expected_outcome || null, p_notes: v.notes || null, p_status: v.status || null })
        : await supabase.rpc('create_objective', { p_project_id: projectId, p_statement: S, p_climate_theme: v.climate_theme || null, p_expected_outcome: v.expected_outcome || null, p_notes: v.notes || null });
    } else if (kind === 'outcome') {
      res = row?.id
        ? await supabase.rpc('update_outcome', { p_id: row.id, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null, p_status: v.status || null })
        : await supabase.rpc('create_outcome', { p_objective_id: parentId, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null });
    } else {
      res = row?.id
        ? await supabase.rpc('update_output', { p_id: row.id, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null, p_status: v.status || null })
        : await supabase.rpc('create_output', { p_outcome_id: parentId, p_statement: S, p_responsible_officer_id: v.responsible_officer_id || null });
    }
    if (res.error) { toast.error(dbErrorMessage(res.error)); return; }
    toast.success(row?.id ? 'Saved' : 'Added');
    onSaved();
  };
  const title = `${row?.id ? 'Edit' : 'New'} ${kind}`;
  return (
    <Modal title={title.charAt(0).toUpperCase() + title.slice(1)} onClose={onClose} onSave={save} saveLabel={row?.id ? 'Save' : 'Add'} dirty={dirty}>
      <Field label={t('ps.statementReq')} className="ps-full">
        <textarea className="field-input" rows={2} value={v.statement} onChange={set('statement')} />
      </Field>
      {kind === 'objective' && <>
        <Field label={t('ps.climateTheme')}><Select value={v.climate_theme ?? ''} onChange={set('climate_theme')} options={OPT.CLIMATE_THEME} allowBlank /></Field>
        <Field label={t('ps.expectedOutcome')} className="ps-full"><input className="field-input" value={v.expected_outcome ?? ''} onChange={set('expected_outcome')} /></Field>
        <Field label={t('ps.notes')} className="ps-full"><textarea className="field-input" rows={2} value={v.notes ?? ''} onChange={set('notes')} /></Field>
      </>}
      {(kind === 'outcome' || kind === 'output') && (
        <Field label={t('ps.responsibleOfficerLc')}><Select value={v.responsible_officer_id ?? ''} onChange={set('responsible_officer_id')} options={users.map((u) => ({ value: u.id, label: u.full_name }))} allowBlank /></Field>
      )}
      {row?.id && <Field label={t('ps.status')}><Select value={v.status ?? ''} onChange={set('status')} options={OPT.RECORD_STATUS} allowBlank /></Field>}
    </Modal>
  );
}

// ── Step 3: Indicators ───────────────────────────────────────────────────────
const qualTag = { marginLeft: 6, fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-3)', background: 'var(--surface-1)', borderRadius: 4, padding: '0.05rem 0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' };
const miniChip = { fontSize: '0.72rem', color: 'var(--text-2)', background: 'var(--surface-1)', borderRadius: 6, padding: '0.15rem 0.45rem' };

function IndicatorsStep({ projectId, indicators, objectives, outcomes, outputs, users, reload }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:t('ps.deleteIndicator'), message:`Delete indicator ${row.code}? This cannot be undone.`, confirmLabel:t('ps.deleteLbl') }))) return;
    const { error } = await supabase.rpc('delete_project_indicator', { p_id: row.id });
    if (error) return toast.error(dbErrorMessage(error)); reload();
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('ps.indicators')} <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 3</span></h3>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> {t('ps.indicator')}</button>
      </div>
      {indicators.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noIndicators')}</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>{t('ps.code')}</th><th>{t('ps.name')}</th><th>{t('ps.level')}</th><th>{t('ps.linked')}</th><th>{t('ps.unit')}</th><th>{t('ps.baseline')}</th><th>{t('ps.target')}</th><th>{t('ps.frequency')}</th><th></th></tr></thead>
            <tbody>
              {indicators.map((i) => (
                <tr key={i.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{i.code}</td>
                  <td>{i.name}{i.is_qualitative && <span style={qualTag}>{t('ps.qualitative')}</span>}</td>
                  <td>{OPT.labelOf(OPT.INDICATOR_LEVEL, i.indicator_level)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-3)' }}>{i.linked_code ?? '—'}</td>
                  <td>{i.unit ?? '—'}</td>
                  <td>{i.baseline_value ?? '—'}</td>
                  <td>{i.target_value ?? '—'}</td>
                  <td>{i.frequency ? OPT.labelOf(OPT.REPORTING_FREQUENCY, i.frequency) : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(i)} aria-label={`Edit indicator ${i.code ?? ''}`} title={t('ps.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
                    <button onClick={() => del(i)} aria-label={`Delete indicator ${i.code ?? ''}`} title={t('ps.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
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
              <div><strong style={{ fontFamily: 'var(--font-mono)' }}>{i.code}</strong> · {i.name}{i.is_qualitative && <span style={qualTag}>{t('ps.qualitative')}</span>}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 2 }}>
                {OPT.labelOf(OPT.INDICATOR_LEVEL, i.indicator_level)}{i.linked_code ? ` · ${i.linked_code}` : ''}
                {i.frequency ? ` · ${OPT.labelOf(OPT.REPORTING_FREQUENCY, i.frequency)}` : ''}
              </div>
              {/* baseline -> target (§21). Achievement/current come from reporting, not setup. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.8rem' }}>
                <span style={miniChip}>Baseline: <strong>{i.baseline_value ?? '—'}</strong></span>
                <span style={{ color: 'var(--text-3)' }}>→</span>
                <span style={miniChip}>Target: <strong>{i.target_value ?? '—'}</strong></span>
                {i.unit && <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>{i.unit}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button onClick={() => setEditing(i)} style={rowGhost()}><Pencil size={13} /> {t('ps.edit')}</button>
                <button onClick={() => del(i)} style={rowGhost({ color: 'var(--red-600)' })}><Trash2 size={13} /> {t('ps.deleteLbl')}</button>
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
  const { t } = useTranslation();
  const base = {
    name: '', indicator_level: '', definition: '', unit: '', baseline_value: '', baseline_year: '',
    target_value: '', target_date: '', frequency: '', data_source: '', collection_method: '',
    means_of_verification: '', verification_method: '', disaggregation: '', assumptions: '',
    responsible_officer_id: '', objective_id: '', outcome_id: '', output_id: '', is_qualitative: false, higher_is_better: true,
  };
  const [v, setV] = useState({ ...base, ...(initial?.id ? initial : {}) });
  const dirty = useDirty(v);
  useEffect(() => setV({ ...base, ...(initial?.id ? initial : {}) }), [initial?.id]); // eslint-disable-line
  const set = (k, t) => (e) => setV((s) => ({ ...s, [k]: t === 'checkbox' ? e.target.checked : e.target.value }));
  const userOpts = users.map((u) => ({ value: u.id, label: u.full_name }));

  const save = async () => {
    if (!v.name.trim()) return toast.error(t('ps.indicatorNameRequired'));
    const year = toNum(v.baseline_year);
    if (year != null && (year < 1980 || year > 2100)) {
      return toast.error(t('ps.baselineYearRange'));
    }
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
    if (error) return toast.error(dbErrorMessage(error));
    onSaved();
  };
  return (
    <Modal title={`${initial?.id ? 'Edit' : 'Add'} indicator`} onClose={onClose} onSave={save} saveLabel={initial?.id ? 'Save' : 'Add'} dirty={dirty}>
      <Field className="ps-full" label={t('ps.indicatorNameReq')}><input className="field-input" value={v.name} onChange={set('name')} /></Field>
      <Field label={t('ps.level')}><Select value={v.indicator_level ?? ''} onChange={set('indicator_level')} options={OPT.INDICATOR_LEVEL} allowBlank /></Field>
      <Field label={t('ps.unitOfMeasurement')}><input className="field-input" value={v.unit ?? ''} onChange={set('unit')} /></Field>
      <Field className="ps-full" label={t('ps.definition')}><textarea className="field-input" rows={2} value={v.definition ?? ''} onChange={set('definition')} /></Field>
      <Field label={t('ps.baselineValue')}><input type="number" className="field-input" value={v.baseline_value ?? ''} onChange={set('baseline_value')} /></Field>
      <Field label={t('ps.baselineYear')}><input type="number" min="1980" max="2100" className="field-input" value={v.baseline_year ?? ''} onChange={set('baseline_year')} /></Field>
      <Field label={t('ps.finalTarget')}><input type="number" className="field-input" value={v.target_value ?? ''} onChange={set('target_value')} /></Field>
      <Field label={t('ps.targetDate')}><input type="date" className="field-input" value={v.target_date || ''} onChange={set('target_date')} /></Field>
      <Field label={t('ps.reportingFrequency')}><Select value={v.frequency ?? ''} onChange={set('frequency')} options={OPT.REPORTING_FREQUENCY} allowBlank /></Field>
      <Field label={t('ps.responsibleOfficer')}><Select value={v.responsible_officer_id ?? ''} onChange={set('responsible_officer_id')} options={userOpts} allowBlank /></Field>
      <Field label={t('ps.dataSource')}><input className="field-input" value={v.data_source ?? ''} onChange={set('data_source')} /></Field>
      <Field label={t('ps.collectionMethod')}><input className="field-input" value={v.collection_method ?? ''} onChange={set('collection_method')} /></Field>
      <Field label={t('ps.disaggregation')}><input className="field-input" value={v.disaggregation ?? ''} onChange={set('disaggregation')} /></Field>
      <Field label={t('ps.verificationMethod')}><input className="field-input" value={v.verification_method ?? ''} onChange={set('verification_method')} /></Field>
      <Field label={t('ps.linkedObjective')}><Select value={v.objective_id ?? ''} onChange={set('objective_id')} options={objectives.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field label={t('ps.linkedOutcome')}><Select value={v.outcome_id ?? ''} onChange={set('outcome_id')} options={outcomes.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field label={t('ps.linkedOutput')}><Select value={v.output_id ?? ''} onChange={set('output_id')} options={outputs.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field className="ps-full" label={t('ps.assumptions')}><textarea className="field-input" rows={2} value={v.assumptions ?? ''} onChange={set('assumptions')} /></Field>
      <Field label={t('ps.qualitativeIndicator')}><input type="checkbox" checked={!!v.is_qualitative} onChange={set('is_qualitative', 'checkbox')} style={{ width: 18, height: 18 }} /></Field>
      <Field label={t('ps.higherIsBetter')}><input type="checkbox" checked={!!v.higher_is_better} onChange={set('higher_is_better', 'checkbox')} style={{ width: 18, height: 18 }} /></Field>
    </Modal>
  );
}

// ── Step 4: Activities ───────────────────────────────────────────────────────
function ActivitiesStep({ outputs, outcomes, activities, users, reload }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:t('ps.deleteActivity'), message:`Delete activity ${row.code}? This cannot be undone.`, confirmLabel:t('ps.deleteLbl') }))) return;
    const { error } = await supabase.rpc('delete_project_activity', { p_id: row.id });
    if (error) return toast.error(dbErrorMessage(error)); reload();
  };
  if (outputs.length === 0) return <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>Add at least one Output in the Results Framework before creating activities.</p>;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('ps.activities')} <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 5</span></h3>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> {t('ps.activity')}</button>
      </div>
      {activities.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noActivities')}</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>{t('ps.code')}</th><th>{t('ps.title')}</th><th>{t('ps.output')}</th><th>{t('ps.status')}</th><th>{t('ps.progress')}</th><th></th></tr></thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id}>
                  <td>{a.code}</td><td>{a.name}</td><td>{a.output_code}</td>
                  <td>{OPT.labelOf(OPT.ACTIVITY_STATUS, a.status)}</td>
                  <td>{a.physical_progress_pct != null ? `${a.physical_progress_pct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(a)} aria-label={`Edit activity ${a.code ?? ''}`} title={t('ps.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
                    <button onClick={() => del(a)} aria-label={`Delete activity ${a.code ?? ''}`} title={t('ps.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
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
                <button onClick={() => setEditing(a)} style={rowGhost()}><Pencil size={13} /> {t('ps.edit')}</button>
                <button onClick={() => del(a)} style={rowGhost({ color: 'var(--red-600)' })}><Trash2 size={13} /> {t('ps.deleteLbl')}</button>
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
  const { t } = useTranslation();
  const base = {
    name: '', output_id: outputs[0]?.id ?? '', outcome_id: '', description: '', responsible_officer_id: '',
    responsible_org: '', status: 'not_started', province: '', island: '', area_council: '', community: '',
    planned_start_date: '', planned_end_date: '', actual_start_date: '', actual_end_date: '',
    planned_budget: '', actual_expenditure: '', physical_progress_pct: '', key_achievement: '',
    issue_delay: '', next_action: '', next_action_due: '',
  };
  const [v, setV] = useState({ ...base, ...(initial?.id ? initial : {}) });
  const dirty = useDirty(v);
  useEffect(() => setV({ ...base, ...(initial?.id ? initial : {}) }), [initial?.id]); // eslint-disable-line
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setProvince = (e) => setV((s) => ({ ...s, province: e.target.value, island: '', area_council: '' }));
  const userOpts = users.map((u) => ({ value: u.id, label: u.full_name }));

  const save = async () => {
    if (!v.name.trim()) return toast.error(t('ps.activityTitleRequired'));
    if (!v.output_id) return toast.error(t('ps.selectParentOutput'));
    const pct = toNum(v.physical_progress_pct);
    if (pct != null && (pct < 0 || pct > 100)) {
      return toast.error(t('ps.progressRange'));
    }
    if (v.planned_start_date && v.planned_end_date && v.planned_end_date < v.planned_start_date) {
      return toast.error(t('ps.endBeforeStart'));
    }
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
    if (error) return toast.error(dbErrorMessage(error));
    onSaved();
  };
  return (
    <Modal title={`${initial?.id ? 'Edit' : 'Add'} activity`} onClose={onClose} onSave={save} saveLabel={initial?.id ? 'Save' : 'Add'} dirty={dirty}>
      <Field className="ps-full" label={t('ps.activityTitleReq')}><input className="field-input" value={v.name} onChange={set('name')} /></Field>
      <Field label={t('ps.linkedOutputReq')}><Select value={v.output_id} onChange={set('output_id')} options={outputs.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} /></Field>
      <Field label={t('ps.linkedOutcome')}><Select value={v.outcome_id ?? ''} onChange={set('outcome_id')} options={outcomes.map((o) => ({ value: o.id, label: `${o.code} ${o.statement}` }))} allowBlank /></Field>
      <Field className="ps-full" label={t('ps.description')}><textarea className="field-input" rows={2} value={v.description ?? ''} onChange={set('description')} /></Field>
      <Field label={t('ps.responsibleOrg')}><input className="field-input" value={v.responsible_org ?? ''} onChange={set('responsible_org')} /></Field>
      <Field label={t('ps.responsibleOfficer')}><Select value={v.responsible_officer_id ?? ''} onChange={set('responsible_officer_id')} options={userOpts} allowBlank /></Field>
      <Field label={t('ps.status')}><Select value={v.status} onChange={set('status')} options={OPT.ACTIVITY_STATUS} /></Field>
      <Field label={t('ps.physicalProgressPct')}><input type="number" min="0" max="100" className="field-input" value={v.physical_progress_pct ?? ''} onChange={set('physical_progress_pct')} /></Field>
      <Field label={t('ps.province')}><Select value={v.province ?? ''} onChange={setProvince} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} allowBlank /></Field>
      <Field label={t('ps.island')}><Select value={v.island ?? ''} onChange={set('island')} options={islandsForProvince(v.province).map((i) => ({ value: i, label: i }))} allowBlank /></Field>
      <Field label={t('ps.areaCouncil')}><Select value={v.area_council ?? ''} onChange={set('area_council')} options={areaCouncilsForProvince(v.province).map((a) => ({ value: a, label: a }))} allowBlank /></Field>
      <Field label={t('ps.community')}><input className="field-input" value={v.community ?? ''} onChange={set('community')} /></Field>
      <Field label={t('ps.plannedStart')}><input type="date" className="field-input" value={v.planned_start_date || ''} onChange={set('planned_start_date')} /></Field>
      <Field label={t('ps.plannedEnd')}><input type="date" className="field-input" value={v.planned_end_date || ''} onChange={set('planned_end_date')} /></Field>
      <Field label={t('ps.plannedBudget')}><input type="number" className="field-input" value={v.planned_budget ?? ''} onChange={set('planned_budget')} /></Field>
      <Field label={t('ps.actualExpenditure')}><input type="number" className="field-input" value={v.actual_expenditure ?? ''} onChange={set('actual_expenditure')} /></Field>
      <Field className="ps-full" label={t('ps.keyAchievement')}><textarea className="field-input" rows={2} value={v.key_achievement ?? ''} onChange={set('key_achievement')} /></Field>
      <Field label={t('ps.nextAction')}><input className="field-input" value={v.next_action ?? ''} onChange={set('next_action')} /></Field>
      <Field label={t('ps.nextActionDue')}><input type="date" className="field-input" value={v.next_action_due || ''} onChange={set('next_action_due')} /></Field>
    </Modal>
  );
}

// ── Step 5: Locations ────────────────────────────────────────────────────────
function LocationsStep({ projectId, locations, reload }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(null);
  const del = async (row) => {
    if (!(await confirmDialog({ title:t('ps.deleteLocation'), message:t('ps.deleteLocationConfirm'), confirmLabel:t('ps.deleteLbl') }))) return;
    const { error } = await supabase.rpc('delete_project_location', { p_id: row.id });
    if (error) return toast.error(dbErrorMessage(error)); reload();
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('ps.geographicImplementation')} <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Form 7</span></h3>
        <button style={btn('var(--green-700)')} onClick={() => setEditing({})}><Plus size={14} /> {t('ps.location')}</button>
      </div>
      {locations.length === 0 ? <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{t('ps.noLocations')}</p> : (
        <div className="ps-desktop" style={{ overflowX: 'auto' }}>
          <table className="ps-table">
            <thead><tr><th>{t('ps.province')}</th><th>{t('ps.island')}</th><th>{t('ps.areaCouncil')}</th><th>{t('ps.community')}</th><th>{t('ps.beneficiaries')}</th><th></th></tr></thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id}>
                  <td>{l.province || '—'}</td><td>{l.island || '—'}</td><td>{l.area_council || '—'}</td>
                  <td>{l.community || '—'}</td><td>{l.beneficiaries ?? '—'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setEditing(l)} aria-label={`Edit location ${l.code ?? ''}`} title={t('ps.edit')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><Pencil size={14} aria-hidden="true" /></button>
                    <button onClick={() => del(l)} aria-label={`Delete location ${l.code ?? ''}`} title={t('ps.deleteLbl')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)' }}><Trash2 size={14} aria-hidden="true" /></button>
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
                <button onClick={() => setEditing(l)} style={rowGhost()}><Pencil size={13} /> {t('ps.edit')}</button>
                <button onClick={() => del(l)} style={rowGhost({ color: 'var(--red-600)' })}><Trash2 size={13} /> {t('ps.deleteLbl')}</button>
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
  const { t } = useTranslation();
  const base = { province: '', island: '', area_council: '', community: '', latitude: '', longitude: '', intervention: '', status: '', beneficiaries: '' };
  const [v, setV] = useState({ ...base, ...(initial?.id ? initial : {}) });
  const dirty = useDirty(v);
  useEffect(() => setV({ ...base, ...(initial?.id ? initial : {}) }), [initial?.id]); // eslint-disable-line
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setProvince = (e) => setV((s) => ({ ...s, province: e.target.value, island: '', area_council: '' }));
  const save = async () => {
    // Every field here is optional on its own, but a location with none of them
    // is not a location — it used to save as a blank row.
    if (!v.province && !v.island && !v.community.trim()) {
      return toast.error(t('ps.locationEmpty'));
    }
    const { error } = await supabase.rpc('upsert_project_location', {
      p_id: initial?.id ?? null, p_project_id: projectId, p_province: toNull(v.province), p_island: toNull(v.island),
      p_area_council: toNull(v.area_council), p_community: toNull(v.community), p_latitude: toNum(v.latitude),
      p_longitude: toNum(v.longitude), p_intervention: toNull(v.intervention), p_status: toNull(v.status),
      p_beneficiaries: toNum(v.beneficiaries),
    });
    if (error) return toast.error(dbErrorMessage(error));
    onSaved();
  };
  return (
    <Modal title={`${initial?.id ? 'Edit' : 'Add'} location`} onClose={onClose} onSave={save} saveLabel={initial?.id ? 'Save' : 'Add'} dirty={dirty}>
      <Field label={t('ps.province')}><Select value={v.province ?? ''} onChange={setProvince} options={PROVINCE_LIST.map((p) => ({ value: p, label: p }))} allowBlank /></Field>
      <Field label={t('ps.island')}><Select value={v.island ?? ''} onChange={set('island')} options={islandsForProvince(v.province).map((i) => ({ value: i, label: i }))} allowBlank /></Field>
      <Field label={t('ps.areaCouncil')}><Select value={v.area_council ?? ''} onChange={set('area_council')} options={areaCouncilsForProvince(v.province).map((a) => ({ value: a, label: a }))} allowBlank /></Field>
      <Field label={t('ps.communitySite')}><input className="field-input" value={v.community ?? ''} onChange={set('community')} /></Field>
      <Field label={t('ps.latitude')}><input type="number" min="-90" max="90" step="any" className="field-input" value={v.latitude ?? ''} onChange={set('latitude')} /></Field>
      <Field label={t('ps.longitude')}><input type="number" min="-180" max="180" step="any" className="field-input" value={v.longitude ?? ''} onChange={set('longitude')} /></Field>
      <Field className="ps-full" label={t('ps.intervention')}><input className="field-input" value={v.intervention ?? ''} onChange={set('intervention')} /></Field>
      <Field label={t('ps.implementationStatus')}><input className="field-input" value={v.status ?? ''} onChange={set('status')} /></Field>
      <Field label={t('ps.beneficiaries')}><input type="number" min="0" className="field-input" value={v.beneficiaries ?? ''} onChange={set('beneficiaries')} /></Field>
    </Modal>
  );
}

// ── Shared primitives ────────────────────────────────────────────────────────
function Field({ label, children, className, hint }) {
  return (
    <div className={className}>
      <label className="field-label">{label}</label>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
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
// Returns true once the form value differs from its initial snapshot (§22).
function useDirty(v) {
  const ref = useRef();
  if (ref.current === undefined) ref.current = JSON.stringify(v);
  return JSON.stringify(v) !== ref.current;
}

function Modal({ title, children, onClose, onSave, saveLabel, dirty }) {
  const { t } = useTranslation();
  // Unsaved-changes guard (§22): confirm before discarding edits.
  const guardedClose = async () => {
    if (dirty && !(await confirmDialog({
      title: t('ps.discardChangesQ'), message: t('ps.unsavedChanges'),
      confirmLabel: t('ps.discardChanges'), cancelLabel: 'Stay',
    }))) return;
    onClose();
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '1.5rem', overflowY: 'auto' }} onClick={guardedClose}>
      <div style={{ background: 'var(--white)', borderRadius: 14, width: '100%', maxWidth: 760, padding: '1.2rem', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <strong style={{ fontSize: '1rem' }}>{title}</strong>
          <button onClick={guardedClose} aria-label={t('ps.close')} title={t('ps.close')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}><X size={18} aria-hidden="true" /></button>
        </div>
        <div className="ps-grid">{children}</div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button style={btn('var(--green-700)')} onClick={onSave}>{saveLabel}</button>
          <button style={ghostBtn} onClick={guardedClose}>{t('ps.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
