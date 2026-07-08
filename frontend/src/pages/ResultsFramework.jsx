import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  Network, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Loader2, AlertCircle, X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  CLIMATE_THEME, EXPECTED_OUTCOME, ACTIVITY_STATUS, FREQUENCY, LINKED_LEVEL, labelOf,
} from '../constants/formOptions';

const EDITOR_ROLES = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];

const CodeChip = ({ code, color }) => (
  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6875rem', fontWeight: 700, color: '#fff', background: color, padding: '0.1rem 0.45rem', borderRadius: 5 }}>{code}</span>
);

const LEVEL_COLOR = { objective: '#1a8c4e', outcome: '#2563eb', output: '#c97b00', activity: '#7c3aed', indicator: '#c0392b' };

export default function ResultsFramework({ user }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';

  const [projects, setProjects]   = useState([]);
  const [data, setData]           = useState({ objectives: [], outcomes: [], outputs: [], activities: [], indicators: [] });
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [expanded, setExpanded]   = useState({});   // id -> bool
  const [editor, setEditor]       = useState(null); // { level, mode, parentId, record }
  const [busy, setBusy]           = useState(false);

  const canEdit = EDITOR_ROLES.includes(user?.role);

  useEffect(() => {
    supabase.from('v_projects').select('id,code,name').order('code')
      .then(({ data, error }) => { if (!error) setProjects(data ?? []); });
  }, []);

  const load = useCallback(async () => {
    if (!projectId) { setData({ objectives: [], outcomes: [], outputs: [], activities: [], indicators: [] }); return; }
    setLoading(true); setErr('');
    const [ob, oc, op, ac, ind] = await Promise.all([
      supabase.from('v_objectives').select('*').eq('project_id', projectId).order('code'),
      supabase.from('v_outcomes').select('*').eq('project_id', projectId).order('code'),
      supabase.from('v_outputs').select('*').eq('project_id', projectId).order('code'),
      supabase.from('v_project_activities').select('*').eq('project_id', projectId).order('code'),
      supabase.from('v_project_indicators').select('*').eq('project_id', projectId).order('code'),
    ]);
    const firstErr = [ob, oc, op, ac, ind].find(r => r.error);
    if (firstErr) setErr(firstErr.error.message);
    setData({
      objectives: ob.data ?? [], outcomes: oc.data ?? [], outputs: op.data ?? [],
      activities: ac.data ?? [], indicators: ind.data ?? [],
    });
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }));
  const openCreate = (level, parentId) => setEditor({ level, mode: 'create', parentId, record: {} });
  const openEdit = (level, record) => setEditor({ level, mode: 'edit', parentId: null, record });

  const linkedOptions = () => ([
    ...data.objectives.map(o => ({ value: o.id, label: `${o.code} · ${o.statement}`, level: 'objective' })),
    ...data.outcomes.map(o => ({ value: o.id, label: `${o.code} · ${o.statement}`, level: 'outcome' })),
    ...data.outputs.map(o => ({ value: o.id, label: `${o.code} · ${o.statement}`, level: 'output' })),
    ...data.activities.map(o => ({ value: o.id, label: `${o.code} · ${o.name}`, level: 'activity' })),
  ]);

  // Build RPC name + params from the editor state.
  const submitEditor = async (fields) => {
    const { level, mode, parentId, record } = editor;
    let rpc, args;
    if (level === 'objective') {
      args = { p_statement: fields.statement, p_climate_theme: fields.climate_theme || null, p_expected_outcome: fields.expected_outcome || null, p_notes: fields.notes || null };
      rpc = mode === 'create'
        ? ['create_objective', { p_project_id: projectId, ...args }]
        : ['update_objective', { p_id: record.id, ...args, p_status: record.status || 'draft' }];
    } else if (level === 'outcome') {
      args = { p_statement: fields.statement, p_responsible_officer_id: fields.responsible_officer_id || null };
      rpc = mode === 'create'
        ? ['create_outcome', { p_objective_id: parentId, ...args }]
        : ['update_outcome', { p_id: record.id, ...args, p_status: record.status || 'draft' }];
    } else if (level === 'output') {
      args = { p_statement: fields.statement, p_responsible_officer_id: fields.responsible_officer_id || null };
      rpc = mode === 'create'
        ? ['create_output', { p_outcome_id: parentId, ...args }]
        : ['update_output', { p_id: record.id, ...args, p_status: record.status || 'draft' }];
    } else if (level === 'activity') {
      args = { p_name: fields.name, p_description: fields.description || null, p_responsible_officer_id: fields.responsible_officer_id || null, p_status: fields.status || 'not_started' };
      rpc = mode === 'create'
        ? ['create_project_activity', { p_output_id: parentId, ...args }]
        : ['update_project_activity', { p_id: record.id, ...args }];
    } else { // indicator
      args = {
        p_name: fields.name, p_unit: fields.unit || null,
        p_baseline_value: fields.baseline_value === '' ? null : Number(fields.baseline_value),
        p_target_value: fields.target_value === '' ? null : Number(fields.target_value),
        p_means_of_verification: fields.means_of_verification || null, p_frequency: fields.frequency || null,
        p_linked_level: fields.linked_level || null, p_linked_id: fields.linked_id || null,
      };
      rpc = mode === 'create'
        ? ['create_project_indicator', { p_project_id: projectId, ...args }]
        : ['update_project_indicator', { p_id: record.id, ...args }];
    }
    setBusy(true);
    const { error } = await supabase.rpc(rpc[0], rpc[1]);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(t('resultsFramework.saved'));
    setEditor(null); load();
  };

  const remove = async (level, record) => {
    if (!window.confirm(t('resultsFramework.confirmDelete'))) return;
    const map = {
      objective: 'delete_objective', outcome: 'delete_outcome', output: 'delete_output',
      activity: 'delete_project_activity', indicator: 'delete_project_indicator',
    };
    const { error } = await supabase.rpc(map[level], { p_id: record.id });
    if (error) return toast.error(error.message);
    toast.success(t('resultsFramework.deleted')); load();
  };

  const RowActions = ({ level, record }) => canEdit && (
    <span style={{ display: 'inline-flex', gap: '0.25rem' }}>
      <button onClick={() => openEdit(level, record)} title={t('common.edit')} style={iconBtn}><Pencil size={13} /></button>
      <button onClick={() => remove(level, record)} title={t('common.delete')} style={{ ...iconBtn, color: 'var(--red-600)' }}><Trash2 size={13} /></button>
    </span>
  );

  const AddBtn = ({ level, parentId, label }) => canEdit && (
    <button onClick={() => openCreate(level, parentId)} style={addBtn}><Plus size={12} /> {label}</button>
  );

  return (
    <div style={{ padding: '2rem 2.5rem', maxWidth: 1200 }} className="animate-fade-up">
      <div style={{ marginBottom: '1.25rem' }}>
        <div className="section-label" style={{ marginBottom: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Network size={13} /> FRM-02
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.875rem', fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.025em', margin: 0 }}>
          {t('resultsFramework.title')}
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>{t('resultsFramework.subtitle')}</p>
      </div>

      <div style={{ maxWidth: 480, marginBottom: '1.5rem' }}>
        <label className="field-label">{t('resultsFramework.selectProject')}</label>
        <select className="field-input" value={projectId} onChange={e => setParams(e.target.value ? { project: e.target.value } : {})}>
          <option value="">—</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
      </div>

      {err && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
          <AlertCircle size={15} /> {err}
        </div>
      )}

      {projectId && (loading ? (
        <div style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>{t('common.loading')}</div>
      ) : (
        <>
          {/* Hierarchy tree */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="section-label">{t('resultsFramework.objectives')}</div>
              <AddBtn level="objective" parentId={null} label={t('resultsFramework.addObjective')} />
            </div>
            {data.objectives.length === 0 && <div style={emptyStyle}>{t('resultsFramework.empty')}</div>}
            {data.objectives.map(obj => {
              const outcomes = data.outcomes.filter(o => o.objective_id === obj.id);
              return (
                <div key={obj.id} className="card" style={{ padding: '0.75rem 1rem' }}>
                  <TreeRow color={LEVEL_COLOR.objective} code={obj.code} label={obj.statement}
                    open={expanded[obj.id]} onToggle={() => toggle(obj.id)}
                    actions={<RowActions level="objective" record={obj} />} />
                  {expanded[obj.id] && (
                    <div style={childWrap}>
                      <div style={childHeader}>
                        <span className="section-label">{t('resultsFramework.outcomes')}</span>
                        <AddBtn level="outcome" parentId={obj.id} label={t('resultsFramework.addOutcome')} />
                      </div>
                      {outcomes.length === 0 && <div style={emptyStyle}>{t('resultsFramework.empty')}</div>}
                      {outcomes.map(oc => {
                        const outputs = data.outputs.filter(o => o.outcome_id === oc.id);
                        return (
                          <div key={oc.id} style={nestBox}>
                            <TreeRow color={LEVEL_COLOR.outcome} code={oc.code} label={oc.statement}
                              open={expanded[oc.id]} onToggle={() => toggle(oc.id)}
                              actions={<RowActions level="outcome" record={oc} />} />
                            {expanded[oc.id] && (
                              <div style={childWrap}>
                                <div style={childHeader}>
                                  <span className="section-label">{t('resultsFramework.outputs')}</span>
                                  <AddBtn level="output" parentId={oc.id} label={t('resultsFramework.addOutput')} />
                                </div>
                                {outputs.length === 0 && <div style={emptyStyle}>{t('resultsFramework.empty')}</div>}
                                {outputs.map(op => {
                                  const acts = data.activities.filter(a => a.output_id === op.id);
                                  return (
                                    <div key={op.id} style={nestBox}>
                                      <TreeRow color={LEVEL_COLOR.output} code={op.code} label={op.statement}
                                        open={expanded[op.id]} onToggle={() => toggle(op.id)}
                                        actions={<RowActions level="output" record={op} />} />
                                      {expanded[op.id] && (
                                        <div style={childWrap}>
                                          <div style={childHeader}>
                                            <span className="section-label">{t('resultsFramework.activities')}</span>
                                            <AddBtn level="activity" parentId={op.id} label={t('resultsFramework.addActivity')} />
                                          </div>
                                          {acts.length === 0 && <div style={emptyStyle}>{t('resultsFramework.empty')}</div>}
                                          {acts.map(a => (
                                            <div key={a.id} style={{ ...nestBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                                <CodeChip code={a.code} color={LEVEL_COLOR.activity} />
                                                <span style={{ fontSize: '0.8125rem', color: 'var(--text-1)' }}>{a.name}</span>
                                                <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>{labelOf(ACTIVITY_STATUS, a.status)}</span>
                                              </span>
                                              <RowActions level="activity" record={a} />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Indicator register */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div className="section-label">{t('resultsFramework.indicators')}</div>
            <AddBtn level="indicator" parentId={null} label={t('resultsFramework.addIndicator')} />
          </div>
          {data.indicators.length === 0 ? <div style={emptyStyle}>{t('resultsFramework.empty')}</div> : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: 'var(--green-50)' }}>
                    {['Code', t('resultsFramework.name'), t('resultsFramework.unit'), t('resultsFramework.baseline'), t('resultsFramework.target'), t('resultsFramework.linkedRecord'), ''].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.indicators.map(i => (
                    <tr key={i.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem 0.75rem' }}><CodeChip code={i.code} color={LEVEL_COLOR.indicator} /></td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-1)', fontWeight: 500 }}>{i.name}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-3)' }}>{i.unit || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)' }}>{i.baseline_value ?? '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'var(--font-mono)' }}>{i.target_value ?? '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-3)' }}>{i.linked_code || '—'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}><RowActions level="indicator" record={i} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ))}

      {editor && (
        <EditorModal editor={editor} onClose={() => setEditor(null)} onSubmit={submitEditor} busy={busy}
          linkedOptions={linkedOptions()} />
      )}
      <style>{`@keyframes spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Tree row ──────────────────────────────────────────────────────────────────
function TreeRow({ color, code, label, open, onToggle, actions }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minWidth: 0, flex: 1, padding: 0 }}>
        {open ? <ChevronDown size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> : <ChevronRight size={15} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        <CodeChip code={code} color={color} />
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </button>
      {actions}
    </div>
  );
}

// ── Editor modal ──────────────────────────────────────────────────────────────
function EditorModal({ editor, onClose, onSubmit, busy, linkedOptions }) {
  const { t } = useTranslation();
  const { level, mode, record } = editor;
  const [f, setF] = useState(() => ({
    statement: record.statement || '', name: record.name || '',
    description: record.description || '', notes: record.notes || '',
    climate_theme: record.climate_theme || '', expected_outcome: record.expected_outcome || '',
    status: record.status || 'not_started', unit: record.unit || '',
    baseline_value: record.baseline_value ?? '', target_value: record.target_value ?? '',
    means_of_verification: record.means_of_verification || '', frequency: record.frequency || '',
    linked_level: record.linked_level || '', linked_id: record.linked_id || '',
    responsible_officer_id: record.responsible_officer_id || '',
  }));
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const needsName = level === 'activity' || level === 'indicator';
  const valid = needsName ? f.name.trim() : f.statement.trim();
  const submit = () => { if (valid) onSubmit(f); };
  const titleKey = { objective: 'addObjective', outcome: 'addOutcome', output: 'addOutput', activity: 'addActivity', indicator: 'addIndicator' }[level];

  return (
    <div style={overlay} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '1.0625rem' }}>{t(`resultsFramework.${titleKey}`)}</div>
          <button onClick={onClose} style={iconBtn}><X size={16} /></button>
        </div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginBottom: '1rem' }}>{t('resultsFramework.codeAuto')}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {(level === 'objective' || level === 'outcome' || level === 'output') && (
            <div>
              <label className="field-label">{t('resultsFramework.statement')}</label>
              <textarea className="field-input" rows={2} value={f.statement} onChange={e => set('statement', e.target.value)} />
            </div>
          )}
          {level === 'objective' && (
            <>
              <div>
                <label className="field-label">{t('resultsFramework.climateTheme')}</label>
                <select className="field-input" value={f.climate_theme} onChange={e => set('climate_theme', e.target.value)}>
                  <option value="">{t('form.selectOption')}</option>
                  {CLIMATE_THEME.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">{t('resultsFramework.expectedOutcome')}</label>
                <select className="field-input" value={f.expected_outcome} onChange={e => set('expected_outcome', e.target.value)}>
                  <option value="">{t('form.selectOption')}</option>
                  {EXPECTED_OUTCOME.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">{t('resultsFramework.notes')}</label>
                <textarea className="field-input" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </>
          )}
          {level === 'activity' && (
            <>
              <div>
                <label className="field-label">{t('resultsFramework.name')}</label>
                <input className="field-input" value={f.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <label className="field-label">{t('resultsFramework.notes')}</label>
                <textarea className="field-input" rows={2} value={f.description} onChange={e => set('description', e.target.value)} />
              </div>
              <div>
                <label className="field-label">{t('registration.status')}</label>
                <select className="field-input" value={f.status} onChange={e => set('status', e.target.value)}>
                  {ACTIVITY_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </>
          )}
          {level === 'indicator' && (
            <>
              <div>
                <label className="field-label">{t('resultsFramework.name')}</label>
                <input className="field-input" value={f.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <div><label className="field-label">{t('resultsFramework.unit')}</label><input className="field-input" value={f.unit} onChange={e => set('unit', e.target.value)} /></div>
                <div><label className="field-label">{t('resultsFramework.baseline')}</label><input className="field-input" type="number" value={f.baseline_value} onChange={e => set('baseline_value', e.target.value)} /></div>
                <div><label className="field-label">{t('resultsFramework.target')}</label><input className="field-input" type="number" value={f.target_value} onChange={e => set('target_value', e.target.value)} /></div>
              </div>
              <div>
                <label className="field-label">{t('resultsFramework.mov')}</label>
                <input className="field-input" value={f.means_of_verification} onChange={e => set('means_of_verification', e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label className="field-label">{t('resultsFramework.frequency')}</label>
                  <select className="field-input" value={f.frequency} onChange={e => set('frequency', e.target.value)}>
                    <option value="">{t('form.selectOption')}</option>
                    {FREQUENCY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">{t('resultsFramework.linkedRecord')}</label>
                  <select className="field-input" value={f.linked_id}
                    onChange={e => {
                      const opt = linkedOptions.find(o => o.value === e.target.value);
                      set('linked_id', e.target.value); set('linked_level', opt?.level || '');
                    }}>
                    <option value="">{t('form.selectOption')}</option>
                    {linkedOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '0.5rem 1rem' }}>{t('form.cancel')}</button>
          <button className="btn-primary" onClick={submit} disabled={busy || !valid} style={{ padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: valid ? 1 : 0.6 }}>
            {busy && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />} {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── inline styles ─────────────────────────────────────────────────────────────
const iconBtn = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--text-2)', cursor: 'pointer' };
const addBtn = { display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem', fontWeight: 600, color: 'var(--green-700)', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 7, padding: '0.25rem 0.6rem', cursor: 'pointer' };
const childWrap = { marginTop: '0.625rem', paddingLeft: '1.375rem', borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' };
const childHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const nestBox = { background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.625rem 0.875rem' };
const emptyStyle = { fontSize: '0.75rem', color: 'var(--text-3)', fontStyle: 'italic', padding: '0.25rem 0' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60 };
