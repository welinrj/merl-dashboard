import { useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, FolderOpen, Database,
  Map, FileBarChart, Settings, LogOut,
  ChevronRight, Eye, EyeOff, AlertCircle, Wifi
} from 'lucide-react';
import { DoCCIcon } from './components/DoCCIcon';

const ClimateParticles = lazy(() => import('./components/ClimateParticles'));
const Dashboard  = lazy(() => import('./pages/Dashboard'));
const Projects   = lazy(() => import('./pages/Projects'));
const Datasets   = lazy(() => import('./pages/Datasets'));
const Analysis   = lazy(() => import('./pages/Analysis'));
const Reports    = lazy(() => import('./pages/Reports'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));

/* ── RBAC ─────────────────────────────────────────────────────────────── */
const ROLES = {
  ROLE_ADMIN:        'System Administrator',
  ROLE_DOCC_SENIOR:  'DoCC Senior Officer',
  ROLE_DOCC_MEO:     'M&E Officer',
  ROLE_PROJ_MANAGER: 'Project Manager',
  ROLE_PROJ_STAFF:   'Project Staff',
};
const DEMO_USERS = [
  { id:1, username:'admin',   password:'admin123',  role:'ROLE_ADMIN',        name:'Alice Natapei' },
  { id:2, username:'senior',  password:'senior123', role:'ROLE_DOCC_SENIOR',  name:'Bob Tahi' },
  { id:3, username:'meo',     password:'meo123',    role:'ROLE_DOCC_MEO',     name:'Carol Mele' },
  { id:4, username:'manager', password:'mgr123',    role:'ROLE_PROJ_MANAGER', name:'David Aru' },
  { id:5, username:'staff',   password:'staff123',  role:'ROLE_PROJ_STAFF',   name:'Eve Tamata' },
];
const TAB_ACCESS = {
  ROLE_ADMIN:        ['dashboard','projects','datasets','analysis','reports','admin'],
  ROLE_DOCC_SENIOR:  ['dashboard','projects','datasets','analysis','reports'],
  ROLE_DOCC_MEO:     ['dashboard','projects','datasets','analysis','reports'],
  ROLE_PROJ_MANAGER: ['dashboard','projects','datasets','analysis','reports'],
  ROLE_PROJ_STAFF:   ['datasets','analysis'],
};
const NAV_ITEMS = [
  { key:'dashboard', path:'/dashboard', label:'Dashboard',      Icon: LayoutDashboard },
  { key:'projects',  path:'/projects',  label:'L&D Components', Icon: FolderOpen },
  { key:'datasets',  path:'/datasets',  label:'Datasets',       Icon: Database },
  { key:'analysis',  path:'/analysis',  label:'Analysis & GIS', Icon: Map },
  { key:'reports',   path:'/reports',   label:'Reports',        Icon: FileBarChart },
  { key:'admin',     path:'/admin',     label:'Administration', Icon: Settings },
];

/* ── Login ─────────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [user,  setUser]  = useState('');
  const [pass,  setPass]  = useState('');
  const [show,  setShow]  = useState(false);
  const [err,   setErr]   = useState('');
  const [hints, setHints] = useState(false);

  const submit = e => {
    e.preventDefault();
    const found = DEMO_USERS.find(u => u.username === user && u.password === pass);
    if (found) onLogin(found);
    else setErr('Incorrect username or password.');
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', fontFamily:'var(--font-ui)' }}>
      {/* ── Left: identity + 3D ────────────────────────────────────── */}
      <motion.div
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width: '48%', flexShrink: 0,
          background: 'linear-gradient(160deg, var(--green-900) 0%, #132b1e 55%, #0d2018 100%)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '3rem 3.5rem', position: 'relative', overflow: 'hidden',
        }}>

        {/* Three.js particle background */}
        <Suspense fallback={null}>
          <ClimateParticles />
        </Suspense>

        {/* Subtle grid overlay */}
        <div style={{
          position:'absolute', inset:0, opacity:0.04,
          backgroundImage:'linear-gradient(var(--gold-500) 1px, transparent 1px), linear-gradient(90deg, var(--gold-500) 1px, transparent 1px)',
          backgroundSize:'40px 40px',
        }}/>

        {/* Content — above canvas */}
        <div style={{ position:'relative', zIndex:2 }}>
          {/* Gov header */}
          <motion.div initial={{ y:-20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.3, duration:0.6 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.875rem', marginBottom:'3rem' }}>
              <div style={{
                width:46, height:46, borderRadius:12,
                background:'rgba(212,168,67,0.15)',
                border:'1.5px solid rgba(212,168,67,0.45)',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>
                <DoCCIcon size={24} color="#d4a843"/>
              </div>
              <div>
                <div style={{ color:'var(--gold-400)', fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase' }}>
                  Republic of Vanuatu
                </div>
                <div style={{ color:'rgba(255,255,255,0.85)', fontSize:'0.875rem', fontWeight:600 }}>
                  Department of Climate Change
                </div>
              </div>
            </div>

            <div style={{
              display:'inline-flex', alignItems:'center', gap:'0.5rem',
              background:'rgba(212,168,67,0.12)', border:'1px solid rgba(212,168,67,0.3)',
              borderRadius:9999, padding:'0.3rem 0.875rem', marginBottom:'1.25rem',
            }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--gold-500)', boxShadow:'0 0 8px var(--gold-500)' }}/>
              <span style={{ color:'var(--gold-400)', fontSize:'0.6875rem', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase' }}>
                Activity 0.2 — On-going Project Management
              </span>
            </div>

            <h1 style={{
              fontFamily:'var(--font-display)', fontSize:'2.75rem', fontWeight:600,
              color:'#ffffff', lineHeight:1.05, letterSpacing:'-0.035em', margin:'0 0 1rem',
            }}>
              Loss &amp; Damage<br/>Fund MERL
            </h1>
            <p style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.9375rem', lineHeight:1.65, maxWidth:340, margin:0 }}>
              Monitoring, Evaluation, Reporting &amp; Learning platform for the Vanuatu Loss and Damage Fund Development Project.
            </p>
          </motion.div>
        </div>

        {/* MFAT credit */}
        <motion.div initial={{ y:20, opacity:0 }} animate={{ y:0, opacity:1 }} transition={{ delay:0.5, duration:0.6 }}
          style={{ position:'relative', zIndex:2 }}>
          <div style={{
            padding:'1.125rem 1.375rem',
            background:'rgba(255,255,255,0.05)', backdropFilter:'blur(8px)',
            border:'1px solid rgba(255,255,255,0.1)', borderRadius:12,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.375rem' }}>
              {/* NZ Fern SVG icon */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="8" fill="rgba(212,168,67,0.2)" stroke="rgba(212,168,67,0.5)" strokeWidth="1"/>
                <path d="M9 3C6 3 4 5.5 4 8.5c0 2.5 1.5 4 3 5l2-3-1.5-2 2.5 1.5V3z" fill="#d4a843" opacity="0.8"/>
                <path d="M9 3c3 0 5 2.5 5 5.5 0 2.5-1.5 4-3 5l-2-3 1.5-2L9 9.5V3z" fill="#d4a843" opacity="0.5"/>
              </svg>
              <span style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                Funded by
              </span>
            </div>
            <div style={{ color:'rgba(255,255,255,0.85)', fontSize:'0.9rem', fontWeight:600, letterSpacing:'-0.01em' }}>
              Ministry of Foreign Affairs &amp; Trade
            </div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.8125rem' }}>
              Government of New Zealand · NZD 4,000,000
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Right: login form ────────────────────────────────────── */}
      <motion.div
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--cream)', padding: '2rem',
        }}>
        <div style={{ width:'100%', maxWidth:380 }}>

          <div style={{ marginBottom:'2rem' }}>
            <h2 style={{
              fontFamily:'var(--font-display)', fontSize:'2rem', fontWeight:600,
              color:'var(--text-1)', margin:'0 0 0.375rem', letterSpacing:'-0.03em',
            }}>Sign in</h2>
            <p style={{ color:'var(--text-3)', fontSize:'0.875rem', margin:0 }}>
              Enter your credentials to access the platform.
            </p>
          </div>

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <motion.div whileFocus={{ scale:1.01 }}>
              <label className="field-label">Username</label>
              <input value={user} onChange={e=>{setUser(e.target.value);setErr('');}}
                className="field-input" placeholder="Enter username" required autoComplete="username"/>
            </motion.div>

            <div>
              <label className="field-label">Password</label>
              <div style={{ position:'relative' }}>
                <input type={show?'text':'password'} value={pass}
                  onChange={e=>{setPass(e.target.value);setErr('');}}
                  className="field-input" style={{ paddingRight:'2.5rem' }}
                  placeholder="Enter password" required autoComplete="current-password"/>
                <button type="button" onClick={()=>setShow(!show)}
                  style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', display:'flex', padding:0 }}>
                  {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {err && (
                <motion.div initial={{ opacity:0, y:-6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:8, padding:'0.625rem 0.875rem', color:'#991b1b', fontSize:'0.8125rem' }}>
                  <AlertCircle size={14} style={{ flexShrink:0 }}/> {err}
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button type="submit" whileHover={{ scale:1.02, boxShadow:'0 8px 24px rgba(28,61,46,0.3)' }} whileTap={{ scale:0.98 }}
              style={{ width:'100%', padding:'0.75rem', background:'var(--green-800)', color:'#fff', border:'none', borderRadius:8, fontSize:'0.9375rem', fontWeight:700, cursor:'pointer', fontFamily:'var(--font-ui)', letterSpacing:'-0.01em', marginTop:'0.25rem' }}>
              Sign In
            </motion.button>
          </form>

          {/* Demo credentials */}
          <div style={{ marginTop:'1.5rem', textAlign:'center' }}>
            <button onClick={()=>setHints(!hints)}
              style={{ background:'none', border:'none', cursor:'pointer', color:'var(--green-700)', fontSize:'0.8125rem', fontWeight:600, textDecoration:'underline', textDecorationStyle:'dotted' }}>
              {hints ? 'Hide' : 'View'} demo credentials
            </button>
            <AnimatePresence>
              {hints && (
                <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                  style={{ overflow:'hidden', marginTop:'0.875rem', background:'var(--green-50)', border:'1px solid var(--green-100)', borderRadius:8, padding:'0.875rem', textAlign:'left' }}>
                  <div style={{ fontSize:'0.625rem', fontWeight:700, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:'0.5rem' }}>Demo Accounts</div>
                  {DEMO_USERS.map(u => (
                    <div key={u.id} style={{ fontSize:'0.8125rem', color:'var(--text-2)', padding:'0.25rem 0', borderBottom:'1px solid var(--green-100)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span>
                        <span style={{ fontFamily:'var(--font-mono)', color:'var(--green-800)', fontWeight:700 }}>{u.username}</span>
                        <span style={{ color:'var(--text-3)', margin:'0 0.375rem' }}>/</span>
                        <span style={{ fontFamily:'var(--font-mono)', color:'var(--text-3)' }}>{u.password}</span>
                      </span>
                      <span style={{ fontSize:'0.6875rem', color:'var(--text-3)' }}>{ROLES[u.role]}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <p style={{ marginTop:'2rem', textAlign:'center', fontSize:'0.75rem', color:'var(--text-3)' }}>
            Built by Vanua Spatial Solutions (VSS) · April 2026
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/* ── App Shell ─────────────────────────────────────────────────────────── */
const PageSuspense = ({ children }) => (
  <Suspense fallback={
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-3)', fontSize:'0.875rem' }}>
      Loading…
    </div>
  }>{children}</Suspense>
);

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) return <LoginScreen onLogin={setUser} />;

  const allowed    = TAB_ACCESS[user.role] || [];
  const visibleNav = NAV_ITEMS.filter(n => allowed.includes(n.key));
  const defaultPath = visibleNav[0]?.path || '/datasets';
  const initials   = user.name.split(' ').map(n=>n[0]).join('').slice(0,2);

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:'var(--font-ui)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <motion.aside
        initial={{ x: -240 }} animate={{ x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          width:232, flexShrink:0, display:'flex', flexDirection:'column',
          background:'var(--green-900)',
          boxShadow:'4px 0 32px rgba(0,0,0,0.22)',
        }}>

        {/* Brand */}
        <div style={{ padding:'1.375rem 1.25rem 1.125rem', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <motion.div whileHover={{ scale:1.08, rotate:5 }} transition={{ type:'spring', stiffness:300 }}
              style={{ width:36, height:36, borderRadius:9, background:'rgba(212,168,67,0.15)', border:'1.5px solid rgba(212,168,67,0.4)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'default', flexShrink:0 }}>
              <DoCCIcon size={20} color="#d4a843"/>
            </motion.div>
            <div>
              <div style={{ fontFamily:'var(--font-display)', color:'#ffffff', fontSize:'0.9375rem', fontWeight:600, letterSpacing:'-0.01em', lineHeight:1.2 }}>L&amp;D MERL</div>
              <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.6rem', letterSpacing:'0.06em', textTransform:'uppercase' }}>DoCC · Vanuatu</div>
            </div>
          </div>
        </div>

        {/* Nav label */}
        <div style={{ padding:'0.875rem 1.25rem 0.25rem' }}>
          <span style={{ fontSize:'0.5rem', fontWeight:700, letterSpacing:'0.14em', textTransform:'uppercase', color:'rgba(255,255,255,0.2)' }}>Navigation</span>
        </div>

        {/* Nav items */}
        <nav style={{ flex:1, padding:'0 0.625rem', overflowY:'auto' }} className="scrollbar-thin">
          {visibleNav.map(({ key, path, label, Icon }, i) => (
            <motion.div key={key} initial={{ x:-20, opacity:0 }} animate={{ x:0, opacity:1 }} transition={{ delay: 0.05*i, duration:0.35 }}>
              <NavLink to={path} style={({ isActive }) => ({
                display:'flex', alignItems:'center', gap:'0.625rem',
                padding:'0.575rem 0.75rem', borderRadius:8, margin:'0.1rem 0',
                textDecoration:'none', fontSize:'0.8125rem', fontWeight: isActive ? 600 : 500,
                color: isActive ? '#ffffff' : 'rgba(255,255,255,0.45)',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(212,168,67,0.18) 0%, rgba(212,168,67,0.06) 100%)'
                  : 'transparent',
                borderLeft: isActive ? '2.5px solid var(--gold-500)' : '2.5px solid transparent',
                transition: 'all 0.15s',
              })}>
                {({ isActive }) => (
                  <>
                    <Icon size={15} style={{ flexShrink:0, opacity: isActive ? 1 : 0.6 }}/>
                    {label}
                    {isActive && (
                      <motion.span layoutId="activeIndicator"
                        style={{ marginLeft:'auto', width:4, height:4, borderRadius:'50%', background:'var(--gold-500)', boxShadow:'0 0 8px var(--gold-500)' }}/>
                    )}
                  </>
                )}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        {/* User card */}
        <div style={{ padding:'1rem 1.25rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.75rem' }}>
            <motion.div whileHover={{ scale:1.1 }}
              style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg, var(--green-600), var(--green-500))', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'0.6875rem', fontWeight:700, flexShrink:0 }}>
              {initials}
            </motion.div>
            <div style={{ overflow:'hidden' }}>
              <div style={{ color:'#fff', fontSize:'0.8125rem', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{user.name}</div>
              <div style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.6rem', letterSpacing:'0.04em', textTransform:'uppercase', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ROLES[user.role]}</div>
            </div>
          </div>
          <motion.button onClick={()=>setUser(null)}
            whileHover={{ background:'rgba(255,255,255,0.12)' }}
            style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', padding:'0.5rem', borderRadius:7, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.45)', fontSize:'0.75rem', cursor:'pointer', transition:'background 0.15s' }}>
            <LogOut size={13}/> Sign Out
          </motion.button>
        </div>
      </motion.aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Top bar */}
        <motion.header initial={{ y:-52 }} animate={{ y:0 }} transition={{ duration:0.4, ease:[0.22,1,0.36,1] }}
          style={{ height:52, flexShrink:0, background:'var(--white)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 1.75rem', gap:'0.5rem' }}>
          <ChevronRight size={14} style={{ color:'var(--text-3)' }}/>
          <span style={{ fontSize:'0.8125rem', color:'var(--text-3)', fontWeight:500 }}>Vanuatu L&amp;D Fund Development Project</span>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <span style={{ fontSize:'0.6875rem', color:'var(--text-3)', padding:'0.25rem 0.625rem', background:'var(--green-50)', border:'1px solid var(--green-100)', borderRadius:9999, fontWeight:600, letterSpacing:'0.04em' }}>Demo Mode</span>
            <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
              <motion.div animate={{ scale:[1,1.3,1], opacity:[1,0.6,1] }} transition={{ duration:2, repeat:Infinity }}
                style={{ width:6, height:6, borderRadius:'50%', background:'var(--green-500)' }}/>
              <span style={{ fontSize:'0.75rem', color:'var(--text-3)' }}>Online</span>
            </div>
          </div>
        </motion.header>

        {/* Page content */}
        <main style={{ flex:1, overflowY:'auto', background:'var(--cream)' }} className="scrollbar-thin">
          <Routes>
            <Route path="/" element={<Navigate to={defaultPath} replace />} />
            <Route path="/dashboard" element={allowed.includes('dashboard') ? <PageSuspense><Dashboard user={user}/></PageSuspense> : <Navigate to={defaultPath} replace />} />
            <Route path="/projects"  element={allowed.includes('projects')  ? <PageSuspense><Projects  user={user}/></PageSuspense> : <Navigate to={defaultPath} replace />} />
            <Route path="/datasets"  element={allowed.includes('datasets')  ? <PageSuspense><Datasets  user={user}/></PageSuspense> : <Navigate to={defaultPath} replace />} />
            <Route path="/analysis"  element={allowed.includes('analysis')  ? <PageSuspense><Analysis  user={user}/></PageSuspense> : <Navigate to={defaultPath} replace />} />
            <Route path="/reports"   element={allowed.includes('reports')   ? <PageSuspense><Reports   user={user}/></PageSuspense> : <Navigate to={defaultPath} replace />} />
            <Route path="/admin"     element={allowed.includes('admin')     ? <PageSuspense><AdminPanel user={user}/></PageSuspense> : <Navigate to={defaultPath} replace />} />
            <Route path="*"          element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
