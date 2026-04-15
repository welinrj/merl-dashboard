import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Calendar, Users } from 'lucide-react';
import { PROJECTS } from '../mockData';

const pct = (a,b) => b ? Math.min(100, Math.round((a/b)*100)) : 0;
const TRAFFIC = { green:'#1a8c4e', amber:'#c97b00', red:'#c0392b' };
const TRAFFIC_BG  = { green:'#d1fae5', amber:'#fef3c7', red:'#fee2e2' };
const TRAFFIC_TXT = { green:'#065f46', amber:'#92400e', red:'#991b1b' };

function ActivityDot({ status }) {
  const c = status==='completed' ? '#1a8c4e' : status==='in_progress' ? '#c97b00' : '#d1d5db';
  return <span style={{ width:7, height:7, borderRadius:'50%', background:c, display:'inline-block', flexShrink:0 }}/>;
}

function RBMSection({ rbm }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
      <button onClick={() => setOpen(!open)} style={{
        display:'flex', alignItems:'center', gap:'0.5rem',
        background:'none', border:'none', cursor:'pointer',
        color:'var(--green-700)', fontSize:'0.8125rem', fontWeight:600, padding:0,
      }}>
        {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        Results Chain (RBM Framework)
      </button>
      {open && (
        <div style={{ marginTop:'0.875rem', paddingLeft:'1rem', borderLeft:'2px solid var(--green-100)' }}>
          <div style={{ fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'0.25rem' }}>Goal</div>
          <div style={{ fontSize:'0.8125rem', color:'var(--text-2)', fontStyle:'italic', marginBottom:'1rem' }}>{rbm.goal}</div>
          {rbm.outcomes.map(out => (
            <div key={out.id} style={{ marginBottom:'0.875rem' }}>
              <div style={{ fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'0.25rem' }}>Outcome</div>
              <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-1)', marginBottom:'0.625rem' }}>{out.text}</div>
              {out.outputs.map(op => (
                <div key={op.id} style={{ marginLeft:'1rem', marginBottom:'0.625rem' }}>
                  <div style={{ fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'0.2rem' }}>Output</div>
                  <div style={{ fontSize:'0.8125rem', color:'var(--text-2)', marginBottom:'0.375rem' }}>{op.text}</div>
                  {op.activities.map(act => (
                    <div key={act.id} style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginLeft:'0.875rem', padding:'0.25rem 0', borderBottom:'1px solid var(--border)' }}>
                      <ActivityDot status={act.status}/>
                      <span style={{ fontSize:'0.75rem', color:'var(--text-2)', flex:1 }}>{act.text}</span>
                      <span style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)', fontWeight:600 }}>{act.pct}%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project: p }) {
  const [expanded, setExpanded] = useState(false);
  const budgetPct = pct(p.spent_vuv, p.budget_vuv);

  return (
    <div className="card" style={{ padding:0, overflow:'hidden' }}>
      {/* Colour bar */}
      <div style={{ height:3, background:p.category_color }}/>

      <div style={{ padding:'1.25rem' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.875rem' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.375rem' }}>
              <span style={{
                background: p.category_color+'1a', color: p.category_color,
                border: `1px solid ${p.category_color}44`,
                borderRadius:4, padding:'0.1rem 0.5rem',
                fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase',
              }}>{p.category}</span>
              <span style={{ background:'var(--green-50)', color:'var(--green-700)', border:'1px solid var(--green-100)', borderRadius:4, padding:'0.1rem 0.5rem', fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' }}>
                Active
              </span>
            </div>
            <h3 style={{ fontFamily:'var(--font-display)', fontSize:'1.0625rem', fontWeight:600, color:'var(--text-1)', letterSpacing:'-0.015em', margin:0, lineHeight:1.3 }}>
              {p.name}
            </h3>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)', marginTop:'0.2rem' }}>{p.code}</div>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="btn-secondary" style={{ fontSize:'0.75rem', padding:'0.375rem 0.75rem', flexShrink:0 }}>
            {expanded ? 'Collapse' : 'Details'}
          </button>
        </div>

        <p style={{ fontSize:'0.8125rem', color:'var(--text-3)', lineHeight:1.6, marginBottom:'1rem', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
          {p.description}
        </p>

        {/* Budget bar */}
        <div style={{ marginBottom:'1rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--text-3)', marginBottom:'0.375rem' }}>
            <span>Budget utilisation</span>
            <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--text-1)' }}>{budgetPct}%</span>
          </div>
          <div style={{ height:6, background:'var(--green-50)', borderRadius:9999, overflow:'hidden', border:'1px solid var(--green-100)' }}>
            <div style={{ width:`${budgetPct}%`, height:'100%', background:p.category_color, borderRadius:9999, transition:'width 0.4s ease' }}/>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6875rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
            <span>VUV {(p.spent_vuv/1e6).toFixed(1)}M spent</span>
            <span>VUV {(p.budget_vuv/1e6).toFixed(1)}M total</span>
          </div>
        </div>

        {/* Indicator mini grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.5rem' }}>
          {p.indicators.map(ind => {
            const pr = pct(ind.current, ind.target);
            return (
              <div key={ind.id} style={{ background:'var(--cream)', borderRadius:7, padding:'0.5rem 0.625rem', border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.25rem' }}>
                  <div style={{ fontSize:'0.625rem', color:'var(--text-3)', fontFamily:'var(--font-mono)' }}>{ind.code.split('-').slice(-1)}</div>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:TRAFFIC[ind.traffic] }}/>
                </div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:'1rem', fontWeight:700, color:'var(--text-1)' }}>{pr}%</div>
                <div style={{ fontSize:'0.625rem', color:'var(--text-3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ind.name}</div>
              </div>
            );
          })}
        </div>

        {/* Expanded details */}
        {expanded && (
          <div style={{ marginTop:'1.25rem' }} className="animate-fade">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.625rem', marginBottom:'1rem' }}>
              {[
                ['Lead Agency', p.lead_agency],
                ['Provinces', p.provinces.join(', ')],
                ['Start Date', p.start_date],
                ['End Date', p.end_date],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'var(--cream)', borderRadius:7, padding:'0.625rem', border:'1px solid var(--border)' }}>
                  <div style={{ fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.07em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'0.2rem' }}>{k}</div>
                  <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text-1)' }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Full indicator table */}
            <div style={{ border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
              <table className="data-table">
                <thead><tr>
                  <th>Indicator</th>
                  <th style={{ textAlign:'right' }}>Base</th>
                  <th style={{ textAlign:'right' }}>Current</th>
                  <th style={{ textAlign:'right' }}>Target</th>
                  <th>Status</th>
                </tr></thead>
                <tbody>
                  {p.indicators.map(ind => (
                    <tr key={ind.id}>
                      <td style={{ fontSize:'0.8125rem' }}>{ind.name}</td>
                      <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.8125rem', color:'var(--text-3)' }}>{ind.baseline}</td>
                      <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, fontSize:'0.875rem' }}>{ind.current}</td>
                      <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontSize:'0.8125rem', color:'var(--text-3)' }}>{ind.target}</td>
                      <td>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:'0.3rem', background:TRAFFIC_BG[ind.traffic], color:TRAFFIC_TXT[ind.traffic], borderRadius:9999, padding:'0.1rem 0.5rem', fontSize:'0.625rem', fontWeight:700, textTransform:'uppercase' }}>
                          <span style={{ width:4, height:4, borderRadius:'50%', background:TRAFFIC[ind.traffic] }}/>
                          {ind.traffic === 'green' ? 'On Track' : ind.traffic === 'amber' ? 'At Risk' : 'Off Track'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <RBMSection rbm={p.rbm} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function Projects({ user }) {
  const [filter, setFilter] = useState('All');
  const categories = ['All', ...new Set(PROJECTS.map(p => p.category))];
  const visible = filter === 'All' ? PROJECTS : PROJECTS.filter(p => p.category === filter);

  return (
    <div style={{ padding:'2rem 2.5rem', maxWidth:1400 }} className="animate-fade-up">
      <div style={{ marginBottom:'1.75rem' }}>
        <div className="section-label" style={{ marginBottom:'0.375rem' }}>Programme Portfolio</div>
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.875rem', fontWeight:600, color:'var(--text-1)', letterSpacing:'-0.025em', margin:0 }}>
          L&amp;D Fund Components
        </h1>
        <p style={{ fontSize:'0.875rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
          Six programme components of the Vanuatu Loss and Damage Fund Development Project.
        </p>
      </div>

      {/* Summary row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          ['Components', visible.length + ' of ' + PROJECTS.length],
          ['Total Budget', 'VUV ' + (visible.reduce((s,p)=>s+p.budget_vuv,0)/1e6).toFixed(0) + 'M'],
          ['Total Spent', 'VUV ' + (visible.reduce((s,p)=>s+p.spent_vuv,0)/1e6).toFixed(0) + 'M'],
        ].map(([k,v]) => (
          <div key={k} className="card" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div className="section-label">{k}</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1.375rem', fontWeight:600, color:'var(--text-1)' }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem', marginBottom:'1.5rem' }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setFilter(cat)} style={{
            padding:'0.375rem 0.875rem', borderRadius:7, border:'1.5px solid',
            fontSize:'0.75rem', fontWeight:700, cursor:'pointer', letterSpacing:'0.03em',
            transition:'all 0.15s',
            background: filter===cat ? 'var(--green-800)' : 'var(--white)',
            color: filter===cat ? '#fff' : 'var(--text-2)',
            borderColor: filter===cat ? 'var(--green-800)' : 'var(--border)',
          }}>
            {cat === 'All' ? 'All Components' : cat}
          </button>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1.25rem' }}>
        {visible.map(p => <ProjectCard key={p.id} project={p} />)}
      </div>
    </div>
  );
}
