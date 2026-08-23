// =============================================================================
// GlobalSearch.jsx — portal-wide command palette (spec §59).
// A header search that finds projects, indicators and activities across the
// standardised dataset and jumps to the owning project in Project Setup. Opens
// on click or ⌘K / Ctrl-K; navigable by keyboard; reads the RLS-scoped public.v_*
// views so results are naturally limited to what the signed-in user may see.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FolderKanban, Target, ListChecks, CornerDownLeft } from 'lucide-react';
import { supabase } from '../supabaseClient';

const GROUPS = {
  project:   { label: 'Project',   icon: FolderKanban, accent: '#2563eb' },
  indicator: { label: 'Indicator', icon: Target,       accent: '#0e7490' },
  activity:  { label: 'Activity',  icon: ListChecks,   accent: '#7c3aed' },
};
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

export default function GlobalSearch() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [data, setData] = useState(null); // null = not loaded yet
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    const [pj, ind, act] = await Promise.all([
      supabase.from('v_projects').select('id, code, name, status'),
      supabase.from('v_project_indicators').select('id, code, name, project_id'),
      supabase.from('v_project_activities').select('id, code, name, project_id'),
    ]);
    setData({ projects: pj.data ?? [], indicators: ind.data ?? [], activities: act.data ?? [] });
  }, []);

  // Open on ⌘K / Ctrl-K anywhere in the app.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      if (data == null) load();
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setQ('');
    return undefined;
  }, [open, data, load]);

  const results = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const match = (r) => `${r.code || ''} ${r.name || ''}`.toLowerCase().includes(term);
    const take = (rows, type) => rows.filter(match).slice(0, 6).map((r) => ({
      type, id: r.id, code: r.code, name: r.name,
      projectId: type === 'project' ? r.id : r.project_id,
    }));
    return [
      ...take(data.projects, 'project'),
      ...take(data.indicators, 'indicator'),
      ...take(data.activities, 'activity'),
    ].slice(0, 16);
  }, [data, q]);

  useEffect(() => { setActive(0); }, [q]);

  const go = useCallback((r) => {
    if (!r) return;
    setOpen(false);
    nav(`/project-setup?project=${r.projectId}`);
  }, [nav]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };

  // Keep the active row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, results]);

  return (
    <>
      <button className="gs-trigger" onClick={() => setOpen(true)} aria-label="Search projects, indicators and activities">
        <Search size={15} />
        <span className="gs-trigger-lbl">Search…</span>
        <kbd className="gs-kbd">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      {open && (
        <div className="gs-overlay" role="dialog" aria-modal="true" aria-label="Search"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="gs-panel" onKeyDown={onKeyDown}>
            <div className="gs-input-row">
              <Search size={18} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects, indicators, activities…" className="gs-input" aria-label="Search query" />
              <kbd className="gs-kbd">Esc</kbd>
            </div>
            <div className="gs-results" ref={listRef}>
              {data == null ? (
                <div className="gs-hint">Loading…</div>
              ) : q.trim() === '' ? (
                <div className="gs-hint">Type to search across the portfolio.</div>
              ) : results.length === 0 ? (
                <div className="gs-hint">No matches for “{q.trim()}”.</div>
              ) : (
                results.map((r, i) => {
                  const g = GROUPS[r.type];
                  const Icon = g.icon;
                  return (
                    <button key={`${r.type}-${r.id}`} data-active={i === active}
                      className={`gs-item${i === active ? ' active' : ''}`}
                      onMouseEnter={() => setActive(i)} onClick={() => go(r)}>
                      <span className="gs-item-ic" style={{ background: `color-mix(in srgb, ${g.accent} 15%, #fff)`, color: g.accent }}>
                        <Icon size={16} />
                      </span>
                      <span className="gs-item-txt">
                        <span className="gs-item-name">{r.code ? `${r.code} · ` : ''}{r.name}</span>
                        <span className="gs-item-type">{g.label}</span>
                      </span>
                      {i === active && <CornerDownLeft size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
