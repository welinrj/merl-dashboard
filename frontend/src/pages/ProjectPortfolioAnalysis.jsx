// =============================================================================
// ProjectPortfolioAnalysis.jsx — one project, analysed end to end.
//
// Financial Analysis (the Dashboards "financial" tab) answers "how is the
// portfolio spending?". This page answers a different question — "how is *this*
// project doing?" — by putting its money, its calendar, its activities, its
// indicators, its people, its places, its risks and its reporting next to each
// other on one screen. Neither replaces the other.
//
// Three things hold the page together:
//
//   · One selected project is the context for everything. Nothing below the
//     selector asks the reader to choose a project again, and changing it
//     clears the whole page rather than leaving last project's numbers on
//     screen while the new ones load.
//   · Every figure comes from lib/docc/projectAnalysis.js. A KPI at the top and
//     the section that explains it below are literally the same value, so they
//     cannot drift apart.
//   · Missing data is said out loud. "No financial records have been submitted"
//     is a different statement from "0 VUV spent", and the page never turns the
//     first into the second.
//
// Reads go through the same views, with the same user token, as the rest of the
// portal: merl.can_access_project() already restricts every one of them to the
// projects a Project Manager or Data Entry Officer is assigned to, so analysis
// shows exactly what that officer could already see elsewhere.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { supabase } from '../supabaseClient';
import { localised, i18nCols } from '../lib/contentLocale';
import { dbErrorMessage } from '../lib/dbError';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import StatTile from '../components/ui/StatTile';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { SkeletonCard } from '../components/ui/LoadingSkeleton';
import VanuatuMap from '../components/VanuatuMap';
import { fmtDate, fmtNum } from '../lib/locale';
import { fmtAmount, fmtPct } from '../lib/docc/reporting';
import { analyseProject, geographicSummary, UNKNOWN } from '../lib/docc/projectAnalysis';

// Semantic only — green on track, amber wants attention, red is critical, grey
// is "we don't know". No colour on this page means anything else.
const TONE = {
  green: { fg: 'var(--green-700)', bg: 'var(--green-50)', bar: '#1a8c4e' },
  amber: { fg: '#8a6416', bg: 'var(--gold-100)', bar: '#d99a2b' },
  red: { fg: 'var(--red-700)', bg: 'var(--red-100)', bar: '#b3402f' },
  unknown: { fg: 'var(--text-3)', bg: 'var(--surface-1)', bar: '#9a9186' },
};
// StatTile speaks green/amber/red/none; the analysis speaks unknown.
const tile = (status) => (status === UNKNOWN ? 'none' : status);

// The four bars share one axis, so a null has to be visibly absent rather than
// drawn at zero — an unreported measure is not a measure of nothing.
const BAR_KEYS = { time: 'ppa.timeElapsed', budget: 'ppa.budgetUsed', implementation: 'ppa.implementation', results: 'ppa.resultsAchievement' };

const SESSION_KEY = 'merl.ppa.context';

// Numbers inside a sentence follow the reader's language too: 35.1 in English
// is 35,1 in French. i18next interpolates raw, so the values are formatted on
// the way in — except `count`, which i18next needs as a number to pick the
// singular or plural form.
const localiseValues = (values) => Object.fromEntries(
  Object.entries(values ?? {}).map(([k, v]) =>
    [k, k !== 'count' && typeof v === 'number' ? fmtNum(v) : v]));

// ── Small shared pieces ──────────────────────────────────────────────────────

/**
 * One section's loading / empty / error / retry behaviour in one place, so a
 * failure in the map cannot take the financial analysis down with it.
 */
function Section({ title, description, actions, loading, error, empty, emptyTitle, emptyText, onRetry, children, id }) {
  const { t } = useTranslation();
  let body;
  if (loading) body = <SkeletonCard />;
  else if (error) {
    body = (
      <EmptyState
        title={t('ppa.sectionFailed')}
        description={error}
        action={onRetry && (
          <button type="button" className="btn-secondary" onClick={onRetry}
            style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-control)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
            {t('ppa.retry')}
          </button>
        )}
        compact
      />
    );
  } else if (empty) {
    body = <EmptyState title={emptyTitle} description={emptyText} compact />;
  } else body = children;

  return (
    <div id={id} style={{ scrollMarginTop: '1rem' }}>
      <SectionCard title={title} description={description} actions={actions}>{body}</SectionCard>
    </div>
  );
}

/** A labelled value in the project strip. Absent data reads as "—", not 0. */
function Field({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-1)', marginTop: 2, overflowWrap: 'anywhere' }}>{value || '—'}</div>
    </div>
  );
}

/** Wide content scrolls inside its own box; the page body never scrolls sideways. */
const Scroller = ({ children }) => (
  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>
);

// ── Project selector ─────────────────────────────────────────────────────────

/**
 * Searchable project picker. A national portfolio is too long to scroll and an
 * officer usually knows the code or a word of the title, so typing filters and
 * the keyboard works throughout.
 */
function ProjectPicker({ projects, value, onChange, disabled }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const selected = projects.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      `${p.code ?? ''} ${p.name ?? ''} ${p.donor ?? ''}`.toLowerCase().includes(q));
  }, [projects, query]);

  const choose = (p) => { setOpen(false); setQuery(''); onChange(p.id); };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={boxRef} style={{ position: 'relative', flex: '1 1 320px', minWidth: 0 }}>
      <label htmlFor="ppa-project" style={{ display: 'block', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '0.2rem' }}>
        {t('ppa.selectProject')}
      </label>
      <input
        id="ppa-project"
        className="field-input"
        role="combobox"
        aria-expanded={open}
        aria-controls="ppa-project-list"
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={t('ppa.selectProjectPlaceholder')}
        value={open ? query : (selected ? `${selected.code} — ${selected.name}` : '')}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => { setQuery(''); setOpen(true); }}
        onKeyDown={onKeyDown}
        style={{ fontWeight: selected && !open ? 600 : 400 }}
      />
      {open && (
        <div id="ppa-project-list" role="listbox"
          style={{ position: 'absolute', zIndex: 40, top: '100%', left: 0, right: 0, marginTop: 4,
            background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow)', maxHeight: 300, overflowY: 'auto' }}>
          {matches.length === 0 ? (
            <p style={{ padding: '0.75rem 0.9rem', fontSize: '0.82rem', color: 'var(--text-3)', margin: 0 }}>
              {t('ppa.noProjectMatch')}
            </p>
          ) : matches.map((p, i) => (
            <button type="button" key={p.id} role="option" aria-selected={p.id === value}
              onMouseEnter={() => setActive(i)} onClick={() => choose(p)}
              style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, cursor: 'pointer',
                padding: '0.5rem 0.9rem', background: i === active ? 'var(--surface-1)' : 'transparent' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-1)' }}>{p.code}</span>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}> — {p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Time vs Money vs Results ─────────────────────────────────────────────────

/**
 * The four measures on one scale. Put next to each other they answer the
 * management question directly — is the money and the work keeping up with the
 * calendar? — which four separate numbers never do.
 */
function Comparison({ comparison }) {
  const { t } = useTranslation();
  const elapsed = comparison.bars.find((b) => b.key === 'time')?.pct;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {comparison.bars.map((b) => {
        const known = typeof b.pct === 'number';
        // Distance from the calendar decides the colour, so a bar is only ever
        // amber or red relative to where the project should be by now.
        let tone = 'unknown';
        if (known && b.key === 'time') tone = 'green';
        else if (known && typeof elapsed === 'number') {
          const gap = Math.abs(b.pct - elapsed);
          tone = gap < 10 ? 'green' : gap <= 30 ? 'amber' : 'red';
        } else if (known) tone = 'green';

        return (
          <div key={b.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-2)' }}>{t(BAR_KEYS[b.key])}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 800, color: known ? TONE[tone].fg : 'var(--text-3)' }}>
                {known ? fmtPct(b.pct) : t('ppa.notReported')}
              </span>
            </div>
            <div style={{ position: 'relative', height: 10, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 999, overflow: 'hidden' }}>
              {known && (
                <div style={{ width: `${Math.min(100, b.pct)}%`, height: '100%', background: TONE[tone].bar }} />
              )}
              {/* The calendar marker, so every bar is read against the same line. */}
              {typeof elapsed === 'number' && b.key !== 'time' && (
                <span aria-hidden="true" style={{ position: 'absolute', top: -2, bottom: -2, left: `${Math.min(100, elapsed)}%`, width: 2, background: 'var(--text-2)' }} />
              )}
            </div>
          </div>
        );
      })}

      {typeof elapsed === 'number' && (
        <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: 0 }}>
          {t('ppa.timeMarker', { pct: fmtPct(elapsed) })}
        </p>
      )}

      {comparison.reading && (
        <p style={{ margin: 0, padding: '0.6rem 0.75rem', fontSize: '0.82rem', lineHeight: 1.5,
          background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', color: 'var(--text-2)' }}>
          {comparison.reading === 'aligned'
            ? t('ppa.readingAligned')
            : t(comparison.reading === 'behind' ? 'ppa.readingBehind' : 'ppa.readingAhead', {
              measure: t(BAR_KEYS[comparison.values.measure]).toLowerCase(),
              gap: fmtNum(comparison.values.gap),
            })}
        </p>
      )}
    </div>
  );
}

// ── Project health ───────────────────────────────────────────────────────────

const DIMENSIONS = ['financial', 'schedule', 'results', 'risk', 'dataQuality'];

function Health({ health, dimensions, completeness }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.35rem 0.7rem',
          borderRadius: 999, background: TONE[health.status].bg, color: TONE[health.status].fg, fontWeight: 800, fontSize: '0.85rem' }}>
          <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: TONE[health.status].bar }} />
          {t(`ppa.health_${health.status}`)}
        </span>
        <span style={{ fontSize: '0.76rem', color: 'var(--text-3)' }}>
          {health.status === UNKNOWN ? t('ppa.healthUnknownWhy') : t('ppa.healthFrom')}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
        {DIMENSIONS.map((key, i) => {
          const d = dimensions[key];
          const isOpen = open === key;
          return (
            <div key={key} style={{ borderTop: i === 0 ? 0 : '1px solid var(--border)' }}>
              <button type="button" onClick={() => setOpen(isOpen ? null : key)}
                aria-expanded={isOpen}
                style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                  gap: '0.75rem', padding: '0.6rem 0.8rem', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'left', minHeight: 42 }}>
                <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--text-1)' }}>{t(`ppa.dim_${key}`)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: TONE[d.status].fg }}>
                    {d.status === UNKNOWN ? t('ppa.assessmentUnavailable') : t(`ppa.health_${d.status}`)}
                  </span>
                  <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 999, background: TONE[d.status].bar }} />
                </span>
              </button>
              {isOpen && (
                <div style={{ padding: '0 0.8rem 0.7rem', fontSize: '0.79rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
                  {t(d.detail, localiseValues(d.values))}
                  {key === 'dataQuality' && completeness && (
                    <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                      {completeness.checks.filter((c) => !c.ok).map((c) => (
                        <li key={c.key} style={{ color: 'var(--text-3)' }}>{t(`ppa.check_${c.key}`)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Results framework ────────────────────────────────────────────────────────

const IND_TONE = {
  achieved: 'green', on_track: 'green', below_target: 'red', not_yet_due: 'unknown', no_data: 'unknown',
};

/**
 * Objective → Outcome → Output → Indicator, collapsible, because a project with
 * forty indicators is unreadable fully expanded and useless fully collapsed.
 */
function Framework({ d, results, onIndicator }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => new Set());
  const toggle = (id) => setOpen((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const byIndicatorId = useMemo(
    () => new Map(results.rows.map((r) => [r.indicator.id, r])), [results],
  );

  // An indicator can be attached at any level, so it is listed under the level
  // it names rather than being forced down to the output.
  const indicatorsFor = (level, id) => results.rows.filter(({ indicator: ind }) =>
    (level === 'objective' && ind.objective_id === id)
    || (level === 'outcome' && ind.outcome_id === id)
    || (level === 'output' && ind.output_id === id)
    || (ind.linked_level === level && ind.linked_id === id));

  const attached = new Set();
  for (const lvl of [['objective', d.objectives], ['outcome', d.outcomes], ['output', d.outputs]]) {
    for (const row of lvl[1]) for (const r of indicatorsFor(lvl[0], row.id)) attached.add(r.indicator.id);
  }
  const orphans = results.rows.filter((r) => !attached.has(r.indicator.id));

  const IndicatorRow = ({ r }) => (
    <button type="button" onClick={() => onIndicator(r)}
      style={{ display: 'flex', width: '100%', gap: '0.6rem', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.45rem 0.6rem', background: 'transparent', border: 0, borderTop: '1px solid var(--border)',
        cursor: 'pointer', textAlign: 'left', minHeight: 40 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)' }}>{r.indicator.code}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-1)', marginLeft: '0.45rem' }}>{r.indicator.name}</span>
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {typeof r.pct === 'number' && (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: TONE[IND_TONE[r.status]].fg }}>{fmtPct(r.pct)}</span>
        )}
        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: TONE[IND_TONE[r.status]].fg,
          background: TONE[IND_TONE[r.status]].bg, padding: '0.15rem 0.45rem', borderRadius: 999, whiteSpace: 'nowrap' }}>
          {t(`ppa.ind_${r.status}`)}
        </span>
      </span>
    </button>
  );

  const Node = ({ row, level, children, depth }) => {
    const isOpen = open.has(row.id);
    const inds = indicatorsFor(level, row.id);
    return (
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <button type="button" onClick={() => toggle(row.id)} aria-expanded={isOpen}
          style={{ display: 'flex', width: '100%', gap: '0.5rem', alignItems: 'baseline', padding: '0.55rem 0.6rem',
            paddingLeft: `${0.6 + depth * 0.85}rem`, background: depth === 0 ? 'var(--surface-1)' : 'transparent',
            border: 0, cursor: 'pointer', textAlign: 'left', minHeight: 40 }}>
          <span aria-hidden="true" style={{ color: 'var(--text-3)', fontSize: '0.7rem', width: 10, flexShrink: 0 }}>{isOpen ? '▾' : '▸'}</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>{row.code}</span>
          <span style={{ fontSize: '0.81rem', color: 'var(--text-1)', fontWeight: depth === 0 ? 700 : 400, minWidth: 0 }}>{row.statement}</span>
        </button>
        {isOpen && (
          <div>
            {inds.map((r) => <IndicatorRow key={r.indicator.id} r={r} />)}
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
      {d.objectives.map((obj) => (
        <Node key={obj.id} row={obj} level="objective" depth={0}>
          {d.outcomes.filter((oc) => oc.objective_id === obj.id).map((oc) => (
            <Node key={oc.id} row={oc} level="outcome" depth={1}>
              {d.outputs.filter((op) => op.outcome_id === oc.id).map((op) => (
                <Node key={op.id} row={op} level="output" depth={2} />
              ))}
            </Node>
          ))}
        </Node>
      ))}
      {orphans.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <div style={{ padding: '0.5rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)', background: 'var(--surface-1)' }}>
            {t('ppa.unlinkedIndicators')}
          </div>
          {orphans.map((r) => <IndicatorRow key={r.indicator.id} r={r} />)}
        </div>
      )}
      {byIndicatorId.size === 0 && d.objectives.length === 0 && (
        <p style={{ padding: '1rem', margin: 0, fontSize: '0.83rem', color: 'var(--text-3)' }}>{t('ppa.noFramework')}</p>
      )}
    </div>
  );
}

/** Indicator detail. Closing returns to exactly where the reader was. */
function IndicatorPanel({ entry, history, onClose }) {
  const { t } = useTranslation();
  const ind = entry.indicator;
  const p = entry.progress;
  const rows = history
    .filter((h) => h.indicator_id === ind.id)
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));

  return (
    <div role="dialog" aria-modal="true" aria-label={ind.name}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,18,15,0.35)', display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: 'var(--white)', width: 'min(560px, 100%)', height: '100%', overflowY: 'auto', padding: '1.25rem', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{ind.code}</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', margin: '0.15rem 0 0', color: 'var(--text-1)' }}>{ind.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary"
            style={{ padding: '0.35rem 0.7rem', borderRadius: 'var(--radius-control)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', flexShrink: 0 }}>
            {t('ppa.close')}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.8rem', margin: '1rem 0' }}>
          <Field label={t('ppa.baseline')} value={ind.baseline_value != null ? fmtNum(ind.baseline_value) : null} />
          <Field label={t('ppa.periodTarget')} value={p?.period_target != null ? fmtNum(p.period_target) : null} />
          <Field label={t('ppa.finalTarget')} value={(p?.final_target ?? ind.target_value) != null ? fmtNum(p?.final_target ?? ind.target_value) : null} />
          <Field label={t('ppa.actual')} value={p?.actual_this_period != null ? fmtNum(p.actual_this_period) : null} />
          <Field label={t('ppa.cumulative')} value={p?.cumulative_actual != null ? fmtNum(p.cumulative_actual) : null} />
          <Field label={t('ppa.achievement')} value={typeof entry.pct === 'number' ? fmtPct(entry.pct) : null} />
          <Field label={t('ppa.unit')} value={ind.unit} />
          <Field label={t('ppa.frequency')} value={ind.frequency} />
          <Field label={t('ppa.dataSource')} value={ind.data_source} />
          <Field label={t('ppa.lastUpdated')} value={p?.updated_at ? fmtDate(p.updated_at) : null} />
        </div>

        {ind.definition && (
          <p style={{ fontSize: '0.83rem', color: 'var(--text-2)', lineHeight: 1.55 }}>{ind.definition}</p>
        )}
        {ind.is_qualitative && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{t('ppa.qualitativeNote')}</p>
        )}
        {ind.higher_is_better === false && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>{t('ppa.inverseNote')}</p>
        )}

        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '1.1rem 0 0.5rem', color: 'var(--text-1)' }}>{t('ppa.history')}</h3>
        {rows.length === 0 ? (
          <p style={{ fontSize: '0.83rem', color: 'var(--text-3)' }}>{t('ppa.noResultsReported')}</p>
        ) : (
          <Scroller>
            <table className="data-table" style={{ width: '100%', minWidth: 380 }}>
              <thead><tr>
                <th>{t('ppa.period')}</th><th>{t('ppa.target')}</th>
                <th>{t('ppa.actual')}</th><th>{t('ppa.achievement')}</th>
              </tr></thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id}>
                    <td>{h.reporting_period || '—'}</td>
                    <td>{h.period_target != null ? fmtNum(h.period_target) : '—'}</td>
                    <td>{h.actual_this_period != null ? fmtNum(h.actual_this_period) : '—'}</td>
                    <td>{h.achievement_pct != null ? fmtPct(h.achievement_pct) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroller>
        )}
      </div>
    </div>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

const EMPTY = {
  project: null, objectives: [], outcomes: [], outputs: [], activities: [],
  indicators: [], progress: [], financial: [], beneficiaries: [], locations: [],
  risks: [], periods: [],
};

export default function ProjectPortfolioAnalysis() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [projects, setProjects] = useState([]);
  const [projectsError, setProjectsError] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // The URL is the source of truth for the selection, so a drill-down and the
  // browser's Back button both land the reader back on the same project. The
  // session copy is the fallback when the page is opened without a project.
  const projectId = params.get('project') ?? '';
  const period = params.get('period') ?? '';

  const [d, setD] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [indicator, setIndicator] = useState(null);
  const [mapProvince, setMapProvince] = useState(null);

  const setContext = useCallback((next) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
      return p;
    }, { replace: true });
  }, [setParams]);

  // ── The project list ───────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    const { data, error } = await localised(() =>
      supabase.from('v_projects')
        .select(i18nCols('id, code, name, status, category, donor, provinces'))
        .order('code'));
    if (error) { setProjectsError(dbErrorMessage(error, t('ppa.projectsFailed'))); setProjectsLoading(false); return; }
    const rows = data ?? [];
    setProjects(rows);
    setProjectsLoading(false);

    // Restore the previous selection, or choose the only project on offer —
    // a user with one project should not have to pick it every time.
    if (!projectId) {
      let restore = '';
      try { restore = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}').project || ''; } catch { /* no session */ }
      const valid = rows.some((p) => p.id === restore) ? restore : (rows.length === 1 ? rows[0].id : '');
      if (valid) setContext({ project: valid });
    }
  }, [t, projectId, setContext]);

  useEffect(() => { loadProjects(); }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Remember the context for the rest of the session, so returning from a
  // drill-down or from another page lands on the same project and period.
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ project: projectId, period })); }
    catch { /* private mode — the URL still carries it */ }
  }, [projectId, period]);

  // ── The selected project's records ─────────────────────────────────────────
  const load = useCallback(async (id) => {
    if (!id) { setD(EMPTY); setErrors({}); return; }
    setLoading(true);
    // Clear first: a figure from the previous project must never be on screen
    // while the new one loads, even for a moment.
    setD(EMPTY);
    setErrors({});
    setIndicator(null);
    setMapProvince(null);

    const scoped = (view, cols) => () =>
      supabase.from(view).select(i18nCols(cols)).eq('project_id', id);

    const jobs = {
      project: () => supabase.from('v_projects').select(i18nCols('*')).eq('id', id).maybeSingle(),
      objectives: scoped('v_objectives', 'id, code, statement'),
      outcomes: scoped('v_outcomes', 'id, objective_id, code, statement'),
      outputs: scoped('v_outputs', 'id, outcome_id, code, statement'),
      activities: scoped('v_project_activities',
        'id, code, name, status, output_id, output_code, province, island, area_council, community, '
        + 'planned_start_date, planned_end_date, actual_start_date, actual_end_date, '
        + 'planned_budget, actual_expenditure, physical_progress_pct, issue_delay, next_action, next_action_due'),
      indicators: scoped('v_project_indicators',
        'id, code, name, unit, baseline_value, target_value, indicator_level, definition, frequency, '
        + 'data_source, target_date, objective_id, outcome_id, output_id, linked_level, linked_id, '
        + 'is_qualitative, higher_is_better'),
      progress: scoped('v_indicator_progress',
        'id, indicator_id, reporting_period, period_target, actual_this_period, cumulative_actual, '
        + 'final_target, achievement_pct, performance_status, narrative, created_at, updated_at'),
      financial: scoped('v_financial_progress',
        'id, reporting_period, approved_budget, period_budget, expenditure_period, cumulative_expenditure, '
        + 'remaining_balance, utilisation_pct, funds_received, funds_available, created_at'),
      beneficiaries: scoped('v_beneficiaries',
        'id, reporting_period, total_direct, female, male, other_gender, youth, '
        + 'persons_with_disability, indirect, double_counting_check'),
      locations: scoped('v_project_locations',
        'id, province, island, area_council, community, latitude, longitude, intervention, status, beneficiaries'),
      risks: scoped('v_risks_issues',
        'id, code, type, description, category, likelihood, impact, risk_rating, mitigation, '
        + 'responsible_person, due_date, status, date_resolved'),
      periods: scoped('v_reporting_periods',
        'id, period_label, period_type, period_start, period_end, submission_status, submitted_at, approved_at'),
    };

    // One round trip for the whole page: several small loaders flashing in
    // sequence is worse than one, and the datasets are independent anyway.
    const entries = Object.entries(jobs);
    const settled = await Promise.all(entries.map(async ([key, q]) => {
      try { return [key, await localised(q)]; }
      catch (e) { return [key, { error: e }]; }
    }));

    const next = { ...EMPTY };
    const errs = {};
    for (const [key, res] of settled) {
      if (res?.error) { errs[key] = dbErrorMessage(res.error, t('ppa.sectionFailed')); continue; }
      next[key] = key === 'project' ? (res.data ?? null) : (res.data ?? []);
    }
    setD(next);
    setErrors(errs);
    setLoading(false);
  }, [t]);

  useEffect(() => { load(projectId); }, [projectId, lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── The analysis ───────────────────────────────────────────────────────────
  const a = useMemo(() => analyseProject(d, period), [d, period]);
  const geo = useMemo(() => geographicSummary(d.locations, d.activities), [d]);

  const periodOptions = useMemo(() => {
    const labels = [...new Set(d.periods.map((p) => p.period_label).filter(Boolean))];
    return labels.sort();
  }, [d.periods]);

  // Planned against actual over the reporting periods that have records.
  const spendSeries = useMemo(() => {
    let planned = 0;
    return a.financial.rows.map((r) => {
      planned += Number(r.period_budget ?? 0);
      return {
        period: r.reporting_period || '—',
        planned: planned || null,
        actual: r.cumulative_expenditure != null ? Number(r.cumulative_expenditure) : null,
      };
    });
  }, [a.financial.rows]);

  const jump = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const exportReport = async () => {
    // Logged to the same Report Library as every other official output, so a
    // generated project report is auditable alongside the rest.
    // The query builder is a thenable rather than a Promise, so it has no
    // .catch(); await it and ignore the result — a failed log must never stop
    // the officer printing their report.
    try {
      await supabase.rpc('log_report_run', {
        p_report_type: 'project_portfolio',
        p_report_label: t('ppa.title'),
        p_project_id: projectId || null,
        p_reporting_period: period || null,
        p_params: {},
      });
    } catch { /* logging is best effort */ }
    window.print();
  };

  const project = d.project;
  const busy = loading || projectsLoading;

  // ── No project chosen ──────────────────────────────────────────────────────
  const picker = (
    <div className="card rp-noprint" style={{ padding: '0.85rem 0.95rem', display: 'flex', gap: '0.9rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <ProjectPicker projects={projects} value={projectId} disabled={projectsLoading}
        onChange={(id) => setContext({ project: id, period: '' })} />
      {projectId && periodOptions.length > 0 && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
            {t('ppa.reportingPeriod')}
          </span>
          <select className="field-input" value={period} onChange={(e) => setContext({ period: e.target.value })}
            style={{ width: 'auto', minWidth: 170, padding: '0.45rem 0.55rem', fontSize: '0.85rem' }}>
            <option value="">{t('ppa.allPeriods')}</option>
            {periodOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      )}
      {projectId && (
        <button type="button" onClick={exportReport} className="btn-secondary"
          style={{ marginLeft: 'auto', padding: '0.5rem 0.85rem', borderRadius: 'var(--radius-control)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
          {t('ppa.exportReport')}
        </button>
      )}
    </div>
  );

  if (projectsError) {
    return (
      <div className="page-pad">
        <PageHeader title={t('ppa.title')} subtitle={t('ppa.subtitle')} />
        <SectionCard>
          <EmptyState title={t('ppa.projectsFailed')} description={projectsError}
            action={(
              <button type="button" className="btn-secondary" onClick={loadProjects}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-control)', fontWeight: 700, cursor: 'pointer' }}>
                {t('ppa.retry')}
              </button>
            )} />
        </SectionCard>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div className="page-pad">
        <PageHeader title={t('ppa.title')} subtitle={t('ppa.subtitle')} />
        {picker}
        <div style={{ marginTop: '1rem' }}>
          <SectionCard>
            <EmptyState
              title={t('ppa.chooseTitle')}
              description={projectsLoading ? t('ui.loading')
                : projects.length === 0 ? t('ppa.noProjectsVisible') : t('ppa.chooseText')} />
          </SectionCard>
        </div>
      </div>
    );
  }

  const periodLabel = period || t('ppa.cumulativeTotal');

  return (
    <div className="page-pad">
      {/* Printed only: the report has to identify itself away from the screen. */}
      <div className="ppa-printhead" style={{ display: 'none' }}>
        <h1>{t('ppa.reportTitle')}</h1>
        <p>
          {project ? `${project.code} — ${project.name}` : ''}<br />
          {t('ppa.reportPeriod', { period: periodLabel })}<br />
          {t('ppa.reportGenerated', { date: fmtDate(new Date()) })}
        </p>
      </div>

      <PageHeader title={t('ppa.title')} subtitle={t('ppa.subtitle')} />
      {picker}

      {busy ? (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <SkeletonCard /><SkeletonCard />
        </div>
      ) : !project ? (
        <div style={{ marginTop: '1rem' }}>
          <SectionCard>
            <EmptyState title={t('ppa.projectMissing')} description={errors.project ?? t('ppa.projectMissingText')}
              action={(
                <button type="button" className="btn-secondary" onClick={() => load(projectId)}
                  style={{ padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-control)', fontWeight: 700, cursor: 'pointer' }}>
                  {t('ppa.retry')}
                </button>
              )} />
          </SectionCard>
        </div>
      ) : (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* 3 — project identification */}
          <div className="card" style={{ padding: '0.9rem 1.1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.85rem' }}>
              <Field label={t('ppa.projectName')} value={project.name} />
              <Field label={t('ppa.projectCode')} value={project.code} />
              <Field label={t('ppa.donor')} value={project.donor} />
              <Field label={t('ppa.implementing')} value={project.executing_agency || project.lead_agency} />
              <Field label={t('ppa.startDate')} value={project.start_date ? fmtDate(project.start_date) : null} />
              <Field label={t('ppa.endDate')} value={project.end_date ? fmtDate(project.end_date) : null} />
              <Field label={t('ppa.status')} value={<StatusBadge status={project.status} />} />
              <Field label={t('ppa.manager')} value={project.project_manager_name} />
            </div>
          </div>

          {/* 4 — executive KPIs. Each jumps to the section that explains it. */}
          <div className="grid-stats">
            <button type="button" onClick={() => jump('ppa-health')} style={kpiBtn}>
              <StatTile label={t('ppa.kpiHealth')} status={tile(a.health.status)}
                value={t(`ppa.health_${a.health.status}`)}
                sub={t('ppa.kpiHealthSub')} />
            </button>
            <button type="button" onClick={() => jump('ppa-financial')} style={kpiBtn}>
              <StatTile label={t('ppa.kpiBudget')} status={tile(a.dimensions.financial.status)}
                value={typeof a.financial.utilisationPct === 'number' ? fmtPct(a.financial.utilisationPct) : t('ppa.notReported')}
                sub={a.financial.hasRecords
                  ? t('ppa.kpiBudgetSub', { spent: fmtAmount(a.financial.spent), budget: fmtAmount(a.financial.approved) })
                  : t('ppa.noFinancialRecords')} />
            </button>
            <button type="button" onClick={() => jump('ppa-implementation')} style={kpiBtn}>
              <StatTile label={t('ppa.kpiImplementation')} status={tile(a.dimensions.schedule.status)}
                value={typeof a.implementation.pct === 'number' ? fmtPct(a.implementation.pct) : t('ppa.notReported')}
                sub={a.implementation.basis === 'physical'
                  ? t('ppa.basisPhysical', { counted: a.implementation.counted, total: a.implementation.total })
                  : a.implementation.basis === 'status'
                    ? t('ppa.basisStatus', { counted: a.implementation.counted, total: a.implementation.total })
                    : t('ppa.noActivities')} />
            </button>
            <button type="button" onClick={() => jump('ppa-results')} style={kpiBtn}>
              <StatTile label={t('ppa.kpiResults')} status={tile(a.dimensions.results.status)}
                value={typeof a.results.achievementPct === 'number' ? fmtPct(a.results.achievementPct) : t('ppa.notReported')}
                sub={a.results.due > 0
                  ? t('ppa.kpiResultsSub', { meeting: a.results.meeting, due: a.results.due })
                  : t('ppa.noIndicatorsDue')} />
            </button>
            <button type="button" onClick={() => jump('ppa-timeline')} style={kpiBtn}>
              <StatTile label={t('ppa.kpiTime')} status="none"
                value={typeof a.timeElapsedPct === 'number' ? fmtPct(a.timeElapsedPct) : t('ppa.notReported')}
                sub={project.end_date ? t('ppa.kpiTimeSub', { date: fmtDate(project.end_date) }) : t('ppa.noDates')} />
            </button>
            <button type="button" onClick={() => jump('ppa-beneficiaries')} style={kpiBtn}>
              <StatTile label={t('ppa.kpiBeneficiaries')} status="none"
                value={a.beneficiaries.reached != null ? fmtNum(a.beneficiaries.reached) : t('ppa.notReported')}
                sub={a.beneficiaries.target != null
                  ? t('ppa.kpiBeneficiariesSub', { target: fmtNum(a.beneficiaries.target) })
                  : t('ppa.noBeneficiaryTarget')} />
            </button>
          </div>

          {/* 5 — Time vs Money vs Results */}
          <Section title={t('ppa.comparisonTitle')} description={t('ppa.comparisonDesc')}>
            <Comparison comparison={a.comparison} />
          </Section>

          {/* 6 — Project health */}
          <Section id="ppa-health" title={t('ppa.healthTitle')} description={t('ppa.healthDesc')}>
            <Health health={a.health} dimensions={a.dimensions} completeness={a.completeness} />
          </Section>

          {/* 8/9 — financial and implementation */}
          <div className="grid-2">
            <Section
              id="ppa-financial"
              title={t('ppa.financialTitle')}
              description={t('ppa.periodLabelCumulative')}
              error={errors.financial}
              onRetry={() => load(projectId)}
              empty={!errors.financial && !a.financial.hasRecords}
              emptyTitle={t('ppa.noFinancialRecords')}
              emptyText={t('ppa.noFinancialRecordsText')}
              actions={(
                <button type="button" className="btn-secondary rp-noprint"
                  onClick={() => navigate(`/analytics/financial?project=${encodeURIComponent(projectId)}`)}
                  style={{ padding: '0.35rem 0.7rem', borderRadius: 'var(--radius-control)', fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer' }}>
                  {t('ppa.viewFullFinancial')}
                </button>
              )}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.8rem', marginBottom: '1rem' }}>
                <Field label={t('ppa.approvedBudget')} value={fmtAmount(a.financial.approved)} />
                <Field label={t('ppa.expenditure')} value={fmtAmount(a.financial.spent)} />
                <Field label={t('ppa.remaining')} value={fmtAmount(a.financial.remaining)} />
                <Field label={t('ppa.utilisation')} value={fmtPct(a.financial.utilisationPct)} />
                <Field label={t('ppa.burnRate')} value={a.financial.burnRate != null ? t('ppa.perMonth', { amount: fmtAmount(a.financial.burnRate) }) : null} />
                <Field label={t('ppa.fundsReceived')} value={a.financial.fundsReceived != null ? fmtAmount(a.financial.fundsReceived) : null} />
              </div>

              {spendSeries.length > 1 ? (
                <div style={{ height: 210 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={spendSeries} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--text-3)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} width={62}
                        tickFormatter={(v) => fmtAmount(v)} />
                      <Tooltip formatter={(v, n) => [fmtAmount(v), t(n === 'planned' ? 'ppa.planned' : 'ppa.actualSpend')]} />
                      <Legend formatter={(v) => t(v === 'planned' ? 'ppa.planned' : 'ppa.actualSpend')} wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="planned" stroke="#9a9186" strokeWidth={2} dot={false} connectNulls />
                      <Line type="monotone" dataKey="actual" stroke="var(--green-600)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>{t('ppa.notEnoughPeriods')}</p>
              )}

              {typeof a.financial.gapPoints === 'number' && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', margin: '0.8rem 0 0', lineHeight: 1.5 }}>
                  {t(a.financial.gapPoints < 0 ? 'ppa.spendBehind' : 'ppa.spendAhead', {
                    gap: fmtNum(Math.abs(a.financial.gapPoints)),
                  })}
                </p>
              )}
            </Section>

            <Section
              id="ppa-implementation"
              title={t('ppa.implementationTitle')}
              error={errors.activities}
              onRetry={() => load(projectId)}
              empty={!errors.activities && d.activities.length === 0}
              emptyTitle={t('ppa.noActivities')}
              emptyText={t('ppa.noActivitiesText')}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '0.7rem', marginBottom: '1rem' }}>
                {[['total', 'none'], ['completed', 'green'], ['in_progress', 'none'], ['not_started', 'none'], ['delayed', 'red'], ['overdue', 'red']].map(([k, tone]) => (
                  <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: '0.5rem 0.6rem' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: a.buckets[k] > 0 && tone === 'red' ? TONE.red.fg : 'var(--text-1)' }}>
                      {fmtNum(a.buckets[k])}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(`ppa.act_${k}`)}</div>
                  </div>
                ))}
              </div>

              <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', margin: '0 0 0.35rem' }}>{t('ppa.keyDates')}</h4>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0 0 0.5rem', lineHeight: 1.45 }}>{t('ppa.keyDatesBasis')}</p>
              {a.commitments.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>{t('ppa.noKeyDates')}</p>
              ) : (
                <Scroller>
                  <table className="data-table" style={{ width: '100%', minWidth: 340 }}>
                    <thead><tr>
                      <th style={{ minWidth: 200 }}>{t('ppa.commitment')}</th>
                      <th>{t('ppa.dueDate')}</th><th>{t('ppa.status')}</th>
                    </tr></thead>
                    <tbody>
                      {a.commitments.slice(0, 8).map((c) => (
                        <tr key={c.id}>
                          <td>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{c.code}</span>{' '}
                            {c.label}
                            <div style={{ fontSize: '0.66rem', color: 'var(--text-3)' }}>{t(`ppa.kind_${c.kind}`)}</div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.due)}</td>
                          <td><StatusBadge status={c.status === 'upcoming' ? 'pending' : c.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroller>
              )}
            </Section>
          </div>

          {/* 10 — results performance */}
          <Section
            id="ppa-results"
            title={t('ppa.resultsTitle')}
            description={period ? t('ppa.periodLabelCurrent', { period }) : t('ppa.periodLabelCumulative')}
            error={errors.indicators || errors.progress}
            onRetry={() => load(projectId)}
            empty={!errors.indicators && d.indicators.length === 0}
            emptyTitle={t('ppa.noIndicators')}
            emptyText={t('ppa.noIndicatorsText')}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '0.7rem', marginBottom: '1rem' }}>
              {[['total', d.indicators.length], ['achieved', a.results.counts.achieved], ['on_track', a.results.counts.on_track],
                ['below_target', a.results.counts.below_target], ['not_yet_due', a.results.counts.not_yet_due], ['no_data', a.results.counts.no_data]].map(([k, v]) => (
                <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: '0.5rem 0.6rem' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-1)' }}>{fmtNum(v)}</div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {k === 'total' ? t('ppa.ind_total') : t(`ppa.ind_${k}`)}
                  </div>
                </div>
              ))}
            </div>
            <Framework d={d} results={a.results} onIndicator={setIndicator} />
          </Section>

          {/* 13/14 — beneficiaries and geography */}
          <div className="grid-2">
            <Section
              id="ppa-beneficiaries"
              title={t('ppa.beneficiariesTitle')}
              description={period ? t('ppa.periodLabelCurrent', { period }) : t('ppa.periodLabelCumulative')}
              error={errors.beneficiaries}
              onRetry={() => load(projectId)}
              empty={!errors.beneficiaries && !a.beneficiaries.hasRecords}
              emptyTitle={t('ppa.noBeneficiaries')}
              emptyText={period ? t('ppa.noBeneficiariesPeriod') : t('ppa.noBeneficiariesText')}
            >
              <div style={{ display: 'flex', gap: '1.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                <Field label={t('ppa.reached')} value={a.beneficiaries.reached != null ? fmtNum(a.beneficiaries.reached) : null} />
                <Field label={t('ppa.target')} value={a.beneficiaries.target != null ? fmtNum(a.beneficiaries.target) : null} />
                <Field label={t('ppa.achievement')} value={a.beneficiaries.achievementPct != null ? fmtPct(a.beneficiaries.achievementPct) : null} />
                <Field label={t('ppa.indirect')} value={a.beneficiaries.indirect != null ? fmtNum(a.beneficiaries.indirect) : null} />
              </div>

              {a.beneficiaries.categories.length > 0 && (
                <>
                  <table className="data-table" style={{ width: '100%' }}>
                    <thead><tr><th>{t('ppa.category')}</th><th style={{ textAlign: 'right' }}>{t('ppa.count')}</th></tr></thead>
                    <tbody>
                      {a.beneficiaries.categories.map((c) => (
                        <tr key={c.key}>
                          <td>{t(`opt.${c.key}`, { defaultValue: t(`ppa.cat_${c.key}`) })}</td>
                          <td style={{ textAlign: 'right' }}>{fmtNum(c.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', margin: '0.5rem 0 0', lineHeight: 1.45 }}>
                    {t('ppa.categoriesOverlap')}
                  </p>
                </>
              )}
              {a.beneficiaries.basis === 'largest' && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: '0.5rem 0 0', lineHeight: 1.45 }}>
                  {t('ppa.beneficiaryLargestBasis', { count: a.beneficiaries.periodCount })}
                </p>
              )}
            </Section>

            <Section
              id="ppa-geography"
              title={t('ppa.geographyTitle')}
              error={errors.locations}
              onRetry={() => load(projectId)}
              empty={!errors.locations && d.locations.length === 0}
              emptyTitle={t('ppa.noLocations')}
              emptyText={t('ppa.noLocationsText')}
              actions={mapProvince && (
                <button type="button" className="btn-secondary rp-noprint" onClick={() => setMapProvince(null)}
                  style={{ padding: '0.3rem 0.65rem', borderRadius: 'var(--radius-control)', fontWeight: 700, fontSize: '0.74rem', cursor: 'pointer' }}>
                  {t('ppa.clearLocation')}
                </button>
              )}
            >
              <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <Field label={t('ppa.provinces')} value={fmtNum(geo.provinceCount)} />
                <Field label={t('ppa.islands')} value={fmtNum(geo.islandCount)} />
                <Field label={t('ppa.communities')} value={fmtNum(geo.communityCount)} />
                <Field label={t('ppa.sites')} value={fmtNum(geo.siteCount)} />
              </div>
              <VanuatuMap counts={geo.counts} selected={mapProvince}
                onSelect={(p) => setMapProvince((cur) => (cur === p ? null : p))} />
              {(mapProvince ? geo.provinces.filter((p) => p.province === mapProvince) : geo.provinces).map((p) => (
                <div key={p.province} style={{ marginTop: '0.7rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-1)' }}>
                    {p.province}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>
                    {t('ppa.provinceDetail', {
                      sites: p.sites, activities: p.activities,
                      beneficiaries: p.beneficiaries != null ? fmtNum(p.beneficiaries) : t('ppa.notReported'),
                    })}
                  </div>
                  {p.communities.length > 0 && (
                    <div style={{ fontSize: '0.73rem', color: 'var(--text-3)', marginTop: 2 }}>{p.communities.join(' · ')}</div>
                  )}
                </div>
              ))}
            </Section>
          </div>

          {/* 15/17 — risks and reporting compliance */}
          <div className="grid-2">
            <Section
              id="ppa-risks"
              title={t('ppa.risksTitle')}
              error={errors.risks}
              onRetry={() => load(projectId)}
              empty={!errors.risks && d.risks.length === 0}
              emptyTitle={t('ppa.noRisks')}
              emptyText={t('ppa.noRisksText')}
            >
              <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
                <Field label={t('ppa.criticalRisks')} value={fmtNum(a.risks.critical.length)} />
                <Field label={t('ppa.highRisks')} value={fmtNum(a.risks.high.length)} />
                <Field label={t('ppa.openIssues')} value={fmtNum(a.risks.openIssues.length)} />
                <Field label={t('ppa.overdueMitigation')} value={fmtNum(a.risks.overdueMitigation.length)} />
              </div>
              {a.risks.unresolved.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', margin: 0 }}>
                  {t('ppa.allRisksResolved', { count: a.risks.resolved.length })}
                </p>
              ) : (
                <Scroller>
                  <table className="data-table" style={{ width: '100%', minWidth: 660 }}>
                    <thead><tr>
                      {/* The description carries the risk, so it gets the room;
                          without a floor it collapses to one word per line
                          inside the half-width column this table sits in. */}
                      <th style={{ minWidth: 260 }}>{t('ppa.risk')}</th>
                      <th>{t('ppa.rating')}</th><th>{t('ppa.owner')}</th>
                      <th>{t('ppa.due')}</th><th>{t('ppa.status')}</th>
                    </tr></thead>
                    <tbody>
                      {a.risks.unresolved.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-3)' }}>{r.code}</span> {r.description}
                            {r.mitigation && <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: 2 }}>{r.mitigation}</div>}
                          </td>
                          <td><StatusBadge status={String(r.risk_rating ?? 'unrated').toLowerCase()} /></td>
                          <td>{r.responsible_person || '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{r.due_date ? fmtDate(r.due_date) : '—'}</td>
                          <td><StatusBadge status={r.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroller>
              )}
            </Section>

            <Section
              id="ppa-reporting"
              title={t('ppa.reportingTitle')}
              error={errors.periods}
              onRetry={() => load(projectId)}
              empty={!errors.periods && d.periods.length === 0}
              emptyTitle={t('ppa.noPeriods')}
              emptyText={t('ppa.noPeriodsText')}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '0.7rem', marginBottom: '0.9rem' }}>
                {[['expected', a.reporting.expected], ['submitted', a.reporting.submitted.length],
                  ['awaiting', a.reporting.awaiting.length], ['approved', a.reporting.approved.length],
                  ['overdue', a.reporting.overdue.length]].map(([k, v]) => (
                  <div key={k} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-control)', padding: '0.5rem 0.6rem' }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800,
                      color: k === 'overdue' && v > 0 ? TONE.red.fg : 'var(--text-1)' }}>{fmtNum(v)}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(`ppa.rep_${k}`)}</div>
                  </div>
                ))}
              </div>
              <Field label={t('ppa.dataCompleteness')}
                value={t('ppa.completenessValue', { pct: fmtPct(a.completeness.pct), done: a.completeness.done, total: a.completeness.total })} />
              <div style={{ marginTop: '0.8rem' }}>
                <Scroller>
                  <table className="data-table" style={{ width: '100%', minWidth: 360 }}>
                    <thead><tr><th>{t('ppa.period')}</th><th>{t('ppa.periodEnd')}</th><th>{t('ppa.status')}</th></tr></thead>
                    <tbody>
                      {d.periods.map((p) => (
                        <tr key={p.id}>
                          <td>{p.period_label}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>{p.period_end ? fmtDate(p.period_end) : '—'}</td>
                          <td>
                            <StatusBadge status={a.reporting.overdue.includes(p) ? 'overdue' : p.submission_status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroller>
              </div>
            </Section>
          </div>

          {/* 18 — timeline */}
          <Section id="ppa-timeline" title={t('ppa.timelineTitle')}
            empty={!project.start_date || !project.end_date}
            emptyTitle={t('ppa.noDates')} emptyText={t('ppa.noDatesText')}>
            <Timeline project={project} periods={d.periods} commitments={a.commitments} elapsed={a.timeElapsedPct} />
          </Section>

          {/* 16 — requires management attention */}
          <Section id="ppa-attention" title={t('ppa.attentionTitle')} description={t('ppa.attentionDesc')}
            empty={a.attention.length === 0}
            emptyTitle={t('ppa.attentionClear')} emptyText={t('ppa.attentionClearText')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {a.attention.map((item) => (
                <button type="button" key={`${item.key}:${item.section}`} onClick={() => jump(`ppa-${item.section}`)}
                  style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', textAlign: 'left', width: '100%',
                    padding: '0.55rem 0.7rem', minHeight: 42, cursor: 'pointer',
                    background: TONE[item.severity].bg, border: `1px solid ${TONE[item.severity].bar}33`,
                    borderRadius: 'var(--radius-control)' }}>
                  <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: TONE[item.severity].bar, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', color: TONE[item.severity].fg, fontWeight: 600 }}>
                    {t(item.key, localiseValues(item.values))}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}

      {indicator && (
        <IndicatorPanel entry={indicator} history={d.progress} onClose={() => setIndicator(null)} />
      )}

      <style>{`
        @media print {
          .ppa-printhead { display: block !important; margin-bottom: 1rem; }
          .ppa-printhead h1 { font-size: 1.2rem; margin: 0 0 0.35rem; }
          .ppa-printhead p { font-size: 0.85rem; margin: 0; line-height: 1.6; }
        }
      `}</style>
    </div>
  );
}

// A KPI tile is a button, so the whole tile is the target rather than a small
// link inside it — but it must not look like one, so the button contributes no
// styling of its own.
const kpiBtn = {
  display: 'block', width: '100%', padding: 0, border: 0, background: 'transparent',
  textAlign: 'left', cursor: 'pointer', font: 'inherit',
};

// ── Timeline ─────────────────────────────────────────────────────────────────

/**
 * Where the project sits between its start and end dates, with its reporting
 * points and dated commitments on the same line. The marker is placed from the
 * same time-elapsed figure the KPI shows, so the picture and the number cannot
 * disagree.
 */
function Timeline({ project, periods, commitments, elapsed }) {
  const { t } = useTranslation();
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.end_date).getTime();
  const span = end - start;
  const at = (v) => {
    const p = ((new Date(v).getTime() - start) / span) * 100;
    return Math.max(0, Math.min(100, p));
  };

  const marks = [
    ...periods.filter((p) => p.period_end).map((p) => ({
      id: `p:${p.id}`, pct: at(p.period_end), date: p.period_end, label: p.period_label, kind: 'report',
    })),
    ...commitments.filter((c) => c.kind === 'plannedEnd').slice(0, 12).map((c) => ({
      id: `c:${c.id}`, pct: at(c.due), date: c.due, label: c.label,
      kind: c.status === 'overdue' ? 'overdue' : 'activity',
    })),
  ];

  const KIND = { report: '#2f6df0', activity: 'var(--green-600)', overdue: TONE.red.bar };

  return (
    <div>
      <div style={{ position: 'relative', height: 46, marginBottom: '0.6rem' }}>
        <div style={{ position: 'absolute', top: 20, left: 0, right: 0, height: 4, background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 999 }} />
        {typeof elapsed === 'number' && (
          <div style={{ position: 'absolute', top: 20, left: 0, width: `${elapsed}%`, height: 4, background: 'var(--green-200)', borderRadius: 999 }} />
        )}
        {marks.map((m) => (
          <span key={m.id} title={`${m.label} · ${fmtDate(m.date)}`} aria-hidden="true"
            style={{ position: 'absolute', top: 16, left: `calc(${m.pct}% - 4px)`, width: 8, height: 12, borderRadius: 2, background: KIND[m.kind] }} />
        ))}
        {typeof elapsed === 'number' && (
          <span style={{ position: 'absolute', top: 10, left: `calc(${elapsed}% - 1px)`, width: 2, height: 24, background: 'var(--text-1)' }} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-3)', gap: '1rem' }}>
        <span>{fmtDate(project.start_date)}</span>
        <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>
          {typeof elapsed === 'number' ? t('ppa.todayAt', { pct: fmtPct(elapsed) }) : t('ppa.today')}
        </span>
        <span>{fmtDate(project.end_date)}</span>
      </div>
      <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', marginTop: '0.6rem', fontSize: '0.7rem', color: 'var(--text-3)' }}>
        {['report', 'activity', 'overdue'].map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: KIND[k] }} />
            {t(`ppa.mark_${k}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
