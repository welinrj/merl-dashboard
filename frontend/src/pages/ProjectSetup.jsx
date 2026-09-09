import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const FORM_GUIDE = [
  {
    title: 'Project Profile / Registration',
    purpose: 'Basic information required to register and identify the project.',
    href: '#project-profile',
    fields: ['Project title and acronym', 'Status and project description', 'Theme / sector and project type', 'Expected primary outcome', 'Lead, executing and implementing agencies', 'Project Manager, DoCC M&E Officer and Finance Officer', 'Donor, funding window, approved budget and currency', 'Start, end and approval dates', 'Province / geographic coverage', 'Expected direct and indirect beneficiaries'],
  },
  {
    title: 'Results Framework',
    purpose: 'Defines what the project intends to achieve and how success will be measured.',
    href: '#/analytics/results',
    fields: ['Project objectives', 'Expected outcomes', 'Expected outputs', 'Indicators', 'Baseline values', 'Targets', 'Units of measure', 'Responsible officers and reporting frequency'],
  },
  {
    title: 'Form 4 · Indicator Progress',
    purpose: 'Tracks whether indicators are achieving their targets.',
    href: '#/analytics/reporting',
    fields: ['Indicator being reported', 'Target for the reporting period', 'Actual achievement this period', 'Cumulative achievement', 'Previous reported value', 'Performance status', 'Progress narrative', 'Reason for variance', 'Corrective action', 'Date reported'],
  },
  {
    title: 'Form 6 · Financial Progress',
    purpose: 'Tracks budget, expenditure and financial utilisation.',
    href: '#/analytics/reporting',
    fields: ['Approved project budget', 'Annual budget', 'Budget for the reporting period', 'Expenditure this period', 'Cumulative expenditure', 'Funds received', 'Funds committed', 'Financial narrative / explanation'],
  },
  {
    title: 'Form 8 · Beneficiaries & GEDSI',
    purpose: 'Records who is benefiting from project activities and supports GEDSI reporting.',
    href: '#/analytics/reporting',
    fields: ['Related activity', 'Location', 'Total direct beneficiaries', 'Female, male and other / not reported', 'Youth', 'Persons with disabilities', 'Indirect beneficiaries', 'Other vulnerable groups', 'Data source', 'Double-counting check', 'Comments'],
  },
  {
    title: 'Form 9 · Risks & Issues',
    purpose: 'Tracks problems that may affect implementation and the actions required.',
    href: '#/analytics/reporting',
    fields: ['Risk or issue type', 'Description and category', 'Date identified', 'Likelihood and impact', 'Mitigation / response', 'Responsible person', 'Due date', 'Current status', 'Latest update', 'Resolution date'],
  },
  {
    title: 'Form 10 · Achievements & Learning',
    purpose: 'Captures achievements, challenges, lessons and management response.',
    href: '#/analytics/reporting',
    fields: ['Key achievements', 'Major results', 'Challenges', 'Lessons learned', 'Successful approaches', 'What did not work', 'Corrective actions taken', 'Recommendations', 'Emerging opportunities', 'Next-period priorities', 'Success story'],
  },
  {
    title: 'Form 11 · Reporting Period & Submission',
    purpose: 'Defines the reporting period and manages submission, review and approval.',
    href: '#/analytics/reporting',
    fields: ['Reporting period label', 'Reporting period type', 'Period start date', 'Period end date', 'Submission status', 'Reviewer comments / corrections', 'Approval or reopening reason where applicable'],
  },
  {
    title: 'Form 12 · Evidence / Means of Verification',
    purpose: 'Links supporting evidence to reported activities and results.',
    href: '#/analytics/reporting',
    fields: ['Evidence / document title', 'Document type', 'Related indicator', 'Related activity', 'Description', 'Document date', 'File or URL', 'Verification status'],
  },
];

function FormsGuide() {
  return (
    <section className="ps-guide" aria-labelledby="ps-guide-title">
      <div className="ps-guide-head">
        <div>
          <h2 id="ps-guide-title">MERL Forms & Information Required</h2>
          <p>Use this checklist before entering data. Open any section below to see the information the project team should prepare.</p>
        </div>
        <span>{FORM_GUIDE.length} sections</span>
      </div>
      <div className="ps-guide-grid">
        {FORM_GUIDE.map((form, index) => (
          <details className="ps-guide-card" key={form.title} open={index === 0}>
            <summary>
              <div><strong>{form.title}</strong><small>{form.purpose}</small></div>
              <span>View requirements</span>
            </summary>
            <div className="ps-guide-body">
              <h3>Information needed</h3>
              <ul>{form.fields.map((item) => <li key={item}>{item}</li>)}</ul>
              <a className="ps-guide-link" href={form.href}>{index === 0 ? 'Go to project profile' : 'Open this MERL workspace'} →</a>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function ProjectSetup({ user }) {
  const { t } = useTranslation();
  const canEdit = EDITOR_ROLES.includes(user?.role);
  const [v, setV] = useState(blankProfile);
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const title = 'Project Registration';
  const subtitle = 'Register a new project and review the information required across all MERL forms before reporting.';
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setMulti = (k) => (e) => setV((s) => ({ ...s, [k]: Array.from(e.target.selectedOptions).map((o) => o.value) }));
  const dirty = useMemo(() => Object.entries(v).some(([k, value]) => {
    const base = blankProfile()[k];
    return Array.isArray(value) ? value.length > 0 : String(value ?? '') !== String(base ?? '');
  }), [v]);

  if (!canEdit) {
    return <div className="page-pad" style={{ maxWidth: 1100, margin: '0 auto' }}><h1>{title}</h1><FormsGuide /><p>You do not have permission to register projects, but you can use the form guide above to see what information is required.</p></div>;
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
      <FormsGuide />
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
      <style>{`
        .ps-guide{margin:0 0 1rem;padding:1rem;background:var(--white);border:1px solid var(--border);border-radius:12px}
        .ps-guide-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:.8rem}.ps-guide-head h2{margin:0;font-size:1.05rem}.ps-guide-head p{margin:.3rem 0 0;color:var(--text-3);font-size:.8rem;max-width:760px}.ps-guide-head>span{white-space:nowrap;background:var(--green-50);color:var(--green-700);border:1px solid var(--border);border-radius:999px;padding:.25rem .55rem;font-size:.7rem;font-weight:700}
        .ps-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}.ps-guide-card{border:1px solid var(--border);border-radius:10px;background:#fff;overflow:hidden}.ps-guide-card summary{list-style:none;display:flex;justify-content:space-between;gap:.8rem;align-items:center;padding:.75rem .8rem;cursor:pointer}.ps-guide-card summary::-webkit-details-marker{display:none}.ps-guide-card summary strong{display:block;font-size:.82rem}.ps-guide-card summary small{display:block;margin-top:.18rem;color:var(--text-3);font-size:.68rem;line-height:1.35}.ps-guide-card summary>span{font-size:.66rem;color:var(--green-700);font-weight:700;white-space:nowrap}.ps-guide-card[open] summary{background:var(--green-50)}.ps-guide-body{padding:.75rem .9rem;border-top:1px solid var(--border)}.ps-guide-body h3{margin:0 0 .45rem;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-3)}.ps-guide-body ul{margin:.2rem 0 .7rem;padding-left:1.1rem;columns:2;column-gap:1.4rem}.ps-guide-body li{font-size:.72rem;line-height:1.4;margin-bottom:.28rem;break-inside:avoid}.ps-guide-link{font-size:.72rem;font-weight:700;color:var(--green-700);text-decoration:none}
        @media(max-width:850px){.ps-guide-grid{grid-template-columns:1fr}.ps-guide-body ul{columns:1}}
        @media(max-width:700px){.ps-grid{grid-template-columns:1fr!important}.ps-grid>*{grid-column:1!important}.ps-guide-head{flex-direction:column}}
      `}</style>
    </div>
  );
}