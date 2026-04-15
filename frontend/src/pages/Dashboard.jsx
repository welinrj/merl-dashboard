import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, CartesianGrid,
} from 'recharts';
import { PROJECTS, ALL_INDICATORS, DASHBOARD_SUMMARY } from '../mockData';
import { TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';

const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
const fmtM = n => (n / 1e6).toFixed(1) + 'M';
const TRAFFIC = { green:'#1a8c4e', amber:'#c97b00', red:'#c0392b' };
const TRAFFIC_BG = { green:'#d1fae5', amber:'#fef3c7', red:'#fee2e2' };
const TRAFFIC_TXT = { green:'#065f46', amber:'#92400e', red:'#991b1b' };
const TRAFFIC_LABEL = { green:'On Track', amber:'At Risk', red:'Off Track' };

function KpiCard({ label, value, sub, color = 'green', icon: Icon }) {
  const accent = color === 'gold' ? 'var(--gold-500)' : color === 'red' ? '#c0392b' : color === 'amber' ? '#c97b00' : 'var(--green-500)';
  return (
    <div className="card" style={{ borderLeft: `3px solid ${accent}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.5rem' }}>
        <div className="section-label">{label}</div>
        {Icon && <Icon size={16} style={{ color: accent, opacity: 0.7 }} />}
      </div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:600, color:'var(--text-1)', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:'0.375rem' }}>{sub}</div>}
    </div>
  );
}

function TrafficBadge({ status }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'0.3rem',
      background: TRAFFIC_BG[status], color: TRAFFIC_TXT[status],
      borderRadius: 9999, padding: '0.15rem 0.6rem',
      fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase',
    }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background: TRAFFIC[status], display:'inline-block' }}/>
      {TRAFFIC_LABEL[status]}
    </span>
  );
}

const CustomTooltip = ({ active, payload, label, prefix = '' }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:'0.625rem 0.875rem', boxShadow:'var(--shadow-md)', fontSize:'0.8125rem' }}>
      <div style={{ fontWeight:700, color:'var(--text-2)', marginBottom:'0.25rem' }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--text-3)' }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:p.fill||p.color }} />
          {p.name}: <span style={{ fontWeight:600, color:'var(--text-1)' }}>{prefix}{p.value}M VUV</span>
        </div>
      ))}
    </div>
  );
};

export default function Dashboard({ user }) {
  const S = DASHBOARD_SUMMARY;
  const spentPct = pct(S.total_spent_vuv, S.total_budget_vuv);

  const budgetData = PROJECTS.map(p => ({
    name: p.category.replace('LD-',''),
    Budget: Math.round(p.budget_vuv/1e6),
    Spent: Math.round(p.spent_vuv/1e6),
  }));

  const pieSrc = [
    { name:'On Track', value:S.indicators_green, color:'#1a8c4e' },
    { name:'At Risk',  value:S.indicators_amber, color:'#c97b00' },
    { name:'Off Track',value:S.indicators_red,   color:'#c0392b' },
  ].filter(d => d.value > 0);

  return (
    <div style={{ padding:'2rem 2.5rem', maxWidth:1400 }} className="animate-fade-up">

      {/* Page header */}
      <div style={{ marginBottom:'1.75rem' }}>
        <div className="section-label" style={{ marginBottom:'0.375rem' }}>
          Vanuatu Loss &amp; Damage Fund Development Project
        </div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.875rem', fontWeight:600, color:'var(--text-1)', letterSpacing:'-0.025em', margin:0 }}>
          MERL Dashboard
        </h1>
        <div style={{ fontSize:'0.8125rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
          Overview · April 2026 · Funded by MFAT New Zealand
        </div>
      </div>

      {/* KPI row — stagger animation */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        <KpiCard label="Active Components" value={S.active_projects} sub={`of ${S.total_projects} total components`} color="green" icon={TrendingUp} />
        <KpiCard label="Total Indicators" value={S.total_indicators} sub={`${S.indicators_green} on track`} color="green" />
        <KpiCard label="Budget (VUV)" value={fmtM(S.total_budget_vuv)} sub={`${spentPct}% utilised · ${fmtM(S.total_spent_vuv)} spent`} color="gold" />
        <KpiCard label="At Risk / Off Track" value={S.indicators_amber + S.indicators_red} sub={`${S.indicators_amber} at risk · ${S.indicators_red} off track`} color={S.indicators_red > 0 ? 'red' : 'amber'} icon={AlertTriangle} />
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'1rem', marginBottom:'1.5rem' }}>

        {/* Budget bar chart */}
        <div className="card">
          <div className="section-label" style={{ marginBottom:'1rem' }}>Budget vs Expenditure by Component (VUV M)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budgetData} barGap={3} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize:10, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="Budget" fill="var(--green-100)" radius={[3,3,0,0]} name="Budget" />
              <Bar dataKey="Spent"  fill="var(--green-600)" radius={[3,3,0,0]} name="Spent" />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', gap:'1rem', marginTop:'0.5rem' }}>
            {[['var(--green-100)','Budget'],['var(--green-600)','Spent']].map(([c,l]) => (
              <div key={l} style={{ display:'flex', alignItems:'center', gap:'0.375rem', fontSize:'0.75rem', color:'var(--text-3)' }}>
                <span style={{ width:10, height:10, borderRadius:2, background:c }}/>
                {l}
              </div>
            ))}
          </div>
        </div>

        {/* Indicator donut */}
        <div className="card" style={{ display:'flex', flexDirection:'column' }}>
          <div className="section-label" style={{ marginBottom:'0.75rem' }}>Indicator Status</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieSrc} cx="50%" cy="50%" innerRadius={48} outerRadius={72} dataKey="value" paddingAngle={3} stroke="none">
                {pieSrc.map(e => <Cell key={e.name} fill={e.color} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginTop:'0.5rem' }}>
            {pieSrc.map(e => (
              <div key={e.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.8125rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--text-2)' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:e.color }}/>
                  {e.name}
                </div>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--text-1)', fontSize:'0.875rem' }}>{e.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicator table */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:600, color:'var(--text-1)' }}>
              All Indicators — Current Status
            </div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:2 }}>
              {ALL_INDICATORS.length} indicators across {PROJECTS.length} programme components
            </div>
          </div>
          <NavLink to="/analysis" style={{ display:'flex', alignItems:'center', gap:'0.375rem', fontSize:'0.8125rem', fontWeight:600, color:'var(--green-700)', textDecoration:'none' }}>
            View Analysis <ArrowRight size={14}/>
          </NavLink>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Indicator</th>
              <th>Component</th>
              <th style={{ textAlign:'right' }}>Baseline</th>
              <th style={{ textAlign:'right' }}>Current</th>
              <th style={{ textAlign:'right' }}>Target</th>
              <th style={{ textAlign:'right' }}>Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ALL_INDICATORS.map(ind => {
              const p = pct(ind.current, ind.target);
              return (
                <tr key={ind.id}>
                  <td>
                    <div style={{ fontWeight:500, color:'var(--text-1)', fontSize:'0.8125rem' }}>{ind.name}</div>
                    <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)' }}>{ind.code}</div>
                  </td>
                  <td>
                    <span style={{
                      background: PROJECTS.find(p=>p.code===ind.project_code)?.category_color+'22',
                      color: PROJECTS.find(p=>p.code===ind.project_code)?.category_color,
                      border: `1px solid ${PROJECTS.find(p=>p.code===ind.project_code)?.category_color}44`,
                      borderRadius:9999, padding:'0.125rem 0.5rem',
                      fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.04em',
                    }}>
                      {ind.category}
                    </span>
                  </td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-3)', fontSize:'0.8125rem' }}>{ind.baseline}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--text-1)', fontSize:'0.9375rem' }}>{ind.current}</td>
                  <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-3)', fontSize:'0.8125rem' }}>{ind.target}</td>
                  <td style={{ textAlign:'right' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', justifyContent:'flex-end' }}>
                      <div style={{ width:64, height:5, background:'var(--green-100)', borderRadius:9999, overflow:'hidden' }}>
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
  );
}
