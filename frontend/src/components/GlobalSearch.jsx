import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, FolderKanban, Target, ListChecks } from './ui/icons';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';

const TYPES = {
  project: { label: 'Project', icon: FolderKanban },
  objective: { label: 'Objective', icon: Target },
  outcome: { label: 'Outcome', icon: Target },
  output: { label: 'Output', icon: Target },
  indicator: { label: 'Indicator', icon: Target },
  activity: { label: 'Activity', icon: ListChecks },
};
const SOURCES = [
  { type: 'project', view: 'v_projects', columns: 'id, code, name, status' },
  { type: 'objective', view: 'v_objectives', columns: 'id, project_id, code, statement' },
  { type: 'outcome', view: 'v_outcomes', columns: 'id, project_id, code, statement' },
  { type: 'output', view: 'v_outputs', columns: 'id, project_id, code, statement' },
  { type: 'indicator', view: 'v_project_indicators', columns: 'id, project_id, code, name, definition, unit, baseline_value, target_value, target_date' },
  { type: 'activity', view: 'v_project_activities', columns: 'id, project_id, code, name, status, planned_end_date, physical_progress_pct' },
];
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const searchable = (r) => [r.code, r.name, r.statement, r.definition, r.unit, r.baseline_value, r.target_value, r.target_date, r.planned_end_date, r.status, r.physical_progress_pct].filter(v => v != null).join(' ').toLowerCase();
const detail = (r) => {
  if (r.type === 'indicator') return [r.target_value != null ? `Target: ${r.target_value}${r.unit ? ` ${r.unit}` : ''}` : null, r.target_date ? `Due: ${r.target_date}` : null].filter(Boolean).join(' · ');
  if (r.type === 'activity') return [r.physical_progress_pct != null ? `Progress: ${r.physical_progress_pct}%` : null, r.planned_end_date ? `Due: ${r.planned_end_date}` : null].filter(Boolean).join(' · ');
  return '';
};

export default function GlobalSearch() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const lang = i18n.resolvedLanguage;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setError('');
    try {
      const responses = await Promise.all(SOURCES.map(async (source) => {
        const { data: rows, error: err } = await localised(() => supabase.from(source.view).select(i18nCols(source.columns)));
        if (err) throw err;
        return (rows ?? []).map(row => ({ ...row, type: source.type, name: row.name ?? row.statement, projectId: source.type === 'project' ? row.id : row.project_id }));
      }));
      if (request === requestRef.current) setData(responses.flat());
    } catch (err) {
      if (request === requestRef.current) { setError(dbErrorMessage(err)); setData([]); }
    }
  }, [lang]);
  useEffect(() => { requestRef.current += 1; setData(null); setError(''); }, [lang]);
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
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects, indicators, outputs, activities or targets" className="gs-input" aria-label={t('gs.query')} />
          <kbd className="gs-kbd">Esc</kbd>
        </div>
        <div className="gs-results" ref={listRef}>
          {error ? <div className="gs-hint" role="alert">{error} <button type="button" onClick={load}>{t('ppa.retry', { defaultValue: 'Retry' })}</button></div>
          : data == null ? <div className="gs-hint">{t('gs.loading')}</div>
          : !q.trim() ? <div className="gs-hint">Search by code, name, definition, target or date.</div>
          : !results.length ? <div className="gs-hint">{t('gs.noMatches', { q: q.trim() })}</div>
          : results.map((r, i) => { const g = TYPES[r.type]; const Icon = g.icon; return <button key={`${r.type}-${r.id}`} data-active={i === active} className={`gs-item${i === active ? ' active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
            <span className="gs-item-ic" style={{ width: 22, height: 22, borderRadius: 0, color: 'var(--text-3)' }}><Icon size={15} aria-hidden="true" /></span>
            <span className="gs-item-txt"><span className="gs-item-name">{r.code ? `${r.code} · ` : ''}{r.name}</span><span className="gs-item-type">{g.label}{detail(r) ? ` · ${detail(r)}` : ''}</span></span>
            {i === active && <span aria-hidden="true" style={{ color: 'var(--text-3)', flexShrink: 0, fontSize: '0.75rem' }}>Enter</span>}
          </button>; })}
        </div>
      </div>
    </div>}
  </>;
}
