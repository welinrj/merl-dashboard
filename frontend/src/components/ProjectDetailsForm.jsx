import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST } from '../constants/vanuatuGeo';
import './ProjectDetailsForm.css';

export default function ProjectDetailsForm({ values: v, onChange, onSubmit, onCancel, saving, editing }) {
  const change = (key, value) => onChange(current => ({ ...current, [key]: value }));
  const input = (key, label, type = 'text', hint) => <label className="pd-field"><span>{label}</span><input className="field-input" type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={v[key] ?? ''} onChange={e => change(key, e.target.value)} />{hint && <small>{hint}</small>}</label>;
  const select = (key, label, options) => <label className="pd-field"><span>{label}</span><select className="field-input" value={v[key] ?? ''} onChange={e => change(key, e.target.value)}><option value="">Choose an option</option>{v[key] && !options.some(o => o.value === v[key]) && <option value={v[key]}>{v[key]}</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  return <form className="pd-form" id="project-profile" onSubmit={onSubmit}>
    <header><h2>{editing ? 'Edit project details' : 'Add a project'}</h2><p>{editing ? 'Update the details below, then choose Save changes.' : 'Start with the project name. You can add other details now or later.'} Only the project name is required.</p></header>
    <fieldset disabled={saving}>
      <section className="pd-section"><h3>Basic details</h3><div className="pd-grid">
        <label className="pd-field pd-wide"><span>Project name *</span><input className="field-input" required value={v.name} onChange={e => change('name', e.target.value)} /></label>
        {input('acronym', 'Short name', 'text', 'For example, PEBACC+ or BOLD.')}
        {select('status', 'Project status', OPT.DOCC_PROJECT_STATUS)}
        <label className="pd-field pd-wide"><span>About this project</span><textarea className="field-input" rows={4} value={v.description} onChange={e => change('description', e.target.value)} /></label>
        {input('project_manager', 'Project manager')}{input('lead_agency', 'Lead department or organisation')}
        <label className="pd-field pd-wide"><span>What the project aims to achieve</span><textarea className="field-input" rows={3} value={v.expected_primary_outcome} onChange={e => change('expected_primary_outcome', e.target.value)} /></label>
      </div></section>
      <details className="pd-section"><summary>Funding and dates</summary><div className="pd-grid">
        {input('donor', 'Who funds this project?')}{input('funding_window', 'Funding programme')}
        {input('budget_vuv', 'Approved budget (Vanuatu vatu)', 'number', 'Enter the budget in VUV used by the dashboard.')}
        {select('currency', 'Original funding currency', OPT.CURRENCY)}
        {input('start_date', 'Start date', 'date')}{input('end_date', 'End date', 'date')}{input('approval_date', 'Approval date', 'date')}
      </div></details>
      <details className="pd-section"><summary>Locations</summary><div className="pd-grid">
        {select('coverage_type', 'Where does the project work?', OPT.COVERAGE_TYPE)}
        <fieldset className="pd-provinces pd-wide"><legend>Provinces — choose all that apply</legend>{[...new Set([...PROVINCE_LIST, ...v.provinces])].map(province => <label key={province}><input type="checkbox" checked={v.provinces.includes(province)} onChange={e => change('provinces', e.target.checked ? [...v.provinces, province] : v.provinces.filter(p => p !== province))} />{province}</label>)}</fieldset>
      </div></details>
      <details className="pd-section"><summary>Other contacts and project information</summary><div className="pd-grid">
        {input('executing_agency', 'Organisation delivering the project')}{input('me_officer', 'Monitoring and evaluation contact')}{input('finance_officer', 'Finance contact')}
        {input('category', 'Theme or sector', 'text', 'Keep the existing category unless it needs to change.')}{input('project_type', 'Type of project')}
        {input('est_direct_beneficiaries', 'Estimated people directly supported', 'number')}{input('est_indirect_beneficiaries', 'Estimated people indirectly supported', 'number')}
      </div></details>
    </fieldset>
    <div className="pd-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add project'}</button></div>
  </form>;
}
