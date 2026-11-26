import { useState } from 'react';
import * as OPT from '../constants/formOptions';
import { PROVINCE_LIST, AREA_COUNCILS_BY_PROVINCE } from '../constants/vanuatuGeo';
import './ProjectDetailsForm.css';

// Use the same 71-council reference as the geographic reporting forms.
function AreaCouncilPicker({ provinces, value, onChange }) {
  const [query, setQuery] = useState('');
  const selected = [...new Set((value || []).map(name => String(name).trim()).filter(Boolean))];
  const provinceCodes = (provinces || []).map(p => String(p).trim().toUpperCase());
  const visibleProvinces = PROVINCE_LIST.filter(p => provinceCodes.includes(p));
  const availableProvinces = visibleProvinces.length ? visibleProvinces : PROVINCE_LIST;
  const matches = (name, province = '') => (name + ' ' + province).toLowerCase().includes(query.trim().toLowerCase());
  const groups = availableProvinces.map(province => ({
    province, names: (AREA_COUNCILS_BY_PROVINCE[province] || []).filter(name => matches(name, province)),
  })).filter(group => group.names.length);
  const available = new Set(availableProvinces.flatMap(p => AREA_COUNCILS_BY_PROVINCE[p] || []));
  const existing = selected.filter(name => !available.has(name));
  const toggle = (name, checked) => onChange(checked ? [...new Set([...selected, name])] : selected.filter(n => n !== name));
  const choice = name => (
    <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '.65rem', minHeight: 44, padding: '.3rem .5rem', overflowWrap: 'anywhere', cursor: 'pointer' }}>
      <input type="checkbox" checked={selected.includes(name)} onChange={e => toggle(name, e.target.checked)}
        style={{ width: 20, height: 20, flexShrink: 0 }} />
      <span>{name}</span>
    </label>
  );
  return <div className="pd-field pd-wide">
    <span id="pd-area-councils-label">Area councils</span>
    <details style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.2rem .65rem', minWidth: 0 }}>
      <summary style={{ cursor: 'pointer', minHeight: 44, fontSize: '1rem', fontWeight: 600 }}>
        {selected.length ? selected.length + ' area council' + (selected.length === 1 ? '' : 's') + ' selected' : 'Select area councils'}
      </summary>
      <label className="pd-field"><span>Search area councils</span>
        <input className="field-input" type="search" value={query} placeholder="Search by council or province"
          onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} />
      </label>
      <div role="group" aria-labelledby="pd-area-councils-label" style={{ maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain', padding: '.25rem 0' }}>
        {groups.map(({ province, names }) => <div key={province} style={{ margin: '.5rem 0' }}>
          <strong style={{ display: 'block', padding: '.3rem .5rem', color: 'var(--text-2)', fontSize: '.85rem', background: 'var(--surface-1)' }}>{province}</strong>
          {names.map(choice)}
        </div>)}
        {!groups.length && <p>No matching area councils.</p>}
        {existing.length > 0 && <div>
          <strong style={{ display: 'block', padding: '.3rem .5rem', color: 'var(--text-2)', fontSize: '.85rem' }}>Previously saved (outside selected provinces or legacy names)</strong>
          {existing.map(choice)}
        </div>}
      </div>
    </details>
    {selected.length > 0 && <div aria-live="polite" style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
      {selected.map(name => <button type="button" key={name} aria-label={'Remove ' + name} onClick={() => toggle(name, false)}
        style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-1)', color: 'var(--text-1)', padding: '.4rem .6rem', font: 'inherit', minHeight: 44, maxWidth: '100%', overflowWrap: 'anywhere', cursor: 'pointer' }}>
        {name} ×
      </button>)}
    </div>}
    <small>Choose one or more councils from the official reference list. Options follow the selected provinces; existing selections are retained until removed.</small>
  </div>;
}

export default function ProjectDetailsForm({ values: v, onChange, onSubmit, onCancel, saving, editing, section = 'all', onSectionChange, error }) {
  const change = (key, value) => onChange(current => ({ ...current, [key]: value }));
  const input = (key, label, type = 'text', hint) => <label className="pd-field"><span>{label}</span><input className="field-input" type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={v[key] ?? ''} onChange={e => change(key, e.target.value)} />{hint && <small>{hint}</small>}</label>;
  const select = (key, label, options) => <label className="pd-field"><span>{label}</span><select className="field-input" value={v[key] ?? ''} onChange={e => change(key, e.target.value)}><option value="">Choose an option</option>{v[key] && !options.some(o => o.value === v[key]) && <option value={v[key]}>{v[key]}</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
  const show = key => section === 'all' || section === key;
  return <form className="pd-form" id="project-profile" onSubmit={onSubmit}>
    <header><h2>{editing ? 'Edit project details' : 'Add a project'}</h2>{editing && <p><strong>{v.name}</strong></p>}<p>{editing ? 'Update the details below, then choose Save changes.' : 'Start with the project name. You can add other details now or later.'} Only the project name is required.</p></header>
    {editing && <nav className="pd-section-nav" aria-label="Project details sections">{[['about','About'],['funding','Funding'],['locations','Locations'],['contacts','Project manager'],['goals','Goals'],['all','All details']].map(([key,label]) => <button type="button" key={key} aria-pressed={section === key} disabled={saving} onClick={() => onSectionChange(key)}>{label}</button>)}</nav>}
    {error && <p className="pd-save-error" role="alert">{error}</p>}
    <fieldset disabled={saving}>
      {show('about') && <section className="pd-section"><h3>About the project</h3><div className="pd-grid">
        <label className="pd-field pd-wide"><span>Project name *</span><input className="field-input" required value={v.name} onChange={e => change('name', e.target.value)} /></label>
        {input('acronym', 'Short name', 'text', 'For example, PEBACC+ or BOLD.')}
        {select('status', 'Project status', OPT.DOCC_PROJECT_STATUS)}
        <label className="pd-field pd-wide"><span>About this project</span><textarea className="field-input" rows={4} value={v.description} onChange={e => change('description', e.target.value)} /></label>
        {input('lead_agency', 'Lead department or organisation')}
      </div></section>}
      {show('funding') && <section className="pd-section"><h3>Funding and dates</h3><div className="pd-grid">
        {input('donor', 'Who funds this project?')}{input('funding_window', 'Funding programme')}
        {input('budget_vuv', 'Approved budget (Vanuatu vatu)', 'number', 'Enter the budget in VUV used by the dashboard.')}
        {select('currency', 'Original funding currency', OPT.CURRENCY)}
        {input('start_date', 'Start date', 'date')}{input('end_date', 'End date', 'date')}{input('approval_date', 'Approval date', 'date')}
      </div></section>}
      {show('locations') && <section className="pd-section"><h3>Locations</h3><div className="pd-grid">
        {select('coverage_type', 'Where does the project work?', OPT.COVERAGE_TYPE)}
        <fieldset className="pd-provinces pd-wide"><legend>Provinces — choose all that apply</legend>{[...new Set([...PROVINCE_LIST, ...v.provinces])].map(province => <label key={province}><input type="checkbox" checked={v.provinces.includes(province)} onChange={e => change('provinces', e.target.checked ? [...v.provinces, province] : v.provinces.filter(p => p !== province))} />{province}</label>)}</fieldset>
        <label className="pd-field pd-wide"><span>Islands</span><textarea className="field-input" rows={3} value={(v.islands || []).join('\n')} onChange={e => change('islands', e.target.value.split('\n'))} /><small>Enter one name on each line.</small></label>
        <AreaCouncilPicker provinces={v.provinces} value={v.area_councils} onChange={names => change('area_councils', names)} />
        <label className="pd-field pd-wide"><span>Communities</span><textarea className="field-input" rows={3} value={(v.communities || []).join('\n')} onChange={e => change('communities', e.target.value.split('\n'))} /><small>Enter one name on each line.</small></label>
      </div></section>}
      {show('contacts') && <section className="pd-section"><h3>Project manager and contacts</h3><p>Enter the name of the person responsible for each role.</p><div className="pd-grid">
        {input('project_manager', 'Project manager', 'text', 'For example, Mary John.')}
        {input('me_officer', 'Monitoring and evaluation contact')}{input('finance_officer', 'Finance contact')}
        {input('executing_agency', 'Organisation delivering the project')}
      </div></section>}
      {show('goals') && <section className="pd-section"><h3>Goals & activities</h3><div className="pd-grid">
        <label className="pd-field pd-wide"><span>What the project aims to achieve</span><textarea className="field-input" rows={4} value={v.expected_primary_outcome} onChange={e => change('expected_primary_outcome', e.target.value)} /><small>Describe the main change this project should make.</small></label>
        {input('category', 'Theme or sector')}{input('project_type', 'Type of project')}
        {input('est_direct_beneficiaries', 'Estimated people directly supported', 'number')}{input('est_indirect_beneficiaries', 'Estimated people indirectly supported', 'number')}
      </div><p>To edit individual activities, indicators or targets, save these details first, then open Goals & activities on the project page.</p></section>}
    </fieldset>
    <div className="pd-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onCancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add project'}</button></div>
  </form>;
}
