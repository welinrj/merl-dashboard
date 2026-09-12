import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { dbErrorMessage } from '../lib/dbError';
import * as OPT from '../constants/formOptions';

const blank = () => ({
  id: null,
  framework_node_id: '',
  name: '',
  description: '',
  status: 'not_started',
  responsible_org: '',
  responsible_officer: '',
  province: '',
  island: '',
  area_council: '',
  community: '',
  planned_start_date: '',
  planned_end_date: '',
  actual_start_date: '',
  actual_end_date: '',
  planned_budget: '',
  actual_expenditure: '',
  physical_progress_pct: '',
  key_achievement: '',
  issue_delay: '',
  next_action: '',
  next_action_due: '',
});

const nullable = value => value === '' || value == null ? null : value;
const numberOrNull = value => value === '' || value == null ? null : Number(value);
const nodeLabel = node => [node.node_code, node.node_type?.replaceAll('_', ' '), node.title].filter(Boolean).join(' · ');

export default function ActivityManager({ projectId, canEdit = false }) {
  const [rows, setRows] = useState([]);
  const [nodes, setNodes] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) { setRows([]); setNodes([]); return; }
    setLoading(true);
    const [activities, framework] = await Promise.all([
      supabase.from('v_project_activities').select('*').eq('project_id', projectId).order('code'),
      supabase.from('v_framework_nodes').select('id, node_code, node_type, title, sort_order').eq('project_id', projectId).order('sort_order').order('node_code'),
    ]);
    if (activities.error) toast.error(dbErrorMessage(activities.error));
    if (framework.error) toast.error(dbErrorMessage(framework.error));
    setRows(activities.data ?? []);
    setNodes(framework.data ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); setEditing(null); }, [load]);

  const linkedNodes = useMemo(() => nodes.filter(node =>
    ['component', 'outcome', 'output', 'sub_output'].includes(node.node_type)), [nodes]);

  const openEdit = row => setEditing({
    ...blank(),
    ...row,
    framework_node_id: row.framework_node_id ?? '',
    description: row.description ?? '',
    responsible_org: row.responsible_org ?? '',
    responsible_officer: row.responsible_officer ?? '',
    province: row.province ?? '',
    island: row.island ?? '',
    area_council: row.area_council ?? '',
    community: row.community ?? '',
    planned_start_date: row.planned_start_date ?? '',
    planned_end_date: row.planned_end_date ?? '',
    actual_start_date: row.actual_start_date ?? '',
    actual_end_date: row.actual_end_date ?? '',
    planned_budget: row.planned_budget ?? '',
    actual_expenditure: row.actual_expenditure ?? '',
    physical_progress_pct: row.physical_progress_pct ?? '',
    key_achievement: row.key_achievement ?? '',
    issue_delay: row.issue_delay ?? '',
    next_action: row.next_action ?? '',
    next_action_due: row.next_action_due ?? '',
  });

  const save = async event => {
    event.preventDefault();
    if (!canEdit || !editing || saving) return;
    if (!editing.name.trim()) { toast.error('Activity title is required.'); return; }
    setSaving(true);
    const { error } = await supabase.rpc('upsert_project_activity_v2', {
      p_id: editing.id,
      p_project_id: projectId,
      p_framework_node_id: nullable(editing.framework_node_id),
      p_name: editing.name.trim(),
      p_description: nullable(editing.description.trim()),
      p_status: editing.status,
      p_responsible_org: nullable(editing.responsible_org.trim()),
      p_responsible_officer: nullable(editing.responsible_officer.trim()),
      p_province: nullable(editing.province.trim()),
      p_island: nullable(editing.island.trim()),
      p_area_council: nullable(editing.area_council.trim()),
      p_community: nullable(editing.community.trim()),
      p_planned_start_date: nullable(editing.planned_start_date),
      p_planned_end_date: nullable(editing.planned_end_date),
      p_actual_start_date: nullable(editing.actual_start_date),
      p_actual_end_date: nullable(editing.actual_end_date),
      p_planned_budget: numberOrNull(editing.planned_budget),
      p_actual_expenditure: numberOrNull(editing.actual_expenditure),
      p_physical_progress_pct: numberOrNull(editing.physical_progress_pct),
      p_key_achievement: nullable(editing.key_achievement.trim()),
      p_issue_delay: nullable(editing.issue_delay.trim()),
      p_next_action: nullable(editing.next_action.trim()),
      p_next_action_due: nullable(editing.next_action_due),
    });
    setSaving(false);
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success(editing.id ? 'Activity updated.' : 'Activity added.');
    setEditing(null);
    load();
  };

  const remove = async row => {
    if (!canEdit) return;
    if (!window.confirm(`Delete ${row.code ? `${row.code} — ` : ''}${row.name}?`)) return;
    const { error } = await supabase.rpc('delete_project_activity', { p_id: row.id });
    if (error) { toast.error(dbErrorMessage(error)); return; }
    toast.success('Activity deleted.');
    if (editing?.id === row.id) setEditing(null);
    load();
  };

  const set = key => event => setEditing(current => ({ ...current, [key]: event.target.value }));

  return <div className="ps-config-card" id="activity-management">
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div>
        <h3>Activities & Workplan (Form 5)</h3>
        <p className="ps-config-note">Enter project activities here. Link an activity to the current Results Framework when applicable; unlinked activities remain valid project-level records.</p>
      </div>
      {canEdit && <button type="button" className="btn btn-primary" onClick={() => setEditing(blank())}>Add activity</button>}
    </div>

    {editing && <form onSubmit={save} style={{ marginTop: '.8rem', borderTop: '1px solid var(--border)', paddingTop: '.8rem' }}>
      <div className="ps-config-form">
        <label className="full"><span className="field-label">Activity title *</span><input className="field-input" value={editing.name} onChange={set('name')} required /></label>
        <label className="full"><span className="field-label">Linked result</span><select className="field-input" value={editing.framework_node_id} onChange={set('framework_node_id')}><option value="">Project-level / not linked</option>{linkedNodes.map(node => <option key={node.id} value={node.id}>{nodeLabel(node)}</option>)}</select></label>
        <label><span className="field-label">Status</span><select className="field-input" value={editing.status} onChange={set('status')}>{OPT.ACTIVITY_STATUS.map(option => <option key={option.value} value={option.value}>{OPT.optionLabel(option)}</option>)}</select></label>
        <label><span className="field-label">Physical progress (%)</span><input className="field-input" type="number" min="0" max="100" step="0.01" value={editing.physical_progress_pct} onChange={set('physical_progress_pct')} placeholder="Leave blank when not assessed" /></label>
        <label><span className="field-label">Responsible organisation</span><input className="field-input" value={editing.responsible_org} onChange={set('responsible_org')} /></label>
        <label><span className="field-label">Responsible officer</span><input className="field-input" value={editing.responsible_officer} onChange={set('responsible_officer')} /></label>
        <label><span className="field-label">Planned start</span><input className="field-input" type="date" value={editing.planned_start_date} onChange={set('planned_start_date')} /></label>
        <label><span className="field-label">Planned end</span><input className="field-input" type="date" value={editing.planned_end_date} onChange={set('planned_end_date')} /></label>
        <label><span className="field-label">Actual start</span><input className="field-input" type="date" value={editing.actual_start_date} onChange={set('actual_start_date')} /></label>
        <label><span className="field-label">Actual end</span><input className="field-input" type="date" value={editing.actual_end_date} onChange={set('actual_end_date')} /></label>
        <label><span className="field-label">Planned budget</span><input className="field-input" type="number" min="0" step="0.01" value={editing.planned_budget} onChange={set('planned_budget')} placeholder="Leave blank when not reported" /></label>
        <label><span className="field-label">Actual expenditure</span><input className="field-input" type="number" min="0" step="0.01" value={editing.actual_expenditure} onChange={set('actual_expenditure')} placeholder="Use 0 only for a recorded zero" /></label>
        <label><span className="field-label">Province</span><input className="field-input" value={editing.province} onChange={set('province')} /></label>
        <label><span className="field-label">Island</span><input className="field-input" value={editing.island} onChange={set('island')} /></label>
        <label><span className="field-label">Area Council</span><input className="field-input" value={editing.area_council} onChange={set('area_council')} /></label>
        <label><span className="field-label">Community</span><input className="field-input" value={editing.community} onChange={set('community')} /></label>
        <label className="full"><span className="field-label">Description</span><textarea className="field-input" rows={2} value={editing.description} onChange={set('description')} /></label>
        <label className="full"><span className="field-label">Key achievement</span><textarea className="field-input" rows={2} value={editing.key_achievement} onChange={set('key_achievement')} /></label>
        <label className="full"><span className="field-label">Issue / delay</span><textarea className="field-input" rows={2} value={editing.issue_delay} onChange={set('issue_delay')} /></label>
        <label className="full"><span className="field-label">Next action</span><textarea className="field-input" rows={2} value={editing.next_action} onChange={set('next_action')} /></label>
        <label><span className="field-label">Next action due</span><input className="field-input" type="date" value={editing.next_action_due} onChange={set('next_action_due')} /></label>
      </div>
      <p className="ps-config-note" style={{ marginTop: '.65rem' }}>Blank means not reported or not assessed. Enter 0 only when zero was explicitly measured or recorded.</p>
      <div className="ps-config-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save activity'}</button></div>
    </form>}

    <div className="ps-mini-table" style={{ marginTop: '.75rem' }}>
      <table>
        <thead><tr><th>Activity</th><th>Status</th><th>Progress</th><th>Planned end</th><th></th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan="5">Loading activities…</td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan="5">No activities have been entered for this project.</td></tr>}
          {rows.map(row => <tr key={row.id}>
            <td><b>{row.code ? `${row.code} — ` : ''}{row.name}</b><small>{row.output_code ? `Linked to ${row.output_code}` : 'Project-level / not linked'}</small></td>
            <td>{OPT.labelOf(OPT.ACTIVITY_STATUS, row.status)}</td>
            <td>{row.physical_progress_pct == null ? 'Not assessed' : `${row.physical_progress_pct}%`}</td>
            <td>{row.planned_end_date || 'Not reported'}</td>
            <td>{canEdit && <><button type="button" onClick={() => openEdit(row)}>Edit</button><button type="button" className="danger" onClick={() => remove(row)}>Delete</button></>}</td>
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
