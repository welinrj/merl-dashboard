import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  Legend, Cell, PieChart, Pie,
} from 'recharts';
import { supabase } from '../supabaseClient';
import { cachedRead } from '../lib/cachedRead';
import { ACTIVITIES as EMBEDDED } from '../strategicPlan';

/* ── theme / status ──────────────────────────────────────────────────────
   Analysis derives everything from the Strategic Results Framework activities
   (the same source the Dashboard and Framework tabs use), so the figures here
   always reflect the live register rather than a separate data model. */
const THEMES = ['Adaptation', 'Mitigation', 'Governance', 'Finance', 'Knowledge', 'Cross-cutting'];
const THEME_COL = {
  Adaptation: '#0e6e6e', Mitigation: '#d99a2b', Governance: '#b3402f',
  Finance: '#158a7a', Knowledge: '#9a6d3b', 'Cross-cutting': '#5c6b8a',
};
const STATUS_KEYS  = ['green', 'amber', 'red', 'none'];
const STATUS_COL   = { green: '#1a8c4e', amber: '#d99a2b', red: '#b3402f', none: '#9a9186' };
const STATUS_LABEL = { green: 'On Track', amber: 'At Risk', red: 'No Progress', none: 'Unrated' };
/* Accepts both the embedded (green/amber/red/none) and DB (on_track/…) codings. */
const NORM = {
  green: 'green', amber: 'amber', red: 'red', none: 'none',
  on_track: 'green', at_risk: 'amber', no_progress: 'red', unrated: 'none',
};

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const fmtVUV = n =>
  !n ? '0' :
  n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' :
  n >= 1e6 ? (n / 1e6).toFixed(0) + 'M' : String(Math.round(n));

const ChartTooltip = ({ active, payload, label, suffix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.625rem 0.875rem', boxShadow: 'var(--shadow-md)', fontSize: '0.8125rem' }}>
      <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: '0.3rem' }}>{label}</div>
      {payload.filter(p => p.value != null && p.value !== 0).map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-3)', marginBottom: '0.15rem' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: p.color || p.fill }} />
          {p.name}: <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{p.value}{suffix}</span>
        </div>
      ))}
    </div>
  );
};

function Kpi({ label, value, sub, color }) {
  return (
    <div className="card" style={{ padding: '1rem 1.1rem' }}>
      <div className="section-label" style={{ marginBottom: '0.35rem' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, color: color || 'var(--text-1)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.2rem' }}>{sub}</div>}
    </div>
  );
}

export default function Analysis() {
  const [acts, setActs] = useState(null);
  // Precomputed, organisation-wide aggregate shared by all users. Read from the
  // Redis caching sidecar when present, otherwise straight from the DB
  // materialized view (v_srf_analytics); null → derive from `acts` client-side.
  const [agg, setAgg] = useState(null);
  const [error, setError] = useState('');
  const [themeFilter, setThemeFilter] = useState('All');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from('v_srf_activities')
        .select('code,name,theme,focus_area,budget_vuv,status,indicator,target_2030')
        .order('sort_order');
      if (cancelled) return;
      const normalize = (rows) => rows.map(a => ({
        code: a.code, name: a.name, theme: a.theme, focusArea: a.focusArea,
        budget: Number(a.budget || 0), status: NORM[a.status] ?? 'none',
        indicator: a.indicator, target2030: a.target2030,
      }));
      if (!err && data && data.length) {
        setActs(data.map(a => ({
          code: a.code, name: a.name, theme: a.theme, focusArea: a.focus_area,
          budget: Number(a.budget_vuv || 0), status: NORM[a.status] ?? 'none',
          indicator: a.indicator, target2030: a.target_2030,
        })));
      } else if (err && err.message && !/does not exist|relation|permission/i.test(err.message)) {
        // A genuine transport error (not a missing/empty view) — surface it,
        // but still fall back to the embedded plan so the page is never blank.
        setError(err.message);
        setActs(normalize(EMBEDDED));
      } else {
        setActs(normalize(EMBEDDED));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await cachedRead('srf-analytics', async () => {
          // Fallback when the sidecar isn't reachable: read the materialized
          // view directly (still a single-row precomputed read, not a scan).
          const { data: row } = await supabase.from('v_srf_analytics').select('*').maybeSingle();
          return row || null;
        });
        if (!cancelled) setAgg(data && data.activity_count != null ? data : null);
      } catch {
        if (!cancelled) setAgg(null); // fall back to client-side aggregation
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const statusCounts = useMemo(() => {
    if (agg) return { green: agg.status_on_track, amber: agg.status_at_risk, red: agg.status_no_progress, none: agg.status_unrated };
    const c = { green: 0, amber: 0, red: 0, none: 0 };
    (acts ?? []).forEach(a => { c[a.status] = (c[a.status] || 0) + 1; });
    return c;
  }, [agg, acts]);

  const activityCount = agg ? agg.activity_count : (acts?.length ?? 0);
  const themesCount = agg
    ? (agg.by_theme?.length ?? 0)
    : THEMES.filter(t => (acts ?? []).some(a => a.theme === t)).length;
  const totalBudget = useMemo(
    () => (agg ? Number(agg.total_budget_vuv || 0) : (acts ?? []).reduce((s, a) => s + a.budget, 0)),
    [agg, acts]);

  const statusPie = useMemo(() =>
    STATUS_KEYS.map(k => ({ name: STATUS_LABEL[k], key: k, value: statusCounts[k] }))
      .filter(d => d.value > 0), [statusCounts]);

  const budgetByTheme = useMemo(() => {
    if (agg) return (agg.by_theme ?? []).map(t => ({ name: t.theme, budgetM: Math.round(Number(t.budget_vuv || 0) / 1e6) })).filter(d => d.budgetM > 0);
    return THEMES.map(t => ({
      name: t,
      budgetM: Math.round((acts ?? []).filter(a => a.theme === t).reduce((s, a) => s + a.budget, 0) / 1e6),
    })).filter(d => d.budgetM > 0);
  }, [agg, acts]);

  const statusByTheme = useMemo(() => {
    if (agg) return (agg.by_theme ?? []).map(t => ({
      theme: t.theme, green: t.on_track, amber: t.at_risk, red: t.no_progress, none: t.unrated,
    })).filter(r => STATUS_KEYS.some(k => r[k] > 0));
    return THEMES.map(t => {
      const row = { theme: t };
      STATUS_KEYS.forEach(k => { row[k] = 0; });
      (acts ?? []).filter(a => a.theme === t).forEach(a => { row[a.status] += 1; });
      return row;
    }).filter(r => STATUS_KEYS.some(k => r[k] > 0));
  }, [agg, acts]);

  const focusByBudget = useMemo(() => {
    let rows;
    if (agg) {
      rows = (agg.by_focus ?? []).map(f => ({ name: f.focus_area, theme: f.theme, budgetM: Math.round(Number(f.budget_vuv || 0) / 1e6) }));
    } else {
      const map = {};
      (acts ?? []).forEach(a => {
        if (!a.focusArea) return;
        (map[a.focusArea] ??= { name: a.focusArea, theme: a.theme, budgetM: 0 });
        map[a.focusArea].budgetM += a.budget / 1e6;
      });
      rows = Object.values(map).map(d => ({ ...d, budgetM: Math.round(d.budgetM) }));
    }
    return rows
      .filter(d => d.budgetM > 0)
      .sort((a, b) => b.budgetM - a.budgetM)
      .slice(0, 8)
      .map(d => ({ ...d, name: d.name.length > 24 ? d.name.slice(0, 24) + '…' : d.name }));
  }, [agg, acts]);

  const themeTabs = ['All', ...THEMES];
  const visibleActs = useMemo(() =>
    (acts ?? []).filter(a => themeFilter === 'All' || a.theme === themeFilter),
    [acts, themeFilter]);

  if (!acts) {
    return <div style={{ padding: '2rem 2.5rem', color: 'var(--text-3)' }}>Loading analysis…</div>;
  }

  const onTrackPct = pct(statusCounts.green, activityCount);

  return (
    <div style={{ maxWidth: 1400 }} className="animate-fade-up page-pad">
      <div style={{ marginBottom: '1.5rem' }}>
        <div className="section-label" style={{ marginBottom: '0.375rem' }}>Analytics</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.5rem, 5vw, 1.875rem)', fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.025em', margin: 0 }}>
          Analysis
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
          Strategic Results Framework — status, budget allocation and delivery across all {activityCount} activities.
        </p>
        {error && (
          <div style={{ fontSize: '0.78rem', color: 'var(--gold-500)', marginTop: '0.4rem' }}>
            Showing the embedded plan (live data unavailable: {error}).
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid-kpi" style={{ marginBottom: '1.25rem' }}>
        <Kpi label="Activities" value={activityCount} sub={`${themesCount} themes`} />
        <Kpi label="Total Budget" value={`${fmtVUV(totalBudget)}`} sub="VUV allocated" color="var(--green-600)" />
        <Kpi label="On Track" value={`${onTrackPct}%`} sub={`${statusCounts.green} of ${activityCount} activities`} color={STATUS_COL.green} />
        <Kpi label="Needs Attention" value={statusCounts.amber + statusCounts.red} sub={`${statusCounts.amber} at risk · ${statusCounts.red} off track`} color={STATUS_COL.red} />
      </div>

      {/* Charts row 1 */}
      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <div className="section-label" style={{ marginBottom: '1rem' }}>Delivery Status</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={90} paddingAngle={2}>
                {statusPie.map(d => <Cell key={d.key} fill={STATUS_COL[d.key]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-label" style={{ marginBottom: '1rem' }}>Budget by Theme (VUV M)</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={budgetByTheme} barSize={26}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip suffix="M" />} />
              <Bar dataKey="budgetM" name="Budget" radius={[3, 3, 0, 0]}>
                {budgetByTheme.map((d, i) => <Cell key={i} fill={THEME_COL[d.name] || 'var(--green-600)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
        <div className="card">
          <div className="section-label" style={{ marginBottom: '1rem' }}>Activity Status by Theme</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusByTheme} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
              <XAxis dataKey="theme" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={54} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {STATUS_KEYS.map(k => (
                <Bar key={k} dataKey={k} name={STATUS_LABEL[k]} stackId="s" fill={STATUS_COL[k]} radius={k === 'none' ? [3, 3, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="section-label" style={{ marginBottom: '1rem' }}>Top Focus Areas by Budget (VUV M)</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={focusByBudget} layout="vertical" barSize={14} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-3)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip suffix="M" />} />
              <Bar dataKey="budgetM" name="Budget" radius={[0, 3, 3, 0]}>
                {focusByBudget.map((d, i) => <Cell key={i} fill={THEME_COL[d.theme] || 'var(--green-600)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Activity delivery detail */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div className="section-label" style={{ marginBottom: '0.25rem' }}>Activity Delivery</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.0625rem', fontWeight: 700, color: 'var(--text-1)' }}>
              {visibleActs.length} activit{visibleActs.length !== 1 ? 'ies' : 'y'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
            {themeTabs.map(t => (
              <button key={t} onClick={() => setThemeFilter(t)} style={{
                padding: '0.3rem 0.75rem', borderRadius: 6, border: '1.5px solid',
                fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.02em',
                background: themeFilter === t ? (t === 'All' ? 'var(--green-800)' : THEME_COL[t]) : 'var(--white)',
                color: themeFilter === t ? '#fff' : 'var(--text-2)',
                borderColor: themeFilter === t ? (t === 'All' ? 'var(--green-800)' : THEME_COL[t]) : 'var(--border)',
                transition: 'all 0.12s',
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
          {visibleActs.map(a => (
            <div key={a.code} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center', paddingBottom: '0.55rem', borderBottom: '1px solid var(--border)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-1)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)', fontSize: '0.6875rem', marginRight: '0.4rem' }}>{a.code}</span>
                  {a.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.15rem' }}>
                  <span style={{ color: THEME_COL[a.theme], fontWeight: 700 }}>{a.theme}</span>
                  {a.focusArea ? ` · ${a.focusArea}` : ''}
                  {a.budget ? ` · ${fmtVUV(a.budget)} VUV` : ''}
                </div>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: `${STATUS_COL[a.status]}18`, color: STATUS_COL[a.status], borderRadius: 9999, padding: '0.15rem 0.6rem', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap', justifySelf: 'end' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COL[a.status] }} />{STATUS_LABEL[a.status]}
              </span>
            </div>
          ))}
          {visibleActs.length === 0 && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-3)' }}>No activities in this theme yet.</div>
          )}
        </div>
      </div>

    </div>
  );
}
