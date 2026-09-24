import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
import { projectColor } from '../components/PublicProjectResults';
import * as OPT from '../constants/formOptions';
import IndicatorEvidencePanel, { EvidenceBadge } from '../components/IndicatorEvidencePanel';
import { fetchEvidenceStatus } from '../lib/evidenceIntelligence';

const NODE_TYPES = [
  ['project_objective', 'Project objective'],
  ['impact', 'Impact'],
  ['paradigm_shift', 'Paradigm shift'],
  ['gcf_result_area', 'GCF result area'],
  ['component', 'Component'],
  ['outcome', 'Outcome'],
  ['output', 'Output'],
  ['sub_output', 'Sub-output'],
  ['co_benefit', 'Co-benefit'],
];

const empty = {
  projects: [], nodes: [], indicators: [], targets: [], progress: [], narratives: [],
};

const routeProject = () => {
  try {
    return new URLSearchParams(window.location.hash.split('?')[1] || '').get('project') || 'all';
  } catch { return 'all'; }
};

const blankNode = () => ({
  mode: 'node', id: null, projectId: '', parentId: '', nodeType: 'outcome',
  title: '', description: '', status: 'draft', sortOrder: 0,
});

const blankIndicator = () => ({
  mode: 'indicator', id: null, projectId: '', frameworkNodeId: '', name: '', unit: '',
  baseline: '', finalTarget: '', frequency: '', direction: 'increase',
  aggregationMethod: 'latest', progressMethod: 'auto', meansOfVerification: '',
  dataSource: '', collectionMethod: '', disaggregation: '', assumptions: '',
  isQualitative: false, higherIsBetter: true, responsibleOfficer: '',
});

const asNumber = (v) => v === '' || v == null ? null : Number(v);
const display = (v) => v === '' || v == null ? '—' : String(v);
const pct = (v) => v == null || Number.isNaN(Number(v)) ? '—' : `${Math.round(Number(v))}%`;

function nodeTypeLabel(value) {
  return NODE_TYPES.find(([v]) => v === value)?.[1] || value || 'Result';
}

function buildNodePath(nodeId, nodesById) {
  const path = [];
  const seen = new Set();
  let current = nodesById.get(nodeId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_node_id ? nodesById.get(current.parent_node_id) : null;
  }
  return path;
}

function latestBy(rows, key, ranker = (r) => r.created_at || r.updated_at || '') {
  const out = new Map();
  for (const row of rows || []) {
    const k = row[key];
    if (!k) continue;
    const prev = out.get(k);
    if (!prev || ranker(row) > ranker(prev)) out.set(k, row);
  }
  return out;
}

function targetLookup(targets) {
  const map = new Map();
  for (const row of targets || []) {
    if (!map.has(row.indicator_id)) map.set(row.indicator_id, {});
    const bag = map.get(row.indicator_id);
    if (!bag[row.target_type]) bag[row.target_type] = row;
  }
  return map;
}

export default function ResultsWorkspace({ user }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [editableIds, setEditableIds] = useState(new Set());
  const [projectFilter, setProjectFilter] = useState(routeProject);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [evidence, setEvidence] = useState(() => new Map());
  const [evidenceIndicator, setEvidenceIndicator] = useState(null);
  // Narratives are clamped so every row is the same height; this holds the ones
  // the reader has opened back up.
  const [openNarratives, setOpenNarratives] = useState(() => new Set());
  const toggleNarrative = (key) => setOpenNarratives((prev) => {
    const next = new Set(prev);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  const refreshEvidence = () => { fetchEvidenceStatus().then(setEvidence).catch(() => {}); };

  const reload = () => setReloadKey((n) => n + 1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      localised(() => supabase.from('v_projects').select(i18nCols('id, code, acronym, name, status')).order('code')),
      supabase.from('v_framework_nodes').select('*').order('sort_order').order('node_code'),
      localised(() => supabase.from('v_project_indicators').select('*').order('code')),
      supabase.from('v_indicator_targets').select('*'),
      localised(() => supabase.from('v_indicator_progress').select('*')),
      supabase.from('v_result_narratives').select('*'),
      supabase.rpc('list_results_framework_editable_projects'),
    ]).then((responses) => {
      if (!alive) return;
      const failed = responses.slice(0, 6).find((r) => r.error);
      if (failed?.error) throw failed.error;
      const [projects, nodes, indicators, targets, progress, narratives] = responses.slice(0, 6).map((r) => r.data || []);
      setData({ projects, nodes, indicators, targets, progress, narratives });

      const permission = responses[6];
      setEditableIds(new Set(permission.error ? [] : (permission.data || []).map((r) => r.project_id)));
      // Evidence status is supplementary: a failure here must leave the
      // framework itself rendering, so it is fetched separately and swallowed.
      fetchEvidenceStatus().then((map) => { if (alive) setEvidence(map); }).catch(() => {});
      setPermissionError(permission.error
        ? 'Editing permissions could not be verified. The framework remains read-only.'
        : '');
      setLoading(false);
    }).catch((err) => {
      if (alive) {
        setError(dbErrorMessage(err));
        setLoading(false);
      }
    });
    return () => { alive = false; };
  }, [i18n.resolvedLanguage, reloadKey, user?.id]);

  const nodesById = useMemo(() => new Map(data.nodes.map((r) => [r.id, r])), [data.nodes]);
  const targetsByIndicator = useMemo(() => targetLookup(data.targets), [data.targets]);
  const latestProgress = useMemo(() => latestBy(data.progress, 'indicator_id', (r) => r.date_reported || r.created_at || ''), [data.progress]);
  const narrativeByProgress = useMemo(() => new Map(data.narratives.map((r) => [r.indicator_progress_id, r])), [data.narratives]);

  const rows = useMemo(() => {
    const projectMap = new Map(data.projects.map((p) => [p.id, p]));
    const indicatorRows = data.indicators.map((indicator) => {
      const node = indicator.framework_node_id ? nodesById.get(indicator.framework_node_id) : null;
      const progress = latestProgress.get(indicator.id) || null;
      const narrative = progress ? narrativeByProgress.get(progress.id) || null : null;
      return {
        type: 'indicator',
        project: projectMap.get(indicator.project_id),
        node,
        path: node ? buildNodePath(node.id, nodesById) : [],
        indicator,
        progress,
        narrative,
        targets: targetsByIndicator.get(indicator.id) || {},
      };
    }).filter((r) => r.project);

    const linkedNodeIds = new Set(data.indicators.map((i) => i.framework_node_id).filter(Boolean));
    const standaloneNodes = data.nodes
      .filter((n) => !linkedNodeIds.has(n.id))
      .map((node) => ({
        type: 'node',
        project: projectMap.get(node.project_id),
        node,
        path: buildNodePath(node.id, nodesById),
        indicator: null,
        progress: null,
        narrative: null,
        targets: {},
      }))
      .filter((r) => r.project);

    return [...indicatorRows, ...standaloneNodes].sort((a, b) => {
      const pa = `${a.project.code || ''} ${a.project.name}`;
      const pb = `${b.project.code || ''} ${b.project.name}`;
      return pa.localeCompare(pb)
        || a.path.map((n) => `${String(n.sort_order || 0).padStart(5, '0')}-${n.node_code || n.title}`).join('/').localeCompare(
          b.path.map((n) => `${String(n.sort_order || 0).padStart(5, '0')}-${n.node_code || n.title}`).join('/')
        )
        || (a.indicator?.code || '').localeCompare(b.indicator?.code || '');
    });
  }, [data.projects, data.nodes, data.indicators, nodesById, latestProgress, narrativeByProgress, targetsByIndicator]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (projectFilter !== 'all' && r.project.id !== projectFilter) return false;
      if (!q) return true;
      const haystack = [
        r.project.code, r.project.acronym, r.project.name,
        ...r.path.flatMap((n) => [n.node_code, n.node_type, n.title, n.description]),
        r.indicator?.code, r.indicator?.name, r.indicator?.unit,
        r.narrative?.progress_summary, r.narrative?.key_achievements,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, projectFilter, search]);

  const projectNodes = (projectId) => data.nodes.filter((n) => n.project_id === projectId);
  const canEdit = (projectId) => !loading && !saving && editableIds.has(projectId);

  const editNode = (node) => {
    if (!canEdit(node.project_id)) return;
    setEditor({
      ...blankNode(), id: node.id, projectId: node.project_id,
      parentId: node.parent_node_id || '', nodeType: node.node_type,
      title: node.title || '', description: node.description || '',
      status: node.status || 'draft', sortOrder: node.sort_order || 0,
    });
  };
  const editIndicator = (indicator) => {
    if (!canEdit(indicator.project_id)) return;
    setEditor({
      ...blankIndicator(), id: indicator.id, projectId: indicator.project_id,
      frameworkNodeId: indicator.framework_node_id || '', name: indicator.name || '',
      unit: indicator.unit || '', baseline: indicator.baseline_value ?? '',
      finalTarget: indicator.target_value ?? '', frequency: indicator.official_reporting_frequency || indicator.frequency || '',
      direction: indicator.direction || 'increase', aggregationMethod: indicator.aggregation_method || 'latest',
      progressMethod: indicator.progress_method || 'auto', meansOfVerification: indicator.means_of_verification || '',
      dataSource: indicator.data_source || '', collectionMethod: indicator.collection_method || '',
      disaggregation: indicator.disaggregation || '', assumptions: indicator.assumptions || '',
      isQualitative: Boolean(indicator.is_qualitative), higherIsBetter: indicator.higher_is_better !== false,
      responsibleOfficer: indicator.responsible_officer || '',
    });
  };

  const saveEditor = async (e) => {
    e.preventDefault();
    if (!editor || saving || !editableIds.has(editor.projectId)) return;
    setSaving(true);
    try {
      let result;
      if (editor.mode === 'node') {
        result = await supabase.rpc('upsert_framework_node', {
          p_id: editor.id,
          p_project_id: editor.projectId,
          p_parent_node_id: editor.parentId || null,
          p_node_type: editor.nodeType,
          p_title: editor.title,
          p_description: editor.description || null,
          p_status: editor.status || 'draft',
          p_sort_order: Number(editor.sortOrder) || 0,
        });
      } else {
        if (!editor.frameworkNodeId) throw new Error('Select the result node this indicator belongs to.');
        result = await supabase.rpc('upsert_project_indicator_v2', {
          p_id: editor.id,
          p_project_id: editor.projectId,
          p_framework_node_id: editor.frameworkNodeId,
          p_name: editor.name,
          p_unit: editor.unit || null,
          p_baseline_value: asNumber(editor.baseline),
          p_final_target: asNumber(editor.finalTarget),
          p_frequency: editor.frequency || null,
          p_direction: editor.direction,
          p_aggregation_method: editor.aggregationMethod,
          p_progress_method: editor.progressMethod,
          p_means_of_verification: editor.meansOfVerification || null,
          p_data_source: editor.dataSource || null,
          p_collection_method: editor.collectionMethod || null,
          p_disaggregation: editor.disaggregation || null,
          p_assumptions: editor.assumptions || null,
          p_is_qualitative: editor.isQualitative,
          p_higher_is_better: editor.higherIsBetter,
          p_responsible_officer: editor.responsibleOfficer || null,
        });
      }
      if (result?.error) throw result.error;
      toast.success(editor.mode === 'node' ? 'Result node saved.' : 'Indicator saved.');
      setEditor(null);
      reload();
    } catch (err) {
      toast.error(dbErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeNode = async (node) => {
    if (!canEdit(node.project_id)) return;
    if (!window.confirm(`Delete ${node.node_code || node.title}? Linked children or indicators must be removed first.`)) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('delete_framework_node', { p_id: node.id });
      if (err) throw err;
      toast.success('Result node deleted.');
      reload();
    } catch (err) {
      toast.error(dbErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeIndicator = async (indicator) => {
    if (!canEdit(indicator.project_id)) return;
    if (!window.confirm(`Delete ${indicator.code || indicator.name}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.rpc('delete_project_indicator', { p_id: indicator.id });
      if (err) throw err;
      toast.success('Indicator deleted.');
      reload();
    } catch (err) {
      toast.error(dbErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const status = (row) => {
    if (!row.progress) return <span className="rf2-pill neutral">No data</span>;
    const performance = row.progress.performance_status || 'no_data';
    const schedule = row.progress.schedule_status || 'on_schedule';
    return <div className="rf2-status-stack">
      <span className={`rf2-pill ${performance}`}>{performance.replaceAll('_', ' ')}</span>
      {schedule === 'delayed' && <span className="rf2-pill delayed">Delayed</span>}
    </div>;
  };

  return <div className="page-pad rf2-page">
    <ResultsStyles />

    <header className="rf2-header">
      <div>
        <h1>Results Framework</h1>
      </div>
      <div className="rf2-summary">
        <div><b>{new Set(filtered.map((r) => r.project.id)).size}</b><span>Projects shown</span></div>
        <div><b>{filtered.filter((r) => r.indicator).length}</b><span>Indicators shown</span></div>
      </div>
    </header>

    <section className="rf2-tools">
      <label>Project
        <select className="field-input" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">All projects</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>)}
        </select>
      </label>
      <label>Search framework
        <input className="field-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Result, indicator, narrative…" />
      </label>
      <button type="button" className="btn btn-secondary" onClick={() => { setProjectFilter('all'); setSearch(''); }}>Reset</button>
    </section>

    {permissionError && <div className="rf2-note" role="alert">{permissionError}</div>}

    {loading && <div className="rf2-empty" role="status">Loading results framework…</div>}
    {error && <div className="rf2-empty" role="alert">{error}</div>}

    {!loading && !error && <div className="rf2-table-wrap">
      <table className="rf2-table">
        <thead><tr>
          <th>Project</th><th>Results pathway</th><th>Indicator</th>
          <th>Baseline</th><th>Mid-term</th><th>Final target</th>
          <th>Latest actual</th><th>Progress</th><th>Status</th>
          <th>Narrative</th><th>Reporting</th><th>{t('evi.colEvidence')}</th>
        </tr></thead>
        <tbody>
          {filtered.map((row, idx) => {
            const baseline = row.targets.baseline?.numeric_value ?? row.indicator?.baseline_value;
            const mid = row.targets.mid_term?.numeric_value ?? row.targets.mid_term?.text_value;
            const finalTarget = row.targets.final?.numeric_value ?? row.indicator?.target_value;
            const actual = row.progress?.cumulative_actual ?? row.progress?.actual_this_period;
            const narrative = row.narrative?.progress_summary || row.progress?.narrative || '';
            const rowKey = row.indicator?.id || row.node?.id || idx;
            const narrativeOpen = openNarratives.has(rowKey);
            return <tr key={rowKey} className={row.indicator ? undefined : 'rf2-row-node'}>
              <td className="rf2-project">
                <div className="rf2-project-mark" style={projectColor(row.project)}>
                  <small>{row.project.code || row.project.acronym || 'NO CODE'}</small>
                  <b>{row.project.name}</b>
                </div>
              </td>
              <td className="rf2-path">
                {row.path.length ? row.path.map((node) => <div key={node.id} className="rf2-path-row">
                  <span>{nodeTypeLabel(node.node_type)}</span>
                  <b>{node.node_code || ''}</b>
                  <p>{node.title}</p>
                  {node.id === row.node?.id && node.description && (
                    <details className="rf2-path-details"><summary>Details</summary><p>{node.description}</p></details>
                  )}
                  {canEdit(row.project.id) && node.id === row.node?.id && <span className="rf2-inline-actions">
                    <button type="button" onClick={() => editNode(node)}>Edit</button>
                    <button type="button" className="danger" onClick={() => removeNode(node)}>Delete</button>
                  </span>}
                </div>) : <span className="rf2-muted">Unlinked</span>}
              </td>
              <td className="rf2-indicator">
                {row.indicator ? <>
                  <small>{row.indicator.code}</small><b>{row.indicator.name}</b>
                  {row.indicator.unit && <span>{row.indicator.unit}</span>}
                  {canEdit(row.project.id) && <span className="rf2-inline-actions">
                    <button type="button" onClick={() => editIndicator(row.indicator)}>Edit</button>
                    <button type="button" className="danger" onClick={() => removeIndicator(row.indicator)}>Delete</button>
                  </span>}
                </> : <span className="rf2-muted">No indicator attached</span>}
              </td>
              <td className="rf2-num">{row.indicator ? display(baseline) : '—'}</td>
              <td className="rf2-num">{row.indicator ? display(mid) : '—'}</td>
              <td className="rf2-num">{row.indicator ? display(finalTarget) : '—'}</td>
              <td className="rf2-num">{row.indicator ? display(actual) : '—'}</td>
              <td className="rf2-num">{row.indicator ? pct(row.progress?.achievement_pct) : '—'}</td>
              <td className="rf2-status">{row.indicator ? status(row) : <span className="rf2-pill neutral">{row.node?.status || 'draft'}</span>}</td>
              <td className="rf2-narrative">
                {narrative
                  ? <button type="button" title={narrativeOpen ? undefined : narrative}
                      className={narrativeOpen ? 'rf2-narrative-text open' : 'rf2-narrative-text'}
                      onClick={() => toggleNarrative(rowKey)}>{narrative}</button>
                  : '—'}
                {row.narrative?.challenges && <details><summary>Challenges</summary><p>{row.narrative.challenges}</p></details>}</td>
              <td className="rf2-small">{row.indicator?.official_reporting_frequency || row.indicator?.frequency
                ? OPT.labelOf(OPT.REPORTING_FREQUENCY, row.indicator.official_reporting_frequency || row.indicator.frequency)
                : '—'}</td>
              <td className="rf2-evidence">{row.indicator ? (() => {
                const st = evidence.get(row.indicator.id);
                const docs = st?.recent_documents ?? [];
                const extra = (st?.evidence_count || 0) - docs.length;
                return <button type="button" className="evi-cell" title={st?.reconciliation_detail || ''}
                  onClick={() => setEvidenceIndicator(row.indicator)}>
                  <EvidenceBadge state={st?.evidence_state || 'no_evidence'} count={st?.evidence_count || 0} />
                  {docs.length > 0 && <span className="evi-cell-docs">
                    {docs.map((doc) => <span key={doc.id} className="evi-cell-doc" title={doc.title}>{doc.title}</span>)}
                    {extra > 0 && <span className="evi-cell-more">{t('evi.moreDocs', { count: extra })}</span>}
                  </span>}
                </button>;
              })() : '—'}</td>
            </tr>;
          })}
        </tbody>
      </table>
      {!filtered.length && <div className="rf2-empty">No results-framework rows match the current filters.</div>}
    </div>}

    {evidenceIndicator && <IndicatorEvidencePanel
      indicator={evidenceIndicator}
      canEdit={canEdit(evidenceIndicator.project_id)}
      onProgressWritten={() => { setReloadKey((k) => k + 1); refreshEvidence(); }} />}

    {editor && <div className="rf2-edit-backdrop" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !saving) setEditor(null);
    }}>
      <div className="rf2-edit-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${editor.mode === 'node' ? 'result' : 'indicator'}`}>
        <EditorForm editor={editor} setEditor={setEditor} nodes={projectNodes(editor.projectId)} saving={saving} onSubmit={saveEditor} onCancel={() => setEditor(null)} />
      </div>
    </div>}
  </div>;
}

function EditorForm({ editor, setEditor, nodes, saving, onSubmit, onCancel }) {
  const change = (key, value) => setEditor((s) => ({ ...s, [key]: value }));
  const sortedNodes = [...nodes].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || (a.node_code || '').localeCompare(b.node_code || ''));
  return <form className="rf2-form" onSubmit={onSubmit}>
    <h3>{editor.id ? 'Edit' : 'Add'} {editor.mode === 'node' ? 'result node' : 'indicator'}</h3>
    {editor.mode === 'node' ? <div className="rf2-form-grid">
      <label>Result type<select className="field-input" value={editor.nodeType} onChange={(e) => change('nodeType', e.target.value)}>{NODE_TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label>Parent result<select className="field-input" value={editor.parentId} onChange={(e) => change('parentId', e.target.value)}><option value="">Top level</option>{sortedNodes.filter((n) => n.id !== editor.id).map((n) => <option key={n.id} value={n.id}>{n.node_code ? `${n.node_code} — ` : ''}{n.title}</option>)}</select></label>
      <label className="full">Title<input className="field-input" value={editor.title} onChange={(e) => change('title', e.target.value)} required /></label>
      <label className="full">Description<textarea className="field-input" rows={3} value={editor.description} onChange={(e) => change('description', e.target.value)} /></label>
      <label>Sort order<input className="field-input" type="number" value={editor.sortOrder} onChange={(e) => change('sortOrder', e.target.value)} /></label>
      <label>Status<select className="field-input" value={editor.status} onChange={(e) => change('status', e.target.value)}><option value="draft">Draft</option><option value="approved">Approved</option><option value="archived">Archived</option></select></label>
    </div> : <div className="rf2-form-grid">
      <label className="full">Result node<select className="field-input" value={editor.frameworkNodeId} onChange={(e) => change('frameworkNodeId', e.target.value)} required><option value="">Select result node</option>{sortedNodes.map((n) => <option key={n.id} value={n.id}>{nodeTypeLabel(n.node_type)} · {n.node_code ? `${n.node_code} — ` : ''}{n.title}</option>)}</select></label>
      <label className="full">Indicator name<input className="field-input" value={editor.name} onChange={(e) => change('name', e.target.value)} required /></label>
      <label>Baseline<input className="field-input" type="number" step="any" value={editor.baseline} onChange={(e) => change('baseline', e.target.value)} /></label>
      <label>Final target<input className="field-input" type="number" step="any" value={editor.finalTarget} onChange={(e) => change('finalTarget', e.target.value)} /></label>
      <label>Unit<input className="field-input" value={editor.unit} onChange={(e) => change('unit', e.target.value)} /></label>
      <label>Official reporting frequency<select className="field-input" value={editor.frequency} onChange={(e) => change('frequency', e.target.value)}><option value="">Select</option>{OPT.REPORTING_FREQUENCY.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label>Direction<select className="field-input" value={editor.direction} onChange={(e) => change('direction', e.target.value)}><option value="increase">Increase</option><option value="decrease">Decrease</option><option value="maintain">Maintain</option><option value="milestone">Milestone</option><option value="qualitative">Qualitative</option></select></label>
      <label>Aggregation<select className="field-input" value={editor.aggregationMethod} onChange={(e) => change('aggregationMethod', e.target.value)}><option value="latest">Latest cumulative</option><option value="sum">Sum</option><option value="average">Average</option><option value="minimum">Minimum</option><option value="maximum">Maximum</option><option value="weighted_average">Weighted average</option><option value="percentage">Percentage</option><option value="milestone">Milestone</option><option value="qualitative">Qualitative</option></select></label>
      <label className="full">Means of verification<textarea className="field-input" rows={2} value={editor.meansOfVerification} onChange={(e) => change('meansOfVerification', e.target.value)} /></label>
      <label>Data source<input className="field-input" value={editor.dataSource} onChange={(e) => change('dataSource', e.target.value)} /></label>
      <label>Collection method<input className="field-input" value={editor.collectionMethod} onChange={(e) => change('collectionMethod', e.target.value)} /></label>
      <label className="full">Disaggregation<input className="field-input" value={editor.disaggregation} onChange={(e) => change('disaggregation', e.target.value)} placeholder="e.g. sex, age, disability, vulnerability" /></label>
      <label className="full">Assumptions / notes<textarea className="field-input" rows={2} value={editor.assumptions} onChange={(e) => change('assumptions', e.target.value)} /></label>
    </div>}
    <div className="rf2-form-actions"><button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
  </form>;
}

function ResultsStyles() {
  return <style>{`
    .rf2-page{max-width:none}.rf2-header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:1rem}
    .rf2-header h1{margin:0;font-size:1.7rem}.rf2-header p,.rf2-note{color:var(--text-2);font-size:.78rem;line-height:1.5}
    .rf2-summary{display:flex;gap:.55rem}.rf2-summary div{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.55rem .85rem}.rf2-summary b{display:block;font-size:1rem}.rf2-summary span{font-size:.66rem;color:var(--text-2)}
    .rf2-tools{display:grid;grid-template-columns:minmax(220px,360px) minmax(260px,1fr) auto;gap:.65rem;align-items:end;border:1px solid var(--border);border-radius:12px;background:var(--white);padding:.85rem;margin-bottom:.85rem}.rf2-tools label,.rf2-form label{display:grid;gap:.25rem;font-size:.72rem;font-weight:700}
    .rf2-inline-actions button{border:1px solid var(--border);border-radius:6px;background:var(--white);padding:.3rem .5rem;font:inherit;font-size:.68rem;cursor:pointer}.rf2-inline-actions button.danger{color:#b91c1c}
    .rf2-edit-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:1rem;background:rgb(15 23 42 / .55)}.rf2-edit-dialog{width:min(760px,100%);max-height:calc(100vh - 2rem);overflow:auto;border-radius:12px;box-shadow:0 20px 50px rgb(15 23 42 / .25)}
    .rf2-form{background:var(--white);border:1px solid var(--border);border-radius:10px;padding:.8rem}.rf2-form h3{margin:0 0 .65rem;font-size:.9rem}.rf2-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.rf2-form-grid .full{grid-column:1/-1}.rf2-form-actions{display:flex;justify-content:flex-end;gap:.45rem;margin-top:.7rem}
    .rf2-table-wrap{overflow:auto;border:1px solid var(--border-strong);border-radius:12px;background:var(--white);max-height:calc(100vh - 260px)}
    /* Every cell paints --rf2-row, so the frozen first column picks up its own
       row's stripe and hover instead of showing the rows sliding underneath. */
    .rf2-table{width:100%;border-collapse:separate;border-spacing:0;min-width:1700px;font-size:.75rem;--rf2-row:var(--white);--rf2-stripe:#faf8f4}
    .rf2-table th{position:sticky;top:0;z-index:4;background:var(--surface-1);padding:.5rem .6rem;text-align:left;border-bottom:1px solid var(--border-strong);border-right:1px solid var(--border);font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
    .rf2-table th:last-child{border-right:0}
    .rf2-table th:first-child{left:0;z-index:6;border-right:1px solid var(--border-strong)}
    .rf2-table td{vertical-align:top;padding:.5rem .6rem;border-bottom:1px solid var(--border);border-right:1px solid var(--border);line-height:1.4;background:var(--rf2-row)}
    .rf2-table td:last-child{border-right:0}
    .rf2-table tbody tr:nth-child(even){--rf2-row:var(--rf2-stripe)}
    .rf2-table tbody tr.rf2-row-node{--rf2-row:#f7f5f0}
    .rf2-table tbody tr.rf2-row-node:nth-child(even){--rf2-row:#f3f0ea}
    /* Last, and matching the node rows too, so hover always wins. */
    .rf2-table tbody tr:hover,.rf2-table tbody tr.rf2-row-node:nth-child(even):hover{--rf2-row:var(--surface-2)}
    .rf2-num,.rf2-small,.rf2-status{vertical-align:middle}
    .rf2-project{min-width:200px;max-width:210px;position:sticky;left:0;z-index:3;border-right:1px solid var(--border-strong)}
    .rf2-project-mark{border-left:5px solid var(--project-ink);background:var(--project-bg);padding:.4rem .5rem;border-radius:6px;color:var(--project-ink)}
    .rf2-project-mark b{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.rf2-project-mark small,.rf2-indicator small{display:block;font-family:var(--font-mono);font-size:.65rem;font-weight:700}.rf2-project-mark b{display:block;margin-top:.15rem}
    .rf2-path{min-width:300px;max-width:330px}.rf2-path-row p{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.rf2-path-row{display:grid;grid-template-columns:95px auto 1fr;gap:.35rem;align-items:start;padding:.28rem 0;border-bottom:1px dashed var(--border)}.rf2-path-row:last-child{border-bottom:0}.rf2-path-row>span:first-child{font-size:.62rem;text-transform:uppercase;color:var(--text-2)}.rf2-path-row>b{font-family:var(--font-mono);font-size:.65rem;color:var(--green-700)}.rf2-path-row p{margin:0}.rf2-path-row .rf2-inline-actions{grid-column:3}
    .rf2-path-details{grid-column:3;color:var(--text-2);font-size:.7rem}.rf2-path-details summary{cursor:pointer}.rf2-path-details p{display:block;overflow:visible;line-clamp:unset;margin:.35rem 0 0;white-space:normal}
    .rf2-indicator{min-width:240px;max-width:260px}.rf2-indicator b{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:.1rem 0}.rf2-indicator>span:not(.rf2-inline-actions):not(.rf2-muted){display:block;color:var(--text-2);font-size:.68rem}.rf2-inline-actions{display:flex;gap:.3rem;margin-top:.35rem}
    .rf2-num{min-width:80px;text-align:right;font-variant-numeric:tabular-nums}.rf2-small{min-width:110px}.rf2-evidence{min-width:220px;max-width:240px}
    .rf2-narrative{min-width:260px;max-width:300px;white-space:normal}
    .rf2-narrative-text{display:-webkit-box;-webkit-line-clamp:3;line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;width:100%;text-align:left;background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer}
    .rf2-narrative-text.open{display:block;overflow:visible}
    .rf2-narrative details{margin-top:.35rem}.rf2-narrative summary{cursor:pointer;font-weight:700;color:var(--text-2)}.rf2-narrative p{margin:.25rem 0 0}
    .rf2-status-stack{display:grid;gap:.25rem}.rf2-pill{display:inline-flex;width:max-content;border-radius:999px;padding:.2rem .45rem;font-size:.62rem;font-weight:800;text-transform:capitalize;background:#e5e7eb;color:#374151}.rf2-pill.on_track{background:#dcfce7;color:#166534}.rf2-pill.attention_required,.rf2-pill.attention{background:#fef3c7;color:#92400e}.rf2-pill.off_track,.rf2-pill.at_risk{background:#ffedd5;color:#9a3412}.rf2-pill.delayed{background:#fee2e2;color:#991b1b}.rf2-pill.completed,.rf2-pill.approved{background:#ede9fe;color:#5b21b6}.rf2-pill.neutral{background:#f3f4f6;color:#6b7280}
    .rf2-muted{color:var(--text-2);font-style:italic}.rf2-empty{padding:1.3rem;text-align:center;color:var(--text-2)}
    /* A frozen column costs half a phone screen, so it only pays on wide ones. */
    @media(max-width:900px){.rf2-project{position:static;min-width:165px;max-width:180px}.rf2-table th:first-child{left:auto}}
    @media(max-width:800px){.rf2-tools,.rf2-form-grid{grid-template-columns:1fr}.rf2-form-grid .full{grid-column:1}.rf2-edit-backdrop{padding:.5rem;align-items:end}.rf2-edit-dialog{max-height:90vh}.rf2-table-wrap{max-height:none}}
  `}</style>;
}
