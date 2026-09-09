import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { dbErrorMessage, isMissingRpcArgument } from '../lib/dbError';
import PageHeader from '../components/ui/PageHeader';
import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST } from '../constants/vanuatuGeo';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const blankProfile = () => ({
  name: '', acronym: '', description: '', status: 'pipeline', category: '', lead_agency: '',
  executing_agency: '', implementing_partners: [], donor: '', funding_window: '', currency: 'VUV',
  budget_vuv: '', start_date: '', end_date: '', approval_date: '', project_type: '',
  primary_climate_theme: '', coverage_type: '', provinces: [], islands: [], area_councils: [], communities: [],
  project_manager: '', me_officer: '', finance_officer: '',
  est_direct_beneficiaries: '', est_indirect_beneficiaries: '', expected_primary_outcome: '',
});

const field = { display: 'flex', flexDirection: 'column', gap: '.3rem' };

const FORM_PREVIEWS = [
  {
    form: '4', title: 'Indicator Progress', purpose: 'Tracks progress against approved indicators and targets.',
    fields: [
      { label: 'Indicator *', type: 'select', placeholder: 'Select indicator' },
      { label: 'Target for Reporting Period', type: 'number' },
      { label: 'Actual Achievement This Period', type: 'number' },
      { label: 'Cumulative Achievement', type: 'number' },
      { label: 'Previous Reported Value', type: 'number' },
      { label: 'Performance Status', type: 'select', options: ['On track', 'At risk', 'Off track', 'Completed'] },
      { label: 'Progress Narrative', type: 'textarea', wide: true },
      { label: 'Reason for Variance', type: 'textarea', wide: true },
      { label: 'Corrective Action', type: 'textarea', wide: true },
      { label: 'Date Reported', type: 'date' },
    ],
  },
  {
    form: '6', title: 'Financial Progress', purpose: 'Tracks project budget, expenditure, commitments and utilisation.',
    fields: [
      { label: 'Approved Project Budget', type: 'number' },
      { label: 'Annual Budget', type: 'number' },
      { label: 'Budget for Reporting Period', type: 'number' },
      { label: 'Expenditure This Period', type: 'number' },
      { label: 'Cumulative Expenditure', type: 'number' },
      { label: 'Funds Received', type: 'number' },
      { label: 'Funds Committed', type: 'number' },
      { label: 'Financial Narrative / Explanation', type: 'textarea', wide: true },
    ],
  },
  {
    form: '8', title: 'Beneficiaries & GEDSI', purpose: 'Records direct and indirect beneficiaries with GEDSI disaggregation.',
    fields: [
      { label: 'Related Activity', type: 'select', placeholder: 'Select activity' },
      { label: 'Location', type: 'text' },
      { label: 'Total Direct Beneficiaries', type: 'number' },
      { label: 'Female', type: 'number' },
      { label: 'Male', type: 'number' },
      { label: 'Other / Not Reported', type: 'number' },
      { label: 'Youth', type: 'number' },
      { label: 'Persons with Disabilities', type: 'number' },
      { label: 'Indirect Beneficiaries', type: 'number' },
      { label: 'Other Vulnerable Groups', type: 'text' },
      { label: 'Data Source', type: 'text' },
      { label: 'Double-counting Check Completed', type: 'checkbox' },
      { label: 'Comments', type: 'textarea', wide: true },
    ],
  },
  {
    form: '9', title: 'Risks & Issues', purpose: 'Records implementation risks, issues, mitigation and management action.',
    fields: [
      { label: 'Type *', type: 'select', options: ['Risk', 'Issue'] },
      { label: 'Category', type: 'select', options: ['Technical', 'Financial', 'Operational', 'Safeguards', 'Governance', 'Other'] },
      { label: 'Description *', type: 'textarea', wide: true },
      { label: 'Date Identified', type: 'date' },
      { label: 'Likelihood', type: 'select', options: ['Low', 'Medium', 'High'] },
      { label: 'Impact', type: 'select', options: ['Low', 'Medium', 'High'] },
      { label: 'Mitigation / Response', type: 'textarea', wide: true },
      { label: 'Responsible Person', type: 'text' },
      { label: 'Due Date', type: 'date' },
      { label: 'Current Status', type: 'select', options: ['Open', 'Monitoring', 'Resolved', 'Closed'] },
      { label: 'Latest Update', type: 'textarea', wide: true },
      { label: 'Date Resolved', type: 'date' },
    ],
  },
  {
    form: '10', title: 'Achievements & Learning', purpose: 'Captures achievements, challenges, lessons and management response.',
    fields: [
      { label: 'Key Achievements', type: 'textarea', wide: true },
      { label: 'Major Results', type: 'textarea', wide: true },
      { label: 'Challenges', type: 'textarea', wide: true },
      { label: 'Lessons Learned', type: 'textarea', wide: true },
      { label: 'Successful Approaches', type: 'textarea', wide: true },
      { label: 'What Did Not Work', type: 'textarea', wide: true },
      { label: 'Corrective Actions Taken', type: 'textarea', wide: true },
      { label: 'Recommendations', type: 'textarea', wide: true },
      { label: 'Emerging Opportunities', type: 'textarea', wide: true },
      { label: 'Next-period Priorities', type: 'textarea', wide: true },
      { label: 'Success Story', type: 'textarea', wide: true },
    ],
  },
  {
    form: '11', title: 'Reporting Period & Submission', purpose: 'Defines the reporting period and manages submission, review and approval.',
    fields: [
      { label: 'Reporting Period Label *', type: 'text', placeholder: 'e.g. Q1 2026' },
      { label: 'Reporting Period Type', type: 'select', options: ['Monthly', 'Quarterly', 'Semi-annual', 'Annual', 'Other'] },
      { label: 'Period Start Date', type: 'date' },
      { label: 'Period End Date', type: 'date' },
      { label: 'Submission Status', type: 'select', options: ['Draft', 'Submitted', 'Returned', 'Reviewed', 'Approved'] },
      { label: 'Reviewer Comments / Corrections', type: 'textarea', wide: true },
      { label: 'Approval / Reopening Reason', type: 'textarea', wide: true },
    ],
  },
  {
    form: '12', title: 'Evidence / Means of Verification', purpose: 'Links supporting evidence to reported activities and results.',
    fields: [
      { label: 'Evidence / Document Title *', type: 'text' },
      { label: 'Document Type', type: 'select', options: ['Report', 'Photo', 'Attendance Sheet', 'Dataset', 'Map', 'Invoice', 'Other'] },
      { label: 'Related Indicator', type: 'select', placeholder: 'Select indicator' },
      { label: 'Related Activity', type: 'select', placeholder: 'Select activity' },
      { label: 'Description', type: 'textarea', wide: true },
      { label: 'Document Date', type: 'date' },
      { label: 'File or URL', type: 'text', wide: true },
      { label: 'Verification Status', type: 'select', options: ['Pending', 'Verified', 'Rejected'] },
    ],
  },
];

function PreviewField({ item }) {
  const common = { className: 'field-input ps-preview-control', disabled: true, 'aria-label': item.label };
  let control;
  if (item.type === 'textarea') control = <textarea {...common} rows={3} placeholder="Enter information here" />;
  else if (item.type === 'select') control = <select {...common} defaultValue=""><option value="">{item.placeholder || 'Select'}</option>{(item.options || []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  else if (item.type === 'checkbox') control = <div className="ps-preview-check"><input type="checkbox" disabled /><span>Yes / completed</span></div>;
  else control = <input {...common} type={item.type || 'text'} placeholder={item.placeholder || (item.type === 'number' ? '0' : 'Enter information')} />;
  return <label className={item.wide ? 'ps-preview-field ps-preview-wide' : 'ps-preview-field'}><span className="field-label">{item.label}</span>{control}</label>;
}

function ActualMerlForms() {
  return (
    <section className="ps-actual" aria-labelledby="ps-actual-title">
      <div className="ps-actual-head">
        <div>
          <h2 id="ps-actual-title">Actual MERL Reporting Forms</h2>
          <p>These are the same fields users complete in the live MERL Reporting workspace. They are displayed here so project teams can see the full forms and prepare the required information before reporting.</p>
        </div>
        <a className="ps-live-link" href="#/analytics/reporting">Open live MERL Reporting →</a>
      </div>
      <div className="ps-form-stack">
        {FORM_PREVIEWS.map((form) => (
          <section className="ps-form-preview" key={form.form}>
            <div className="ps-form-title">
              <span className="ps-form-number">Form {form.form}</span>
              <div><h3>{form.title}</h3><p>{form.purpose}</p></div>
            </div>
            <div className="ps-preview-grid">{form.fields.map((item) => <PreviewField key={`${form.form}-${item.label}`} item={item} />)}</div>
          </section>
        ))}
      </div>
      <p className="ps-preview-note">Preview only on Project Setup. Register the project first, then use the live MERL Reporting workspace to enter, save, submit, review and approve these records.</p>
    </section>
  );
}

export default function ProjectSetup({ user }) {
  const canEdit = EDITOR_ROLES.includes(user?.role);
  const [v, setV] = useState(blankProfile);
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const title = 'Project Registration';
  const subtitle = 'Register a new project and see the complete MERL reporting forms required after project setup.';
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setMulti = (k) => (e) => setV((s) => ({ ...s, [k]: Array.from(e.target.selectedOptions).map((o) => o.value) }));
  const dirty = useMemo(() => Object.entries(v).some(([k, value]) => {
    const base = blankProfile()[k];
    return Array.isArray(value) ? value.length > 0 : String(value ?? '') !== String(base ?? '');
  }), [v]);

  if (!canEdit) {
    return <div className="page-pad" style={{ maxWidth: 1100, margin: '0 auto' }}><h1>{title}</h1><p>You do not have permission to register projects. You can still review the actual MERL reporting forms below.</p><ActualMerlForms /></div>;
  }

  const save = async (e) => {
    e?.preventDefault();
    if (!v.name.trim()) { toast.error('Project title is required.'); return; }
    const budget = toNum(v.budget_vuv);
    if (budget != null && budget < 0) { toast.error('Approved budget cannot be negative.'); return; }
    if (v.start_date && v.end_date && v.end_date < v.start_date) { toast.error('End date cannot be earlier than start date.'); return; }
    setSaving(true);
    const args = {
      p_id: null,
      p_name: v.name.trim(),
      p_acronym: toNull(v.acronym?.trim()),
      p_description: toNull(v.description?.trim()),
      p_status: v.status,
      p_category: toNull(v.category?.trim()),
      p_lead_agency: toNull(v.lead_agency?.trim()),
      p_executing_agency: toNull(v.executing_agency?.trim()),
      p_implementing_partners: toArr(v.implementing_partners),
      p_donor: toNull(v.donor),
      p_funding_window: toNull(v.funding_window?.trim()),
      p_currency: v.currency || 'VUV',
      p_budget_vuv: budget ?? 0,
      p_start_date: toNull(v.start_date),
      p_end_date: toNull(v.end_date),
      p_approval_date: toNull(v.approval_date),
      p_project_type: toNull(v.project_type?.trim()),
      p_primary_climate_theme: toNull(v.primary_climate_theme?.trim()),
      p_coverage_type: toNull(v.coverage_type),
      p_provinces: toArr(v.provinces),
      p_islands: toArr(v.islands),
      p_area_councils: toArr(v.area_councils),
      p_communities: toArr(v.communities),
      p_project_manager_id: null,
      p_me_officer_id: null,
      p_finance_officer_id: null,
      p_est_direct_beneficiaries: toNum(v.est_direct_beneficiaries),
      p_est_indirect_beneficiaries: toNum(v.est_indirect_beneficiaries),
      p_expected_primary_outcome: toNull(v.expected_primary_outcome?.trim()),
      p_project_manager: toNull(v.project_manager?.trim()),
      p_me_officer: toNull(v.me_officer?.trim()),
      p_finance_officer: toNull(v.finance_officer?.trim()),
    };
    let { data, error } = await supabase.rpc('upsert_project', args);
    if (isMissingRpcArgument(error, 'p_project_manager')) {
      const { p_project_manager: _pm, p_me_officer: _me, p_finance_officer: _fo, ...older } = args;
      ({ data, error } = await supabase.rpc('upsert_project', older));
    }
    setSaving(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    setRegistered({ id: data, name: v.name.trim(), acronym: v.acronym?.trim() });
    setV(blankProfile());
    setResetKey((n) => n + 1);
    toast.success('Project registered successfully.');
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1180, margin: '0 auto' }} key={resetKey}>
      <PageHeader title={title} subtitle={subtitle} />
      {registered && <div role="status" style={{ marginBottom: '1rem', padding: '.8rem 1rem', border: '1px solid #16a34a55', background: '#dcece2', borderRadius: 10, color: '#155e34' }}><strong>{registered.acronym ? `${registered.acronym} — ` : ''}{registered.name}</strong> was registered. The form has been cleared for the next project.</div>}
      <form onSubmit={save} id="project-profile">
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Project Profile</h2>
          <div className="ps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '.8rem' }}>
            <label style={{ ...field, gridColumn: '1 / -1' }}><span className="field-label">Project Title *</span><input className="field-input" value={v.name} onChange={set('name')} required /></label>
            <label style={field}><span className="field-label">Acronym</span><input className="field-input" value={v.acronym} onChange={set('acronym')} /></label>
            <label style={field}><span className="field-label">Status</span><select className="field-input" value={v.status} onChange={set('status')}>{OPT.DOCC_PROJECT_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label style={{ ...field, gridColumn: '1 / -1' }}><span className="field-label">Description</span><textarea className="field-input" rows={3} value={v.description} onChange={set('description')} /></label>

            <h3 style={{ gridColumn: '1 / -1', margin: '.8rem 0 0', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>Classification</h3>
            <label style={field}><span className="field-label">Theme / Sector</span><input className="field-input" value={v.category} onChange={set('category')} /></label>
            <label style={field}><span className="field-label">Project Type</span><input className="field-input" value={v.project_type} onChange={set('project_type')} /></label>
            <label style={{ ...field, gridColumn: '1 / -1' }}><span className="field-label">Expected Primary Outcome</span><input className="field-input" value={v.expected_primary_outcome} onChange={set('expected_primary_outcome')} /></label>

            <h3 style={{ gridColumn: '1 / -1', margin: '.8rem 0 0', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>Institutions</h3>
            <label style={field}><span className="field-label">Lead Department / Agency</span><input className="field-input" value={v.lead_agency} onChange={set('lead_agency')} /></label>
            <label style={field}><span className="field-label">Executing Agency</span><input className="field-input" value={v.executing_agency} onChange={set('executing_agency')} /></label>
            <label style={field}><span className="field-label">Project Manager</span><input className="field-input" value={v.project_manager} onChange={set('project_manager')} /></label>
            <label style={field}><span className="field-label">DoCC M&E Officer</span><input className="field-input" value={v.me_officer} onChange={set('me_officer')} /></label>
            <label style={field}><span className="field-label">Finance Officer</span><input className="field-input" value={v.finance_officer} onChange={set('finance_officer')} /></label>

            <h3 style={{ gridColumn: '1 / -1', margin: '.8rem 0 0', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>Funding & Timeline</h3>
            <label style={field}><span className="field-label">Donor / Source of Funding</span><select className="field-input" value={v.donor} onChange={set('donor')}><option value="">Select</option>{OPT.DONOR.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label style={field}><span className="field-label">Funding Window</span><input className="field-input" value={v.funding_window} onChange={set('funding_window')} /></label>
            <label style={field}><span className="field-label">Approved Budget</span><input className="field-input" type="number" min="0" value={v.budget_vuv} onChange={set('budget_vuv')} /></label>
            <label style={field}><span className="field-label">Currency</span><select className="field-input" value={v.currency} onChange={set('currency')}>{OPT.CURRENCY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label style={field}><span className="field-label">Start Date</span><input className="field-input" type="date" value={v.start_date} onChange={set('start_date')} /></label>
            <label style={field}><span className="field-label">End Date</span><input className="field-input" type="date" value={v.end_date} onChange={set('end_date')} /></label>
            <label style={field}><span className="field-label">Approval Date</span><input className="field-input" type="date" value={v.approval_date} onChange={set('approval_date')} /></label>

            <h3 style={{ gridColumn: '1 / -1', margin: '.8rem 0 0', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>Geographic Coverage</h3>
            <label style={field}><span className="field-label">Coverage Type</span><select className="field-input" value={v.coverage_type} onChange={set('coverage_type')}><option value="">Select</option>{OPT.COVERAGE_TYPE.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
            <label style={field}><span className="field-label">Provinces</span><select multiple className="field-input" style={{ minHeight: 105 }} value={v.provinces} onChange={setMulti('provinces')}>{PROVINCE_LIST.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>

            <h3 style={{ gridColumn: '1 / -1', margin: '.8rem 0 0', fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-3)' }}>Expected Beneficiaries</h3>
            <label style={field}><span className="field-label">Direct Beneficiaries</span><input className="field-input" type="number" min="0" value={v.est_direct_beneficiaries} onChange={set('est_direct_beneficiaries')} /></label>
            <label style={field}><span className="field-label">Indirect Beneficiaries</span><input className="field-input" type="number" min="0" value={v.est_indirect_beneficiaries} onChange={set('est_indirect_beneficiaries')} /></label>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '.6rem', marginTop: '1rem' }}>
          <button type="button" className="btn btn-secondary" disabled={!dirty || saving} onClick={() => setV(blankProfile())}>Clear form</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Registering…' : 'Register project'}</button>
        </div>
      </form>

      <ActualMerlForms />

      <style>{`
        .ps-actual{margin:1.2rem 0 0;padding:1rem;background:var(--white);border:1px solid var(--border);border-radius:12px}
        .ps-actual-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem}.ps-actual-head h2{margin:0;font-size:1.08rem}.ps-actual-head p{margin:.3rem 0 0;color:var(--text-3);font-size:.8rem;max-width:790px;line-height:1.5}.ps-live-link{white-space:nowrap;text-decoration:none;font-size:.75rem;font-weight:700;color:var(--green-700);border:1px solid var(--border);border-radius:8px;padding:.5rem .7rem;background:#fff}
        .ps-form-stack{display:grid;gap:1rem}.ps-form-preview{border:1px solid var(--border);border-radius:12px;background:#fff;padding:1rem}.ps-form-title{display:flex;gap:.75rem;align-items:flex-start;padding-bottom:.8rem;margin-bottom:.8rem;border-bottom:1px solid var(--border)}.ps-form-number{flex:0 0 auto;background:var(--green-50);color:var(--green-700);border:1px solid var(--border);border-radius:999px;padding:.28rem .55rem;font-size:.68rem;font-weight:800}.ps-form-title h3{margin:0;font-size:.95rem}.ps-form-title p{margin:.2rem 0 0;color:var(--text-3);font-size:.72rem;line-height:1.4}
        .ps-preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.ps-preview-field{display:flex;flex-direction:column;gap:.3rem}.ps-preview-wide{grid-column:1/-1}.ps-preview-control:disabled{opacity:1;color:var(--text-2);background:#f8fafc;cursor:default}.ps-preview-control:disabled::placeholder{color:#94a3b8}.ps-preview-check{display:flex;align-items:center;gap:.5rem;min-height:42px;padding:.55rem .7rem;background:#f8fafc;border:1px solid var(--border);border-radius:8px;color:var(--text-3);font-size:.75rem}.ps-preview-note{margin:.9rem 0 0;padding:.7rem .8rem;border-radius:8px;background:#f8fafc;color:var(--text-3);font-size:.72rem;line-height:1.45}
        @media(max-width:800px){.ps-preview-grid{grid-template-columns:1fr}.ps-preview-wide{grid-column:1}.ps-actual-head{flex-direction:column}.ps-live-link{white-space:normal}}
        @media(max-width:700px){.ps-grid{grid-template-columns:1fr!important}.ps-grid>*{grid-column:1!important}}
      `}</style>
    </div>
  );
}