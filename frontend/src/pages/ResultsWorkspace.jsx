import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
import * as OPT from '../constants/formOptions';

const value = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const SUPER_EDITORS = ['ROLE_ADMIN', 'ROLE_DOCC_MEO'];

const blankEdit = () => ({ kind: '', id: null, statement: '', parentId: '', name: '', unit: '', baseline: '', target: '', frequency: '' });

export default function ResultsWorkspace({ user }) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [data, setData] = useState({ projects: [], objectives: [], outcomes: [], outputs: [], indicators: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [editableIds, setEditableIds] = useState(new Set());
  const [editorProjectId, setEditorProjectId] = useState('');
  const [editing, setEditing] = useState(blankEdit);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = () => setReloadKey((n) => n + 1);

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
    ]).then(async (responses) => {
      if (!alive) return;
      const failed = responses.find((r) => r.error);
      if (failed) {
        setError(dbErrorMessage(failed.error));
        setLoading(false);
        return;
      }
      const [projects, objectives, outcomes, outputs, indicators] = responses.map((r) => r.data ?? []);
      setData({ projects, objectives, outcomes, outputs, indicators });

      let ids = [];
      const { data: permitted, error: permissionError } = await supabase.rpc('list_results_framework_editable_projects');
      if (!permissionError) ids = (permitted ?? []).map((r) => r.project_id);
      else if (SUPER_EDITORS.includes(user?.role)) ids = projects.map((p) => p.id);
      if (!alive) return;
      setEditableIds(new Set(ids));
      setEditorProjectId((current) => ids.includes(current) ? current : '');
      setLoading(false);
    }).catch((err) => {
      if (!alive) return;
      setError(dbErrorMessage(err));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [lang, reloadKey, user?.role]);

  const rows = useMemo(() => {
    const objById = new Map(data.objectives.map((r) => [r.id, r]));
    const outcomeById = new Map(data.outcomes.map((r) => [r.id, r]));
    const outputById = new Map(data.outputs.map((r) => [r.id, r]));
    const projects = new Map(data.projects.map((p) => [p.id, p]));
    const built = [];
    const indicatorLinked = new Set();

    for (const indicator of data.indicators) {
      const project = projects.get(indicator.project_id);
      if (!project) continue;
      const output = indicator.output_id ? outputById.get(indicator.output_id) : null;
      const outcome = indicator.outcome_id ? outcomeById.get(indicator.outcome_id) : (output?.outcome_id ? outcomeById.get(output.outcome_id) : null);
      const objective = indicator.objective_id ? objById.get(indicator.objective_id) : (outcome?.objective_id ? objById.get(outcome.objective_id) : null);
      built.push({ project, objective, outcome, output, indicator });
      if (indicator.output_id) indicatorLinked.add(`output:${indicator.output_id}`);
      if (indicator.outcome_id) indicatorLinked.add(`outcome:${indicator.outcome_id}`);
      if (indicator.objective_id) indicatorLinked.add(`objective:${indicator.objective_id}`);
    }

    for (const output of data.outputs) {
      if (indicatorLinked.has(`output:${output.id}`)) continue;
      const project = projects.get(output.project_id);
      if (!project) continue;
      const outcome = output.outcome_id ? outcomeById.get(output.outcome_id) : null;
      const objective = outcome?.objective_id ? objById.get(outcome.objective_id) : null;
      built.push({ project, objective, outcome, output, indicator: null });
      if (output.outcome_id) indicatorLinked.add(`outcome:${output.outcome_id}`);
      if (objective?.id) indicatorLinked.add(`objective:${objective.id}`);
    }

    for (const outcome of data.outcomes) {
      const hasOutput = data.outputs.some((o) => o.outcome_id === outcome.id);
      if (hasOutput || indicatorLinked.has(`outcome:${outcome.id}`)) continue;
      const project = projects.get(outcome.project_id);
      if (!project) continue;
      const objective = outcome.objective_id ? objById.get(outcome.objective_id) : null;
      built.push({ project, objective, outcome, output: null, indicator: null });
      if (objective?.id) indicatorLinked.add(`objective:${objective.id}`);
    }

    for (const objective of data.objectives) {
      const hasOutcome = data.outcomes.some((o) => o.objective_id === objective.id);
      if (hasOutcome || indicatorLinked.has(`objective:${objective.id}`)) continue;
      const project = projects.get(objective.project_id);
      if (!project) continue;
      built.push({ project, objective, outcome: null, output: null, indicator: null });
    }

    for (const project of data.projects) {
      if (!built.some((r) => r.project.id === project.id)) built.push({ project, objective: null, outcome: null, output: null, indicator: null });
    }

    return built.sort((a, b) => {
      const pc = `${a.project.code ?? ''} ${a.project.name}`.localeCompare(`${b.project.code ?? ''} ${b.project.name}`);
      if (pc) return pc;
      return `${a.objective?.code ?? ''}${a.outcome?.code ?? ''}${a.output?.code ?? ''}${a.indicator?.code ?? ''}`
        .localeCompare(`${b.objective?.code ?? ''}${b.outcome?.code ?? ''}${b.output?.code ?? ''}${b.indicator?.code ?? ''}`);
    });
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (projectFilter !== 'all' && r.project.id !== projectFilter) return false;
      if (!q) return true;
      return [r.project.code, r.project.acronym, r.project.name, r.objective?.code, r.objective?.statement,
        r.outcome?.code, r.outcome?.statement, r.output?.code, r.output?.statement,
        r.indicator?.code, r.indicator?.name].some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [rows, projectFilter, search]);

  const projectCount = new Set(filtered.map((r) => r.project.id)).size;
  const indicatorCount = filtered.filter((r) => r.indicator).length;
  const editorProject = data.projects.find((p) => p.id === editorProjectId);
  const editorObjectives = data.objectives.filter((r) => r.project_id === editorProjectId);
  const editorOutcomes = data.outcomes.filter((r) => r.project_id === editorProjectId);
  const editorOutputs = data.outputs.filter((r) => r.project_id === editorProjectId);
  const editorIndicators = data.indicators.filter((r) => r.project_id === editorProjectId);

  const openNew = (kind) => {
    const next = blankEdit();
    next.kind = kind;
    if (kind === 'outcome') next.parentId = editorObjectives[0]?.id ?? '';
    if (kind === 'output') next.parentId = editorOutcomes[0]?.id ?? '';
    if (kind === 'indicator') {
      if (editorOutputs[0]) next.parentId = `output:${editorOutputs[0].id}`;
      else if (editorOutcomes[0]) next.parentId = `outcome:${editorOutcomes[0].id}`;
      else if (editorObjectives[0]) next.parentId = `objective:${editorObjectives[0].id}`;
    }
    setEditing(next);
  };

  const openExisting = (kind, row) => {
    const next = blankEdit();
    next.kind = kind;
    next.id = row.id;
    if (kind === 'objective') next.statement = row.statement ?? '';
    if (kind === 'outcome') { next.statement = row.statement ?? ''; next.parentId = row.objective_id ?? ''; }
    if (kind === 'output') { next.statement = row.statement ?? ''; next.parentId = row.outcome_id ?? ''; }
    if (kind === 'indicator') {
      next.name = row.name ?? '';
      next.unit = row.unit ?? '';
      next.baseline = row.baseline_value ?? '';
      next.target = row.target_value ?? '';
      next.frequency = row.frequency ?? '';
      next.parentId = row.output_id ? `output:${row.output_id}` : row.outcome_id ? `outcome:${row.outcome_id}` : row.objective_id ? `objective:${row.objective_id}` : '';
    }
    setEditing(next);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editorProjectId || !editableIds.has(editorProjectId)) return;
    setSaving(true);
    let result;
    try {
      if (editing.kind === 'objective') {
        result = editing.id
          ? await supabase.rpc('update_objective', { p_id: editing.id, p_statement: editing.statement, p_climate_theme: null, p_expected_outcome: null, p_notes: null, p_status: 'draft' })
          : await supabase.rpc('create_objective', { p_project_id: editorProjectId, p_statement: editing.statement, p_climate_theme: null, p_expected_outcome: null, p_notes: null });
      } else if (editing.kind === 'outcome') {
        if (!editing.id && !editing.parentId) throw new Error('Select a parent objective.');
        result = editing.id
          ? await supabase.rpc('update_outcome', { p_id: editing.id, p_statement: editing.statement, p_responsible_officer_id: null, p_status: 'draft' })
          : await supabase.rpc('create_outcome', { p_objective_id: editing.parentId, p_statement: editing.statement, p_responsible_officer_id: null });
      } else if (editing.kind === 'output') {
        if (!editing.id && !editing.parentId) throw new Error('Select a parent outcome.');
        result = editing.id
          ? await supabase.rpc('update_output', { p_id: editing.id, p_statement: editing.statement, p_responsible_officer_id: null, p_status: 'draft' })
          : await supabase.rpc('create_output', { p_outcome_id: editing.parentId, p_statement: editing.statement, p_responsible_officer_id: null });
      } else if (editing.kind === 'indicator') {
        const existing = editing.id ? editorIndicators.find((i) => i.id === editing.id) : null;
        const [level, linkedId] = editing.parentId ? editing.parentId.split(':') : [null, null];
        result = await supabase.rpc('upsert_project_indicator', {
          p_id: editing.id,
          p_project_id: editorProjectId,
          p_name: editing.name,
          p_unit: editing.unit || null,
          p_baseline_value: numOrNull(editing.baseline),
          p_target_value: numOrNull(editing.target),
          p_means_of_verification: existing?.means_of_verification ?? null,
          p_frequency: editing.frequency || null,
          p_indicator_level: existing?.indicator_level ?? null,
          p_definition: existing?.definition ?? null,
          p_baseline_year: existing?.baseline_year ?? null,
          p_target_date: existing?.target_date ?? null,
          p_data_source: existing?.data_source ?? null,
          p_collection_method: existing?.collection_method ?? null,
          p_responsible_officer_id: existing?.responsible_officer_id ?? null,
          p_disaggregation: existing?.disaggregation ?? null,
          p_verification_method: existing?.verification_method ?? null,
          p_assumptions: existing?.assumptions ?? null,
          p_objective_id: level === 'objective' ? linkedId : null,
          p_outcome_id: level === 'outcome' ? linkedId : null,
          p_output_id: level === 'output' ? linkedId : null,
          p_is_qualitative: existing?.is_qualitative ?? false,
          p_higher_is_better: existing?.higher_is_better ?? true,
          p_responsible_officer: existing?.responsible_officer ?? null,
        });
      }
      if (result?.error) throw result.error;
      toast.success('Results framework saved.');
      setEditing(blankEdit());
      load();
    } catch (err) {
      toast.error(dbErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (kind, id) => {
    if (!editableIds.has(editorProjectId)) return;
    const label = kind === 'indicator' ? 'indicator' : kind;
    if (!window.confirm(`Delete this ${label}? Linked child records may need to be removed first.`)) return;
    const rpc = kind === 'objective' ? 'delete_objective' : kind === 'outcome' ? 'delete_outcome' : kind === 'output' ? 'delete_output' : 'delete_project_indicator';
    const { error: deleteError } = await supabase.rpc(rpc, { p_id: id });
    if (deleteError) { toast.error(dbErrorMessage(deleteError)); return; }
    toast.success(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
    setEditing(blankEdit());
    load();
  };

  const linkedOptions = [
    ...editorObjectives.map((r) => ({ value: `objective:${r.id}`, label: `${r.code} — ${r.statement}` })),
    ...editorOutcomes.map((r) => ({ value: `outcome:${r.id}`, label: `${r.code} — ${r.statement}` })),
    ...editorOutputs.map((r) => ({ value: `output:${r.id}`, label: `${r.code} — ${r.statement}` })),
  ];

  return (
    <div className="page-pad rf-page">
      <style>{`
        .rf-page{max-width:none;margin:0 auto}
        .rf-title{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem}
        .rf-title h1{margin:0;font-family:var(--font-display);font-size:clamp(1.55rem,2.4vw,2rem)}
        .rf-title p{margin:.35rem 0 0;color:var(--text-2);max-width:820px}
        .rf-stats{display:flex;gap:.5rem;flex-wrap:wrap}.rf-stat{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.55rem .75rem;min-width:105px}.rf-stat strong{display:block;font-size:1rem}.rf-stat span{font-size:.68rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em}
        .rf-directory{border:1px solid var(--border);border-radius:12px;background:var(--white);padding:.9rem;margin-bottom:.85rem}.rf-directory-head{display:flex;justify-content:space-between;gap:.8rem;align-items:center;margin-bottom:.65rem}.rf-directory-head h2{margin:0;font-size:.95rem}.rf-directory-head span{font-size:.72rem;color:var(--text-3)}.rf-project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:.5rem}.rf-project-card{border:1px solid var(--border);border-radius:9px;padding:.65rem .7rem;background:var(--surface-1);display:flex;gap:.6rem;justify-content:space-between;align-items:flex-start}.rf-project-card strong{display:block;font-size:.78rem;line-height:1.3}.rf-project-card small{display:block;margin-top:.18rem;color:var(--text-3);font-family:var(--font-mono);font-size:.65rem}.rf-edit-badge{font-size:.62rem;font-weight:700;color:#155e34;background:#dcece2;border:1px solid #16a34a55;border-radius:999px;padding:.12rem .35rem;white-space:nowrap}
        .rf-editor{border:1px solid #3b82f655;border-radius:12px;background:#eff6ff;padding:.9rem;margin-bottom:.85rem}.rf-editor-head{display:flex;justify-content:space-between;gap:.75rem;align-items:flex-start;flex-wrap:wrap}.rf-editor-head h2{margin:0;font-size:1rem}.rf-editor-head p{margin:.2rem 0 0;color:var(--text-2);font-size:.78rem}.rf-editor-select{min-width:300px;max-width:520px}.rf-level-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.6rem;margin-top:.8rem}.rf-level-box{background:var(--white);border:1px solid var(--border);border-radius:10px;padding:.65rem;min-width:0}.rf-level-box h3{font-size:.78rem;margin:0 0 .5rem;display:flex;justify-content:space-between;align-items:center}.rf-level-list{display:flex;flex-direction:column;gap:.35rem;max-height:230px;overflow:auto}.rf-level-item{border:1px solid var(--border);border-radius:8px;padding:.45rem;background:var(--surface-1);font-size:.7rem}.rf-level-item strong{font-family:var(--font-mono);font-size:.63rem;color:var(--green-700)}.rf-level-item p{margin:.2rem 0 .35rem;line-height:1.3}.rf-row-actions{display:flex;gap:.25rem;flex-wrap:wrap}.rf-row-actions button{border:1px solid var(--border);background:var(--white);border-radius:6px;padding:.2rem .38rem;font-size:.64rem;cursor:pointer}.rf-row-actions button.danger{color:var(--red-600)}
        .rf-edit-form{margin-top:.8rem;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:.75rem}.rf-edit-form h3{margin:0 0 .55rem;font-size:.82rem}.rf-edit-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}.rf-edit-form label{display:flex;flex-direction:column;gap:.2rem;font-size:.7rem;font-weight:700;color:var(--text-2)}.rf-form-full{grid-column:1/-1}.rf-form-actions{display:flex;justify-content:flex-end;gap:.4rem;margin-top:.6rem}
        .rf-tools{display:grid;grid-template-columns:minmax(220px,1fr) minmax(220px,360px) auto;gap:.65rem;align-items:end;background:var(--white);border:1px solid var(--border);border-radius:12px;padding:.8rem;margin-bottom:.8rem}.rf-tools label{display:flex;flex-direction:column;gap:.25rem}.rf-tools span{font-size:.72rem;font-weight:700;color:var(--text-2)}
        .rf-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--white);max-height:calc(100vh - 300px)}.rf-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1500px;font-size:.78rem}.rf-table th{position:sticky;top:0;z-index:3;background:var(--surface-1);color:var(--text-2);font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;text-align:left;padding:.65rem;border-bottom:1px solid var(--border);white-space:nowrap}.rf-table td{vertical-align:top;padding:.65rem;border-bottom:1px solid var(--border);border-right:1px solid var(--border);line-height:1.35}.rf-table tr:last-child td{border-bottom:none}.rf-table td:last-child,.rf-table th:last-child{border-right:none}.rf-project{min-width:230px}.rf-level{min-width:250px}.rf-indicator{min-width:280px}.rf-num{min-width:90px;text-align:right}.rf-small{min-width:120px}.rf-code{display:block;font-family:var(--font-mono);font-size:.68rem;font-weight:700;color:var(--green-700);margin-bottom:.18rem}.rf-project strong{display:block;font-size:.82rem}.rf-empty{padding:2rem;text-align:center;color:var(--text-3)}
        @media(max-width:1050px){.rf-level-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:760px){.rf-tools{grid-template-columns:1fr}.rf-table-wrap{max-height:none}.rf-level-grid,.rf-edit-form-grid{grid-template-columns:1fr}.rf-form-full{grid-column:1}.rf-editor-select{min-width:0;width:100%}}
      `}</style>

      <div className="rf-title">
        <div><h1>Results Framework</h1><p>Portfolio-wide view of objectives, outcomes, outputs and indicators. System Administrators and DoCC M&E Officers can edit every project; Project Managers can edit only projects assigned to them.</p></div>
        <div className="rf-stats" aria-label="Results framework totals"><div className="rf-stat"><strong>{projectCount}</strong><span>Projects shown</span></div><div className="rf-stat"><strong>{indicatorCount}</strong><span>Indicators shown</span></div></div>
      </div>

      <section className="rf-directory" aria-label="All registered projects">
        <div className="rf-directory-head"><h2>All Registered Projects</h2><span>{data.projects.length} projects</span></div>
        <div className="rf-project-grid">
          {data.projects.map((p) => <div className="rf-project-card" key={p.id}><div><strong>{p.name}</strong><small>{p.code || p.acronym || 'No project code'}</small></div>{editableIds.has(p.id) && <span className="rf-edit-badge">Editable</span>}</div>)}
        </div>
      </section>

      {editableIds.size > 0 && (
        <section className="rf-editor" aria-label="Results framework editor">
          <div className="rf-editor-head"><div><h2>Edit Results Framework</h2><p>{SUPER_EDITORS.includes(user?.role) ? 'You can edit all project frameworks.' : 'You can edit only projects assigned to you.'}</p></div><select className="field-input rf-editor-select" value={editorProjectId} onChange={(e) => { setEditorProjectId(e.target.value); setEditing(blankEdit()); }}><option value="">Select a project to edit</option>{data.projects.filter((p) => editableIds.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}</select></div>

          {editorProject && <>
            <div className="rf-level-grid">
              <FrameworkBox title="Objectives" rows={editorObjectives} onAdd={() => openNew('objective')} onEdit={(r) => openExisting('objective', r)} onDelete={(r) => remove('objective', r.id)} textKey="statement" />
              <FrameworkBox title="Outcomes" rows={editorOutcomes} onAdd={() => openNew('outcome')} onEdit={(r) => openExisting('outcome', r)} onDelete={(r) => remove('outcome', r.id)} textKey="statement" />
              <FrameworkBox title="Outputs" rows={editorOutputs} onAdd={() => openNew('output')} onEdit={(r) => openExisting('output', r)} onDelete={(r) => remove('output', r.id)} textKey="statement" />
              <FrameworkBox title="Indicators" rows={editorIndicators} onAdd={() => openNew('indicator')} onEdit={(r) => openExisting('indicator', r)} onDelete={(r) => remove('indicator', r.id)} textKey="name" />
            </div>

            {editing.kind && <form className="rf-edit-form" onSubmit={saveEdit}>
              <h3>{editing.id ? 'Edit' : 'Add'} {editing.kind}</h3>
              <div className="rf-edit-form-grid">
                {editing.kind !== 'indicator' && <label className="rf-form-full"><span>Statement</span><textarea className="field-input" rows={3} value={editing.statement} onChange={(e) => setEditing((s) => ({ ...s, statement: e.target.value }))} required /></label>}
                {editing.kind === 'outcome' && !editing.id && <label className="rf-form-full"><span>Parent objective</span><select className="field-input" value={editing.parentId} onChange={(e) => setEditing((s) => ({ ...s, parentId: e.target.value }))} required>{editorObjectives.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.statement}</option>)}</select></label>}
                {editing.kind === 'output' && !editing.id && <label className="rf-form-full"><span>Parent outcome</span><select className="field-input" value={editing.parentId} onChange={(e) => setEditing((s) => ({ ...s, parentId: e.target.value }))} required>{editorOutcomes.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.statement}</option>)}</select></label>}
                {editing.kind === 'indicator' && <>
                  <label className="rf-form-full"><span>Indicator name</span><input className="field-input" value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} required /></label>
                  <label className="rf-form-full"><span>Linked result level</span><select className="field-input" value={editing.parentId} onChange={(e) => setEditing((s) => ({ ...s, parentId: e.target.value }))}><option value="">Not linked</option>{linkedOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                  <label><span>Baseline</span><input className="field-input" type="number" step="any" value={editing.baseline} onChange={(e) => setEditing((s) => ({ ...s, baseline: e.target.value }))} /></label>
                  <label><span>Target</span><input className="field-input" type="number" step="any" value={editing.target} onChange={(e) => setEditing((s) => ({ ...s, target: e.target.value }))} /></label>
                  <label><span>Unit</span><input className="field-input" value={editing.unit} onChange={(e) => setEditing((s) => ({ ...s, unit: e.target.value }))} /></label>
                  <label><span>Reporting frequency</span><select className="field-input" value={editing.frequency} onChange={(e) => setEditing((s) => ({ ...s, frequency: e.target.value }))}><option value="">Select</option>{OPT.REPORTING_FREQUENCY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
                </>}
              </div>
              <div className="rf-form-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditing(blankEdit())}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
            </form>}
          </>}
        </section>
      )}

      <div className="rf-tools">
        <label><span>Search framework</span><input className="field-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Project, objective, outcome, output or indicator" /></label>
        <label><span>Project</span><select className="field-input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="all">All projects</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}</select></label>
        <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setProjectFilter('all'); }}>Reset</button>
      </div>

      {loading && <div className="rf-empty" role="status">Loading results framework…</div>}
      {error && <div className="rf-empty" role="alert">{error}</div>}
      {!loading && !error && <div className="rf-table-wrap"><table className="rf-table"><thead><tr><th>Project</th><th>Objective</th><th>Outcome</th><th>Output</th><th>Indicator</th><th>Baseline</th><th>Target</th><th>Unit</th><th>Reporting Frequency</th></tr></thead><tbody>{filtered.map((r, idx) => <tr key={`${r.project.id}-${r.indicator?.id ?? r.output?.id ?? r.outcome?.id ?? r.objective?.id ?? idx}`}><td className="rf-project"><span className="rf-code">{r.project.code || r.project.acronym || 'NO CODE'}</span><strong>{r.project.name}</strong></td><td className="rf-level">{r.objective ? <><span className="rf-code">{r.objective.code}</span>{r.objective.statement}</> : '—'}</td><td className="rf-level">{r.outcome ? <><span className="rf-code">{r.outcome.code}</span>{r.outcome.statement}</> : '—'}</td><td className="rf-level">{r.output ? <><span className="rf-code">{r.output.code}</span>{r.output.statement}</> : '—'}</td><td className="rf-indicator">{r.indicator ? <><span className="rf-code">{r.indicator.code}</span>{r.indicator.name}</> : '—'}</td><td className="rf-num">{r.indicator ? value(r.indicator.baseline_value) : '—'}</td><td className="rf-num">{r.indicator ? value(r.indicator.target_value) : '—'}</td><td className="rf-small">{r.indicator ? value(r.indicator.unit) : '—'}</td><td className="rf-small">{r.indicator?.frequency ? OPT.labelOf(OPT.REPORTING_FREQUENCY, r.indicator.frequency) : '—'}</td></tr>)}</tbody></table>{!filtered.length && <div className="rf-empty">No results-framework rows match the current filters.</div>}</div>}
    </div>
  );
}

function FrameworkBox({ title, rows, onAdd, onEdit, onDelete, textKey }) {
  return <section className="rf-level-box"><h3><span>{title}</span><button type="button" className="btn btn-secondary" style={{ padding: '.25rem .4rem', fontSize: '.65rem' }} onClick={onAdd}>+ Add</button></h3><div className="rf-level-list">{rows.map((r) => <div className="rf-level-item" key={r.id}><strong>{r.code}</strong><p>{r[textKey]}</p><div className="rf-row-actions"><button type="button" onClick={() => onEdit(r)}>Edit</button><button type="button" className="danger" onClick={() => onDelete(r)}>Delete</button></div></div>)}{!rows.length && <div style={{ color: 'var(--text-3)', fontSize: '.7rem' }}>None recorded.</div>}</div></section>;
}
