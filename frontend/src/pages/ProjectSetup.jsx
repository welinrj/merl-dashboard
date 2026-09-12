import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { dbErrorMessage, isMissingRpcArgument } from '../lib/dbError';
import { confirmDialog } from '../lib/confirm';
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
        <a className="ps-live-link" href="#/merl-reporting">Open live MERL Reporting →</a>
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


function ProjectConfiguration({ preferredProjectId, canEdit, isAdmin }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [refs, setRefs] = useState([]);
  const [areas, setAreas] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [kpis, setKpis] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [areaEdit, setAreaEdit] = useState({ id: null, area_council_name: '', coverage_status: 'active', feasibility_status: 'not_assessed', feasibility_note: '' });
  const [kpiEdit, setKpiEdit] = useState({ id: null, indicator_id: '', short_label: '', display_order: 0, show_target: true, show_progress: true, is_public: false, active: true });
  const [orgEdit, setOrgEdit] = useState({ id:null, name:'', short_name:'', organization_type:'', role:'implementing_partner', is_primary:false });
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    const [{ data: ps, error: pe }, { data: rs, error: re }] = await Promise.all([
      supabase.from('v_projects').select('id,code,name').order('code'),
      supabase.from('v_ref_area_councils').select('*').order('province_code').order('name'),
    ]);
    if (pe || re) { toast.error(dbErrorMessage(pe || re)); return; }
    setProjects(ps || []);
    setRefs(rs || []);
    setProjectId((old) => {
      const preferred = (ps || []).some((p) => p.id === preferredProjectId) ? preferredProjectId : '';
      const existing = (ps || []).some((p) => p.id === old) ? old : '';
      return preferred || existing || ps?.[0]?.id || '';
    });
  }, [preferredProjectId]);

  const loadConfig = useCallback(async (pid) => {
    if (!pid) { setAreas([]); setIndicators([]); setKpis([]); return; }
    const [a,i,k,o] = await Promise.all([
      supabase.from('v_project_area_councils').select('*').eq('project_id',pid).order('province_code').order('area_council_name'),
      supabase.from('v_project_indicators').select('id,code,name,unit').eq('project_id',pid).order('code'),
      supabase.from('v_dashboard_kpi_config').select('*').eq('project_id',pid).eq('dashboard_scope','project').order('display_order'),
      supabase.from('v_project_organizations').select('*').eq('project_id',pid).order('role').order('name'),
    ]);
    const err=a.error||i.error||k.error||o.error;
    if (err) { toast.error(dbErrorMessage(err)); return; }
    setAreas(a.data||[]); setIndicators(i.data||[]); setKpis(k.data||[]); setOrganizations(o.data||[]);
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { loadConfig(projectId); }, [projectId, loadConfig]);

  const saveArea = async () => {
    if (!projectId || !areaEdit.area_council_name) { toast.error('Select an Area Council.'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('upsert_project_area_council', {
      p_id: areaEdit.id, p_project_id: projectId, p_area_council_name: areaEdit.area_council_name,
      p_coverage_status: areaEdit.coverage_status, p_feasibility_status: areaEdit.feasibility_status,
      p_feasibility_note: toNull(areaEdit.feasibility_note?.trim()),
    });
    setBusy(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('Area Council coverage saved.');
    setAreaEdit({ id:null, area_council_name:'', coverage_status:'active', feasibility_status:'not_assessed', feasibility_note:'' });
    loadConfig(projectId);
  };
  const deleteArea = async (id) => {
    if (!canEdit) return;
    const row=areas.find((x)=>x.id===id);
    if (!(await confirmDialog({ title:'Delete Area Council coverage', message:`Remove ${row?.area_council_name || 'this Area Council'} from this project's coverage? This cannot be undone.`, confirmLabel:'Delete' }))) return;
    const { error } = await supabase.rpc('delete_project_area_council',{ p_id:id });
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('Area Council coverage deleted.');
    loadConfig(projectId);
  };
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
    toast.success('Donor / partner link deleted.');
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
    setAreas([]); setIndicators([]); setKpis([]); setOrganizations([]);
    await loadProjects();
  };

  return <section className="ps-config">
    <div className="ps-config-head">
      <div><h2>Coverage & Dashboard Configuration</h2><p>Manage the selected project's Area Council coverage/feasibility and choose which official indicators appear as project KPI cards.</p>{!canEdit && <p style={{color:'var(--text-3)',fontSize:'.7rem'}}>Read-only access: deletion and editing are available to authorised project editors.</p>}</div>
      <div style={{display:'flex',gap:'.5rem',alignItems:'end',flexWrap:'wrap'}}>
        <select className="field-input" value={projectId} onChange={(e)=>setProjectId(e.target.value)}>
          <option value="">Select project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
        </select>
        {isAdmin && projectId && <button type="button" className="btn btn-secondary" onClick={deleteProject} disabled={busy} style={{color:'var(--red-600)',borderColor:'var(--red-200)'}}>Delete project</button>}
      </div>
    </div>
    {projectId && <div className="ps-config-grid">
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
        <h3>Area Council Coverage & Feasibility</h3>
        <div className="ps-config-form">
          <label><span className="field-label">Area Council</span><select className="field-input" value={areaEdit.area_council_name} onChange={(e)=>setAreaEdit(s=>({...s,area_council_name:e.target.value}))}><option value="">Select</option>{refs.map(r=><option key={`${r.province_code}-${r.name}`} value={r.name}>{r.province_code} — {r.name}</option>)}</select></label>
          <label><span className="field-label">Coverage</span><select className="field-input" value={areaEdit.coverage_status} onChange={(e)=>setAreaEdit(s=>({...s,coverage_status:e.target.value}))}><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option><option value="not_covered">Not covered</option></select></label>
          <label><span className="field-label">Feasibility</span><select className="field-input" value={areaEdit.feasibility_status} onChange={(e)=>setAreaEdit(s=>({...s,feasibility_status:e.target.value}))}><option value="not_assessed">Not assessed</option><option value="under_assessment">Under assessment</option><option value="confirmed">Confirmed</option><option value="conditional">Conditional</option><option value="not_feasible">Not feasible</option></select></label>
          <label className="full"><span className="field-label">Feasibility note</span><textarea className="field-input" rows={2} value={areaEdit.feasibility_note} onChange={(e)=>setAreaEdit(s=>({...s,feasibility_note:e.target.value}))}/></label>
        </div>
        <div className="ps-config-actions"><button className="btn btn-secondary" type="button" onClick={()=>setAreaEdit({ id:null, area_council_name:'', coverage_status:'active', feasibility_status:'not_assessed', feasibility_note:'' })}>Clear</button><button className="btn btn-primary" type="button" disabled={busy || !canEdit} onClick={saveArea}>Save coverage</button></div>
        <div className="ps-mini-table"><table><thead><tr><th>Area Council</th><th>Coverage</th><th>Feasibility</th><th></th></tr></thead><tbody>{areas.map(r=><tr key={r.id}><td><b>{r.area_council_name}</b><small>{r.province_code||''}</small></td><td>{r.coverage_status.replaceAll('_',' ')}</td><td>{r.feasibility_status.replaceAll('_',' ')}</td><td>{canEdit && <><button type="button" onClick={()=>setAreaEdit({...r,feasibility_note:r.feasibility_note||''})}>Edit</button><button type="button" className="danger" onClick={()=>deleteArea(r.id)}>Delete</button></>}</td></tr>)}</tbody></table></div>
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
    </div>}
  </section>;
}

export default function ProjectSetup({ user }) {
  const canEdit = EDITOR_ROLES.includes(user?.role);
  const [v, setV] = useState(blankProfile);
  const [saving, setSaving] = useState(false);
  const [registered, setRegistered] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const [mode, setMode] = useState('manage');
  const title = 'Project Setup';
  const subtitle = 'Manage project profiles, Area Council coverage, donors and partners, and dashboard KPI configuration.';
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setMulti = (k) => (e) => setV((s) => ({ ...s, [k]: Array.from(e.target.selectedOptions).map((o) => o.value) }));
  const dirty = useMemo(() => Object.entries(v).some(([k, value]) => {
    const base = blankProfile()[k];
    return Array.isArray(value) ? value.length > 0 : String(value ?? '') !== String(base ?? '');
  }), [v]);

  if (!canEdit) {
    return (
      <div className="page-pad" style={{ maxWidth: 1180, margin: '0 auto' }}>
        <PageHeader title={title} subtitle="Read-only project setup and reporting reference." />
        <div className="ps-mode-tabs" role="tablist" aria-label="Project setup sections">
          <button type="button" className={mode === 'manage' ? 'active' : ''} onClick={() => setMode('manage')}>Projects</button>
          <button type="button" className={mode === 'forms' ? 'active' : ''} onClick={() => setMode('forms')}>MERL form reference</button>
        </div>
        {mode === 'manage'
          ? <ProjectConfiguration preferredProjectId={null} canEdit={false} isAdmin={false} />
          : <ActualMerlForms />}
        <style>{`
          .ps-mode-tabs{display:flex;gap:.45rem;flex-wrap:wrap;margin:0 0 1rem;padding:.35rem;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;width:max-content;max-width:100%}
          .ps-mode-tabs button{border:0;background:transparent;color:var(--text-2);font:inherit;font-size:.78rem;font-weight:700;padding:.5rem .8rem;border-radius:7px;cursor:pointer}
          .ps-mode-tabs button.active{background:var(--white);color:var(--green-700);box-shadow:0 1px 2px rgba(15,23,42,.08)}
        `}</style>
      </div>
    );
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
    setMode('manage');
  };

  return (
    <div className="page-pad" style={{ maxWidth: 1180, margin: '0 auto' }} key={resetKey}>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="ps-mode-tabs" role="tablist" aria-label="Project setup sections">
        <button type="button" className={mode === 'manage' ? 'active' : ''} onClick={() => setMode('manage')}>Manage projects</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register new project</button>
        <button type="button" className={mode === 'forms' ? 'active' : ''} onClick={() => setMode('forms')}>MERL form reference</button>
      </div>

      {registered && mode === 'manage' && <div role="status" style={{ marginBottom: '1rem', padding: '.8rem 1rem', border: '1px solid #16a34a55', background: '#dcece2', borderRadius: 10, color: '#155e34' }}><strong>{registered.acronym ? `${registered.acronym} — ` : ''}{registered.name}</strong> was registered and is selected below.</div>}

      {mode === 'register' && <form onSubmit={save} id="project-profile">
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
      </form>}

      {mode === 'manage' && <ProjectConfiguration preferredProjectId={registered?.id} canEdit={canEdit} isAdmin={user?.role === 'ROLE_ADMIN'} />}

      {mode === 'forms' && <ActualMerlForms />}

      <style>{`
        .ps-mode-tabs{display:flex;gap:.45rem;flex-wrap:wrap;margin:0 0 1rem;padding:.35rem;background:var(--surface-1);border:1px solid var(--border);border-radius:10px;width:max-content;max-width:100%}.ps-mode-tabs button{border:0;background:transparent;color:var(--text-2);font:inherit;font-size:.78rem;font-weight:700;padding:.5rem .8rem;border-radius:7px;cursor:pointer}.ps-mode-tabs button.active{background:var(--white);color:var(--green-700);box-shadow:0 1px 2px rgba(15,23,42,.08)}
        .ps-config{margin:0;padding:1rem;background:var(--white);border:1px solid var(--border);border-radius:12px}.ps-config-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-end;flex-wrap:wrap}.ps-config-head h2{margin:0;font-size:1.08rem}.ps-config-head p{margin:.25rem 0 0;color:var(--text-3);font-size:.78rem;max-width:700px}.ps-config-head select{min-width:300px}.ps-config-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}.ps-config-card{border:1px solid var(--border);border-radius:10px;padding:.9rem}.ps-config-card h3{margin:0 0 .35rem;font-size:.9rem}.ps-config-note{margin:0 0 .7rem;color:var(--text-3);font-size:.7rem;line-height:1.45}.ps-config-form{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}.ps-config-form label{display:flex;flex-direction:column;gap:.25rem}.ps-config-form .full{grid-column:1/-1}.ps-check{flex-direction:row!important;align-items:center;font-size:.72rem;color:var(--text-2)}.ps-config-actions{display:flex;justify-content:flex-end;gap:.5rem;margin:.65rem 0}.ps-mini-table{overflow:auto;max-height:320px}.ps-mini-table table{width:100%;border-collapse:collapse;font-size:.72rem}.ps-mini-table th,.ps-mini-table td{padding:.45rem;border-top:1px solid var(--border);text-align:left}.ps-mini-table th{font-size:.62rem;text-transform:uppercase;color:var(--text-3)}.ps-mini-table td small{display:block;color:var(--text-3)}.ps-mini-table button{border:0;background:none;color:var(--green-700);font:inherit;cursor:pointer;margin-right:.35rem}.ps-mini-table button.danger{color:#b91c1c}
        .ps-actual{margin:1.2rem 0 0;padding:1rem;background:var(--white);border:1px solid var(--border);border-radius:12px}
        .ps-actual-head{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem}.ps-actual-head h2{margin:0;font-size:1.08rem}.ps-actual-head p{margin:.3rem 0 0;color:var(--text-3);font-size:.8rem;max-width:790px;line-height:1.5}.ps-live-link{white-space:nowrap;text-decoration:none;font-size:.75rem;font-weight:700;color:var(--green-700);border:1px solid var(--border);border-radius:8px;padding:.5rem .7rem;background:#fff}
        .ps-form-stack{display:grid;gap:1rem}.ps-form-preview{border:1px solid var(--border);border-radius:12px;background:#fff;padding:1rem}.ps-form-title{display:flex;gap:.75rem;align-items:flex-start;padding-bottom:.8rem;margin-bottom:.8rem;border-bottom:1px solid var(--border)}.ps-form-number{flex:0 0 auto;background:var(--green-50);color:var(--green-700);border:1px solid var(--border);border-radius:999px;padding:.28rem .55rem;font-size:.68rem;font-weight:800}.ps-form-title h3{margin:0;font-size:.95rem}.ps-form-title p{margin:.2rem 0 0;color:var(--text-3);font-size:.72rem;line-height:1.4}
        .ps-preview-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}.ps-preview-field{display:flex;flex-direction:column;gap:.3rem}.ps-preview-wide{grid-column:1/-1}.ps-preview-control:disabled{opacity:1;color:var(--text-2);background:#f8fafc;cursor:default}.ps-preview-control:disabled::placeholder{color:#94a3b8}.ps-preview-check{display:flex;align-items:center;gap:.5rem;min-height:42px;padding:.55rem .7rem;background:#f8fafc;border:1px solid var(--border);border-radius:8px;color:var(--text-3);font-size:.75rem}.ps-preview-note{margin:.9rem 0 0;padding:.7rem .8rem;border-radius:8px;background:#f8fafc;color:var(--text-3);font-size:.72rem;line-height:1.45}
        @media(max-width:800px){.ps-config-grid{grid-template-columns:1fr}.ps-config-head select{min-width:0;width:100%}.ps-preview-grid{grid-template-columns:1fr}.ps-preview-wide{grid-column:1}.ps-actual-head{flex-direction:column}.ps-live-link{white-space:normal}}
        @media(max-width:700px){.ps-grid{grid-template-columns:1fr!important}.ps-grid>*{grid-column:1!important}}
      `}</style>
    </div>
  );
}