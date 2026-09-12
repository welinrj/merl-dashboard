import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { dbErrorMessage } from '../lib/dbError';
import * as OPT from '../constants/formOptions';

const NODE_TYPES = [
  ['project_objective', 'Project Objective'],
  ['impact', 'Impact'],
  ['paradigm_shift', 'Paradigm Shift'],
  ['gcf_result_area', 'GCF Result Area'],
  ['component', 'Component'],
  ['outcome', 'Outcome'],
  ['output', 'Output'],
  ['sub_output', 'Sub-output'],
  ['co_benefit', 'Co-benefit'],
];

const blankNode = () => ({ id: null, projectId: '', parentId: '', nodeType: 'output', title: '', description: '', sortOrder: 0 });
const blankIndicator = () => ({ id: null, projectId: '', frameworkNodeId: '', name: '', unit: '', baseline: '', finalTarget: '', frequency: '', direction: 'increase', aggregationMethod: 'latest', meansOfVerification: '', dataSource: '', collectionMethod: '', disaggregation: '', assumptions: '' });
const n = (v) => (v === '' || v == null ? null : Number(v));
const show = (v) => (v === '' || v == null ? '—' : String(v));

function nodeLabel(node) {
  const type = NODE_TYPES.find(([v]) => v === node?.node_type)?.[1] || String(node?.node_type || '').replaceAll('_', ' ');
  return `${type}${node?.node_code ? ` · ${node.node_code}` : ''}`;
}

function buildPaths(nodes) {
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const cache = new Map();
  const pathOf = (id, seen = new Set()) => {
    if (!id || !byId.has(id)) return [];
    if (cache.has(id)) return cache.get(id);
    if (seen.has(id)) return [byId.get(id)];
    const node = byId.get(id);
    const nextSeen = new Set(seen); nextSeen.add(id);
    const path = [...pathOf(node.parent_node_id, nextSeen), node];
    cache.set(id, path);
    return path;
  };
  return { byId, pathOf };
}

export default function ResultsWorkspace({ user }) {
  const [data, setData] = useState({ projects: [], nodes: [], indicators: [], targets: [], narratives: [] });
  const [editableIds, setEditableIds] = useState(new Set());
  const [projectFilter, setProjectFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState('');
  const [error, setError] = useState('');
  const [editingNode, setEditingNode] = useState(null);
  const [editingIndicator, setEditingIndicator] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((x) => x + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    Promise.all([
      supabase.from('v_projects').select('id, code, acronym, name, status').order('code'),
      supabase.from('v_framework_nodes').select('*').order('sort_order').order('node_code'),
      supabase.from('v_project_indicators').select('*').order('code'),
      supabase.from('v_indicator_targets').select('*'),
      supabase.from('v_indicator_narrative_latest').select('*'),
      supabase.rpc('list_results_framework_editable_projects'),
    ]).then((responses) => {
      if (!alive) return;
      const failed = responses.slice(0, 5).find((r) => r.error);
      if (failed?.error) throw failed.error;
      const [projects, nodes, indicators, targets, narratives, permission] = responses;
      setData({
        projects: projects.data || [],
        nodes: nodes.data || [],
        indicators: indicators.data || [],
        targets: targets.data || [],
        narratives: narratives.data || [],
      });
      setEditableIds(new Set(permission.error ? [] : (permission.data || []).map((r) => r.project_id)));
      setPermissionError(permission.error ? 'Editing permissions could not be verified. Results Framework is read-only.' : '');
      setLoading(false);
    }).catch((err) => { if (alive) { setError(dbErrorMessage(err)); setLoading(false); } });
    return () => { alive = false; };
  }, [reloadKey, user?.id]);

  const projects = useMemo(() => new Map(data.projects.map((p) => [p.id, p])), [data.projects]);
  const { byId: nodesById, pathOf } = useMemo(() => buildPaths(data.nodes), [data.nodes]);
  const targets = useMemo(() => {
    const out = new Map();
    for (const t of data.targets) {
      if (!out.has(t.indicator_id)) out.set(t.indicator_id, {});
      out.get(t.indicator_id)[t.target_type] = t;
    }
    return out;
  }, [data.targets]);
  const narratives = useMemo(() => new Map(data.narratives.map((x) => [x.indicator_id, x])), [data.narratives]);

  const rows = useMemo(() => data.indicators.map((indicator) => {
    const project = projects.get(indicator.project_id);
    const path = pathOf(indicator.framework_node_id);
    const t = targets.get(indicator.id) || {};
    return {
      project, indicator, path,
      baseline: t.baseline || { numeric_value: indicator.baseline_value },
      mid: t.mid_term,
      final: t.final || { numeric_value: indicator.target_value },
      narrative: narratives.get(indicator.id),
    };
  }).filter((r) => r.project), [data.indicators, projects, pathOf, targets, narratives]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (projectFilter !== 'all' && r.project.id !== projectFilter) return false;
      if (!q) return true;
      return [r.project.code, r.project.name, r.indicator.code, r.indicator.name, ...r.path.flatMap((x) => [x.node_code, x.title])]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [rows, projectFilter, search]);

  const visibleNodes = useMemo(() => data.nodes
    .filter((x) => projectFilter === 'all' || x.project_id === projectFilter)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || String(a.node_code || '').localeCompare(String(b.node_code || ''))), [data.nodes, projectFilter]);

  const canEdit = (projectId) => !saving && editableIds.has(projectId);

  const openNewNode = (projectId) => setEditingNode({ ...blankNode(), projectId });
  const openEditNode = (node) => setEditingNode({ id: node.id, projectId: node.project_id, parentId: node.parent_node_id || '', nodeType: node.node_type, title: node.title || '', description: node.description || '', sortOrder: node.sort_order || 0 });
  const openNewIndicator = (projectId, frameworkNodeId = '') => setEditingIndicator({ ...blankIndicator(), projectId, frameworkNodeId });
  const openEditIndicator = (i) => {
    const t = targets.get(i.id) || {};
    setEditingIndicator({
      id: i.id, projectId: i.project_id, frameworkNodeId: i.framework_node_id || '',
      name: i.name || '', unit: i.unit || '',
      baseline: t.baseline?.numeric_value ?? i.baseline_value ?? '',
      finalTarget: t.final?.numeric_value ?? i.target_value ?? '',
      frequency: i.official_reporting_frequency || i.frequency || '',
      direction: i.direction || 'increase', aggregationMethod: i.aggregation_method || 'latest',
      meansOfVerification: i.means_of_verification || '', dataSource: i.data_source || '',
      collectionMethod: i.collection_method || '', disaggregation: i.disaggregation || '',
      assumptions: i.assumptions || '',
    });
  };

  const saveNode = async (e) => {
    e.preventDefault();
    const x = editingNode;
    if (!x || !canEdit(x.projectId)) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('upsert_framework_node', {
        p_id: x.id, p_project_id: x.projectId, p_parent_node_id: x.parentId || null,
        p_node_type: x.nodeType, p_title: x.title, p_description: x.description || null,
        p_status: 'draft', p_sort_order: Number(x.sortOrder) || 0,
      });
      if (err) throw err;
      toast.success('Framework result saved.'); setEditingNode(null); reload();
    } catch (err) { toast.error(dbErrorMessage(err)); } finally { setSaving(false); }
  };

  const saveIndicator = async (e) => {
    e.preventDefault();
    const x = editingIndicator;
    if (!x || !canEdit(x.projectId)) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('upsert_project_indicator_v2', {
        p_id: x.id, p_project_id: x.projectId, p_framework_node_id: x.frameworkNodeId || null,
        p_name: x.name, p_unit: x.unit || null, p_baseline_value: n(x.baseline), p_final_target: n(x.finalTarget),
        p_frequency: x.frequency || null, p_direction: x.direction, p_aggregation_method: x.aggregationMethod,
        p_progress_method: ['milestone', 'qualitative'].includes(x.direction) ? x.direction : 'auto',
        p_means_of_verification: x.meansOfVerification || null, p_data_source: x.dataSource || null,
        p_collection_method: x.collectionMethod || null, p_disaggregation: x.disaggregation || null,
        p_assumptions: x.assumptions || null, p_is_qualitative: ['milestone', 'qualitative'].includes(x.direction),
        p_higher_is_better: x.direction !== 'decrease', p_responsible_officer: null,
      });
      if (err) throw err;
      toast.success('Indicator saved.'); setEditingIndicator(null); reload();
    } catch (err) { toast.error(dbErrorMessage(err)); } finally { setSaving(false); }
  };

  const removeNode = async (node) => {
    if (!canEdit(node.project_id) || !window.confirm(`Delete ${node.node_code || node.title}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('delete_framework_node', { p_id: node.id });
      if (err) throw err;
      toast.success('Framework result deleted.'); reload();
    } catch (err) { toast.error(dbErrorMessage(err)); } finally { setSaving(false); }
  };

  const removeIndicator = async (indicator) => {
    if (!canEdit(indicator.project_id) || !window.confirm(`Delete ${indicator.code || indicator.name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('delete_project_indicator', { p_id: indicator.id });
      if (err) throw err;
      toast.success('Indicator deleted.'); reload();
    } catch (err) { toast.error(dbErrorMessage(err)); } finally { setSaving(false); }
  };

  const selectedProject = projectFilter === 'all' ? null : projects.get(projectFilter);
  const nodeOptions = data.nodes.filter((x) => x.project_id === (editingNode?.projectId || editingIndicator?.projectId));

  return <div className="page-pad rf2">
    <style>{`
      .rf2{max-width:none;margin:0 auto}.rf2 h1{margin:0;font-size:1.7rem}.rf2-sub{margin:.35rem 0 1rem;color:var(--text-2);font-size:.8rem}
      .rf2-tools,.rf2-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:.9rem;margin-bottom:.85rem}
      .rf2-tools{display:grid;grid-template-columns:minmax(210px,1fr) minmax(240px,380px) auto;gap:.65rem;align-items:end}.rf2-tools label,.rf2-form label{display:grid;gap:.25rem;font-size:.7rem;font-weight:700}
      .rf2-actions{display:flex;gap:.45rem;flex-wrap:wrap}.rf2-tree{display:flex;flex-direction:column;gap:.35rem}.rf2-node{display:grid;grid-template-columns:130px minmax(0,1fr) auto;gap:.65rem;align-items:start;padding:.55rem .65rem;border:1px solid var(--border);border-radius:8px;background:#fafafa}.rf2-node-type{font-size:.64rem;text-transform:uppercase;color:var(--text-3);font-weight:800}.rf2-node-title{font-size:.76rem;line-height:1.4}.rf2-node-title b{display:block;font-family:var(--font-mono);font-size:.66rem;color:var(--green-700)}
      .rf2-indent{margin-left:calc(var(--depth) * 20px)}.rf2-mini{border:0;background:none;color:var(--green-700);font:inherit;font-size:.68rem;font-weight:700;cursor:pointer}.rf2-mini.danger{color:#b91c1c}
      .rf2-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.rf2-full{grid-column:1/-1}.rf2-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:.5rem}
      .rf2-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:12px;background:#fff}.rf2-table{width:100%;border-collapse:collapse;min-width:1450px;font-size:.74rem}.rf2-table th{position:sticky;top:0;background:var(--surface-1);z-index:2;text-align:left;padding:.65rem;border-bottom:1px solid var(--border);font-size:.63rem;text-transform:uppercase}.rf2-table td{vertical-align:top;padding:.65rem;border-bottom:1px solid var(--border);line-height:1.4}.rf2-path{min-width:340px}.rf2-path-line{display:flex;gap:.4rem;margin-bottom:.22rem}.rf2-path-type{min-width:82px;color:var(--text-3);font-size:.62rem;text-transform:uppercase;font-weight:800}.rf2-code{font-family:var(--font-mono);font-size:.65rem;color:var(--green-700);font-weight:800}.rf2-ind{min-width:300px}.rf2-number{min-width:95px;text-align:right}.rf2-narrative{min-width:300px}.rf2-narrative summary{cursor:pointer;color:var(--green-700);font-weight:700}.rf2-narrative p{margin:.35rem 0 0;color:var(--text-2);white-space:pre-wrap}.rf2-empty{padding:1.3rem;text-align:center;color:var(--text-3)}
      @media(max-width:800px){.rf2-tools,.rf2-form{grid-template-columns:1fr}.rf2-full,.rf2-form-actions{grid-column:1}.rf2-node{grid-template-columns:1fr}.rf2-indent{margin-left:0}}
    `}</style>
    <h1>Results Framework</h1>
    <p className="rf2-sub">One flexible results engine for VCAP2, VCCRP and future DoCC projects. Original donor terminology and hierarchy are preserved. Latest reporting narrative is shown beside each indicator.</p>

    <section className="rf2-tools">
      <label>Search<input className="field-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Project, result or indicator" /></label>
      <label>Project<select className="field-input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}><option value="all">All projects</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}</select></label>
      <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setProjectFilter('all'); }}>Reset</button>
    </section>

    {permissionError && <p role="alert" className="rf2-sub">{permissionError}</p>}
    {selectedProject && editableIds.has(selectedProject.id) && <section className="rf2-card">
      <div className="rf2-actions">
        <button type="button" className="btn btn-secondary" onClick={() => openNewNode(selectedProject.id)}>+ Add result level</button>
        <button type="button" className="btn btn-secondary" onClick={() => openNewIndicator(selectedProject.id)}>+ Add indicator</button>
      </div>
      {editingNode && <form className="rf2-form" onSubmit={saveNode} style={{ marginTop: '.8rem' }}>
        <label>Type<select className="field-input" value={editingNode.nodeType} onChange={(e) => setEditingNode((s) => ({ ...s, nodeType: e.target.value }))}>{NODE_TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Parent<select className="field-input" value={editingNode.parentId} onChange={(e) => setEditingNode((s) => ({ ...s, parentId: e.target.value }))}><option value="">Top level</option>{nodeOptions.filter((x) => x.id !== editingNode.id).map((x) => <option key={x.id} value={x.id}>{x.node_code ? `${x.node_code} — ` : ''}{x.title}</option>)}</select></label>
        <label className="rf2-full">Title<input className="field-input" value={editingNode.title} onChange={(e) => setEditingNode((s) => ({ ...s, title: e.target.value }))} required /></label>
        <label className="rf2-full">Description<textarea className="field-input" rows={3} value={editingNode.description} onChange={(e) => setEditingNode((s) => ({ ...s, description: e.target.value }))} /></label>
        <label>Sort order<input className="field-input" type="number" value={editingNode.sortOrder} onChange={(e) => setEditingNode((s) => ({ ...s, sortOrder: e.target.value }))} /></label>
        <div className="rf2-form-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditingNode(null)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save result'}</button></div>
      </form>}
      {editingIndicator && <form className="rf2-form" onSubmit={saveIndicator} style={{ marginTop: '.8rem' }}>
        <label className="rf2-full">Indicator name<input className="field-input" value={editingIndicator.name} onChange={(e) => setEditingIndicator((s) => ({ ...s, name: e.target.value }))} required /></label>
        <label className="rf2-full">Result level<select className="field-input" value={editingIndicator.frameworkNodeId} onChange={(e) => setEditingIndicator((s) => ({ ...s, frameworkNodeId: e.target.value }))}><option value="">Project level</option>{nodeOptions.map((x) => <option key={x.id} value={x.id}>{x.node_code ? `${x.node_code} — ` : ''}{x.title}</option>)}</select></label>
        <label>Baseline<input className="field-input" type="number" step="any" value={editingIndicator.baseline} onChange={(e) => setEditingIndicator((s) => ({ ...s, baseline: e.target.value }))} /></label>
        <label>Final target<input className="field-input" type="number" step="any" value={editingIndicator.finalTarget} onChange={(e) => setEditingIndicator((s) => ({ ...s, finalTarget: e.target.value }))} /></label>
        <label>Unit<input className="field-input" value={editingIndicator.unit} onChange={(e) => setEditingIndicator((s) => ({ ...s, unit: e.target.value }))} /></label>
        <label>Official reporting frequency<select className="field-input" value={editingIndicator.frequency} onChange={(e) => setEditingIndicator((s) => ({ ...s, frequency: e.target.value }))}><option value="">Select</option>{OPT.REPORTING_FREQUENCY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label>Direction<select className="field-input" value={editingIndicator.direction} onChange={(e) => setEditingIndicator((s) => ({ ...s, direction: e.target.value }))}><option value="increase">Increase</option><option value="decrease">Decrease</option><option value="maintain">Maintain</option><option value="milestone">Milestone</option><option value="qualitative">Qualitative</option></select></label>
        <label>Aggregation<select className="field-input" value={editingIndicator.aggregationMethod} onChange={(e) => setEditingIndicator((s) => ({ ...s, aggregationMethod: e.target.value }))}><option value="latest">Latest cumulative value</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option><option value="weighted_average">Weighted average</option><option value="percentage">Percentage</option><option value="milestone">Milestone</option><option value="qualitative">Qualitative</option></select></label>
        <label className="rf2-full">Means of verification<textarea className="field-input" rows={2} value={editingIndicator.meansOfVerification} onChange={(e) => setEditingIndicator((s) => ({ ...s, meansOfVerification: e.target.value }))} /></label>
        <div className="rf2-form-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditingIndicator(null)}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save indicator'}</button></div>
      </form>}
    </section>}

    {selectedProject && <section className="rf2-card">
      <h2 style={{ margin: '0 0 .65rem', fontSize: '.95rem' }}>{selectedProject.name} · Result hierarchy</h2>
      <div className="rf2-tree">
        {visibleNodes.map((node) => {
          const depth = Math.max(0, pathOf(node.id).length - 1);
          return <div className="rf2-node rf2-indent" style={{ '--depth': depth }} key={node.id}>
            <span className="rf2-node-type">{nodeLabel(node)}</span>
            <div className="rf2-node-title">{node.node_code && <b>{node.node_code}</b>}{node.title}</div>
            {canEdit(node.project_id) && <div><button type="button" className="rf2-mini" onClick={() => openEditNode(node)}>Edit</button> <button type="button" className="rf2-mini danger" onClick={() => removeNode(node)}>Delete</button> <button type="button" className="rf2-mini" onClick={() => openNewIndicator(node.project_id, node.id)}>+ Indicator</button></div>}
          </div>;
        })}
      </div>
    </section>}

    {loading && <div className="rf2-empty">Loading results framework…</div>}
    {error && <div className="rf2-empty" role="alert">{error}</div>}
    {!loading && !error && <div className="rf2-table-wrap"><table className="rf2-table"><thead><tr><th>Project</th><th>Result hierarchy</th><th>Indicator</th><th>Baseline</th><th>Mid-term</th><th>Final target</th><th>Unit</th><th>Official frequency</th><th>Narrative</th><th>Actions</th></tr></thead><tbody>
      {filteredRows.map((r) => <tr key={r.indicator.id}>
        <td><span className="rf2-code">{r.project.code || r.project.acronym || 'NO CODE'}</span><strong>{r.project.name}</strong></td>
        <td className="rf2-path">{r.path.length ? r.path.map((x) => <div className="rf2-path-line" key={x.id}><span className="rf2-path-type">{NODE_TYPES.find(([v]) => v === x.node_type)?.[1] || x.node_type}</span><span><span className="rf2-code">{x.node_code}</span> {x.title}</span></div>) : 'Project level'}</td>
        <td className="rf2-ind"><span className="rf2-code">{r.indicator.code}</span><strong>{r.indicator.name}</strong></td>
        <td className="rf2-number">{show(r.baseline?.numeric_value ?? r.baseline?.text_value)}</td>
        <td className="rf2-number">{show(r.mid?.numeric_value ?? r.mid?.text_value)}</td>
        <td className="rf2-number">{show(r.final?.numeric_value ?? r.final?.text_value)}</td>
        <td>{show(r.indicator.unit)}</td>
        <td>{r.indicator.official_reporting_frequency || r.indicator.frequency || '—'}</td>
        <td className="rf2-narrative">{r.narrative ? <details><summary>{r.narrative.reporting_period || 'View narrative'}</summary><p>{r.narrative.progress_summary || r.narrative.public_summary || r.narrative.key_achievements || 'Narrative recorded.'}</p>{r.narrative.challenges && <p><b>Challenges:</b> {r.narrative.challenges}</p>}{r.narrative.corrective_actions && <p><b>Corrective action:</b> {r.narrative.corrective_actions}</p>}</details> : '—'}</td>
        <td>{canEdit(r.project.id) ? <><button type="button" className="rf2-mini" onClick={() => openEditIndicator(r.indicator)}>Edit</button> <button type="button" className="rf2-mini danger" onClick={() => removeIndicator(r.indicator)}>Delete</button></> : '—'}</td>
      </tr>)}
    </tbody></table>{!filteredRows.length && <div className="rf2-empty">No indicators match the current filters.</div>}</div>}
  </div>;
}
