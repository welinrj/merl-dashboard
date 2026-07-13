import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import { PROJECTS, ALL_INDICATORS, DASHBOARD_SUMMARY } from '../mockData';
import { supabase } from '../supabaseClient';
import { TrendingUp, AlertTriangle, ArrowRight, ListChecks, CircleDollarSign } from 'lucide-react';

/* ── helpers ────────────────────────────────────────────────────────────── */
const pct  = (a, b) => b ? Math.round((a / b) * 100) : 0;
const fmtM = n => (n / 1e6).toFixed(1) + 'M';
const TRAFFIC     = { green:'#16a34a', amber:'#d97706', red:'#dc2626' };
const TRAFFIC_BG  = { green:'#dcfce7', amber:'#fef3c7', red:'#fee2e2' };
const TRAFFIC_TXT = { green:'#166534', amber:'#92400e', red:'#991b1b' };
const TRAFFIC_LABEL = { green:'On Track', amber:'At Risk', red:'Off Track' };

/* ── live data (v_indicator_status / v_domain_budget, migration 0003) ────── */
const DOMAIN_META = {
  governance: { label:'Governance', color:'#4338ca', short:'GOV' },
  financial:  { label:'Financial',  color:'#c2410c', short:'FIN' },
  community:  { label:'Community',  color:'#1d4ed8', short:'COM' },
  events:     { label:'L&D Events', color:'#b91c1c', short:'EVT' },
  learning:   { label:'Learning',   color:'#6d28d9', short:'LRN' },
};

// Traffic light from progress toward target (handles decreasing targets,
// e.g. response time in days where target < baseline).
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
    const meta = DOMAIN_META[r.domain] ?? { label: r.domain, color:'#64748b' };
    const current = r.current_value == null ? Number(r.baseline_value ?? 0) : Number(r.current_value);
    return {
      id:       r.id,
      code:     r.code,
      name:     r.name,
      baseline: Number(r.baseline_value ?? 0),
      current,
      target:   Number(r.target_value ?? 0),
      traffic:  trafficFor(r.baseline_value, r.current_value, r.target_value),
      category: meta.label,
      color:    meta.color,
    };
  });
  const budgetData = budgetRows.map(b => ({
    name:   DOMAIN_META[b.domain]?.short ?? b.domain,
    Budget: Math.round(Number(b.budget_vuv ?? 0) / 1e6),
    Spent:  Math.round(Number(b.spent_vuv ?? 0) / 1e6),
  }));
  const green = indicators.filter(i => i.traffic === 'green').length;
  const amber = indicators.filter(i => i.traffic === 'amber').length;
  const red   = indicators.filter(i => i.traffic === 'red').length;
  const summary = {
    total_indicators: indicators.length,
    indicators_green: green,
    indicators_amber: amber,
    indicators_red:   red,
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
    return { ...ind, color: proj?.category_color ?? '#64748b' };
  });
  const budgetData = PROJECTS.map(p => ({
    name:   p.code.split('-')[0],
    Budget: Math.round(p.budget_vuv / 1e6),
    Spent:  Math.round(p.spent_vuv  / 1e6),
  }));
  return { indicators, budgetData, summary: DASHBOARD_SUMMARY };
}

/* ── KPI card ────────────────────────────────────────────────────────────── */
const TINTS = {
  indigo: { bg:'var(--green-50)', fg:'var(--green-600)' },
  orange: { bg:'var(--gold-100)', fg:'var(--gold-500)' },
  red:    { bg:'var(--red-100)',  fg:'var(--red-600)' },
};

function Chip({ bg, fg, children }) {
  return (
    <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.1rem 0.45rem', borderRadius:6, background:bg, color:fg }}>
      {children}
    </span>
  );
}

function KpiCard({ label, value, tint = 'indigo', icon: Icon, foot }) {
  const t = TINTS[tint] ?? TINTS.indigo;
  return (
    <div className="card" style={{ padding:'1.125rem 1.125rem 1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
        <div className="section-label" style={{ margin:0 }}>{label}</div>
        {Icon && (
          <span style={{ width:34, height:34, borderRadius:9, background:t.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Icon size={17} style={{ color:t.fg }} />
          </span>
        )}
      </div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'2.1rem', fontWeight:700, color:'var(--text-1)', lineHeight:1, letterSpacing:'-0.03em', fontVariantNumeric:'tabular-nums' }}>
        {value}
      </div>
      {foot && <div style={{ marginTop:'0.5rem', fontSize:'0.78rem', color:'var(--text-3)', display:'flex', alignItems:'center', gap:'0.4rem', flexWrap:'wrap' }}>{foot}</div>}
    </div>
  );
}

/* ── traffic badge ───────────────────────────────────────────────────────── */
function TrafficBadge({ status }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'0.35rem',
      background:TRAFFIC_BG[status], color:TRAFFIC_TXT[status],
      borderRadius:9999, padding:'0.15rem 0.55rem',
      fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase',
    }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:TRAFFIC[status], display:'inline-block' }}/>
      {TRAFFIC_LABEL[status]}
    </span>
  );
}

/* ── chart tooltip ───────────────────────────────────────────────────────── */
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

/* ── SVG progress ring ───────────────────────────────────────────────────── */
function ProgressRing({ value, total, color, size = 64, stroke = 5 }) {
  const p = pct(value, total);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (p / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--green-50)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition:'stroke-dasharray 1s ease' }}
      />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ fontSize:size*0.22, fontWeight:700, fill:'var(--text-1)', fontFamily:'var(--font-display)',
          transform:'rotate(90deg)', transformOrigin:`${size/2}px ${size/2}px` }}>
        {p}%
      </text>
    </svg>
  );
}

function StatRing({ label, value, total, color }) {
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:12, padding:'1rem',
      display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' }}>
      <ProgressRing value={value} total={total} color={color} />
      <div style={{ fontSize:'0.75rem', color:'var(--text-3)', textAlign:'center', lineHeight:1.3 }}>{label}</div>
      <div style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-1)' }}>{value} / {total}</div>
    </div>
  );
}

/* ══ Dashboard ═══════════════════════════════════════════════════════════════ */
export default function Dashboard({ user }) {
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

  const pieSrc = [
    { name:'On Track',  value:S.indicators_green, color:TRAFFIC.green },
    { name:'At Risk',   value:S.indicators_amber, color:TRAFFIC.amber },
    { name:'Off Track', value:S.indicators_red,   color:TRAFFIC.red },
  ].filter(d => d.value > 0);

  return (
    <div style={{ maxWidth:1400 }} className="animate-fade-up page-pad">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:'0.75rem', flexWrap:'wrap', marginBottom:'1.5rem' }}>
        <div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.75rem', fontWeight:700, color:'var(--text-1)', letterSpacing:'-0.03em', margin:0, lineHeight:1.15 }}>
            MERL Dashboard
          </h1>
          <div style={{ fontSize:'0.9rem', color:'var(--text-2)', marginTop:'0.25rem' }}>
            Vanuatu Loss &amp; Damage Fund Development Project · Funded by MFAT New Zealand
          </div>
        </div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:'0.4rem', fontSize:'0.8rem', fontWeight:600, color:live ? '#16a34a' : 'var(--text-3)' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:live ? '#16a34a' : 'var(--text-3)', boxShadow:live ? '0 0 0 3px #dcfce7' : 'none' }} />
          {live ? 'Live data' : 'Sample data (offline)'}
        </div>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────── */}
      <div className="grid-kpi" style={{ marginBottom:'1rem' }}>
        <KpiCard label="Active Components" value={S.active_projects} tint="indigo" icon={TrendingUp}
          foot={<>of {S.total_projects} total components <Chip bg="#dcfce7" fg="#166534">{pct(S.active_projects, S.total_projects)}%</Chip></>} />
        <KpiCard label="Total Indicators" value={S.total_indicators} tint="indigo" icon={ListChecks}
          foot={<Chip bg="#dcfce7" fg="#166534">{S.indicators_green} on track</Chip>} />
        <KpiCard label="Budget (VUV)" value={fmtM(S.total_budget_vuv)} tint="orange" icon={CircleDollarSign}
          foot={<>{spentPct}% utilised · {fmtM(S.total_spent_vuv)} spent</>} />
        <KpiCard label="At Risk / Off Track" value={S.indicators_amber + S.indicators_red} tint="red" icon={AlertTriangle}
          foot={<>{S.indicators_amber > 0 && <Chip bg="#fef3c7" fg="#92400e">{S.indicators_amber} at risk</Chip>}{S.indicators_red > 0 && <Chip bg="#fee2e2" fg="#991b1b">{S.indicators_red} off track</Chip>}</>} />
      </div>

      {/* ── Charts ────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', gap:'1rem', marginBottom:'1rem' }}>
        {/* Budget bar chart */}
        <div className="card">
          <div style={{ fontFamily:'var(--font-display)', fontSize:'0.95rem', fontWeight:700, color:'var(--text-1)' }}>Budget vs Expenditure by Component</div>
          <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginBottom:'1rem' }}>Millions VUV · allocated vs spent</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budgetData} barGap={4} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill:'var(--green-50)' }} />
              <Bar dataKey="Budget" fill="var(--green-100)" radius={[5,5,0,0]} name="Budget" />
              <Bar dataKey="Spent"  fill="var(--green-600)" radius={[5,5,0,0]} name="Spent" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', gap:'1rem', marginTop:'0.5rem' }}>
            {[['var(--green-100)','Budget'],['var(--green-600)','Spent']].map(([c,l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:'0.375rem', fontSize:'0.75rem', color:'var(--text-3)' }}>
                <span style={{ width:11, height:11, borderRadius:3, background:c }}/>{l}
              </div>
            ))}
          </div>
        </div>

        {/* progress rings */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem' }}>
          <StatRing label="On Track"  value={S.indicators_green} total={S.total_indicators} color={TRAFFIC.green} />
          <StatRing label="At Risk"   value={S.indicators_amber} total={S.total_indicators} color={TRAFFIC.amber} />
          <StatRing label="Off Track" value={S.indicators_red}   total={S.total_indicators} color={TRAFFIC.red} />
        </div>
      </div>

      {/* ── Indicators table + donut ──────────────────────────────────── */}
      <div className="grid-main-side" style={{ marginBottom:'1.5rem' }}>

        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:700, color:'var(--text-1)' }}>
                All Indicators — Current Status
              </div>
              <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:2 }}>
                {indicators.length} indicators across {S.total_projects} programme components
              </div>
            </div>
            <NavLink to="/analysis" style={{ display:'flex', alignItems:'center', gap:'0.375rem', fontSize:'0.8125rem', fontWeight:700, color:'var(--green-600)', textDecoration:'none' }}>
              View Analysis <ArrowRight size={14}/>
            </NavLink>
          </div>
          <div style={{ overflowX:'auto' }} className="scrollbar-thin">
          <table className="data-table" style={{ minWidth:640 }}>
            <thead>
              <tr>
                <th>Indicator</th><th>Component</th>
                <th style={{ textAlign:'right' }}>Baseline</th>
                <th style={{ textAlign:'right' }}>Current</th>
                <th style={{ textAlign:'right' }}>Target</th>
                <th style={{ textAlign:'right' }}>Progress</th>
                <th>Status</th>
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
                      <span style={{ background:`${ind.color}18`, color:ind.color, borderRadius:9999, padding:'0.125rem 0.5rem', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.03em' }}>
                        {ind.category}
                      </span>
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
        </div>

        {/* Donut + budget summary */}
        <div className="card" style={{ display:'flex', flexDirection:'column' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'0.95rem', fontWeight:700, color:'var(--text-1)' }}>Indicator Status</div>
          <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginBottom:'0.5rem' }}>{S.total_indicators} indicators tracked</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieSrc} cx="50%" cy="50%" innerRadius={46} outerRadius={70} dataKey="value" paddingAngle={3} stroke="none">
                {pieSrc.map(e => (
                  <Cell key={e.name} fill={e.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginTop:'0.5rem' }}>
            {pieSrc.map(e => (
              <div key={e.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.8125rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--text-2)' }}>
                  <span style={{ width:9, height:9, borderRadius:'50%', background:e.color }}/>
                  {e.name}
                </div>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--text-1)', fontSize:'0.875rem' }}>{e.value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop:'auto', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.78rem', color:'var(--text-3)', marginBottom:'0.4rem' }}>
              <span>Budget utilisation</span>
              <span style={{ fontWeight:700, color:'var(--text-1)' }}>{spentPct}%</span>
            </div>
            <div style={{ width:'100%', height:8, background:'var(--green-50)', borderRadius:9999, overflow:'hidden' }}>
              <div style={{ width:`${spentPct}%`, height:'100%', background:'linear-gradient(90deg, var(--green-500), var(--green-600))', borderRadius:9999, transition:'width 1.2s ease' }}/>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6875rem', color:'var(--text-3)', marginTop:'0.3rem' }}>
              <span>VUV {fmtM(S.total_spent_vuv)} spent</span>
              <span>VUV {fmtM(S.total_budget_vuv)} total</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
