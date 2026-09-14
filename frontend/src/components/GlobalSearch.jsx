import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, FolderKanban, Target, ListChecks } from './ui/icons';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';

const TYPES = {
  project: { label: 'Project', icon: FolderKanban },
  result: { label: 'Result', icon: Target },
  indicator: { label: 'Indicator', icon: Target },
  activity: { label: 'Activity', icon: ListChecks },
};

// Search must follow the live Results Framework schema. The former
// v_objectives/v_outcomes/v_outputs views were retired when framework nodes
// became the single hierarchy, so querying them made the whole global search
// fail even when projects themselves were available.
const SOURCES = [
  { type: 'project', view: 'v_projects', columns: 'id, code, acronym, name, description, status', localised: true },
  { type: 'result', view: 'v_framework_nodes', columns: 'id, project_id, node_code, node_type, title, description, status', localised: false },
  { type: 'indicator', view: 'v_project_indicators', columns: 'id, project_id, code, name, definition, unit, baseline_value, target_value, target_date', localised: true },
  { type: 'activity', view: 'v_project_activities', columns: 'id, project_id, code, name, description, status, planned_end_date, physical_progress_pct', localised: true },
];

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const searchable = (r) => [
  r.code, r.acronym, r.name, r.description, r.nodeType, r.definition, r.unit,
  r.baseline_value, r.target_value, r.target_date, r.planned_end_date, r.status,
  r.physical_progress_pct,
].filter(v => v != null).join(' ').toLowerCase();

const resultTypeLabel = (value) => {
  if (!value) return 'Result';
  return String(value).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const detail = (r) => {
  if (r.type === 'result') return resultTypeLabel(r.nodeType);
  if (r.type === 'indicator') return [
    r.target_value != null ? `Target: ${r.target_value}${r.unit ? ` ${r.unit}` : ''}` : null,
    r.target_date ? `Due: ${r.target_date}` : null,
  ].filter(Boolean).join(' · ');
  if (r.type === 'activity') return [
    r.physical_progress_pct != null ? `Progress: ${r.physical_progress_pct}%` : null,
    r.planned_end_date ? `Due: ${r.planned_end_date}` : null,
  ].filter(Boolean).join(' · ');
  return '';
};

const normaliseRows = (source, rows) => (rows ?? []).map(row => ({
  ...row,
  type: source.type,
  code: row.code ?? row.node_code,
  name: row.name ?? row.title,
  nodeType: row.node_type,
  projectId: source.type === 'project' ? row.id : row.project_id,
}));

export default function GlobalSearch() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const lang = i18n.resolvedLanguage;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setError('');
    setWarning('');

    const responses = await Promise.all(SOURCES.map(async (source) => {
      try {
        const run = () => supabase.from(source.view).select(source.localised ? i18nCols(source.columns) : source.columns);
        const result = source.localised ? await localised(run) : await run();
        if (result.error) throw result.error;
        return { ok: true, rows: normaliseRows(source, result.data) };
      } catch (err) {
        return { ok: false, rows: [], error: err };
      }
    }));

    if (request !== requestRef.current) return;

    const successful = responses.filter(r => r.ok);
    if (successful.length === 0) {
      setData([]);
      setError('Search is temporarily unavailable. Check your connection and try again.');
      return;
    }

    setData(successful.flatMap(r => r.rows));
    if (successful.length !== responses.length) {
      setWarning('Some search categories are temporarily unavailable. Available results are shown below.');
    }
  }, [lang]);

  useEffect(() => { requestRef.current += 1; setData(null); setError(''); setWarning(''); }, [lang]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (open) {
      if (data == null) load();
      setActive(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
    setQ('');
    return undefined;
  }, [open, data, load]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!data || !term) return [];
    return data.filter(r => searchable(r).includes(term)).slice(0, 30);
  }, [data, q]);
  useEffect(() => { setActive(0); }, [q]);

  const go = useCallback((r) => {
    if (!r?.projectId) return;
    setOpen(false);
    const params = new URLSearchParams({ project: r.projectId });
    if (r.type !== 'project') { params.set('focus', r.type); params.set('record', r.id); }
    nav(`/analytics/project-portfolio?${params.toString()}`);
  }, [nav]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };
  useEffect(() => { listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, results]);

  return <>
    <button className="gs-trigger" onClick={() => setOpen(true)} aria-label={t('gs.trigger')}>
      <Search size={15} aria-hidden="true" /><span className="gs-trigger-lbl">{t('gs.short')}</span><kbd className="gs-kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
    {open && <div className="gs-overlay" role="dialog" aria-modal="true" aria-label={t('gs.dialog')} onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="gs-panel" onKeyDown={onKeyDown}>
        <div className="gs-input-row">
          <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} aria-hidden="true" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects, results, indicators, activities or targets" className="gs-input" aria-label={t('gs.query')} />
          <kbd className="gs-kbd">Esc</kbd>
        </div>
        <div className="gs-results" ref={listRef}>
          {error ? <div className="gs-hint" role="alert">{error} <button type="button" onClick={load}>{t('ppa.retry', { defaultValue: 'Retry' })}</button></div>
          : data == null ? <div className="gs-hint">{t('gs.loading')}</div>
          : !q.trim() ? <div className="gs-hint">Search by project code or acronym, result, indicator, activity, target or date.</div>
          : !results.length ? <div className="gs-hint">{t('gs.noMatches', { q: q.trim() })}</div>
          : <>
            {warning && <div className="gs-hint" role="status">{warning}</div>}
            {results.map((r, i) => { const g = TYPES[r.type] ?? TYPES.result; const Icon = g.icon; return <button key={`${r.type}-${r.id}`} data-active={i === active} className={`gs-item${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
              <span className="gs-item-ic" style={{ width: 22, height: 22, borderRadius: 0, color: 'var(--text-3)' }}><Icon size={15} aria-hidden="true" /></span>
              <span className="gs-item-txt"><span className="gs-item-name">{r.code ? `${r.code} · ` : ''}{r.name}</span><span className="gs-item-type">{g.label}{detail(r) ? ` · ${detail(r)}` : ''}</span></span>
              {i === active && <span aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0, fontSize: '0.75rem' }}>Enter</span>}
            </button>; })}
          </>}
        </div>
      </div>
    </div>}
  </>;
}
