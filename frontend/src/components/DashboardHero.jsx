// Dashboard hero — a dark, atmospheric "growing tree" scene rendered entirely as
// hand-built SVG (no raster/AI art): a procedurally-scattered, depth-shaded
// canopy, misted forest silhouettes, a soft glow and floating data particles.
// Sits as a dark band at the top of the (otherwise light) Dashboard, under the
// white top navigation.
import { useMemo } from 'react';

// Tonal radial gradients give each foliage cluster volume (lit top-left).
const TONES = [
  ['t0', '#2f5a3d', '#20402c'],
  ['t1', '#3f7d52', '#2c5a3a'],
  ['t2', '#5e9e67', '#457a4e'],
  ['t3', '#83bd7f', '#5e9463'],
  ['t4', '#a7d29a', '#7fb488'],
  ['tan', '#cdbb8f', '#a58f5f'],
  ['gold', '#dcb570', '#b48a3e'],
];

const CX = 660, CY = 168, RX = 140, RY = 110;

// Scatter foliage blobs within an elliptical canopy, shaded back-to-front by
// depth so the crown reads as a rounded, layered volume.
function buildCanopy() {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const blobs = [];
  for (let i = 0; i < 150; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random());
    const x = CX + Math.cos(a) * RX * rr * rnd(0.7, 1);
    const y = CY - 6 + Math.sin(a) * RY * rr * rnd(0.7, 1) - rr * 10;
    const depth = (y - (CY - RY)) / (2 * RY); // 0 top … 1 bottom
    let tone;
    const t = depth + rnd(-0.15, 0.15);
    if (Math.random() < 0.06) tone = Math.random() < 0.5 ? 'tan' : 'gold';
    else if (t < 0.28) tone = 't4';
    else if (t < 0.45) tone = 't3';
    else if (t < 0.62) tone = 't2';
    else if (t < 0.8) tone = 't1';
    else tone = 't0';
    blobs.push({ x, y, r: rnd(9, 24) * (1 - depth * 0.3), tone });
  }
  return blobs.sort((p, q) => q.r - p.r); // big/back first
}

const PARTICLES = [[470, 70], [520, 110], [430, 60], [560, 95], [600, 70], [520, 150], [450, 120]];

function Chip({ label, value, sub }) {
  return (
    <div style={{ background: 'rgba(24,38,31,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', border: '1px solid rgba(127,191,139,0.22)', borderRadius: 14, padding: '0.7rem 0.9rem', minWidth: 104 }}>
      <div style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8fa898' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontWeight: 700, fontSize: '1.5rem', color: '#f2f8f2', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.62rem', color: '#7fbf8b' }}>{sub}</div>}
    </div>
  );
}

export default function DashboardHero({ activities, onTrackPct, greenCount, budgetLabel, themes, focusAreas, indicators }) {
  const blobs = useMemo(buildCanopy, []);
  return (
    <div className="dash-hero animate-fade-up">
      <svg viewBox="0 0 1000 400" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0 }} aria-hidden="true">
        <defs>
          {TONES.map(([id, c1, c2]) => (
            <radialGradient key={id} id={`dh-${id}`} cx="38%" cy="32%" r="72%">
              <stop offset="0" stopColor={c1} /><stop offset="1" stopColor={c2} />
            </radialGradient>
          ))}
          <radialGradient id="dh-glow" cx="50%" cy="40%" r="60%">
            <stop offset="0" stopColor="#3a6b4d" stopOpacity="0.5" /><stop offset="1" stopColor="#3a6b4d" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dh-m1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9cc2a6" stopOpacity="0.28" /><stop offset="1" stopColor="#9cc2a6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dh-m2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5e9463" stopOpacity="0.34" /><stop offset="1" stopColor="#3a6b4d" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <circle cx="665" cy="175" r="225" fill="url(#dh-glow)" />
        <path d="M0 250 C 140 170, 260 300, 420 220 S 720 150, 1000 210 L1000 400 L0 400Z" fill="url(#dh-m1)" opacity="0.55" />
        <path d="M0 300 C 160 240, 320 320, 520 275 S 820 240, 1000 285 L1000 400 L0 400Z" fill="url(#dh-m2)" />

        {/* floating data particles + connectors */}
        {PARTICLES.slice(0, -1).map((p, i) => (
          <line key={`l${i}`} x1={p[0]} y1={p[1]} x2={PARTICLES[i + 1][0]} y2={PARTICLES[i + 1][1]} stroke="#6fbf85" strokeWidth="1" strokeOpacity="0.25" />
        ))}
        {PARTICLES.map((p, i) => (
          <circle key={`p${i}`} cx={p[0]} cy={p[1]} r={i % 3 ? 2.4 : 3.4} fill="#8fd39a" fillOpacity={i % 2 ? 0.5 : 0.85} />
        ))}

        <ellipse cx="660" cy="352" rx="150" ry="16" fill="#0b120e" fillOpacity="0.55" />
        <path d="M652 352 C 648 300, 644 250, 656 205 C 660 250, 666 300, 668 352 Z" fill="#7a5a3a" />
        {[
          'M656 250 C 620 240, 592 250, 565 232',
          'M660 232 C 696 220, 726 228, 756 208',
          'M658 214 C 642 196, 648 176, 636 158',
          'M660 208 C 680 192, 676 172, 692 158',
        ].map((d, i) => <path key={`b${i}`} d={d} stroke="#7a5a3a" strokeWidth={i < 2 ? 7 : 6} fill="none" strokeLinecap="round" />)}

        {blobs.map((b, i) => (
          <circle key={`c${i}`} cx={b.x.toFixed(1)} cy={b.y.toFixed(1)} r={b.r.toFixed(1)} fill={`url(#dh-${b.tone})`} />
        ))}
        <ellipse cx="610" cy="250" rx="120" ry="22" fill="#bfe0c4" fillOpacity="0.10" />
        <ellipse cx="720" cy="270" rx="150" ry="24" fill="#bfe0c4" fillOpacity="0.08" />
      </svg>

      {/* copy (top-left) */}
      <div className="dash-hero-copy">
        <div style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: '#7fbf8b', opacity: 0.9 }}>
          DoCC · Vanuatu · 2025–2030
        </div>
        <h1 className="dash-hero-title">
          Growing a <b>climate&#8209;resilient</b> Vanuatu
        </h1>
        <p style={{ color: '#a9bdb0', fontSize: '0.9rem', fontWeight: 400, lineHeight: 1.5, maxWidth: 340, margin: 0 }}>
          Strategic Results Framework — tracking delivery across {themes} themes,
          {' '}{focusAreas} focus areas and {activities} activities.
        </p>
      </div>

      {/* KPI chips (bottom-left) */}
      <div className="dash-hero-chips">
        <Chip label="Activities" value={activities} sub={`${indicators} indicators`} />
        <Chip label="On Track" value={`${onTrackPct}%`} sub={`${greenCount} of ${activities}`} />
        <Chip label="Budget" value={budgetLabel} sub="VUV" />
      </div>
    </div>
  );
}
