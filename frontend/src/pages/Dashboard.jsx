import { useRef, useEffect, useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';
import createGlobe from 'cobe';
import { PROJECTS, ALL_INDICATORS, DASHBOARD_SUMMARY } from '../mockData';
import { TrendingUp, AlertTriangle, ArrowRight, Globe2 } from 'lucide-react';

/* ── helpers ────────────────────────────────────────────────────────────── */
const pct  = (a, b) => b ? Math.round((a / b) * 100) : 0;
const fmtM = n => (n / 1e6).toFixed(1) + 'M';
const TRAFFIC     = { green:'#1a8c4e', amber:'#c97b00', red:'#c0392b' };
const TRAFFIC_BG  = { green:'#d1fae5', amber:'#fef3c7', red:'#fee2e2' };
const TRAFFIC_TXT = { green:'#065f46', amber:'#92400e', red:'#991b1b' };
const TRAFFIC_LABEL = { green:'On Track', amber:'At Risk', red:'Off Track' };

/* ── animated counter ───────────────────────────────────────────────────── */
function useCountUp(target, duration = 1400) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = now => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

/* ── particle canvas background ────────────────────────────────────────── */
function ParticleCanvas({ color = 'rgba(180,255,200,0.5)' }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width = W; canvas.height = H;

    const N = 55;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2 + 0.5,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      o: Math.random() * 0.5 + 0.2,
    }));

    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = color.replace('0.5', String(p.o));
        ctx.fill();
      });
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 90) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = color.replace('0.5', String(0.08 * (1 - dist / 90)));
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [color]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

/* ── floating orbs ──────────────────────────────────────────────────────── */
function FloatingOrbs() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <style>{`
        @keyframes orbFloat0 { 0%,100%{transform:translateY(0) scale(1)}  50%{transform:translateY(-18px) scale(1.04)} }
        @keyframes orbFloat1 { 0%,100%{transform:translateY(0) scale(1)}  50%{transform:translateY(-24px) scale(0.97)} }
        @keyframes orbFloat2 { 0%,100%{transform:translateY(0) scale(1)}  50%{transform:translateY(-12px) scale(1.06)} }
      `}</style>
      {[
        { w:180, h:180, left:'5%',  top:'10%', color:'rgba(74,171,130,0.13)', dur:7, anim:0 },
        { w:120, h:120, left:'75%', top:'5%',  color:'rgba(212,168,67,0.10)', dur:9, anim:1 },
        { w:220, h:220, left:'50%', top:'55%', color:'rgba(74,171,130,0.08)', dur:11, anim:2 },
        { w:80,  h:80,  left:'88%', top:'70%', color:'rgba(212,168,67,0.12)', dur:6, anim:0 },
        { w:140, h:140, left:'20%', top:'65%', color:'rgba(74,171,130,0.09)', dur:8, anim:1 },
      ].map((o, i) => (
        <div key={i} style={{
          position:'absolute', width:o.w, height:o.h, left:o.left, top:o.top,
          borderRadius:'50%',
          background:`radial-gradient(circle, ${o.color} 0%, transparent 70%)`,
          animation:`orbFloat${o.anim} ${o.dur}s ease-in-out infinite`,
          filter:'blur(1px)',
        }} />
      ))}
    </div>
  );
}

/* ── 3D tilt card ────────────────────────────────────────────────────────── */
function TiltCard({ children, style, className }) {
  const ref = useRef(null);
  const onMove = useCallback(e => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(8px)`;
    el.style.boxShadow = `${-x * 8}px ${y * 8}px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)`;
  }, []);
  const onLeave = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg) translateZ(0)';
    el.style.boxShadow = '';
  }, []);
  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={className}
      style={{ transition:'transform 0.15s ease, box-shadow 0.15s ease', willChange:'transform', ...style }}>
      {children}
    </div>
  );
}

/* ── KPI card ────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, color = 'green', icon: Icon, animate = false }) {
  const accent = color === 'gold' ? 'var(--gold-500)' : color === 'red' ? '#c0392b' : color === 'amber' ? '#c97b00' : 'var(--green-500)';
  const numericVal = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0;
  const counted = useCountUp(animate ? numericVal : 0, 1400);
  const displayed = animate ? String(counted) : value;

  return (
    <TiltCard className="card" style={{ borderLeft:`3px solid ${accent}`, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:-20, right:-20, width:80, height:80, borderRadius:'50%',
        background:`radial-gradient(circle, ${accent}22 0%, transparent 70%)`, pointerEvents:'none' }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.5rem' }}>
        <div className="section-label">{label}</div>
        {Icon && <Icon size={16} style={{ color:accent, opacity:0.75 }} />}
      </div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:600, color:'var(--text-1)', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>
        {displayed}
      </div>
      {sub && <div style={{ fontSize:'0.75rem', color:'var(--text-3)', marginTop:'0.375rem' }}>{sub}</div>}
    </TiltCard>
  );
}

/* ── traffic badge ───────────────────────────────────────────────────────── */
function TrafficBadge({ status }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:'0.3rem',
      background:TRAFFIC_BG[status], color:TRAFFIC_TXT[status],
      borderRadius:9999, padding:'0.15rem 0.6rem',
      fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.05em', textTransform:'uppercase',
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

/* ── Vanuatu 3D Globe (cobe) ─────────────────────────────────────────────── */
function VanuatuGlobe() {
  const canvasRef   = useRef(null);
  const pointerDown = useRef(null);
  const lastDelta   = useRef(0);
  const phiRef      = useRef(3.4);
  const [rotOffset, setRotOffset] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let width = canvas.offsetWidth;

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width:  width * 2,
      height: width * 2,
      phi:    3.4,
      theta:  0.25,
      dark:   0,
      diffuse: 1.4,
      mapSamples: 20000,
      mapBrightness: 7,
      baseColor:   [0.90, 0.97, 0.92],
      markerColor: [0.07, 0.55, 0.28],
      glowColor:   [0.75, 0.97, 0.80],
      markers: [
        { location: [-17.733, 168.322], size: 0.09 }, // Shefa — Port Vila
        { location: [-15.516, 167.183], size: 0.07 }, // Sanma — Luganville
        { location: [-15.283, 168.033], size: 0.06 }, // Penama
        { location: [-16.067, 167.424], size: 0.06 }, // Malampa
        { location: [-13.878, 167.557], size: 0.05 }, // Torba
        { location: [-19.533, 169.267], size: 0.07 }, // Tafea
      ],
      onRender: state => {
        if (!pointerDown.current) phiRef.current += 0.003;
        state.phi    = phiRef.current + rotOffset;
        state.width  = width * 2;
        state.height = width * 2;
      },
    });

    requestAnimationFrame(() => { if (canvas) canvas.style.opacity = '1'; });

    const onResize = () => { width = canvas.offsetWidth; };
    window.addEventListener('resize', onResize);
    return () => { globe.destroy(); window.removeEventListener('resize', onResize); };
  }, [rotOffset]);

  return (
    <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center' }}>
      <div style={{
        position:'absolute', top:'50%', left:'50%',
        transform:'translate(-50%,-50%)',
        width:'88%', aspectRatio:'1', borderRadius:'50%',
        background:'radial-gradient(circle, rgba(74,171,130,0.14) 0%, transparent 70%)',
        pointerEvents:'none',
      }} />
      <canvas
        ref={canvasRef}
        style={{ width:'100%', aspectRatio:'1', cursor:'grab', opacity:0, transition:'opacity 1.2s ease', borderRadius:'50%' }}
        onPointerDown={e => { pointerDown.current = e.clientX - lastDelta.current; canvasRef.current.style.cursor = 'grabbing'; }}
        onPointerUp={() => { pointerDown.current = null; canvasRef.current.style.cursor = 'grab'; }}
        onPointerOut={() => { pointerDown.current = null; canvasRef.current.style.cursor = 'grab'; }}
        onMouseMove={e => {
          if (pointerDown.current !== null) {
            const delta = e.clientX - pointerDown.current;
            lastDelta.current = delta;
            setRotOffset(delta / 180);
          }
        }}
        onTouchMove={e => {
          if (pointerDown.current !== null && e.touches[0]) {
            const delta = e.touches[0].clientX - pointerDown.current;
            lastDelta.current = delta;
            setRotOffset(delta / 100);
          }
        }}
      />
      <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginTop:'0.75rem', color:'var(--text-3)', fontSize:'0.6875rem' }}>
        <Globe2 size={11} /> Vanuatu — 6 province locations · drag to rotate
      </div>
    </div>
  );
}

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
        style={{ transition:'stroke-dasharray 1s ease', filter:`drop-shadow(0 0 4px ${color}88)` }}
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
    <TiltCard style={{ background:'var(--white)', border:'1px solid var(--border)', borderRadius:12, padding:'1rem',
      display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' }}>
      <ProgressRing value={value} total={total} color={color} />
      <div style={{ fontSize:'0.75rem', color:'var(--text-3)', textAlign:'center', lineHeight:1.3 }}>{label}</div>
      <div style={{ fontSize:'0.8125rem', fontWeight:700, color:'var(--text-1)' }}>{value} / {total}</div>
    </TiltCard>
  );
}

/* ══ Dashboard ═══════════════════════════════════════════════════════════════ */
export default function Dashboard({ user }) {
  const S = DASHBOARD_SUMMARY;
  const spentPct = pct(S.total_spent_vuv, S.total_budget_vuv);

  const budgetData = PROJECTS.map(p => ({
    name:   p.code.split('-')[0],
    Budget: Math.round(p.budget_vuv / 1e6),
    Spent:  Math.round(p.spent_vuv  / 1e6),
  }));

  const pieSrc = [
    { name:'On Track',  value:S.indicators_green, color:'#1a8c4e' },
    { name:'At Risk',   value:S.indicators_amber, color:'#c97b00' },
    { name:'Off Track', value:S.indicators_red,   color:'#c0392b' },
  ].filter(d => d.value > 0);

  return (
    <div style={{ padding:'2rem 2.5rem', maxWidth:1400 }} className="animate-fade-up">

      {/* ── Hero header ─────────────────────────────────────────────── */}
      <div style={{
        position:'relative',
        background:'linear-gradient(135deg, var(--green-900) 0%, var(--green-800) 55%, #1a5c3a 100%)',
        borderRadius:16, padding:'2rem 2.5rem', marginBottom:'1.75rem',
        overflow:'hidden', minHeight:110,
      }}>
        <ParticleCanvas />
        <FloatingOrbs />
        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(212,168,67,0.9)', marginBottom:'0.375rem' }}>
            Vanuatu Loss &amp; Damage Fund Development Project
          </div>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.875rem', fontWeight:600, color:'#ffffff', letterSpacing:'-0.025em', margin:0, lineHeight:1.2 }}>
            MERL Dashboard
          </h1>
          <div style={{ fontSize:'0.8125rem', color:'rgba(255,255,255,0.5)', marginTop:'0.375rem' }}>
            Overview · April 2026 · Funded by MFAT New Zealand
          </div>
        </div>
      </div>

      {/* ── KPI row ──────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1rem', marginBottom:'1.5rem' }}>
        <KpiCard label="Active Components"   value={S.active_projects}                      sub={`of ${S.total_projects} total components`}                        color="green" icon={TrendingUp} animate />
        <KpiCard label="Total Indicators"    value={S.total_indicators}                     sub={`${S.indicators_green} on track`}                                 color="green"               animate />
        <KpiCard label="Budget (VUV)"        value={fmtM(S.total_budget_vuv)}               sub={`${spentPct}% utilised · ${fmtM(S.total_spent_vuv)} spent`}        color="gold"                         />
        <KpiCard label="At Risk / Off Track" value={S.indicators_amber + S.indicators_red}  sub={`${S.indicators_amber} at risk · ${S.indicators_red} off track`}   color={S.indicators_red > 0 ? 'red' : 'amber'} icon={AlertTriangle} animate />
      </div>

      {/* ── Globe + charts ────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:'1rem', marginBottom:'1.5rem' }}>

        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {/* Budget bar chart */}
          <div className="card">
            <div className="section-label" style={{ marginBottom:'1rem' }}>Budget vs Expenditure by Component (VUV M)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={budgetData} barGap={4} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--green-50)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize:11, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-3)', fontFamily:'var(--font-ui)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Budget" fill="var(--green-100)" radius={[4,4,0,0]} name="Budget" />
                <Bar dataKey="Spent"  fill="var(--green-600)" radius={[4,4,0,0]} name="Spent" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', gap:'1rem', marginTop:'0.5rem' }}>
              {[['var(--green-100)','Budget'],['var(--green-600)','Spent']].map(([c,l]) => (
                <div key={l} style={{ display:'flex', alignItems:'center', gap:'0.375rem', fontSize:'0.75rem', color:'var(--text-3)' }}>
                  <span style={{ width:10, height:10, borderRadius:2, background:c }}/>{l}
                </div>
              ))}
            </div>
          </div>

          {/* 3D progress rings */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem' }}>
            <StatRing label="On Track"  value={S.indicators_green} total={S.total_indicators} color="#1a8c4e" />
            <StatRing label="At Risk"   value={S.indicators_amber} total={S.total_indicators} color="#c97b00" />
            <StatRing label="Off Track" value={S.indicators_red}   total={S.total_indicators} color="#c0392b" />
          </div>
        </div>

        {/* 3D Globe */}
        <TiltCard className="card" style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}>
          <div className="section-label" style={{ marginBottom:'0.75rem', textAlign:'center' }}>Project Coverage</div>
          <VanuatuGlobe />
          <div style={{ marginTop:'0.875rem', display:'flex', flexWrap:'wrap', gap:'0.4rem', justifyContent:'center' }}>
            {['Shefa','Sanma','Penama','Malampa','Torba','Tafea'].map(p => (
              <span key={p} style={{ fontSize:'0.625rem', fontWeight:700, background:'var(--green-50)', color:'var(--green-800)', border:'1px solid var(--green-100)', borderRadius:9999, padding:'0.15rem 0.5rem', letterSpacing:'0.04em' }}>
                {p}
              </span>
            ))}
          </div>
        </TiltCard>
      </div>

      {/* ── Indicators table + donut ──────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 260px', gap:'1rem', marginBottom:'1.5rem' }}>

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
                <th>Indicator</th><th>Component</th>
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
                const proj = PROJECTS.find(pr => pr.code === ind.project_code);
                return (
                  <tr key={ind.id}>
                    <td>
                      <div style={{ fontWeight:500, color:'var(--text-1)', fontSize:'0.8125rem' }}>{ind.name}</div>
                      <div style={{ fontFamily:'var(--font-mono)', fontSize:'0.6875rem', color:'var(--text-3)' }}>{ind.code}</div>
                    </td>
                    <td>
                      <span style={{ background:`${proj?.category_color}22`, color:proj?.category_color, border:`1px solid ${proj?.category_color}44`, borderRadius:9999, padding:'0.125rem 0.5rem', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.04em' }}>
                        {ind.category}
                      </span>
                    </td>
                    <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-3)', fontSize:'0.8125rem' }}>{ind.baseline}</td>
                    <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--text-1)', fontSize:'0.9375rem' }}>{ind.current}</td>
                    <td style={{ textAlign:'right', fontFamily:'var(--font-mono)', color:'var(--text-3)', fontSize:'0.8125rem' }}>{ind.target}</td>
                    <td style={{ textAlign:'right' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', justifyContent:'flex-end' }}>
                        <div style={{ width:64, height:5, background:'var(--green-100)', borderRadius:9999, overflow:'hidden' }}>
                          <div style={{ width:`${p}%`, height:'100%', background:TRAFFIC[ind.traffic], borderRadius:9999, boxShadow:`0 0 6px ${TRAFFIC[ind.traffic]}88` }}/>
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

        {/* Donut + budget summary */}
        <div className="card" style={{ display:'flex', flexDirection:'column' }}>
          <div className="section-label" style={{ marginBottom:'0.75rem' }}>Indicator Status</div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieSrc} cx="50%" cy="50%" innerRadius={46} outerRadius={70} dataKey="value" paddingAngle={4} stroke="none">
                {pieSrc.map(e => (
                  <Cell key={e.name} fill={e.color} style={{ filter:`drop-shadow(0 0 6px ${e.color}66)` }} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [v, n]} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem', marginTop:'0.5rem' }}>
            {pieSrc.map(e => (
              <div key={e.name} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.8125rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--text-2)' }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:e.color, boxShadow:`0 0 4px ${e.color}` }}/>
                  {e.name}
                </div>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:600, color:'var(--text-1)', fontSize:'0.875rem' }}>{e.value}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop:'auto', paddingTop:'1rem', borderTop:'1px solid var(--border)' }}>
            <div className="section-label" style={{ marginBottom:'0.5rem' }}>Budget Utilisation</div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--text-3)', marginBottom:'0.35rem' }}>
              <span>Spent</span>
              <span style={{ fontWeight:700, color:'var(--text-1)' }}>{spentPct}%</span>
            </div>
            <div style={{ width:'100%', height:6, background:'var(--green-50)', borderRadius:9999, overflow:'hidden' }}>
              <div style={{ width:`${spentPct}%`, height:'100%', background:'linear-gradient(90deg, var(--green-500), var(--green-400))', borderRadius:9999, boxShadow:'0 0 8px rgba(74,171,130,0.5)', transition:'width 1.2s ease' }}/>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.6875rem', color:'var(--text-3)', marginTop:'0.25rem' }}>
              <span>VUV {fmtM(S.total_spent_vuv)}</span>
              <span>VUV {fmtM(S.total_budget_vuv)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
