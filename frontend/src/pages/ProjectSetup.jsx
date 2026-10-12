import { officialProjects, currentProjects } from '../lib/docc/projectScope';
import ProjectDetailsForm from '../components/ProjectDetailsForm';
import ProjectDetailsSummary from '../components/ProjectDetailsSummary';
import PendingResultsFrameworks from '../components/PendingResultsFrameworks';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { dbErrorMessage, isMissingRpcArgument } from '../lib/dbError';
import { confirmDialog } from '../lib/confirm';
import PageHeader from '../components/ui/PageHeader';
import ActivityManager from '../components/ActivityManager';
import * as OPT from '../constants/formOptions';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const toNull = (v) => (v === '' || v === undefined ? null : v);
const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const toArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const blankProfile = () => ({
  name: '', acronym: '', description: '', status: 'pipeline', category: '', lead_agency: '',
  executing_agency: '', implementing_partners: [], donor: '', funding_window: '', currency: 'VUV',
  budget_vuv: '', start_date: '', end_date: '', approval_date: '', project_type: '',
  primary_climate_theme: '', coverage_type: '', provinces: [], islands: [], area_councils: [], communities: [],
  project_manager_id: '', me_officer_id: '', finance_officer_id: '',
  project_manager: '', me_officer: '', finance_officer: '',
  est_direct_beneficiaries: '', est_indirect_beneficiaries: '', expected_primary_outcome: '',
});


const FORM_PREVIEWS = [
  {
    form: '4', title: 'Indicator Progress', purpose: 'Tracks progress against approved indicators and targets.',
    fields: [
      { label: 'Indicator *', type: 'select', placeholder: 'Select indicator' },
      { label: 'Target for Reporting Period', type: 'number' },
      { label: 'Actual Achievement This Period', type: 'number' },
      { label: 'Cumulative Achievement', type: 'number', help: 'Enter the cumulative value to the end of this reporting period. Leave blank when it has not been reported; enter 0 only when zero was explicitly measured.' },
      { label: 'Previous Reported Value', type: 'number' },
      { label: 'Performance Status', type: 'select', options: ['On Track', 'Attention Required', 'Off Track', 'Target Achieved', 'No Data'], help: 'Use the same controlled status available in the live reporting form; do not infer a positive status when no data has been reported.' },
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
      { label: 'Cumulative Expenditure', type: 'number', help: 'Total expenditure to date in the project currency. Leave blank when unreported; a recorded zero is different from missing financial information.' },
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
      { label: 'Double-counting Check Completed', type: 'checkbox', help: 'Confirm whether beneficiary records were checked for overlap before totals are aggregated. Youth and disability categories can overlap with sex-disaggregated totals.' },
      { label: 'Comments', type: 'textarea', wide: true },
    ],
  },
  {
    form: '9', title: 'Risks & Issues', purpose: 'Records implementation risks, issues, mitigation and management action.',
    fields: [
      { label: 'Type *', type: 'select', options: ['Risk', 'Issue'] },
      { label: 'Category', type: 'select', options: ['Financial', 'Technical', 'Operational', 'Environmental', 'Social / GEDSI', 'Governance', 'Procurement', 'Safeguards', 'Other'] },
      { label: 'Description *', type: 'textarea', wide: true },
      { label: 'Date Identified', type: 'date' },
      { label: 'Likelihood', type: 'select', options: ['1', '2', '3', '4', '5'], help: 'Use the standard 1–5 likelihood scale used by the live risk form.' },
      { label: 'Impact', type: 'select', options: ['1', '2', '3', '4', '5'], help: 'Use the standard 1–5 impact scale used by the live risk form.' },
      { label: 'Mitigation / Response', type: 'textarea', wide: true },
      { label: 'Responsible Person', type: 'text' },
      { label: 'Due Date', type: 'date' },
      { label: 'Current Status', type: 'select', options: ['Open', 'Monitoring', 'Escalated', 'Resolved', 'Closed'] },
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
      { label: 'Reporting Period Type', type: 'select', options: ['Monthly', 'Quarterly', 'Six-monthly', 'Annual', 'Final', 'Ad hoc'] },
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
      { label: 'Document Type', type: 'select', options: ['Attendance List', 'Photograph', 'Monitoring Report', 'Survey / Data', 'Financial Report', 'Contract', 'Completion Report', 'Evaluation', 'Map', 'Other'] },
      { label: 'Related Indicator', type: 'select', placeholder: 'Select indicator' },
      { label: 'Related Activity', type: 'select', placeholder: 'Select activity' },
      { label: 'Description', type: 'textarea', wide: true },
      { label: 'Document Date', type: 'date' },
      { label: 'File or URL', type: 'text', wide: true },
      { label: 'Verification Status', type: 'select', options: ['Pending', 'Verified', 'Rejected', 'Superseded'] },
    ],
  },
];

function PreviewField({ item }) {
  const typeLabel = item.type === 'select' ? 'Selected from project data'
    : item.type === 'textarea' ? 'Narrative'
    : item.type === 'checkbox' ? 'Yes / No'
    : item.type === 'date' ? 'Date'
    : item.type === 'number' ? 'Numeric'
    : 'Text';
  const helpText = item.help || item.placeholder || (item.type === 'select'
    ? 'The live reporting workspace supplies this value from project setup or the Results Framework.'
    : item.type === 'textarea'
      ? 'A short narrative is entered in the live MERL Reporting workspace.'
      : 'This value is entered in the live MERL Reporting workspace.');
  return (
    <div className={item.wide ? 'ps-reference-field ps-reference-wide' : 'ps-reference-field'}>
      <div className="ps-reference-field-head">
        <span className="field-label">{item.label}</span>
        <span className="ps-reference-kind">{typeLabel}</span>
      </div>
      <p>{helpText}</p>
      {item.options?.length ? <small>Allowed values: {item.options.join(' · ')}</small> : null}
    </div>
  );
}

function ActualMerlForms() {
  return (
    <section className="ps-actual" aria-labelledby="ps-actual-title">
      <div className="ps-actual-head">
        <div>
          <h2 id="ps-actual-title">MERL Form Reference</h2>
          <p>Field examples are read-only. This page explains what each reporting form collects. Actual reporting data is entered, edited, saved and submitted in MERL Reporting; Activities & Workplan (Form 5) is entered under Manage projects.</p>
        </div>
        <a className="ps-live-link" href="#/merl-reporting">Open MERL Reporting →</a>
      </div>

      <div className="ps-reference-callout">
        <strong>Field examples are read-only.</strong>
        <span>Use the field descriptions below to prepare the required information before opening the live reporting workspace.</span>
      </div>

      <div className="ps-reference-list">
        {FORM_PREVIEWS.map((form) => (
          <section className="ps-reference-item" key={form.form}>
            <div className="ps-reference-summary static">
              <span className="ps-form-number">Form {form.form}</span>
              <span className="ps-reference-copy"><strong>{form.title}</strong><small>{form.purpose}</small></span>
              <span className="ps-reference-count">{form.fields.length} fields</span>
            </div>
            <div className="ps-reference-detail">
              <div className="ps-reference-fields">
                {form.fields.map((item) => <PreviewField key={form.form + '-' + item.label} item={item} />)}
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="ps-preview-note"><strong>Reference only.</strong> Nothing on this page can be selected, edited or saved.</div>
    </section>
  );
}

function ProjectConfiguration({ preferredProjectId, canEdit, isAdmin, onEditProject, user }) {
  const routeProjectId = (() => {
    try {
      const query = window.location.hash.split('?')[1] || '';
      return new URLSearchParams(query).get('project') || '';
    } catch { return ''; }
  })();
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showCompletedProjects, setShowCompletedProjects] = useState(false);
  const visibleProjects = showCompletedProjects ? projects : currentProjects(projects);
  const [projectId, setProjectId] = useState('');
  const [indicators, setIndicators] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [kpiEdit, setKpiEdit] = useState({ id: null, indicator_id: '', short_label: '', display_order: 0, show_target: true, show_progress: true, is_public: false, active: true });
  const [orgEdit, setOrgEdit] = useState({ id:null, name:'', short_name:'', organization_type:'', role:'implementing_partner', is_primary:false });
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    const { data: ps, error: pe } = await supabase
      .from('v_projects')
      .select('id,has_results_framework,code,name,acronym,description,status,category,lead_agency,executing_agency,implementing_partners,donor,funding_window,currency,budget_vuv,start_date,end_date,approval_date,project_type,primary_climate_theme,coverage_type,provinces,islands,area_councils,communities,project_manager_id,me_officer_id,finance_officer_id,project_manager,me_officer,finance_officer,est_direct_beneficiaries,est_indirect_beneficiaries,expected_primary_outcome')
      .order('code');
    setLoadingProjects(false);
    if (pe) { toast.error(dbErrorMessage(pe)); return; }
    setProjects(officialProjects(ps || []));
    setProjectId((old) => {
      const requested = preferredProjectId || routeProjectId;
      const preferred = officialProjects(ps || []).some((p) => p.id === requested) ? requested : '';
      if (preferred && !currentProjects(ps || []).some(p => p.id === preferred)) setShowCompletedProjects(true);
      const existing = officialProjects(ps || []).some((p) => p.id === old) ? old : '';
      return preferred || existing || currentProjects(ps || [])[0]?.id || '';
    });
  }, [preferredProjectId]);

  const loadConfig = useCallback(async (pid) => {
    if (!pid) { setIndicators([]); setKpis([]); return; }
    const [i,k,o] = await Promise.all([
      supabase.from('v_project_indicators').select('id,code,name,unit').eq('project_id',pid).order('code'),
      supabase.from('v_dashboard_kpi_config').select('*').eq('project_id',pid).eq('dashboard_scope','project').order('display_order'),
      supabase.from('v_project_organizations').select('*').eq('project_id',pid).order('role').order('name'),
    ]);
    const err=i.error||k.error||o.error;
    if (err) { toast.error(dbErrorMessage(err)); return; }
    setIndicators(i.data||[]); setKpis(k.data||[]); setOrganizations(o.data||[]);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { loadConfig(projectId); }, [projectId, loadConfig]);

  const saveKpi = async () => {
    if (!projectId || !kpiEdit.indicator_id) { toast.error('Select an indicator.'); return; }
    setBusy(true);
    const ind=indicators.find(x=>x.id===kpiEdit.indicator_id);
    const { error } = await supabase.rpc('upsert_dashboard_kpi_config', {
      p_id:kpiEdit.id,p_project_id:projectId,p_indicator_id:kpiEdit.indicator_id,p_dashboard_scope:'project',
      p_short_label:toNull(kpiEdit.short_label?.trim()) || ind?.name || 'Indicator',
      p_display_order:Number(kpiEdit.display_order)||0,p_show_target:!!kpiEdit.show_target,
      p_show_progress:!!kpiEdit.show_progress,p_is_public:!!kpiEdit.is_public,p_active:!!kpiEdit.active,
    });
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('Project KPI saved.');
    setKpiEdit({ id:null, indicator_id:'', short_label:'', display_order:0, show_target:true, show_progress:true, is_public:false, active:true });
    loadConfig(projectId);
  };
  const deleteKpi = async (id) => {
    if (!canEdit) return;
    const row=kpis.find((x)=>x.id===id);
    if (!(await confirmDialog({ title:'Delete KPI card', message:`Remove ${row?.short_label || 'this KPI'} from the dashboard configuration? The indicator itself will not be deleted.`, confirmLabel:'Delete' }))) return;
    const { error } = await supabase.rpc('delete_dashboard_kpi_config',{ p_id:id });
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('KPI card deleted.');
    loadConfig(projectId);
  };

  const saveOrganization = async () => {
    if (!projectId || !orgEdit.name.trim()) { toast.error('Organization name is required.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_project_organization', {
      p_id:orgEdit.id,p_project_id:projectId,p_name:orgEdit.name.trim(),
      p_short_name:toNull(orgEdit.short_name?.trim()),p_organization_type:toNull(orgEdit.organization_type?.trim()),
      p_role:orgEdit.role,p_is_primary:!!orgEdit.is_primary,
    });
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('Donor / partner relationship saved.');
    setOrgEdit({ id:null, name:'', short_name:'', organization_type:'', role:'implementing_partner', is_primary:false });
    loadConfig(projectId);
  };
  const deleteOrganization = async (id) => {
    if (!canEdit) return;
    const row=organizations.find((x)=>x.id===id);
    if (!(await confirmDialog({ title:'Delete donor / partner link', message:`Remove ${row?.name || 'this organization'} from this project? The organization master record will remain available for other projects.`, confirmLabel:'Delete' }))) return;
    const { error } = await supabase.rpc('delete_project_organization',{ p_id:id });
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('Donor / partner relationship deleted.');
    loadConfig(projectId);
  };

  const deleteProject = async () => {
    if (!isAdmin || !projectId) return;
    const project=projects.find((p)=>p.id===projectId);
    if (!(await confirmDialog({
      title:'Delete project and all project data',
      message:`Delete ${project?.code ? project.code + ' — ' : ''}${project?.name || 'this project'}? This permanently removes its framework, indicators, reporting records, finances, beneficiaries, risks, Area Council coverage, partners and related project data.`,
      confirmLabel:'Delete project',
    }))) return;
    setBusy(true);
    const { error } = await supabase.rpc('admin_delete_project',{ p_id:projectId });
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('Project deleted.');
    setProjectId('');
    setIndicators([]); setKpis([]); setOrganizations([]);
    await loadProjects();
  };

  return <section className="ps-config">
    <PendingResultsFrameworks projects={projects} user={user} onSelect={id => { setShowCompletedProjects(true); setProjectId(id); }} />
    <div className="pd-finder">
      <h2>Find your project</h2>
      <label className="pd-field"><span>Search by project name, short name or code</span><input type="search" className="field-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="For example, VCAP2" /></label>
      <label className="pd-show-all"><input type="checkbox" checked={showCompletedProjects} onChange={event => { setShowCompletedProjects(event.target.checked); if (!event.target.checked) setProjectId(currentProjects(projects)[0]?.id || ''); }} /> Show projects without a results framework and completed projects</label>
      <div className="pd-project-list" aria-label="Choose a project">
        {loadingProjects ? <p role="status">Loading projects…</p> : visibleProjects.filter(p => `${p.name} ${p.acronym || ''} ${p.code || ''}`.toLowerCase().includes(search.trim().toLowerCase())).map(p => <button type="button" key={p.id} aria-pressed={p.id === projectId} onClick={() => setProjectId(p.id)}><strong>{p.name}</strong><span>{p.code || p.acronym || 'Open project'}{p.id === projectId ? ' · Selected' : ''}</span></button>)}
        {!loadingProjects && !visibleProjects.some(p => `${p.name} ${p.acronym || ''} ${p.code || ''}`.toLowerCase().includes(search.trim().toLowerCase())) && <p role="status">No matching projects. Try another name or choose Show projects above.</p>}
      </div>
    </div>
    {projectId && projects.find(p => p.id === projectId) && <ProjectDetailsSummary project={projects.find(p => p.id === projectId)} canEdit={canEdit} onEdit={onEditProject} />}
    {projectId && <details className="ps-settings" key={projectId}><summary>Partners, activities and dashboard settings</summary><div className="ps-config-grid">
      <div className="ps-config-card">
        <h3>Donors & Partners</h3>
        <p className="ps-config-note">Donors and partners are stored separately by role so dashboard filters and reports do not mix funding sources with implementing organisations.</p>
        <div className="ps-config-form">
          <label className="full"><span className="field-label">Organization name</span><input className="field-input" value={orgEdit.name} onChange={(e)=>setOrgEdit(s=>({...s,name:e.target.value}))}/></label>
          <label><span className="field-label">Short name</span><input className="field-input" value={orgEdit.short_name||''} onChange={(e)=>setOrgEdit(s=>({...s,short_name:e.target.value}))}/></label>
          <label><span className="field-label">Organization type</span><input className="field-input" value={orgEdit.organization_type||''} onChange={(e)=>setOrgEdit(s=>({...s,organization_type:e.target.value}))} placeholder="e.g. multilateral, NGO, government"/></label>
          <label className="full"><span className="field-label">Role</span><select className="field-input" value={orgEdit.role} onChange={(e)=>setOrgEdit(s=>({...s,role:e.target.value}))}>
            <option value="donor">Donor</option><option value="co_financier">Co-financier</option>
            <option value="accredited_entity">Accredited entity</option><option value="executing_entity">Executing entity</option>
            <option value="implementing_partner">Implementing partner</option><option value="technical_partner">Technical partner</option>
            <option value="government_partner">Government partner</option>
          </select></label>
          <label className="ps-check full"><input type="checkbox" checked={!!orgEdit.is_primary} onChange={(e)=>setOrgEdit(s=>({...s,is_primary:e.target.checked}))}/> Primary organization for this role</label>
        </div>
        <div className="ps-config-actions"><button className="btn btn-secondary" type="button" onClick={()=>setOrgEdit({ id:null, name:'', short_name:'', organization_type:'', role:'implementing_partner', is_primary:false })}>Clear</button><button className="btn btn-primary" type="button" disabled={busy || !canEdit} onClick={saveOrganization}>Save organization</button></div>
        <div className="ps-mini-table"><table><thead><tr><th>Role</th><th>Organization</th><th>Primary</th><th></th></tr></thead><tbody>{organizations.map(o=><tr key={o.id}><td>{String(o.role||'').replaceAll('_',' ')}</td><td><b>{o.name}</b><small>{o.short_name||o.organization_type||''}</small></td><td>{o.is_primary?'Yes':'No'}</td><td>{canEdit && <><button type="button" onClick={()=>setOrgEdit({ id:o.id, name:o.name||'', short_name:o.short_name||'', organization_type:o.organization_type||'', role:o.role||'implementing_partner', is_primary:!!o.is_primary })}>Edit</button><button type="button" className="danger" onClick={()=>deleteOrganization(o.id)}>Delete</button></>}</td></tr>)}</tbody></table></div>
      </div>

      <div className="ps-config-card">
        <h3>Project KPI Cards</h3>
        <div className="ps-config-form">
          <label className="full"><span className="field-label">Official indicator</span><select className="field-input" value={kpiEdit.indicator_id} onChange={(e)=>{const ind=indicators.find(x=>x.id===e.target.value);setKpiEdit(s=>({...s,indicator_id:e.target.value,short_label:s.short_label||ind?.name||''}));}}><option value="">Select indicator</option>{indicators.map(i=><option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}</select></label>
          <label><span className="field-label">Card label</span><input className="field-input" value={kpiEdit.short_label} onChange={(e)=>setKpiEdit(s=>({...s,short_label:e.target.value}))}/></label>
          <label><span className="field-label">Display order</span><input className="field-input" type="number" value={kpiEdit.display_order} onChange={(e)=>setKpiEdit(s=>({...s,display_order:e.target.value}))}/></label>
          <label className="ps-check"><input type="checkbox" checked={kpiEdit.show_target} onChange={(e)=>setKpiEdit(s=>({...s,show_target:e.target.checked}))}/> Show target</label>
          <label className="ps-check"><input type="checkbox" checked={kpiEdit.show_progress} onChange={(e)=>setKpiEdit(s=>({...s,show_progress:e.target.checked}))}/> Show progress</label>
          <label className="ps-check"><input type="checkbox" checked={kpiEdit.is_public} onChange={(e)=>setKpiEdit(s=>({...s,is_public:e.target.checked}))}/> Allow on public dashboard</label>
          <label className="ps-check"><input type="checkbox" checked={kpiEdit.active} onChange={(e)=>setKpiEdit(s=>({...s,active:e.target.checked}))}/> Active</label>
        </div>
        <div className="ps-config-actions"><button className="btn btn-secondary" type="button" onClick={()=>setKpiEdit({ id:null, indicator_id:'', short_label:'', display_order:0, show_target:true, show_progress:true, is_public:false, active:true })}>Clear</button><button className="btn btn-primary" type="button" disabled={busy || !canEdit} onClick={saveKpi}>Save KPI</button></div>
        <div className="ps-mini-table"><table><thead><tr><th>Order</th><th>KPI</th><th>Target</th><th>Progress</th><th></th></tr></thead><tbody>{kpis.map(k=><tr key={k.id}><td>{k.display_order}</td><td><b>{k.short_label}</b></td><td>{k.show_target?'Yes':'No'}</td><td>{k.show_progress?'Yes':'No'}</td><td>{canEdit && <><button type="button" onClick={()=>setKpiEdit({...k})}>Edit</button><button type="button" className="danger" onClick={()=>deleteKpi(k.id)}>Delete</button></>}</td></tr>)}</tbody></table></div>
      </div>
      <ActivityManager projectId={projectId} canEdit={canEdit} />
    </div></details>}
    {isAdmin && projectId && <details className="ps-settings"><summary>Delete this project</summary><p>Deleting a project removes it from the register. This action cannot be undone.</p><button type="button" className="btn btn-secondary" onClick={deleteProject} disabled={busy} style={{color:'var(--red-600)',borderColor:'var(--red-200)'}}>Delete project</button></details>}
  </section>;
}

export default function ProjectSetup({ user }) {
  const canEdit = EDITOR_ROLES.includes(user?.role);
  const [v, setV] = useState(blankProfile);
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState(null);
  const [editId, setEditId] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [mode, setMode] = useState('manage');
  const [selectedId, setSelectedId] = useState(null);
  const [editSection, setEditSection] = useState('all');
  const [saveError, setSaveError] = useState('');
  const title = 'Projects';
  const beginEditProfile = (project, section = 'all') => {
    if (!canEdit) return;
    setEditSection(section);
    setSaveError('');
    if (!project) return;
    const next = blankProfile();
    Object.keys(next).forEach((key) => {
      if (project[key] !== null && project[key] !== undefined) next[key] = project[key];
    });
    next.implementing_partners = toArr(project.implementing_partners);
    next.provinces = toArr(project.provinces);
    next.islands = toArr(project.islands);
    next.area_councils = toArr(project.area_councils);
    next.communities = toArr(project.communities);
    setV(next);
    setEditId(project.id);
    setSelectedId(project.id);
    setRegistered(null);
    setMode('register');
    document.querySelector('.dsh-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!canEdit) {
    return (
      <div className="page-pad" style={{ maxWidth: 1180, margin: '0 auto' }}>
        <PageHeader title={title} />
        <ProjectConfiguration preferredProjectId={null} canEdit={false} isAdmin={false} user={user} />
      </div>
    );
  }

  const save = async (e) => {
    e?.preventDefault();
    if (saving) return;
    setSaveError('');
    if (!v.name.trim()) { setSaveError('Enter a project name before saving.'); return; }
    const budget = toNum(v.budget_vuv);
    if (budget != null && budget < 0) { setSaveError('The approved budget must be zero or more.'); return; }
    if (v.start_date && v.end_date && v.end_date < v.start_date) { setSaveError('The end date must be on or after the start date.'); return; }
    setSaving(true);
    const args = {
      p_id: editId,
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
      p_budget_vuv: budget,
      p_start_date: toNull(v.start_date),
      p_end_date: toNull(v.end_date),
      p_approval_date: toNull(v.approval_date),
      p_project_type: toNull(v.project_type?.trim()),
      p_primary_climate_theme: toNull(v.primary_climate_theme?.trim()),
      p_coverage_type: toNull(v.coverage_type),
      p_provinces: toArr(v.provinces),
      p_islands: toArr(v.islands).map(name => String(name).trim()).filter(Boolean),
      p_area_councils: toArr(v.area_councils).map(name => String(name).trim()).filter(Boolean),
      p_communities: toArr(v.communities).map(name => String(name).trim()).filter(Boolean),
      p_project_manager_id: toNull(v.project_manager_id),
      p_me_officer_id: toNull(v.me_officer_id),
      p_finance_officer_id: toNull(v.finance_officer_id),
      p_est_direct_beneficiaries: toNum(v.est_direct_beneficiaries),
      p_est_indirect_beneficiaries: toNum(v.est_indirect_beneficiaries),
      p_expected_primary_outcome: toNull(v.expected_primary_outcome?.trim()),
      p_project_manager: toNull(v.project_manager?.trim()),
      p_me_officer: toNull(v.me_officer?.trim()),
      p_finance_officer: toNull(v.finance_officer?.trim()),
    };
    try {
      let { data, error } = await supabase.rpc('upsert_project', args);
      if (isMissingRpcArgument(error, 'p_project_manager')) {
        const { p_project_manager: _pm, p_me_officer: _me, p_finance_officer: _fo, ...older } = args;
        ({ data, error } = await supabase.rpc('upsert_project', older));
      }
      setSaving(false);
      if (error) { setSaveError(`Your changes were not saved. ${dbErrorMessage(error)}`); return; }
      const action = editId ? 'updated' : 'registered';
      setRegistered({ id: data, name: v.name.trim(), acronym: v.acronym?.trim(), action });
      setV(blankProfile());
      setEditId(null);
      setResetKey((n) => n + 1);
      toast.success(action === 'updated' ? 'Your changes have been saved.' : 'Your project has been added.');
      setMode('manage');
    } catch { setSaveError('Your changes were not saved. Check your connection and try again.'); }
    finally { setSaving(false); }
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1180, margin: '0 auto' }} key={resetKey}>
      <PageHeader title={title} />
      {mode === 'manage' && <div className="ps-mode-tabs" aria-label="Projects">
        <button type="button" className={mode === 'manage' ? 'active' : ''} onClick={() => { setEditId(null); setMode('manage'); }}>Projects</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => { setEditId(null); setEditSection('all'); setSaveError(''); setV(blankProfile()); setMode('register'); }}>Add project</button>
      </div>}

      {registered && mode === 'manage' && <div role="status" style={{ marginBottom: '1rem', padding: '.8rem 1rem', border: '1px solid #16a34a55', background: '#dcece2', borderRadius: 10, color: '#155e34' }}><strong>{registered.acronym ? `${registered.acronym} — ` : ''}{registered.name}</strong> — {registered.action === 'updated' ? 'Your changes have been saved.' : 'Your project has been added.'}</div>}

      {mode === 'register' && <ProjectDetailsForm values={v} onChange={setV} onSubmit={save} saving={saving} editing={Boolean(editId)} section={editSection} onSectionChange={setEditSection} error={saveError} onCancel={() => { setV(blankProfile()); setEditId(null); setMode('manage'); }} />}

      {mode === 'manage' && <ProjectConfiguration preferredProjectId={registered?.id || selectedId} canEdit={canEdit} isAdmin={user?.role === 'ROLE_ADMIN'} onEditProject={beginEditProfile} user={user} />}

      <style>{`
        .ps-project-summary{margin-top:1rem;padding:1rem;border-radius:10px;background:var(--surface-1)}.ps-project-summary h3{margin:0 0 .5rem;font-size:1rem}.ps-project-summary p{margin:0;white-space:pre-line;color:var(--text-2);line-height:1.6}.ps-settings{margin-top:1rem;border-top:1px solid var(--border);padding-top:1rem}.ps-settings summary{cursor:pointer;font-weight:700;min-height:44px;line-height:1.5}.ps-settings p{color:var(--text-2)}
        .ps-mode-tabs{display:flex;gap:.45rem;flex-wrap:wrap;margin:0 0 1rem;padding:.35rem;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;width:max-content;max-width:100%}.ps-mode-tabs button{border:0;background:transparent;color:var(--text-2);font:inherit;font-size:.78rem;font-weight:700;padding:.5rem .8rem;border-radius:7px;cursor:pointer}.ps-mode-tabs button.active{background:var(--white);color:var(--green-700);box-shadow:0 1px 2px rgba(15,23,42,.08)}
        .ps-config{margin:0;padding:1rem;background:var(--white);border:1px solid var(--border);border-radius:12px}.ps-config-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-end;flex-wrap:wrap}.ps-config-head h2{margin:0;font-size:1.08rem}.ps-config-head p{margin:.25rem 0 0;color:var(--text-3);font-size:.78rem;max-width:700px}.ps-config-head select{min-width:300px}.ps-config-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}.ps-config-card{border:1px solid var(--border);border-radius:10px;padding:.9rem}.ps-config-card h3{margin:0 0 .35rem;font-size:.9rem}.ps-config-note{margin:0 0 .7rem;color:var(--text-3);font-size:.7rem;line-height:1.45}.ps-config-form{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}.ps-config-form label{display:flex;flex-direction:column;gap:.25rem}.ps-config-form .full{grid-column:1/-1}.ps-check{flex-direction:row!important;align-items:center;font-size:.72rem;color:var(--text-2)}.ps-config-actions{display:flex;justify-content:flex-end;gap:.5rem;margin:.65rem 0}.ps-mini-table{overflow:auto;max-height:320px}.ps-mini-table table{width:100%;border-collapse:collapse;font-size:.72rem}.ps-mini-table th,.ps-mini-table td{padding:.45rem;border-top:1px solid var(--border);text-align:left}.ps-mini-table th{font-size:.62rem;text-transform:uppercase;color:var(--text-3)}.ps-mini-table td small{display:block;color:var(--text-3)}.ps-mini-table button{border:0;background:none;color:var(--green-700);font:inherit;cursor:pointer;margin-right:.35rem}.ps-mini-table button.danger{color:#b91c1c}
        .ps-actual{margin:1.2rem 0 0;padding:1rem;background:var(--white);border:1px solid var(--border);border-radius:12px}
        .ps-actual-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem}.ps-actual-head h2{margin:0;font-size:1.08rem}.ps-actual-head p{margin:.3rem 0 0;color:var(--text-3);font-size:.8rem;max-width:790px;line-height:1.5}.ps-live-link{white-space:nowrap;text-decoration:none;font-size:.75rem;font-weight:700;color:var(--green-700);border:1px solid var(--border);border-radius:8px;padding:.5rem .7rem;background:#fff}
        .ps-form-stack{display:grid;gap:1rem}.ps-form-preview{border:1px solid var(--border);border-radius:12px;background:#fff;padding:1rem}.ps-form-title{display:flex;gap:.75rem;align-items:flex-start;padding-bottom:.8rem;margin-bottom:.8rem;border-bottom:1px solid var(--border)}.ps-form-number{flex:0 0 auto;background:var(--green-50);color:var(--green-700);border:1px solid var(--border);border-radius:999px;padding:.28rem .55rem;font-size:.68rem;font-weight:800}.ps-form-title h3{margin:0;font-size:.95rem}.ps-form-title p{margin:.2rem 0 0;color:var(--text-3);font-size:.72rem;line-height:1.4}
        .ps-preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.ps-preview-field{display:flex;flex-direction:column;gap:.3rem}.ps-preview-wide{grid-column:1/-1}.ps-preview-control:disabled{opacity:1;color:var(--text-2);background:#f8fafc;cursor:default}.ps-preview-control:disabled::placeholder{color:#94a3b8}.ps-preview-check{display:flex;align-items:center;gap:.5rem;min-height:42px;padding:.55rem .7rem;background:#f8fafc;border:1px solid var(--border);border-radius:8px;color:var(--text-3);font-size:.75rem}.ps-preview-note{margin:.9rem 0 0;padding:.7rem .8rem;border-radius:8px;background:#f8fafc;color:var(--text-3);font-size:.72rem;line-height:1.45}
        @media(max-width:800px){.ps-config-grid{grid-template-columns:1fr}.ps-config-head select{min-width:0;width:100%}.ps-preview-grid{grid-template-columns:1fr}.ps-preview-wide{grid-column:1}.ps-actual-head{flex-direction:column}.ps-live-link{white-space:normal}}
        @media(max-width:700px){.ps-grid{grid-template-columns:1fr!important}.ps-grid>*{grid-column:1!important}}
        .ps-reference-callout{display:flex;gap:.35rem;flex-direction:column;margin:.85rem 0 1rem;padding:.8rem 1rem;border:1px solid var(--border);border-radius:10px;background:var(--surface-1);font-size:.76rem;color:var(--text-2)}.ps-reference-callout strong{color:var(--text-1);font-size:.8rem}.ps-reference-list{display:grid;gap:.7rem}.ps-reference-item{border:1px solid var(--border);border-radius:10px;background:var(--white);overflow:hidden}.ps-reference-summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:.8rem;padding:.8rem .9rem;background:var(--white)}.ps-reference-copy{min-width:0}.ps-reference-copy strong{display:block;font-size:.84rem;color:var(--text-1)}.ps-reference-copy small{display:block;margin-top:.15rem;color:var(--text-3);font-size:.69rem;line-height:1.4}.ps-reference-count{font-size:.66rem;color:var(--text-3);white-space:nowrap}.ps-reference-detail{border-top:1px solid var(--border);padding:.9rem;background:var(--surface-1)}.ps-reference-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem}.ps-reference-field{border:1px solid var(--border);border-radius:8px;background:var(--white);padding:.7rem}.ps-reference-wide{grid-column:1/-1}.ps-reference-field-head{display:flex;justify-content:space-between;gap:.5rem;align-items:flex-start}.ps-reference-kind{font-size:.6rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em}.ps-reference-field p{margin:.25rem 0 0;color:var(--text-2);font-size:.7rem;line-height:1.4}.ps-reference-field small{display:block;margin-top:.3rem;color:var(--text-3);font-size:.64rem;line-height:1.35}@media(max-width:700px){.ps-reference-summary{grid-template-columns:auto minmax(0,1fr)}.ps-reference-count{display:none}.ps-reference-fields{grid-template-columns:1fr}.ps-reference-wide{grid-column:1}}
      `}</style>
    </div>
  );
}
