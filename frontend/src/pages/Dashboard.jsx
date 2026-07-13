import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { PROJECTS, ALL_INDICATORS, DASHBOARD_SUMMARY } from '../mockData';
import { supabase } from '../supabaseClient';
import { ArrowRight } from 'lucide-react';

/* ── helpers ────────────────────────────────────────────────────────────── */
const pct  = (a, b) => b ? Math.round((a / b) * 100) : 0;
const fmtM = n => (n / 1e6).toFixed(1) + 'M';
const TRAFFIC     = { green:'#1a8c4e', amber:'#d99a2b', red:'#b3402f' };
const TRAFFIC_BG  = { green:'#dcece2', amber:'#f7ead0', red:'#f6ded8' };
const TRAFFIC_TXT = { green:'#155e34', amber:'#8a6416', red:'#8a2e21' };
const TRAFFIC_LABEL = { green:'On Track', amber:'At Risk', red:'Off Track' };
const BANNER = `${import.meta.env.BASE_URL}tribal-banner.svg`;

/* ── live data (v_indicator_status / v_domain_budget, migration 0003) ────── */
const DOMAIN_META = {
  governance: { label:'Governance', color:'#0e6e6e', short:'GOV' },
  financial:  { label:'Financial',  color:'#c2841c', short:'FIN' },
  community:  { label:'Community',  color:'#12827f', short:'COM' },
  events:     { label:'L&D Events', color:'#b3402f', short:'EVT' },
  learning:   { label:'Learning',   color:'#8a6d3b', short:'LRN' },
};

function trafficFor(baseline, current, target) {
  const b = Number(baseline ?? 0), t = Number(target ?? 0);
  const c = current == null ? b : Number(current);
  if (t === b) return 'green';
  const p = (c - b) / (t - b);
  if (p >= 0.7) return 'green';
  if (p >= 0.35) return 'amber';
  return 'red';
}

function normaliseLive(indicatorRows, budgetRows) {
  const indicators = indicatorRows.map(r => {
    const meta = DOMAIN_META[r.domain] ?? { label: r.domain, color:'#8a6d3b' };
    const current = r.current_value == null ? Number(r.baseline_value ?? 0) : Number(r.current_value);
    return {
      id: r.id, code: r.code, name: r.name,
      baseline: Number(r.baseline_value ?? 0), current, target: Number(r.target_value ?? 0),
      traffic: trafficFor(r.baseline_value, r.current_value, r.target_value),
      category: meta.label, color: meta.color,
    };
  });
  const budgetData = budgetRows.map(b => ({
    name: DOMAIN_META[b.domain]?.short ?? b.domain,
    Budget: Math.round(Number(b.budget_vuv ?? 0) / 1e6),
    Spent:  Math.round(Number(b.spent_vuv ?? 0) / 1e6),
  }));
  const green = indicators.filter(i => i.traffic === 'green').length;
  const amber = indicators.filter(i => i.traffic === 'amber').length;
  const red   = indicators.filter(i => i.traffic === 'red').length;
  const summary = {
    total_indicators: indicators.length, indicators_green: green, indicators_amber: amber, indicators_red: red,
    total_budget_vuv: budgetRows.reduce((s, b) => s + Number(b.budget_vuv ?? 0), 0),
    total_spent_vuv:  budgetRows.reduce((s, b) => s + Number(b.spent_vuv ?? 0), 0),
    active_projects:  budgetRows.filter(b => Number(b.activities_active ?? 0) > 0).length,
    total_projects:   budgetRows.length,
  };
  return { indicators, budgetData, summary };
}

function normaliseMock() {
  const indicators = ALL_INDICATORS.map(ind => {
    const proj = PROJECTS.find(pr => pr.code === ind.project_code);
    return { ...ind, color: proj?.category_color ?? '#8a6d3b' };
  });
  const budgetData = PROJECTS.map(p => ({
    name: p.code.split('-')[0],
    Budget: Math.round(p.budget_vuv / 1e6), Spent: Math.round(p.spent_vuv / 1e6),
  }));
  return { indicators, budgetData, summary: DASHBOARD_SUMMARY };
}

/* ── tribal-banner card ──────────────────────────────────────────────────── */
function BannerCard({ title, action, children, style }) {
  return (
    <div className="card" style={{ padding:0, overflow:'hidden', display:'flex', flexDirection:'column', ...style }}>
      <div style={{
        height:60, display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'0 1.1rem', position:'relative',
        backgroundImage:`url(${BANNER})`, backgroundRepeat:'repeat-x', backgroundSize:'auto 60px',
      }}>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(28,21,18,0.82), rgba(28,21,18,0.42))' }} />
        <h3 style={{ position:'relative', zIndex:1, color:'#fff', fontFamily:'var(--font-display)', fontSize:'1.02rem', fontWeight:800, letterSpacing:'-0.01em', textShadow:'0 1px 4px rgba(0,0,0,0.45)', margin:0 }}>
          {title}
        </h3>
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
  const a = Math.PI * (1 - value / 100);           // 0%→π (left), 100%→0 (right)
  const nx = cx + r * 0.82 * Math.cos(a);
  const ny = cy - r * 0.82 * Math.sin(a);
  const arc = (from, to) => {
    const a0 = Math.PI * (1 - from / 100), a1 = Math.PI * (1 - to / 100);
    const large = 0;
    return `M ${cx + r*Math.cos(a0)} ${cy - r*Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r*Math.cos(a1)} ${cy - r*Math.sin(a1)}`;
  };
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', margin:'auto 0' }}>
      <svg width="210" height="128" viewBox="0 0 200 128">
        <path d={arc(0, 40)}   fill="none" stroke="#0e6e6e" strokeWidth="15" strokeLinecap="round" />
        <path d={arc(42, 72)}  fill="none" stroke="#e0a12a" strokeWidth="15" strokeLinecap="round" />
        <path d={arc(74, 100)} fill="none" stroke="#b3402f" strokeWidth="15" strokeLinecap="round" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="6.5" fill="var(--ink)" />
      </svg>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:800, color:'var(--green-600)', marginTop:'-0.4rem' }}>{value}%</div>
      <div style={{ fontSize:'0.82rem', color:'var(--text-2)' }}>{label}</div>
    </div>
  );
}

function TrafficBadge({ status }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'0.35rem', background:TRAFFIC_BG[status], color:TRAFFIC_TXT[status],
      borderRadius:9999, padding:'0.15rem 0.55rem', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:TRAFFIC[status] }}/>{TRAFFIC_LABEL[status]}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:'0.625rem 0.875rem', boxShadow:'var(--shadow-md)', fontSize:'0.8125rem' }}>
      <div style={{ fontWeight:700, color:'var(--text-2)', marginBottom:'0.25rem' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--text-3)' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:p.fill||p.color }} />
          {p.name}: <span style={{ fontWeight:600, color:'var(--text-1)' }}>{p.value}M VUV</span>
        </div>
      ))}
    </div>
  );
};

/* ══ Dashboard ═══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [live, setLive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [ind, bud] = await Promise.all([
        supabase.from('v_indicator_status').select('*').order('code'),
        supabase.from('v_domain_budget').select('*').order('domain'),
      ]);
      if (cancelled || ind.error || bud.error || !ind.data?.length) return;
      setLive(normaliseLive(ind.data, bud.data ?? []));
    })();
    return () => { cancelled = true; };
  }, []);

  const { indicators, budgetData, summary: S } = live ?? normaliseMock();
  const spentPct = pct(S.total_spent_vuv, S.total_budget_vuv);
  const onTrackPct = pct(S.indicators_green, S.total_indicators);
  const attention = [...indicators].filter(i => i.traffic !== 'green')
    .sort((a, b) => (a.traffic === 'red' ? 0 : 1) - (b.traffic === 'red' ? 0 : 1)).slice(0, 5);

  return (
    <div style={{ maxWidth:1400 }} className="animate-fade-up page-pad">

      <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:800, letterSpacing:'-0.02em', color:'var(--text-1)', margin:'0 0 1.25rem' }}>
        Dashboard — Monitoring, Evaluation, Research &amp; Learning
      </h1>

      {/* Row 1 — three banner cards */}
      <div className="grid-dash-3" style={{ marginBottom:'1rem' }}>
        <BannerCard title="Project Status Overview">
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <Kpi label="Active Components" value={S.active_projects} tone="teal" />
            <Kpi label="At Risk / Off" value={S.indicators_amber + S.indicators_red} tone="red" />
            <Kpi label="Indicators" value={S.total_indicators} tone="gold" />
          </div>
          <div style={{ marginTop:'auto', paddingTop:'0.9rem', fontSize:'0.78rem', color:'var(--text-3)' }}>
            {S.active_projects} of {S.total_projects} programme components active
          </div>
        </BannerCard>

        <BannerCard title="Evaluation Metrics">
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <Kpi label="Budget (VUV)" value={fmtM(S.total_budget_vuv)} tone="teal" />
            <Kpi label="Utilised" value={`${spentPct}%`} tone="gold" />
          </div>
          <div style={{ marginTop:'auto', paddingTop:'0.9rem', fontSize:'0.78rem', color:'var(--text-3)' }}>
            VUV {fmtM(S.total_spent_vuv)} spent · {S.indicators_green} indicators on track
          </div>
        </BannerCard>

        <BannerCard title="Needs Attention"
          action={<NavLink to="/analysis" style={{ color:'#fff', fontSize:'0.75rem', fontWeight:700, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>Analysis <ArrowRight size={13} /></NavLink>}>
          {attention.length === 0 ? (
            <div style={{ fontSize:'0.85rem', color:'var(--text-3)', margin:'auto 0' }}>All indicators on track 🎉</div>
          ) : attention.map(ind => (
            <div key={ind.id} style={{ display:'flex', gap:'0.6rem', padding:'0.55rem 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:TRAFFIC[ind.traffic], marginTop:6, flexShrink:0 }} />
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:'0.8rem', fontWeight:700, color:'var(--text-1)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ind.name}</div>
                <div style={{ fontSize:'0.7rem', color:'var(--text-3)', fontFamily:'var(--font-mono)' }}>{ind.code} · {ind.category}</div>
              </div>
            </div>
          ))}
        </BannerCard>
      </div>

      {/* Row 2 — chart + gauge */}
      <div className="grid-dash-2" style={{ marginBottom:'1rem' }}>
        <BannerCard title="Key Performance Indicators — Budget vs Expenditure">
          <div style={{ display:'flex', gap:'0.6rem', marginBottom:'0.75rem' }}>
            {[['var(--green-600)','Budget'],['var(--red-600)','Spent']].map(([c,l]) => (
              <span key={l} style={{ display:'flex', alignItems:'center', gap:'0.4rem', background:'var(--cream)', border:'1px solid var(--border)', borderRadius:8, padding:'0.3rem 0.6rem', fontSize:'0.75rem', fontWeight:600, color:'var(--text-2)' }}>
                <span style={{ width:9, height:9, borderRadius:3, background:c }} />{l}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={budgetData} barGap={4} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'var(--green-50)' }} />
              <Bar dataKey="Budget" fill="var(--green-600)" radius={[4,4,0,0]} name="Budget" />
              <Bar dataKey="Spent"  fill="var(--red-600)"   radius={[4,4,0,0]} name="Spent" />
            </BarChart>
          </ResponsiveContainer>
        </BannerCard>

        <BannerCard title="Resource Allocation">
          <Gauge value={spentPct} label="Budget Utilisation" />
          <div style={{ display:'flex', justifyContent:'space-around', paddingTop:'0.75rem', borderTop:'1px solid var(--border)' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', fontWeight:800, color:'var(--green-600)' }}>{onTrackPct}%</div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-3)' }}>On Track</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', fontWeight:800, color:'var(--gold-500)' }}>{fmtM(S.total_spent_vuv)}</div>
              <div style={{ fontSize:'0.7rem', color:'var(--text-3)' }}>VUV Spent</div>
            </div>
          </div>
        </BannerCard>
      </div>

      {/* Row 3 — full indicators table */}
      <BannerCard title="All Indicators — Current Status"
        action={<NavLink to="/analysis" style={{ color:'#fff', fontSize:'0.78rem', fontWeight:700, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:'0.3rem' }}>View Analysis <ArrowRight size={14} /></NavLink>}
        style={{ marginBottom:'1.5rem' }}>
        <div style={{ overflowX:'auto', margin:'-0.3rem -0.4rem' }} className="scrollbar-thin">
        <table className="data-table" style={{ minWidth:640 }}>
          <thead>
            <tr>
              <th>Indicator</th><th>Component</th>
              <th style={{ textAlign:'right' }}>Baseline</th><th style={{ textAlign:'right' }}>Current</th>
              <th style={{ textAlign:'right' }}>Target</th><th style={{ textAlign:'right' }}>Progress</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map(ind => {
              const p = pct(ind.current, ind.target);
              return (
                <tr key={ind.id}>
                  <td>
                    <div style={{ fontWeight:600, color:'var(--text-1)', fontSize:'0.8125rem' }}>{ind.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)' }}>{ind.code}</div>
                  </td>
                  <td>
                    <span style={{ background:`${ind.color}18`, color:ind.color, borderRadius:9999, padding:'0.125rem 0.5rem', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.03em' }}>{ind.category}</span>
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-3)', fontSize:'0.8125rem' }}>{ind.baseline}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--text-1)', fontSize:'0.9375rem' }}>{ind.current}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-3)', fontSize:'0.8125rem' }}>{ind.target}</td>
                  <td style={{ textAlign:'right' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', justifyContent:'flex-end' }}>
                      <div style={{ width:64, height:5, background:'var(--green-50)', borderRadius:9999, overflow:'hidden' }}>
                        <div style={{ width:`${p}%`, height:'100%', background:TRAFFIC[ind.traffic], borderRadius:9999 }}/>
                      </div>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.75rem', color:'var(--text-3)', minWidth:32, textAlign:'right' }}>{p}%</span>
                    </div>
                  </td>
                  <td><TrafficBadge status={ind.traffic}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </BannerCard>
    </div>
  );
}
