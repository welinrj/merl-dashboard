import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { localised, i18nCols, sourceRow } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
import { draftKey, clearDraft } from '../lib/formDraft';
import { saveModuleRecord } from '../lib/merlRecordSave';
import { IndicatorForm } from './ProjectSetup';
import { MODULES, RecordForm } from './MerlReporting';
import * as OPT from '../constants/formOptions';
import { fmtPct } from '../lib/docc/reporting';
import './results-workspace.css';

const EDITORS = ['ROLE_ADMIN', 'ROLE_DOCC_MEO', 'ROLE_PROJ_MANAGER'];
const editablePeriod = (period) => period && ['draft', 'returned'].includes(period.submission_status);
const latest = (rows) => [...rows].sort((a, b) => String(b.created_at ?? b.reporting_period ?? '').localeCompare(String(a.created_at ?? a.reporting_period ?? '')))[0];

export default function ResultsWorkspace({ user }) {
  const { t, i18n } = useTranslation();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState('');
  const [periodLabel, setPeriodLabel] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const canEdit = EDITORS.includes(user?.role);
  const lang = i18n.resolvedLanguage;
  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    localised(() => supabase.from('v_projects').select(i18nCols('id, code, name')).order('code'))
      .then(({ data: rows, error: err }) => {
        if (!alive) return;
        if (err) { setError(dbErrorMessage(err)); setLoading(false); return; }
        setProjects(rows ?? []);
        setProjectId((current) => rows?.some((p) => p.id === current) ? current : rows?.[0]?.id ?? '');
        if (!rows?.length) setLoading(false);
      });
    return () => { alive = false; };
  }, [lang]);

  useEffect(() => {
    if (!projectId) { setData(null); return; }
    let alive = true;
    setLoading(true);
    setError('');
    setData(null);
    const q = (view) => localised(() => supabase.from(view).select('*').eq('project_id', projectId));
    Promise.all([
      q('v_project_indicators'), q('v_objectives'), q('v_outcomes'), q('v_outputs'),
      q('v_reporting_periods'), q('v_indicator_progress'), q('v_evidence'),
    ]).then((responses) => {
      if (!alive) return;
      const failed = responses.find((response) => response.error);
      if (failed) { setError(dbErrorMessage(failed.error)); setLoading(false); return; }
      const [indicators, objectives, outcomes, outputs, periods, progress, evidence] = responses.map((response) => response.data ?? []);
      setData({ indicators, objectives, outcomes, outputs, periods, progress, evidence });
      setSelectedId((current) => indicators.some((i) => i.id === current) ? current : indicators[0]?.id ?? '');
      setPeriodLabel((current) => periods.some((p) => p.period_label === current) ? current : latest(periods)?.period_label ?? '');
      setLoading(false);
    }).catch((err) => { if (alive) { setError(dbErrorMessage(err)); setLoading(false); } });
    return () => { alive = false; };
  }, [projectId, lang, refresh]);

  const selected = data?.indicators.find((i) => i.id === selectedId);
  const period = data?.periods.find((p) => p.period_label === periodLabel);
  const rows = useMemo(() => (data?.indicators ?? []).filter((i) => `${i.code} ${i.name}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const progressFor = (id) => data?.progress.filter((r) => r.indicator_id === id) ?? [];
  const evidenceFor = (id) => data?.evidence.filter((r) => r.indicator_id === id) ?? [];
  const currentProgress = selected ? latest(progressFor(selected.id)) : null;
  const currentEvidence = selected ? evidenceFor(selected.id) : [];
  const module = editing?.kind === 'progress' ? MODULES.find((m) => m.key === 'indicator_progress') : MODULES.find((m) => m.key === 'evidence');
  const formModule = editing?.kind === 'evidence' ? { ...module, fields: module.fields.filter((f) => f.name !== 'verification_status') } : module;
  const formKey = editing && draftKey('merl', user?.id, projectId, periodLabel, module.key, editing.initial?.id ?? 'new');

  const open = (kind, indicator, record = null) => {
    if (!canEdit) return;
    if (kind !== 'indicator' && !editablePeriod(period)) return;
    setSelectedId(indicator.id);
    setEditing({ kind, initial: record ? sourceRow(record) : kind === 'indicator' ? sourceRow(indicator) : { indicator_id: indicator.id } });
  };

  const saveRecord = async (values) => {
    if (!editing || !selected || !editablePeriod(period) || saving) return;
    setSaving(true);
    try {
      const payload = { ...values, indicator_id: selected.id };
      if (editing.kind === 'evidence') payload.verification_status = editing.initial?.verification_status ?? 'pending';
      await saveModuleRecord({ module, values: payload, id: editing.initial?.id ?? null, projectId, reportingPeriod: periodLabel, indicators: data.indicators });
      clearDraft(formKey);
      toast.success(t(editing.initial?.id ? 'merl.updatedToast' : 'merl.addedToast'));
      setEditing(null);
      reload();
    } catch (err) { toast.error(dbErrorMessage(err)); }
    finally { setSaving(false); }
  };

  return (
    <div className="ri-workspace page-pad">
      <header className="ri-heading"><div><h1>{t('nav.results')}</h1><p>Manage indicator definitions, report progress and submit supporting evidence.</p></div></header>
      <div className="ri-toolbar">
        <label>{t('merl.project')}<select className="field-input" value={projectId} onChange={(e) => { setProjectId(e.target.value); setSelectedId(''); setPeriodLabel(''); setEditing(null); }}><option value="">Select project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select></label>
        <label>{t('merl.activePeriod')}<select className="field-input" value={periodLabel} onChange={(e) => { setPeriodLabel(e.target.value); setEditing(null); }} disabled={!data}><option value="">Select period</option>{data?.periods.map((p) => <option key={p.id} value={p.period_label}>{p.period_label}</option>)}</select></label>
      </div>
      {error && <div className="ri-error" role="alert">{error} <button onClick={reload}>Retry</button></div>}
      {loading && <p role="status">Loading results…</p>}
      {!loading && !error && !data?.indicators.length && <p>No indicators are available for this project. Establish the results framework in Project Setup first.</p>}
      {!loading && !error && data && data.indicators.length > 0 && <>
        <div className="ri-status">{period ? <>Reporting period: <strong>{period.period_label}</strong> · {OPT.labelOf(OPT.SUBMISSION_STATUS, period.submission_status)}{!editablePeriod(period) && <span> · Locked for editing</span>}</> : 'Select a reporting period to update progress or submit evidence.'}</div>
        <div className="ri-layout">
          <section className="ri-list" aria-label="Project indicators">
            <div className="ri-list-head"><h2>Indicators</h2><span>{data.indicators.length}</span></div>
            <input className="field-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or indicator" aria-label="Search indicators" />
            <div className="ri-table-wrap"><table><thead><tr><th>Indicator</th><th>Latest progress</th><th>Actions</th></tr></thead><tbody>{rows.map((i) => { const p = latest(progressFor(i.id)); return <tr key={i.id} className={selectedId === i.id ? 'ri-selected' : ''}><td><button className="ri-indicator" onClick={() => setSelectedId(i.id)}><strong>{i.code}</strong><span>{i.name}</span></button></td><td>{p ? <><strong>{fmtPct(p.achievement_pct)}</strong><small>{p.reporting_period}</small></> : 'No progress'}</td><td><div className="ri-actions">{canEdit && <><button onClick={() => open('indicator', i)}>Edit</button><button onClick={() => open('progress', i)} disabled={!editablePeriod(period)}>Update progress</button><button onClick={() => open('evidence', i)} disabled={!editablePeriod(period)}>Add evidence</button></>}</div></td></tr>; })}</tbody></table></div>
            {!rows.length && <p>No indicators match your search.</p>}
          </section>
          {selected && <aside className="ri-detail"><div className="ri-detail-head"><span>Selected indicator</span><h2>{selected.code}</h2><p>{selected.name}</p></div><dl><div><dt>Baseline</dt><dd>{selected.baseline_value ?? '—'}</dd></div><div><dt>Target</dt><dd>{selected.target_value ?? '—'} {selected.unit ?? ''}</dd></div><div><dt>Frequency</dt><dd>{selected.frequency ? OPT.labelOf(OPT.REPORTING_FREQUENCY, selected.frequency) : '—'}</dd></div><div><dt>Latest achievement</dt><dd>{currentProgress ? fmtPct(currentProgress.achievement_pct) : '—'}</dd></div></dl><h3>Progress history</h3>{!progressFor(selected.id).length ? <p>No progress recorded.</p> : <div className="ri-history">{[...progressFor(selected.id)].sort((a,b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).map((p) => <div key={p.id}><span>{p.reporting_period}</span><strong>{fmtPct(p.achievement_pct)}</strong>{canEdit && editablePeriod(data.periods.find((r) => r.period_label === p.reporting_period)) && <button onClick={() => { setPeriodLabel(p.reporting_period); setEditing({ kind:'progress', initial:sourceRow(p) }); }}>Edit</button>}</div>)}</div>}<h3>Evidence</h3>{!currentEvidence.length ? <p>No evidence linked to this indicator.</p> : <div className="ri-history">{currentEvidence.map((e) => <div key={e.id}><span>{e.title}<small>{e.reporting_period}</small></span>{canEdit && editablePeriod(data.periods.find((p) => p.period_label === e.reporting_period)) && <button onClick={() => { setPeriodLabel(e.reporting_period); setEditing({ kind:'evidence', initial:sourceRow(e) }); }}>Edit</button>}</div>)}</div>}</aside>}
        </div>
      </>}
      {editing?.kind === 'indicator' && <IndicatorForm key={editing.initial.id} projectId={projectId} userId={user?.id} initial={editing.initial} objectives={data.objectives} outcomes={data.outcomes} outputs={data.outputs} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      {editing && editing.kind !== 'indicator' && <RecordForm key={`${editing.kind}-${editing.initial?.id ?? selectedId}-${periodLabel}`} module={formModule} initial={editing.initial} draftKey={formKey} dynamicOptions={(key) => key === 'indicators' ? [{ value: selected.id, label: `${selected.code} · ${selected.name}` }] : []} indicators={data.indicators} onCancel={() => setEditing(null)} onSave={saveRecord} onTranslated={reload} />}
    </div>
  );
}
