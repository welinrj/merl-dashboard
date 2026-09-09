import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
import { projectColor } from '../components/PublicProjectResults';
import * as OPT from '../constants/formOptions';

const empty = { projects: [], objectives: [], outcomes: [], outputs: [], indicators: [] };
const blank = () => ({ kind: '', id: null, projectId: '', statement: '', parentId: '', name: '', unit: '', baseline: '', target: '', frequency: '' });
const number = v => v === '' || v == null ? null : Number(v);
const display = v => v === '' || v == null ? '—' : String(v);
const kinds = ['objective', 'outcome', 'output', 'indicator'];
const plural = { objective: 'objectives', outcome: 'outcomes', output: 'outputs', indicator: 'indicators' };
const title = kind => kind.charAt(0).toUpperCase() + kind.slice(1);

// One row represents a real framework record. Missing parents are retained rather
// than silently hiding orphaned records. No project data or codes are fabricated.
function buildRows(data) {
  const projects = new Map(data.projects.map(p => [p.id, p]));
  const objectives = new Map(data.objectives.map(r => [r.id, r]));
  const outcomes = new Map(data.outcomes.map(r => [r.id, r]));
  const outputs = new Map(data.outputs.map(r => [r.id, r]));
  const rows = [];
  const shown = { objective: new Set(), outcome: new Set(), output: new Set(), indicator: new Set() };
  const add = (kind, record) => {
    const project = projects.get(record.project_id);
    if (!project) return;
    const output = kind === 'output' ? record : kind === 'indicator' ? outputs.get(record.output_id) : null;
    const outcome = kind === 'outcome' ? record : output ? outcomes.get(output.outcome_id) : kind === 'indicator' ? outcomes.get(record.outcome_id) : null;
    const objective = kind === 'objective' ? record : outcome ? objectives.get(outcome.objective_id) : kind === 'indicator' ? objectives.get(record.objective_id) : null;
    const chain = { project, objective, outcome, output, indicator: kind === 'indicator' ? record : null };
    rows.push(chain);
    for (const level of kinds) if (chain[level]) shown[level].add(chain[level].id);
  };
  for (const r of data.indicators) add('indicator', r);
  for (const r of data.outputs) if (!shown.output.has(r.id)) add('output', r);
  for (const r of data.outcomes) if (!shown.outcome.has(r.id)) add('outcome', r);
  for (const r of data.objectives) if (!shown.objective.has(r.id)) add('objective', r);
  for (const project of data.projects) if (!rows.some(r => r.project.id === project.id)) rows.push({ project, objective: null, outcome: null, output: null, indicator: null });
  return rows.sort((a,b) => `${a.project.code || ''} ${a.project.name}`.localeCompare(`${b.project.code || ''} ${b.project.name}`) || kinds.map(k => a[k]?.code || '').join('/').localeCompare(kinds.map(k => b[k]?.code || '').join('/')));
}

export default function ResultsWorkspace({ user }) {
  const { i18n } = useTranslation();
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [editableIds, setEditableIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [editing, setEditing] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(n => n + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      localised(() => supabase.from('v_projects').select(i18nCols('id, code, acronym, name, status')).order('code')),
      localised(() => supabase.from('v_objectives').select('*').order('code')),
      localised(() => supabase.from('v_outcomes').select('*').order('code')),
      localised(() => supabase.from('v_outputs').select('*').order('code')),
      localised(() => supabase.from('v_project_indicators').select('*').order('code')),
      supabase.rpc('list_results_framework_editable_projects'),
    ]).then(responses => {
      if (!alive) return;
      const failed = responses.slice(0,5).find(r => r.error);
      if (failed) throw failed.error;
      const [projects, objectives, outcomes, outputs, indicators] = responses.slice(0,5).map(r => r.data || []);
      setData({ projects, objectives, outcomes, outputs, indicators });
      const permission = responses[5];
      // A failed permission lookup must never grant portfolio-wide editing.
      setEditableIds(new Set(permission.error ? [] : (permission.data || []).map(r => r.project_id)));
      setPermissionError(permission.error ? 'Editing permissions could not be verified. The framework remains read-only.' : '');
      setLoading(false);
    }).catch(err => { if (alive) { setError(dbErrorMessage(err)); setLoading(false); } });
    return () => { alive = false; };
  }, [i18n.resolvedLanguage, reloadKey, user?.id]);

  const rows = useMemo(() => buildRows(data), [data]);
  const filtered = useMemo(() => rows.filter(r => (projectFilter === 'all' || r.project.id === projectFilter) && (!search.trim() || [r.project.code, r.project.acronym, r.project.name, ...kinds.flatMap(k => [r[k]?.code, r[k]?.statement, r[k]?.name])].join(' ').toLowerCase().includes(search.trim().toLowerCase()))), [rows, projectFilter, search]);
  const editorProject = data.projects.find(p => p.id === editing.projectId);
  const canEdit = projectId => !loading && !saving && editableIds.has(projectId);
  const records = kind => data[plural[kind]].filter(r => r.project_id === editing.projectId);
  const parents = kind => kind === 'outcome' ? records('objective').map(r => ({ id:r.id, label:`${r.code} — ${r.statement}` })) : kind === 'output' ? records('outcome').map(r => ({ id:r.id, label:`${r.code} — ${r.statement}` })) : kind === 'indicator' ? kinds.slice(0,3).flatMap(level => records(level).map(r => ({ id:`${level}:${r.id}`, label:`${r.code} — ${r.statement}` }))) : [];
  const openNew = (projectId, kind, parentId = '') => { if (canEdit(projectId)) setEditing({ ...blank(), projectId, kind, parentId }); };
  const openExisting = (projectId, kind, record) => {
    if (!canEdit(projectId) || !record || record.project_id !== projectId) return;
    setEditing({ ...blank(), kind, id:record.id, projectId, statement:record.statement || '', name:record.name || '', unit:record.unit || '', baseline:record.baseline_value ?? '', target:record.target_value ?? '', frequency:record.frequency || '', parentId:kind === 'outcome' ? record.objective_id || '' : kind === 'output' ? record.outcome_id || '' : kind === 'indicator' ? record.output_id ? `output:${record.output_id}` : record.outcome_id ? `outcome:${record.outcome_id}` : record.objective_id ? `objective:${record.objective_id}` : '' : '' });
  };
  const change = (key, val) => setEditing(s => ({ ...s, [key]:val }));
  const cancel = () => setEditing(blank());

  const saveEdit = async e => {
    e.preventDefault();
    if (saving || !editableIds.has(editing.projectId) || !kinds.includes(editing.kind)) return;
    const current = editing.id ? data[plural[editing.kind]].find(r => r.id === editing.id && r.project_id === editing.projectId) : null;
    if (editing.id && !current) { toast.error('The selected record is no longer available. Refresh and try again.'); return; }
    const parent = editing.parentId;
    if (!editing.id && ['outcome','output'].includes(editing.kind) && !parent) { toast.error('Select a parent record.'); return; }
    if (!editing.id && editing.kind === 'indicator' && !parent) { toast.error('Select the result level for this indicator.'); return; }
    if (parent) {
      const [level, id] = editing.kind === 'indicator' ? parent.split(':') : [editing.kind === 'outcome' ? 'objective' : 'outcome', parent];
      if (!data[plural[level]]?.some(r => r.id === id && r.project_id === editing.projectId)) { toast.error('Select a parent from the same project.'); return; }
    }
    if (editing.kind === 'indicator' && [editing.baseline, editing.target].some(v => v !== '' && !Number.isFinite(Number(v)))) { toast.error('Baseline and target must be valid numbers.'); return; }
    setSaving(true);
    try {
      let result;
      if (editing.kind === 'objective') result = current
        ? await supabase.rpc('update_objective', { p_id:current.id, p_statement:editing.statement, p_climate_theme:current.climate_theme ?? null, p_expected_outcome:current.expected_outcome ?? null, p_notes:current.notes ?? null, p_status:'draft' })
        : await supabase.rpc('create_objective', { p_project_id:editing.projectId, p_statement:editing.statement, p_climate_theme:null, p_expected_outcome:null, p_notes:null });
      else if (editing.kind === 'outcome') result = current
        ? await supabase.rpc('update_outcome', { p_id:current.id, p_statement:editing.statement, p_responsible_officer_id:current.responsible_officer_id ?? null, p_status:'draft' })
        : await supabase.rpc('create_outcome', { p_objective_id:parent, p_statement:editing.statement, p_responsible_officer_id:null });
      else if (editing.kind === 'output') result = current
        ? await supabase.rpc('update_output', { p_id:current.id, p_statement:editing.statement, p_responsible_officer_id:current.responsible_officer_id ?? null, p_status:'draft' })
        : await supabase.rpc('create_output', { p_outcome_id:parent, p_statement:editing.statement, p_responsible_officer_id:null });
      else {
        const [level, linkedId] = parent ? parent.split(':') : [null,null];
        result = await supabase.rpc('upsert_project_indicator', {
          p_id:editing.id, p_project_id:editing.projectId, p_name:editing.name, p_unit:editing.unit || null,
          p_baseline_value:number(editing.baseline), p_target_value:number(editing.target),
          p_means_of_verification:current?.means_of_verification ?? null, p_frequency:editing.frequency || null,
          p_indicator_level:current?.indicator_level ?? null, p_definition:current?.definition ?? null,
          p_baseline_year:current?.baseline_year ?? null, p_target_date:current?.target_date ?? null,
          p_data_source:current?.data_source ?? null, p_collection_method:current?.collection_method ?? null,
          p_responsible_officer_id:current?.responsible_officer_id ?? null, p_disaggregation:current?.disaggregation ?? null,
          p_verification_method:current?.verification_method ?? null, p_assumptions:current?.assumptions ?? null,
          p_objective_id:level === 'objective' ? linkedId : null, p_outcome_id:level === 'outcome' ? linkedId : null,
          p_output_id:level === 'output' ? linkedId : null, p_is_qualitative:current?.is_qualitative ?? false,
          p_higher_is_better:current?.higher_is_better ?? true, p_responsible_officer:current?.responsible_officer ?? null,
        });
      }
      if (result?.error) throw result.error;
      toast.success('Results framework saved.'); cancel(); reload();
    } catch (err) { toast.error(dbErrorMessage(err)); } finally { setSaving(false); }
  };

  const remove = async (projectId, kind, record) => {
    if (saving || !editableIds.has(projectId) || record.project_id !== projectId) return;
    const children = kind === 'objective' ? data.outcomes.some(r => r.objective_id === record.id) || data.indicators.some(r => r.objective_id === record.id) : kind === 'outcome' ? data.outputs.some(r => r.outcome_id === record.id) || data.indicators.some(r => r.outcome_id === record.id) : kind === 'output' ? data.indicators.some(r => r.output_id === record.id) : false;
    if (children) { toast.error('This record has linked children. Remove or reassign those records first.'); return; }
    if (!window.confirm(`Delete ${record.code || title(kind)}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const rpc = kind === 'indicator' ? 'delete_project_indicator' : `delete_${kind}`;
      const { error:err } = await supabase.rpc(rpc, { p_id:record.id });
      if (err) throw err;
      toast.success(`${title(kind)} deleted.`); cancel(); reload();
    } catch (err) { toast.error(dbErrorMessage(err)); } finally { setSaving(false); }
  };

  const rowActions = (projectId, kind, record) => canEdit(projectId) ? <span className="rf-row-actions"><button type="button" onClick={() => openExisting(projectId,kind,record)} aria-label={`Edit ${kind} ${record.code || ''}`}>Edit</button><button type="button" className="danger" onClick={() => remove(projectId,kind,record)} aria-label={`Delete ${kind} ${record.code || ''}`}>Delete</button></span> : null;
  const cell = (row, kind) => <td className="rf-level">{row[kind] ? <><span className="rf-code">{row[kind].code}</span><div>{row[kind].statement || row[kind].name}</div>{rowActions(row.project.id,kind,row[kind])}</> : '—'}</td>;
  const editor = editing.kind && editorProject && editableIds.has(editing.projectId) ? <form className="rf-edit-form" onSubmit={saveEdit}>
    <h3>{editing.id ? 'Edit' : 'Add'} {editing.kind} · {editorProject.name}</h3>
    <p className="rf-hint">Changes to the framework are saved as drafts for the normal review process. Project codes are generated automatically.</p>
    <div className="rf-edit-form-grid">
      {editing.kind !== 'indicator' ? <label className="rf-form-full">Statement<textarea className="field-input" rows={3} value={editing.statement} onChange={e => change('statement',e.target.value)} required /></label> : <>
        <label className="rf-form-full">Indicator name<input className="field-input" value={editing.name} onChange={e => change('name',e.target.value)} required /></label>
        <label>Baseline<input className="field-input" type="number" step="any" value={editing.baseline} onChange={e => change('baseline',e.target.value)} /></label>
        <label>Target<input className="field-input" type="number" step="any" value={editing.target} onChange={e => change('target',e.target.value)} /></label>
        <label>Unit<input className="field-input" value={editing.unit} onChange={e => change('unit',e.target.value)} /></label>
        <label>Reporting frequency<select className="field-input" value={editing.frequency} onChange={e => change('frequency',e.target.value)}><option value="">Select</option>{OPT.REPORTING_FREQUENCY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </>}
      {(editing.kind === 'indicator' || (editing.kind !== 'objective' && !editing.id)) && <label className="rf-form-full">Parent result<select className="field-input" value={editing.parentId} onChange={e => change('parentId',e.target.value)} required><option value="">Select a parent</option>{parents(editing.kind).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
    </div>
    <div className="rf-form-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={cancel}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
  </form> : null;

  return <div className="page-pad rf-page">
    <style>{`.rf-page{max-width:none;margin:0 auto}.rf-title{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}.rf-title h1{margin:0;font-size:1.7rem}.rf-title p,.rf-hint{color:var(--text-2);font-size:.78rem;line-height:1.5}.rf-directory,.rf-tools,.rf-editor{border:1px solid var(--border);border-radius:12px;background:var(--white);padding:.9rem;margin-bottom:.85rem}.rf-directory-head,.rf-editor-head{display:flex;justify-content:space-between;align-items:center;gap:.8rem;flex-wrap:wrap}.rf-directory-head h2,.rf-editor-head h2{margin:0;font-size:.95rem}.rf-project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.5rem;margin-top:.7rem}.rf-project-card{border:1px solid var(--project-ink);border-radius:9px;padding:.65rem;background:var(--project-bg);color:var(--project-ink);display:flex;justify-content:space-between;gap:.5rem;text-align:left;font:inherit}.rf-project-card strong{font-size:.78rem}.rf-project-card small{display:block;font-size:.66rem;margin-top:.2rem}.rf-edit-badge{font-size:.65rem;font-weight:700}.rf-stats{display:flex;gap:.5rem}.rf-stat{padding:.5rem .8rem;border:1px solid var(--border);border-radius:9px}.rf-stat strong{display:block}.rf-stat span{font-size:.68rem;color:var(--text-2)}.rf-tools{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,350px) auto;gap:.65rem;align-items:end}.rf-tools label,.rf-edit-form label{display:grid;gap:.25rem;font-size:.72rem;font-weight:700}.rf-editor{background:var(--surface-1)}.rf-editor-head{margin-bottom:.65rem}.rf-editor-select{min-width:250px;max-width:520px}.rf-add-actions,.rf-row-actions,.rf-form-actions{display:flex;gap:.35rem;flex-wrap:wrap}.rf-add-actions{margin:.7rem 0}.rf-add-actions button,.rf-row-actions button{border:1px solid var(--border);border-radius:6px;background:var(--white);padding:.3rem .5rem;font:inherit;font-size:.7rem;cursor:pointer}.rf-row-actions{margin-top:.4rem}.rf-row-actions button.danger{color:var(--red-600,#b91c1c)}.rf-row-actions button:focus-visible,.rf-project-card:focus-visible{outline:3px solid var(--project-ink,#2563eb);outline-offset:2px}.rf-edit-form{padding:.8rem;border:1px solid var(--border);border-radius:10px;background:var(--white)}.rf-edit-form h3{margin:0 0 .5rem;font-size:.9rem}.rf-edit-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.rf-form-full{grid-column:1/-1}.rf-form-actions{justify-content:flex-end;margin-top:.7rem}.rf-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--white);max-height:calc(100vh - 300px)}.rf-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1450px;font-size:.78rem}.rf-table th{position:sticky;top:0;z-index:3;background:var(--surface-1);text-align:left;padding:.65rem;border-bottom:1px solid var(--border);font-size:.68rem;text-transform:uppercase}.rf-table td{vertical-align:top;padding:.65rem;border-bottom:1px solid var(--border);border-right:1px solid var(--border);line-height:1.4}.rf-table td:last-child{border-right:0}.rf-project{min-width:230px}.rf-level{min-width:245px}.rf-num{min-width:85px;text-align:right}.rf-small{min-width:110px}.rf-code{display:block;font-family:var(--font-mono);font-size:.68rem;font-weight:700;margin-bottom:.2rem;color:var(--green-700)}.rf-project-mark{border-left:5px solid var(--project-ink);background:var(--project-bg);padding:.45rem .6rem;border-radius:5px;color:var(--project-ink)}.rf-project-mark strong{display:block}.rf-empty{padding:1.5rem;color:var(--text-2);text-align:center}@media(max-width:760px){.rf-tools,.rf-edit-form-grid{grid-template-columns:1fr}.rf-form-full{grid-column:1}.rf-table-wrap{max-height:none}.rf-editor-select{min-width:0;width:100%}}`}</style>
    <div className="rf-title"><div><h1>Results Framework</h1><p>View project objectives, outcomes, outputs and indicators. Authorised users can add, edit and delete records directly from the table.</p></div><div className="rf-stats"><div className="rf-stat"><strong>{new Set(filtered.map(r => r.project.id)).size}</strong><span>Projects shown</span></div><div className="rf-stat"><strong>{filtered.filter(r => r.indicator).length}</strong><span>Indicator rows</span></div></div></div>
    <section className="rf-directory"><div className="rf-directory-head"><h2>All Registered Projects</h2><span>{data.projects.length} projects</span></div><div className="rf-project-grid">{data.projects.map(p => <button type="button" key={p.id} className="rf-project-card" style={projectColor(p)} onClick={() => { setProjectFilter(p.id); if (canEdit(p.id)) setEditing({ ...blank(), projectId:p.id }); }}><span><strong>{p.name}</strong><small>{p.code || p.acronym || 'No project code'}</small></span>{editableIds.has(p.id) && <span className="rf-edit-badge">Editable</span>}</button>)}</div></section>
    {permissionError && <p role="alert" className="rf-hint">{permissionError}</p>}
    {editableIds.size > 0 && <section className="rf-editor"><div className="rf-editor-head"><div><h2>Edit Results Framework</h2><p className="rf-hint">Select an authorised project, then add a record or use Edit/Delete in the table. Project registration fields remain in Project Setup.</p></div><select className="field-input rf-editor-select" value={editing.projectId} onChange={e => setEditing({ ...blank(), projectId:e.target.value })}><option value="">Select a project to edit</option>{data.projects.filter(p => editableIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}</select></div>{editorProject && <div className="rf-add-actions">{kinds.map(kind => <button type="button" key={kind} disabled={saving} onClick={() => openNew(editorProject.id,kind)}>+ Add {kind}</button>)}</div>}{editor}</section>}
    <div className="rf-tools"><label>Search framework<input className="field-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Project, objective, outcome, output or indicator" /></label><label>Project<select className="field-input" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}><option value="all">All projects</option>{data.projects.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}</select></label><button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setProjectFilter('all'); }}>Reset</button></div>
    {loading && <div className="rf-empty" role="status">Loading results framework…</div>}{error && <div className="rf-empty" role="alert">{error}</div>}
    {!loading && !error && <div className="rf-table-wrap"><table className="rf-table"><thead><tr><th>Project</th><th>Objective</th><th>Outcome</th><th>Output</th><th>Indicator</th><th>Baseline</th><th>Target</th><th>Unit</th><th>Reporting Frequency</th></tr></thead><tbody>{filtered.map((r,idx) => <tr key={`${r.project.id}-${r.indicator?.id || r.output?.id || r.outcome?.id || r.objective?.id || idx}`}><td className="rf-project"><div className="rf-project-mark" style={projectColor(r.project)}><span className="rf-code">{r.project.code || r.project.acronym || 'NO CODE'}</span><strong>{r.project.name}</strong></div>{canEdit(r.project.id) && <div className="rf-row-actions">{kinds.map(kind => <button type="button" key={kind} onClick={() => openNew(r.project.id,kind,r[kind === 'outcome' ? 'objective' : kind === 'output' ? 'outcome' : 'output']?.id ? kind === 'indicator' ? `output:${r.output.id}` : kind === 'outcome' ? r.objective.id : r.outcome.id : '')}>+ {title(kind)}</button>)}</div>}</td>{cell(r,'objective')}{cell(r,'outcome')}{cell(r,'output')}<td className="rf-level">{r.indicator ? <><span className="rf-code">{r.indicator.code}</span><div>{r.indicator.name}</div>{rowActions(r.project.id,'indicator',r.indicator)}</> : '—'}</td><td className="rf-num">{display(r.indicator?.baseline_value)}</td><td className="rf-num">{display(r.indicator?.target_value)}</td><td className="rf-small">{display(r.indicator?.unit)}</td><td className="rf-small">{r.indicator?.frequency ? OPT.labelOf(OPT.REPORTING_FREQUENCY,r.indicator.frequency) : '—'}</td></tr>)}</tbody></table>{!filtered.length && <div className="rf-empty">No results-framework rows match the current filters.</div>}</div>}
  </div>;
}
