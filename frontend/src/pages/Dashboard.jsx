import { useState, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { ArrowRight, X, ChevronDown } from 'lucide-react';
import { AnimatedImageText } from '@/components/ui/text-animation';
import { STRATEGIC_THEMES, ACTIVITIES, PLAN_SUMMARY as S } from '../strategicPlan';

/* Image clipped to the animated dashboard title. A misty forest reads as the
   teal/green environmental theme when shown through the letters. */
const TITLE_TEXTURE =
  'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=60';

/* ── helpers ────────────────────────────────────────────────────────────── */
const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const fmtVUV = n =>
  n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' :
  n >= 1e6 ? (n / 1e6).toFixed(0) + 'M' : String(Math.round(n));
const STATUS_COL   = { green:'#1a8c4e', amber:'#d99a2b', red:'#b3402f', none:'#9a9186' };
const STATUS_BG    = { green:'#dcece2', amber:'#f7ead0', red:'#f6ded8', none:'#ece9e3' };
const STATUS_TXT   = { green:'#155e34', amber:'#8a6416', red:'#8a2e21', none:'#5b5349' };
const STATUS_LABEL = { green:'On Track', amber:'At Risk', red:'No Progress', none:'Unrated' };
const THEME_COL    = {
  Adaptation:'#0e6e6e', Mitigation:'#d99a2b', Governance:'#b3402f',
  Finance:'#158a7a', Knowledge:'#9a6d3b', 'Cross-cutting':'#5c6b8a',
};
const BANNER = `${import.meta.env.BASE_URL}IMG_0874.jpeg`;

/* ── filter metadata ───────────────────────────────────────────────────────
   Filters let users narrow the dashboard by Theme, Focus Area and Status.
   Each dimension is multi-select (one or more values), and dimensions combine
   with AND. When any filter is active, every KPI/chart/list is recomputed from
   the matching activities; otherwise the overall PLAN_SUMMARY is shown. */
const THEME_OPTIONS  = STRATEGIC_THEMES.map(t => t.name);
const FOCUS_BY_THEME = Object.fromEntries(
  STRATEGIC_THEMES.map(t => [t.name, t.focusAreas.map(f => f.name)]),
);
const ALL_FOCUS = [...new Set(ACTIVITIES.map(a => a.focusArea))];
const STATUS_OPTIONS = [
  { value:'green', label:'On Track' },
  { value:'amber', label:'At Risk' },
  { value:'red',   label:'No Progress' },
  { value:'none',  label:'Unrated' },
];

/* Recompute the summary object (same shape as PLAN_SUMMARY) from a set of
   activities, so filtered views drive every KPI on the page. */
function deriveView(acts) {
  const status = { green:0, amber:0, red:0, none:0 };
  const themes = new Set(), focusAreas = new Set(), focusTheme = {}, focusBudget = {};
  let indicators = 0, total_budget_vuv = 0;
  for (const a of acts) {
    status[a.status] = (status[a.status] || 0) + 1;
    themes.add(a.theme);
    focusAreas.add(a.focusArea);
    if (a.indicator) indicators += 1;
    total_budget_vuv += a.budget || 0;
    focusBudget[a.focusArea] = (focusBudget[a.focusArea] || 0) + (a.budget || 0);
    focusTheme[a.focusArea]  = a.theme;
  }
  const budget_by_focus = Object.entries(focusBudget)
    .filter(([, b]) => b > 0)
    .map(([name, b]) => ({
      name: name.length > 23 ? name.slice(0, 23) : name,
      fullName: name,
      budget: Math.round(b / 1e6),
      theme: focusTheme[name],
    }))
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 9);
  return {
    themes: themes.size,
    focus_areas: focusAreas.size,
    activities: acts.length,
    indicators,
    total_budget_vuv,
    status,
    budget_by_focus,
  };
}

/* Multi-select dropdown: each filter dimension accepts one or more values.
   `selected` is an array of values; toggling a checkbox adds/removes it. */
function MultiSelect({ label, selected, onToggle, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const active = selected.length > 0;
  const summary = !active
    ? placeholder
    : selected.length === 1
      ? (options.find(o => o.value === selected[0])?.label ?? `${selected.length} selected`)
      : `${selected.length} selected`;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.2rem', minWidth:0, position:'relative' }}>
      <span style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-3)' }}>{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.4rem',
          padding:'0.4rem 0.55rem', borderRadius:8,
          border:`1px solid ${active ? 'var(--green-600)' : 'var(--border)'}`,
          background:'var(--white)', color:active ? 'var(--text-1)' : 'var(--text-2)',
          fontSize:'0.8rem', fontWeight:600, minWidth:150, maxWidth:220, cursor:'pointer',
          textAlign:'left', whiteSpace:'nowrap', overflow:'hidden',
        }}
      >
        <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{summary}</span>
        <ChevronDown size={14} style={{ flexShrink:0, transform:open ? 'rotate(180deg)' : 'none', transition:'transform 0.15s' }} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:20 }} />
          <div
            className="scrollbar-thin"
            style={{
              position:'absolute', top:'100%', left:0, marginTop:4, zIndex:21,
              minWidth:'100%', maxWidth:280, maxHeight:260, overflowY:'auto',
              background:'var(--white)', border:'1px solid var(--border)', borderRadius:8,
              boxShadow:'var(--shadow-md)', padding:'0.3rem',
            }}
          >
            {options.length === 0 && (
              <div style={{ padding:'0.4rem 0.5rem', fontSize:'0.78rem', color:'var(--text-3)' }}>No options</div>
            )}
            {options.map(o => {
              const checked = selected.includes(o.value);
              return (
                <label
                  key={o.value}
                  style={{
                    display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.35rem 0.45rem',
                    borderRadius:6, cursor:'pointer', fontSize:'0.8rem',
                    color:'var(--text-1)', background:checked ? 'var(--green-50)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(o.value)}
                    style={{ accentColor:'var(--green-600)', cursor:'pointer', flexShrink:0 }}
                  />
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.label}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ── tribal-banner card ──────────────────────────────────────────────────── */
function BannerCard({ title, action, children, style }) {
  return (
    <div className="card" style={{ padding:0, overflow:'hidden', display:'flex', flexDirection:'column', ...style }}>
      <div style={{
        height:64, display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 1.1rem', position:'relative',
        backgroundImage:`url(${BANNER})`, backgroundRepeat:'no-repeat',
        backgroundSize:'cover', backgroundPosition:'center 22%',
      }}>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(18,13,10,0.9) 0%, rgba(18,13,10,0.6) 55%, rgba(18,13,10,0.34) 100%)' }} />
        <h3 style={{ position:'relative', zIndex:1, color:'#fff', fontFamily:'var(--font-display)', fontSize:'1.02rem', fontWeight:800, letterSpacing:'-0.01em', textShadow:'0 1px 4px rgba(0,0,0,0.45)', margin:0 }}>{title}</h3>
        {action && <div style={{ position:'relative', zIndex:1 }}>{action}</div>}
      </div>
      <div style={{ padding:'1.1rem 1.2rem', flex:1, display:'flex', flexDirection:'column' }}>{children}</div>
    </div>
  );
}

function Kpi({ label, value, tone = 'teal' }) {
  const col = tone === 'red' ? 'var(--red-600)' : tone === 'gold' ? 'var(--gold-500)' : 'var(--green-600)';
  return (
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:'0.66rem', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase', color:'var(--text-3)', lineHeight:1.25 }}>{label}</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, letterSpacing:'-0.03em', color:col, marginTop:'0.35rem', fontVariantNumeric:'tabular-nums' }}>{value}</div>
    </div>
  );
}

/* ── semicircle gauge ────────────────────────────────────────────────────── */
function Gauge({ value, label }) {
  const cx = 100, cy = 104, r = 62;
  const a = Math.PI * (1 - value / 100);
  const nx = cx + r * 0.82 * Math.cos(a);
  const ny = cy - r * 0.82 * Math.sin(a);
  const arc = (from, to) => {
    const a0 = Math.PI * (1 - from / 100), a1 = Math.PI * (1 - to / 100);
    return `M ${cx + r*Math.cos(a0)} ${cy - r*Math.sin(a0)} A ${r} ${r} 0 0 1 ${cx + r*Math.cos(a1)} ${cy - r*Math.sin(a1)}`;
  };
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', margin:'auto 0' }}>
      <svg width="210" height="128" viewBox="0 0 200 128">
        <path d={arc(0, 40)}   fill="none" stroke="#b3402f" strokeWidth="15" strokeLinecap="round" />
        <path d={arc(42, 72)}  fill="none" stroke="#e0a12a" strokeWidth="15" strokeLinecap="round" />
        <path d={arc(74, 100)} fill="none" stroke="#0e6e6e" strokeWidth="15" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6.5" fill="var(--ink)" />
      </svg>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, color:'var(--green-600)', marginTop:'-0.4rem' }}>{value}%</div>
      <div style={{ fontSize:'0.82rem', color:'var(--text-2)' }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', background:STATUS_BG[status], color:STATUS_TXT[status],
      borderRadius:9999, padding:'0.15rem 0.55rem', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:STATUS_COL[status] }}/>{STATUS_LABEL[status]}
    </span>
  );
}

const BudgetTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:'0.5rem 0.75rem', boxShadow:'var(--shadow-md)', fontSize:'0.8125rem', maxWidth:220 }}>
      <div style={{ fontWeight:700, color:'var(--text-2)', marginBottom:'0.15rem' }}>{label}</div>
      <div style={{ color:'var(--text-1)', fontWeight:600 }}>{payload[0].value}M VUV allocated</div>
    </div>
  );
};

/* ══ Dashboard — DoCC Strategic Plan 2025–2030 ═══════════════════════════════ */
export default function Dashboard() {
  // Each filter dimension holds an array of selected values (multi-select).
  const [themes, setThemes] = useState([]);
  const [focusAreas, setFocusAreas] = useState([]);
  const [statuses, setStatuses] = useState([]);

  const isFiltered = themes.length > 0 || focusAreas.length > 0 || statuses.length > 0;

  // Focus-area options narrow to the selected themes (union), if any.
  const focusOptions = useMemo(
    () => (themes.length
      ? [...new Set(themes.flatMap(t => FOCUS_BY_THEME[t] || []))]
      : ALL_FOCUS),
    [themes],
  );

  const filtered = useMemo(
    () => (isFiltered
      ? ACTIVITIES.filter(a =>
          (themes.length === 0 || themes.includes(a.theme)) &&
          (focusAreas.length === 0 || focusAreas.includes(a.focusArea)) &&
          (statuses.length === 0 || statuses.includes(a.status)))
      : ACTIVITIES),
    [isFiltered, themes, focusAreas, statuses],
  );

  // When filtered, recompute the summary; otherwise use the overall figures.
  const view = useMemo(
    () => (isFiltered ? deriveView(filtered) : S),
    [isFiltered, filtered],
  );

  const st = view.status;
  const onTrackPct = pct(st.green || 0, view.activities);
  const attention = filtered.filter(a => a.status === 'red').slice(0, 5);
  const budgetData = view.budget_by_focus;

  const toggle = (setter, value) =>
    setter(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  // Toggling a theme also drops any selected focus areas outside the new set.
  const toggleTheme = value => {
    const next = themes.includes(value) ? themes.filter(v => v !== value) : [...themes, value];
    setThemes(next);
    if (next.length) {
      const allowed = new Set(next.flatMap(t => FOCUS_BY_THEME[t] || []));
      setFocusAreas(prev => prev.filter(f => allowed.has(f)));
    }
  };

  const clearFilters = () => { setThemes([]); setFocusAreas([]); setStatuses([]); };

  return (
    <div style={{ maxWidth:1400 }} className="animate-fade-up page-pad">

      <h1 style={{ fontFamily:"'Impact', 'Haettenschweiler', 'Franklin Gothic Bold', 'Arial Narrow Bold', sans-serif", fontSize:'clamp(1.5rem, 5.5vw, 2.4rem)', fontWeight:900, letterSpacing:'0.01em', margin:'0 0 0.35rem', lineHeight:1.05 }}>
        <AnimatedImageText image={TITLE_TEXTURE}>
          Dashboard — Monitoring, Evaluation, Research &amp; Learning
        </AnimatedImageText>
      </h1>
      <div style={{ fontSize:'0.85rem', color:'var(--text-2)', margin:'0 0 1.25rem' }}>
        DoCC Strategic Results Framework 2025–2030 · Government of Vanuatu
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding:'0.85rem 1rem', marginBottom:'1rem', display:'flex', gap:'0.9rem', alignItems:'flex-end', flexWrap:'wrap' }}>
        <MultiSelect
          label="Theme" placeholder="All themes"
          selected={themes} onToggle={toggleTheme}
          options={THEME_OPTIONS.map(t => ({ value:t, label:t }))}
        />
        <MultiSelect
          label="Focus Area" placeholder="All focus areas"
          selected={focusAreas} onToggle={v => toggle(setFocusAreas, v)}
          options={focusOptions.map(f => ({ value:f, label:f }))}
        />
        <MultiSelect
          label="Status" placeholder="All statuses"
          selected={statuses} onToggle={v => toggle(setStatuses, v)}
          options={STATUS_OPTIONS}
        />
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'0.75rem' }}>
          <span style={{ fontSize:'0.75rem', fontWeight:600, color:isFiltered ? 'var(--green-600)' : 'var(--text-3)' }}>
            {isFiltered
              ? `Filtered · ${filtered.length} of ${S.activities} activities`
              : `Showing all ${S.activities} activities`}
          </span>
          {isFiltered && (
            <button
              onClick={clearFilters}
              style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background:'var(--green-50)', color:'var(--green-600)', border:'1px solid var(--border)', borderRadius:9999, padding:'0.3rem 0.7rem', fontSize:'0.75rem', fontWeight:700, cursor:'pointer' }}
            >
              <X size={13} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Row 1 — three banner cards */}
      <div className="grid-dash-3" style={{ marginBottom:'1rem' }}>
        <BannerCard title="Strategic Framework">
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <Kpi label="Themes" value={view.themes} tone="teal" />
            <Kpi label="Focus Areas" value={view.focus_areas} tone="gold" />
            <Kpi label="Activities" value={view.activities} tone="teal" />
          </div>
          <div style={{ marginTop:'auto', paddingTop:'0.9rem', fontSize:'0.78rem', color:'var(--text-3)' }}>
            {view.themes} strategic {view.themes === 1 ? 'priority' : 'priorities'} · {view.indicators} output indicators tracked
          </div>
        </BannerCard>

        <BannerCard title="Budget & Delivery">
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <Kpi label="Total Budget (VUV)" value={fmtVUV(view.total_budget_vuv)} tone="teal" />
            <Kpi label="On Track" value={`${onTrackPct}%`} tone="gold" />
          </div>
          <div style={{ marginTop:'auto', paddingTop:'0.9rem', fontSize:'0.78rem', color:'var(--text-3)' }}>
            {st.green} on track · {st.amber} at risk · {st.red} no progress
          </div>
        </BannerCard>

        <BannerCard title="Needs Attention"
          action={<NavLink to="/analysis" style={{ color:'#fff', fontSize:'0.75rem', fontWeight:700, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>Analysis <ArrowRight size={13} /></NavLink>}>
          {attention.length === 0 ? (
            <div style={{ fontSize:'0.85rem', color:'var(--text-3)', margin:'auto 0' }}>No stalled activities 🎉</div>
          ) : attention.map((a, i) => (
            <div key={i} style={{ display:'flex', gap:'0.6rem', padding:'0.5rem 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:STATUS_COL.red, marginTop:6, flexShrink:0 }} />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:'0.78rem', fontWeight:700, color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.name}</div>
                <div style={{ fontSize:'0.68rem', color:'var(--text-3)' }}>{a.code && `${a.code} · `}{a.focusArea}</div>
              </div>
            </div>
          ))}
        </BannerCard>
      </div>

      {/* Row 2 — budget chart + delivery gauge */}
      <div className="grid-dash-2" style={{ marginBottom:'1rem' }}>
        <BannerCard title="Budget Allocation by Focus Area">
          <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginBottom:'0.5rem' }}>Top focus areas · millions VUV</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={budgetData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize:10, fill:'var(--text-3)' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize:10, fill:'var(--text-2)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<BudgetTooltip />} cursor={{ fill:'var(--green-50)' }} />
              <Bar dataKey="budget" radius={[0,4,4,0]} name="Budget" barSize={16}>
                {budgetData.map((d, i) => <Cell key={i} fill={THEME_COL[d.theme] || 'var(--green-600)'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', gap:'1rem', marginTop:'0.4rem' }}>
            {Object.entries(THEME_COL).map(([k, c]) => (
              <span key={k} style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.72rem', color:'var(--text-3)' }}>
                <span style={{ width:9, height:9, borderRadius:3, background:c }} />{k}
              </span>
            ))}
          </div>
        </BannerCard>

        <BannerCard title="Delivery Status">
          <Gauge value={onTrackPct} label="Activities On Track" />
          <div style={{ display:'flex', justifyContent:'space-around', paddingTop:'0.75rem', borderTop:'1px solid var(--border)' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', fontWeight:800, color:STATUS_COL.amber }}>{st.amber}</div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-3)' }}>At Risk</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', fontWeight:800, color:STATUS_COL.red }}>{st.red}</div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-3)' }}>No Progress</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', fontWeight:800, color:'var(--gold-500)' }}>{fmtVUV(view.total_budget_vuv)}</div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-3)' }}>VUV Budget</div>
            </div>
          </div>
        </BannerCard>
      </div>

      {/* Row 3 — activities table */}
      <BannerCard title="Strategic Results Framework — Activities" style={{ marginBottom:'1.5rem' }}>
        <div style={{ overflowX:'auto', margin:'-0.3rem -0.4rem' }} className="scrollbar-thin">
        <table className="data-table" style={{ minWidth:760 }}>
          <thead>
            <tr>
              <th>Activity</th><th>Theme</th><th>Focus Area</th><th>Output Indicator</th>
              <th style={{ textAlign:'right' }}>Budget (VUV)</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign:'center', padding:'1.5rem', color:'var(--text-3)', fontSize:'0.85rem' }}>
                  No activities match the selected filters.
                </td>
              </tr>
            )}
            {filtered.map((a, i) => (
              <tr key={i}>
                <td style={{ maxWidth:280 }}>
                  <div style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.8125rem' }}>{a.name}</div>
                  {a.code && <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)' }}>{a.code}</div>}
                </td>
                <td>
                  <span style={{ background:`${THEME_COL[a.theme]}18`, color:THEME_COL[a.theme], borderRadius:9999, padding:'0.125rem 0.5rem', fontSize:'0.6875rem', fontWeight:700 }}>{a.theme}</span>
                </td>
                <td style={{ fontSize:'0.75rem', color:'var(--text-2)', maxWidth:150 }}>{a.focusArea}</td>
                <td style={{ fontSize:'0.72rem', color:'var(--text-3)', maxWidth:240 }}>{a.indicator || '—'}</td>
                <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-1)', fontSize:'0.8125rem', whiteSpace:'nowrap' }}>{a.budget ? fmtVUV(a.budget) : '—'}</td>
                <td><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </BannerCard>
    </div>
  );
}
