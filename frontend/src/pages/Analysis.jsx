import { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';
import { PROJECTS, ALL_INDICATORS } from '../mockData';

const pct = (a,b) => b ? Math.round((a/b)*100) : 0;
const TRAFFIC = { green:'#1a8c4e', amber:'#c97b00', red:'#c0392b' };

const QUARTER_DATA = ['Q1 2025','Q2 2025','Q3 2025','Q4 2025','Q1 2026'].map((q,qi) => {
  const obj = { q };
  PROJECTS.forEach(p => { const d = p.quarterly[qi]; if(d) obj[p.category.replace('LD-','')] = d.actual; });
  return obj;
});

const CAT_COLORS = {
  'ADAPT':'#3b82f6','EVENTS':'#10b981','FINANCE':'#f59e0b',
  'POLICY':'#8b5cf6','CAPBLD':'#ec4899','GEDSI':'#6366f1',
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:8, padding:'0.625rem 0.875rem', boxShadow:'var(--shadow-md)', fontSize:'0.8125rem' }}>
      <div style={{ fontWeight:700, color:'var(--text-2)', marginBottom:'0.3rem' }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--text-3)', marginBottom:'0.15rem' }}>
          <span style={{ width:7, height:7, borderRadius:'50%', background:p.color||p.fill }}/>
          {p.name}: <span style={{ fontWeight:600, color:'var(--text-1)' }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function Analysis({ user }) {
  const [indFilter, setIndFilter] = useState('All');
  const cats = ['All', ...Object.keys(CAT_COLORS)];
  const visibleInds = indFilter==='All' ? ALL_INDICATORS : ALL_INDICATORS.filter(i=>i.category.replace('LD-','')=== indFilter);

  const budgetData = PROJECTS.map(p => ({
    name: p.category.replace('LD-',''),
    Budget: Math.round(p.budget_vuv/1e6),
    Spent: Math.round(p.spent_vuv/1e6),
  }));

  return (
    <div style={{ padding:'2rem 2.5rem', maxWidth:1400 }} className="animate-fade-up">
      <div style={{ marginBottom:'1.75rem' }}>
        <div className="section-label" style={{ marginBottom:'0.375rem' }}>Analytics</div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.875rem', fontWeight:600, color:'var(--text-1)', letterSpacing:'-0.025em', margin:0 }}>
          Analysis &amp; GIS
        </h1>
        <p style={{ fontSize:'0.875rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
          Cross-component trend analysis, budget visualisation, and geographic mapping.
        </p>
      </div>

      {/* Charts row */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem', marginBottom:'1.25rem' }}>

        {/* Trend chart */}
        <div className="card">
          <div className="section-label" style={{ marginBottom:'1rem' }}>Quarterly Output Delivery</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={QUARTER_DATA}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false}/>
              <XAxis dataKey="q" tick={{ fontSize:10, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:10, fill:'var(--text-3)' }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip/>}/>
              {Object.entries(CAT_COLORS).map(([k,c]) => (
                <Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2} dot={{ r:3, fill:c }} activeDot={{ r:5 }}/>
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Budget chart */}
        <div className="card">
          <div className="section-label" style={{ marginBottom:'1rem' }}>Budget vs Expenditure (VUV M)</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={budgetData} barGap={4} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false}/>
              <XAxis dataKey="name" tick={{ fontSize:10, fill:'var(--text-3)' }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize:10, fill:'var(--text-3)' }} axisLine={false} tickLine={false}/>
              <Tooltip content={<ChartTooltip/>}/>
              <Legend wrapperStyle={{ fontSize:12, fontFamily:'var(--font-ui)' }}/>
              <Bar dataKey="Budget" fill="var(--green-100)" radius={[3,3,0,0]}/>
              <Bar dataKey="Spent"  fill="var(--green-600)" radius={[3,3,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Indicator progress */}
      <div className="card" style={{ marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem', flexWrap:'wrap', gap:'0.75rem' }}>
          <div>
            <div className="section-label" style={{ marginBottom:'0.25rem' }}>Indicator Progress</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)' }}>
              {visibleInds.length} indicator{visibleInds.length!==1?'s':''}
            </div>
          </div>
          <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap' }}>
            {cats.map(c => (
              <button key={c} onClick={() => setIndFilter(c)} style={{
                padding:'0.3rem 0.75rem', borderRadius:6, border:'1.5px solid',
                fontSize:'0.75rem', fontWeight:700, cursor:'pointer', letterSpacing:'0.03em',
                background: indFilter===c ? 'var(--green-800)' : 'var(--white)',
                color: indFilter===c ? '#fff' : 'var(--text-2)',
                borderColor: indFilter===c ? 'var(--green-800)' : 'var(--border)',
                transition:'all 0.12s',
              }}>{c==='All'?'All':c}</button>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
          {visibleInds.map(ind => {
            const p = pct(ind.current, ind.target);
            return (
              <div key={ind.id} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:'0.75rem', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:'0.8125rem', fontWeight:500, color:'var(--text-1)', marginBottom:'0.2rem' }}>{ind.name}</div>
                  <div style={{ height:5, background:'var(--cream)', borderRadius:9999, overflow:'hidden', border:'1px solid var(--border)' }}>
                    <div style={{ width:`${p}%`, height:'100%', background:TRAFFIC[ind.traffic], borderRadius:9999 }}/>
                  </div>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.8125rem', color:'var(--text-2)', whiteSpace:'nowrap' }}>
                  {ind.current}/{ind.target}
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.875rem', fontWeight:700, color:TRAFFIC[ind.traffic], minWidth:36, textAlign:'right' }}>
                  {p}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GIS Map */}
      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ padding:'1.25rem 1.5rem', borderBottom:'1px solid var(--border)' }}>
          <div className="section-label" style={{ marginBottom:'0.25rem' }}>Geographic Distribution</div>
          <div style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)' }}>
            Programme Component Locations — Vanuatu
          </div>
        </div>
        <div style={{ height:420 }}>
          <MapContainer center={[-15.377, 166.959]} zoom={6} style={{ height:'100%', width:'100%' }} scrollWheelZoom={false}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
            {PROJECTS.map(p => (
              <CircleMarker key={p.id} center={[p.latitude, p.longitude]} radius={11}
                pathOptions={{ color:p.category_color, fillColor:p.category_color, fillOpacity:0.75, weight:2 }}>
                <Popup>
                  <div style={{ fontFamily:'var(--font-ui)', minWidth:180, padding:'0.25rem' }}>
                    <div style={{ fontWeight:700, color:p.category_color, fontSize:'0.75rem', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:'0.375rem' }}>{p.category}</div>
                    <div style={{ fontWeight:600, color:'var(--text-1)', marginBottom:'0.375rem', fontSize:'0.875rem', lineHeight:1.3 }}>{p.name}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Budget: VUV {(p.budget_vuv/1e6).toFixed(0)}M</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Lead: {p.lead_agency}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>{p.provinces.join(', ')}</div>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
        <div style={{ padding:'0.875rem 1.5rem', background:'var(--cream)', borderTop:'1px solid var(--border)', display:'flex', flexWrap:'wrap', gap:'1rem' }}>
          {PROJECTS.map(p => (
            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.75rem', color:'var(--text-2)' }}>
              <span style={{ width:10, height:10, borderRadius:'50%', background:p.category_color }}/>
              {p.category}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
