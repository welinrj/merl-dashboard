import { FRAMEWORK_COLUMNS, frameworkColumns } from '../lib/docc/frameworkColumns';
import { currentProjects } from '../lib/docc/projectScope';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { cellChanges } from '../lib/docc/frameworkCellEditor';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { latestReportedBy, withReportingDates } from '../lib/docc/progressSelection';
import { frameworkTargetValue } from '../lib/docc/frameworkTarget';
import { useLiveDashboard } from '../lib/useLiveDashboard';
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
  const liveRevision = useLiveDashboard();
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(empty);
  const [loading, setLoading] = useState(true);
  const [reportingPeriods, setReportingPeriods] = useState([]);
  const [error, setError] = useState('');
  const [permissionError, setPermissionError] = useState('');
  const [editableIds, setEditableIds] = useState(new Set());
  const [projectFilter, setProjectFilter] = useState(routeProject);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [editorViewport, setEditorViewport] = useState(null);
  const editorOpen = Boolean(editor);
  useEffect(() => {
    if (!editorOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const viewport = window.visualViewport;
    const updateViewport = () => setEditorViewport(viewport ? { top: viewport.offsetTop, height: viewport.height } : null);
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
    };
  }, [editorOpen]);
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
      localised(() => supabase.from('v_projects').select(i18nCols('id,has_results_framework, code, acronym, name, status')).order('code')),
      supabase.from('v_framework_nodes').select('*').order('sort_order').order('node_code'),
      localised(() => supabase.from('v_project_indicators').select('*').order('code')),
      supabase.from('v_indicator_targets').select('*').order('created_at').order('id'),
      localised(() => supabase.from('v_indicator_progress').select('*')),
      supabase.from('v_result_narratives').select('*'),
      supabase.rpc('list_results_framework_editable_projects'),
      supabase.from('v_reporting_periods').select('project_id, period_label, period_end'),
    ]).then((responses) => {
      if (!alive) return;
      const failed = [...responses.slice(0, 6), responses[7]].find((r) => r.error);
      if (failed?.error) throw failed.error;
      setReportingPeriods(responses[7].data || []);
      const [projects, nodes, indicators, targets, progress, narratives] = responses.slice(0, 6).map((r) => r.data || []);
      setData({ projects: currentProjects(projects), nodes, indicators, targets, progress: withReportingDates(progress, responses[7].data || []), narratives });

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
  }, [i18n.resolvedLanguage, reloadKey, user?.id, liveRevision]);

  const nodesById = useMemo(() => new Map(data.nodes.map((r) => [r.id, r])), [data.nodes]);
  const targetsByIndicator = useMemo(() => targetLookup(data.targets), [data.targets]);
  const latestProgress = useMemo(() => latestReportedBy(data.progress, 'indicator_id'), [data.progress]);
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

  const canEdit = (projectId) => !loading && !saving && editableIds.has(projectId);
  const editNode = (node) => {
    if (!canEdit(node.project_id)) return;
    setEditor({mode:'node', projectId:node.project_id, id:node.id, label:nodeTypeLabel(node.node_type), value:node.title || '', code:node.node_code || '', description:node.description || ''});
  };
  const editRow = (row, field = 'indicator') => {
    if (!canEdit(row.project.id) || !row.indicator) return;
    const labels = {indicator:'Indicator',baseline:'Baseline',mid_term:'Mid-term',final:'Final target',actual:'Latest actual',progress:'Progress (%)',status:'Status',narrative:'Narrative',reporting:'Reporting'};
    const values = {indicator:row.indicator.name, baseline:frameworkTargetValue(row.targets.baseline,row.indicator.baseline_value), mid_term:frameworkTargetValue(row.targets.mid_term), final:frameworkTargetValue(row.targets.final,row.indicator.target_value), actual:row.progress?.cumulative_actual ?? row.progress?.actual_this_period, progress:row.progress?.achievement_pct, narrative:row.narrative?.progress_summary || row.progress?.narrative, reporting:row.indicator.official_reporting_frequency || row.indicator.frequency};
    setEditor({mode:'cell',projectId:row.project.id,id:row.indicator.id,label:labels[field],field,row,value:values[field] ?? '',code:row.indicator.code || '',unit:row.indicator.unit || '',performance:row.progress?.performance_status || 'no_data',schedule:row.progress?.schedule_status || 'on_schedule',period:row.progress?.reporting_period || ''});
  };
  const attachIndicator = row => setEditor({mode:'add',projectId:row.project.id,nodeId:row.node.id,label:'Indicator',value:'',unit:''});
  const saveEditor = async (e) => {
    e.preventDefault();
    if (!editor || saving || !editableIds.has(editor.projectId)) return;
    setSaving(true);
    try {
      let result;
      if (editor.mode === 'node') result = await supabase.rpc('patch_results_framework_node',{p_id:editor.id,p_changes:{title:editor.value,node_code:editor.code || null,description:editor.description || null}});
      else if (editor.mode === 'add') result = await supabase.rpc('create_results_framework_indicator',{p_project_id:editor.projectId,p_fields:{framework_node_id:editor.nodeId,name:editor.value,unit:editor.unit || null}});
      else result = await supabase.rpc('patch_results_framework_row',{p_indicator_id:editor.id,p_changes:cellChanges(editor),p_progress_id:editor.row.progress?.id || null});
      if (result?.error) throw result.error;
      toast.success('Saved.');
      setEditor(null);
      reload();
    } catch (err) { toast.error(dbErrorMessage(err)); }
    finally { setSaving(false); }
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
      <span className="rf2-pill neutral">{row.progress.review_status || 'Unreviewed'}</span>
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
          <th scope="col">Project</th>{FRAMEWORK_COLUMNS.map(column => <th scope="col" key={column.key}>{column.label}</th>)}<th scope="col">Indicator</th>
          <th>Baseline</th><th>Mid-term</th><th>Final target</th>
          <th>Latest actual</th><th>Progress</th><th>Status</th>
          <th>Narrative</th><th>Reporting</th><th>{t('evi.colEvidence')}</th>
        </tr></thead>
        <tbody>
          {filtered.map((row, idx) => {
            const baseline = frameworkTargetValue(row.targets.baseline, row.indicator?.baseline_value);
            const mid = frameworkTargetValue(row.targets.mid_term);
            const finalTarget = frameworkTargetValue(row.targets.final, row.indicator?.target_value);
            const actual = row.progress?.cumulative_actual ?? row.progress?.actual_this_period;
            const narrative = row.narrative?.progress_summary || row.progress?.narrative || '';
            const rowKey = row.indicator?.id || row.node?.id || idx;
            const columns = frameworkColumns(row.path);
            const narrativeOpen = openNarratives.has(rowKey);
            return <tr key={rowKey} className={row.indicator ? undefined : 'rf2-row-node'}>
              <td className="rf2-project">
                <div className="rf2-project-mark" style={projectColor(row.project)}>
                  <small>{row.project.code || row.project.acronym || 'NO CODE'}</small>
                  <b>{row.project.name}</b>
                </div>
                {canEdit(row.project.id) && <a className="rf2-project-link" href={`#/project-setup?project=${encodeURIComponent(row.project.id)}`}>Edit project information</a>}
              </td>
              {FRAMEWORK_COLUMNS.map(column => <td key={column.key} className={`rf2-level rf2-level-${column.key}`}>
                {columns[column.key].length ? columns[column.key].map(node => <div key={node.id} className="rf2-level-node">
                  <div className="rf2-level-code">{node.node_code && <b>{node.node_code}</b>}
                    {(!['project_objective', 'component', 'outcome', 'output'].includes(node.node_type)) && <small>{nodeTypeLabel(node.node_type)}</small>}
                  </div>
                  <p>{node.title}</p>
                  {node.id === row.node?.id && node.description && (
                    <details className="rf2-path-details"><summary>Details</summary><p>{node.description}</p></details>
                  )}
                  {canEdit(row.project.id) && <span className="rf2-inline-actions">
                    <button type="button" aria-label={`Edit ${column.label}: ${node.node_code || node.title}`} onClick={() => editNode(node)}>Edit</button>
                    {node.id === row.node?.id && <button type="button" className="danger" onClick={() => removeNode(node)}>Delete</button>}
                  </span>}
                </div>) : <span className="rf2-muted" aria-label={`No ${column.label.toLowerCase()} recorded for this row`}>—</span>}
              </td>)}
              <td className="rf2-indicator">
                {row.indicator ? <>
                  <small>{row.indicator.code}</small><b>{row.indicator.name}</b>
                  {row.indicator.unit && <span>{row.indicator.unit}</span>}
                  {canEdit(row.project.id) && <span className="rf2-inline-actions">
                    <button type="button" aria-label={`Edit Indicator: ${row.indicator.code}`} onClick={() => editRow(row)}>Edit</button>
                    <button type="button" className="danger" onClick={() => removeIndicator(row.indicator)}>Delete</button>
                  </span>}
                </> : <><span className="rf2-muted">No indicator attached</span>{canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" onClick={() => attachIndicator(row)}>Add indicator</button>}</>}
              </td>
              <td className="rf2-num">{row.indicator ? display(baseline) : '—'}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Baseline: ${row.indicator.code}`} onClick={() => editRow(row, 'baseline')}>Edit</button>}</td>
              <td className="rf2-num">{row.indicator ? display(mid) : '—'}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Mid-term: ${row.indicator.code}`} onClick={() => editRow(row, 'mid_term')}>Edit</button>}</td>
              <td className="rf2-num">{row.indicator ? display(finalTarget) : '—'}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Final target: ${row.indicator.code}`} onClick={() => editRow(row, 'final')}>Edit</button>}</td>
              <td className="rf2-num">{row.indicator ? display(actual) : '—'}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Latest actual: ${row.indicator.code}`} onClick={() => editRow(row, 'actual')}>Edit</button>}</td>
              <td className="rf2-num">{row.indicator ? pct(row.progress?.achievement_pct) : '—'}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Progress: ${row.indicator.code}`} onClick={() => editRow(row, 'progress')}>Edit</button>}</td>
              <td className="rf2-status">{row.indicator ? status(row) : <span className="rf2-pill neutral">{row.node?.status || 'draft'}</span>}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Status: ${row.indicator.code}`} onClick={() => editRow(row, 'status')}>Edit</button>}</td>
              <td className="rf2-narrative">
                {narrative
                  ? <button type="button" title={narrativeOpen ? undefined : narrative}
                      className={narrativeOpen ? 'rf2-narrative-text open' : 'rf2-narrative-text'}
                      onClick={() => toggleNarrative(rowKey)}>{narrative}</button>
                  : '—'}
                {row.narrative?.challenges && <details><summary>Challenges</summary><p>{row.narrative.challenges}</p></details>}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Narrative: ${row.indicator.code}`} onClick={() => editRow(row, 'narrative')}>Edit</button>}</td>
              <td className="rf2-small">{row.indicator?.official_reporting_frequency || row.indicator?.frequency
                ? OPT.labelOf(OPT.REPORTING_FREQUENCY, row.indicator.official_reporting_frequency || row.indicator.frequency)
                : '—'}{row.indicator && canEdit(row.project.id) && <button type="button" className="rf2-cell-edit" aria-label={`Edit Reporting: ${row.indicator.code}`} onClick={() => editRow(row, 'reporting')}>Edit</button>}</td>
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
              })() : '—'}{row.indicator && canEdit(row.project.id) && <a className="rf2-cell-edit" href={`#/merl-reporting?module=evidence&project=${encodeURIComponent(row.project.id)}`}>Edit evidence</a>}</td>
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

    {editor && createPortal(<div className="rf2-edit-backdrop" style={editorViewport || undefined} role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !saving) setEditor(null);
    }}>
      <div className="rf2-edit-dialog" role="dialog" aria-modal="true" aria-label={`Edit ${editor.label}`}>
        <form className="rf2-form" onSubmit={saveEditor}>
          <h3>{editor.mode === 'add' ? 'Add' : 'Edit'} {editor.label}</h3>
          <div className="rf2-form-grid">
            {(editor.mode === 'node' || editor.field === 'indicator') && <label className="full">Code<input className="field-input" value={editor.code} onChange={e=>setEditor({...editor,code:e.target.value})} /></label>}
            {editor.field === 'status' ? <>
              <label className="full">Status<select className="field-input" value={editor.performance} onChange={e=>setEditor({...editor,performance:e.target.value})}>{[['no_data','No data'],['on_track','On track'],['attention_required','Needs attention'],['at_risk','At risk'],['target_achieved','Target achieved']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
              <label className="full">Schedule<select className="field-input" value={editor.schedule} onChange={e=>setEditor({...editor,schedule:e.target.value})}><option value="on_schedule">On schedule</option><option value="delayed">Delayed</option></select></label>
            </> : editor.field === 'reporting' ? <label className="full">Reporting<select className="field-input" value={editor.value} onChange={e=>setEditor({...editor,value:e.target.value})}><option value="">Not recorded</option>{OPT.REPORTING_FREQUENCY.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label> : <label className="full">{['actual','progress'].includes(editor.field) ? editor.label : 'Content'}<textarea aria-label="Content" className="field-input" rows={['node','add'].includes(editor.mode) || ['indicator','narrative'].includes(editor.field) ? 6 : 2} value={editor.value} onChange={e=>setEditor({...editor,value:e.target.value})} required={editor.mode === 'node' || editor.mode === 'add' || editor.field === 'indicator'} /></label>}
            {(editor.field === 'indicator' || editor.mode === 'add') && <label className="full">Unit<input className="field-input" value={editor.unit} onChange={e=>setEditor({...editor,unit:e.target.value})} /></label>}
            {editor.mode === 'node' && <label className="full">Details<textarea className="field-input" rows={3} value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})} /></label>}
            {['actual','progress','status','narrative'].includes(editor.field) && !editor.row.progress && <label className="full">Reporting period<select className="field-input" value={editor.period} onChange={e=>setEditor({...editor,period:e.target.value})} required><option value="">Choose period</option>{reportingPeriods.filter(p=>p.project_id===editor.projectId).map(p=><option key={p.period_label} value={p.period_label}>{p.period_label}</option>)}</select></label>}
          </div>
          <div className="rf2-form-actions"><button type="button" className="btn btn-secondary" disabled={saving} onClick={()=>setEditor(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></div>
        </form>
      </div>
    </div>, document.body)}
  </div>;
}

function ResultsStyles() {
  return <style>{`
    .rf2-page{max-width:none}.rf2-header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:1rem}
    .rf2-header h1{margin:0;font-size:1.7rem}.rf2-header p,.rf2-note{color:var(--text-2);font-size:.78rem;line-height:1.5}
    .rf2-summary{display:flex;gap:.55rem}.rf2-summary div{border:1px solid var(--border);border-radius:10px;background:var(--white);padding:.55rem .85rem}.rf2-summary b{display:block;font-size:1rem}.rf2-summary span{font-size:.66rem;color:var(--text-2)}
    .rf2-tools{display:grid;grid-template-columns:minmax(220px,360px) minmax(260px,1fr) auto;gap:.65rem;align-items:end;border:1px solid var(--border);border-radius:12px;background:var(--white);padding:.85rem;margin-bottom:.85rem}.rf2-tools label,.rf2-form label{display:grid;gap:.25rem;font-size:.72rem;font-weight:700}
    .rf2-edit-row{display:block;margin-top:.55rem;border:1px solid var(--border-strong);border-radius:6px;background:var(--white);color:var(--text-1);padding:.4rem .65rem;font:inherit;font-weight:700;cursor:pointer}.rf2-row-edit-picker{flex-shrink:0;display:grid;gap:.6rem;background:var(--white);padding:.85rem;border-bottom:1px solid var(--border)}.rf2-row-edit-picker{min-width:0;overflow-wrap:anywhere}.rf2-row-edit-picker .field-input{width:100%;min-width:0;box-sizing:border-box}.rf2-row-edit-picker label{min-width:0;display:grid;gap:.3rem;font-size:.75rem;font-weight:700}
    .rf2-project-link,.rf2-cell-edit{display:block;margin-top:.4rem;color:var(--text-1);font:inherit;font-size:.72rem;background:var(--white);border:1px solid var(--border);border-radius:5px;padding:.3rem .5rem;cursor:pointer}.rf2-row-fields fieldset{min-width:0;border:1px solid var(--border);border-radius:6px;padding:.65rem;margin:0}.rf2-row-fields legend{font-weight:800;font-size:.85rem;white-space:normal}.rf2-fields-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.rf2-fields-grid .full{grid-column:1/-1}.rf2-target-fields{margin-bottom:.6rem!important}.rf2-inline-actions button{border:1px solid var(--border);border-radius:6px;background:var(--white);padding:.3rem .5rem;font:inherit;font-size:.68rem;cursor:pointer}.rf2-inline-actions button.danger{color:#b91c1c}
    .rf2-edit-backdrop{position:fixed;inset:0;bottom:auto;height:100vh;height:100dvh;z-index:10000;display:grid;place-items:center;box-sizing:border-box;padding:1rem;background:rgb(15 23 42 / .55)}.rf2-edit-dialog{width:min(560px,100%);max-height:100%;height:auto;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--white);border-radius:12px;box-shadow:0 20px 50px rgb(15 23 42 / .25)}
    .rf2-form{display:flex;flex-direction:column;flex:1;min-height:0;margin:0;background:var(--white);border:1px solid var(--border);border-radius:10px;padding:.8rem}.rf2-form h3{margin:0 0 .65rem;font-size:.9rem}.rf2-form-grid{flex:1;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:0;padding:.15rem;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}.rf2-form-grid .full{grid-column:1/-1}.rf2-form h3{flex-shrink:0}.rf2-form-grid label{min-width:0}.rf2-form .field-input{width:100%;min-width:0;box-sizing:border-box}.rf2-form textarea{white-space:pre-wrap;overflow-wrap:anywhere;resize:vertical}.rf2-form-actions{flex-shrink:0;background:var(--white);padding-top:.65rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:.45rem;margin-top:.7rem}
    .rf2-table-wrap{overflow:auto;border:1px solid var(--border-strong);border-radius:12px;background:var(--white);max-height:calc(100vh - 260px)}
    /* Every cell paints --rf2-row, so the frozen first column picks up its own
       row's stripe and hover instead of showing the rows sliding underneath. */
    .rf2-table{width:100%;border-collapse:separate;border-spacing:0;min-width:2300px;font-size:.75rem;--rf2-row:var(--white);--rf2-stripe:#faf8f4}
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
    .rf2-level{min-width:230px;max-width:280px;overflow-wrap:anywhere}.rf2-level-node{padding:.3rem 0;border-bottom:1px dashed var(--border)}.rf2-level-node:last-child{border-bottom:0}.rf2-level-node p{margin:.3rem 0;white-space:normal}.rf2-level-code{display:flex;flex-wrap:wrap;gap:.4rem;align-items:baseline}.rf2-level-code b{font-family:var(--font-mono);font-size:.7rem;color:var(--green-700)}.rf2-level-code small{font-size:.62rem;text-transform:uppercase;color:var(--text-2)}
    .rf2-path-details{color:var(--text-2);font-size:.7rem}.rf2-path-details summary{cursor:pointer}.rf2-path-details p{display:block;overflow:visible;line-clamp:unset;margin:.35rem 0 0;white-space:normal}
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
    @media(max-width:800px){.rf2-tools,.rf2-form-grid,.rf2-fields-grid{grid-template-columns:1fr}.rf2-form-grid .full{grid-column:1}.rf2-edit-backdrop{padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}.rf2-edit-dialog{height:100%;max-height:100%;width:100%;border-radius:0}.rf2-form .field-input,.rf2-row-edit-picker .field-input{font-size:16px}.rf2-form-actions button{min-height:44px;flex:1}.rf2-table-wrap{max-height:none}}
  `}</style>;
}
