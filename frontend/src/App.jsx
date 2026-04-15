import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderOpen, Database,
  Map, FileBarChart, Settings, LogOut,
  ChevronRight, Eye, EyeOff, AlertCircle
} from 'lucide-react';

import Dashboard  from './pages/Dashboard';
import Projects   from './pages/Projects';
import Datasets   from './pages/Datasets';
import Analysis   from './pages/Analysis';
import Reports    from './pages/Reports';
import AdminPanel from './pages/AdminPanel';
import { PROJECTS } from './mockData';

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
  { key:'dashboard', path:'/dashboard', label:'Dashboard',       Icon: LayoutDashboard },
  { key:'projects',  path:'/projects',  label:'L&D Components',  Icon: FolderOpen },
  { key:'datasets',  path:'/datasets',  label:'Datasets',        Icon: Database },
  { key:'analysis',  path:'/analysis',  label:'Analysis & GIS',  Icon: Map },
  { key:'reports',   path:'/reports',   label:'Reports',         Icon: FileBarChart },
  { key:'admin',     path:'/admin',     label:'Administration',  Icon: Settings },
];

/* ── Login ─────────────────────────────────────────────────────────────── */
function LoginScreen({ onLogin }) {
  const [user, setUser]   = useState('');
  const [pass, setPass]   = useState('');
  const [show, setShow]   = useState(false);
  const [err,  setErr]    = useState('');
  const [hints, setHints] = useState(false);

  const submit = e => {
    e.preventDefault();
    const found = DEMO_USERS.find(u => u.username === user && u.password === pass);
    if (found) onLogin(found);
    else { setErr('Incorrect username or password.'); }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      fontFamily: 'var(--font-ui)',
      background: 'var(--cream)',
    }}>
      {/* Left panel — identity */}
      <div style={{
        width: '45%', flexShrink: 0,
        background: 'linear-gradient(160deg, var(--green-900) 0%, var(--green-800) 60%, var(--green-700) 100%)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '3rem 3.5rem',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative pattern */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: `radial-gradient(circle at 20% 50%, var(--gold-400) 1px, transparent 1px),
                            radial-gradient(circle at 80% 20%, var(--gold-400) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />

        {/* Top — gov branding */}
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '2.5rem' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'rgba(212,168,67,0.2)',
              border: '1.5px solid rgba(212,168,67,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.25rem',
            }}>🌿</div>
            <div>
              <div style={{ color: 'var(--gold-400)', fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Republic of Vanuatu
              </div>
              <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.875rem', fontWeight: 600 }}>
                Department of Climate Change
              </div>
            </div>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.5rem', fontWeight: 600,
            color: '#ffffff', lineHeight: 1.1,
            letterSpacing: '-0.03em',
            marginBottom: '1rem',
          }}>
            Loss &amp; Damage Fund<br />MERL Dashboard
          </h1>

          <p style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.9375rem', lineHeight: 1.6,
            maxWidth: 340,
          }}>
            Monitoring, Evaluation, Reporting &amp; Learning platform for the
            Vanuatu Loss and Damage Fund Development Project.
          </p>
        </div>

        {/* Bottom — funder attribution */}
        <div style={{ position: 'relative' }}>
          <div style={{
            padding: '1rem 1.25rem',
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
          }}>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
              Funded by
            </div>
            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.875rem', fontWeight: 600 }}>
              Ministry of Foreign Affairs &amp; Trade
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8125rem' }}>
              Government of New Zealand — NZD 4 million
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.75rem', fontWeight: 600,
            color: 'var(--text-1)', marginBottom: '0.375rem',
            letterSpacing: '-0.025em',
          }}>Sign in</h2>
          <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: '2rem' }}>
            Enter your credentials to access the platform.
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="field-label">Username</label>
              <input
                value={user} onChange={e => { setUser(e.target.value); setErr(''); }}
                className="field-input" placeholder="Enter your username" required
              />
            </div>

            <div>
              <label className="field-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={pass} onChange={e => { setPass(e.target.value); setErr(''); }}
                  className="field-input"
                  style={{ paddingRight: '2.5rem' }}
                  placeholder="Enter your password" required
                />
                <button
                  type="button" onClick={() => setShow(!show)}
                  style={{
                    position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', display: 'flex', padding: 0,
                  }}
                >
                  {show ? <EyeOff size={16}/> : <Eye size={16}/>}
                </button>
              </div>
            </div>

            {err && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: 8, padding: '0.625rem 0.875rem',
                color: '#991b1b', fontSize: '0.8125rem',
              }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }}/>
                {err}
              </div>
            )}

            <button type="submit" className="btn-primary"
              style={{ width: '100%', padding: '0.75rem', fontSize: '0.9375rem', marginTop: '0.25rem', borderRadius: 8 }}>
              Sign In
            </button>
          </form>

          {/* Demo hints */}
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              onClick={() => setHints(!hints)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--green-700)', fontSize: '0.8125rem', fontWeight: 600,
                textDecoration: 'underline', textDecorationStyle: 'dotted',
              }}
            >
              {hints ? 'Hide' : 'View'} demo credentials
            </button>

            {hints && (
              <div style={{
                marginTop: '0.875rem', background: 'var(--green-50)',
                border: '1px solid var(--green-100)', borderRadius: 8,
                padding: '0.875rem', textAlign: 'left',
              }}>
                <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '0.5rem' }}>
                  Demo Accounts
                </div>
                {DEMO_USERS.map(u => (
                  <div key={u.id} style={{ fontSize: '0.8125rem', color: 'var(--text-2)', padding: '0.25rem 0', borderBottom: '1px solid var(--green-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green-800)', fontWeight: 600 }}>{u.username}</span>
                      <span style={{ color: 'var(--text-3)', margin: '0 0.375rem' }}>/</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{u.password}</span>
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>{ROLES[u.role]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <p style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-3)' }}>
            Built by Vanua Spatial Solutions · April 2026
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── App Shell ─────────────────────────────────────────────────────────── */
export default function App() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState(PROJECTS);

  if (!user) return <LoginScreen onLogin={setUser} />;

  const allowed    = TAB_ACCESS[user.role] || [];
  const visibleNav = NAV_ITEMS.filter(n => allowed.includes(n.key));
  const defaultPath = visibleNav[0]?.path || '/datasets';
  const initials   = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font-ui)' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside style={{
        width: 232, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--green-900)',
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
      }}>

        {/* Brand */}
        <div style={{
          padding: '1.5rem 1.25rem 1.25rem',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'rgba(212,168,67,0.18)',
              border: '1.5px solid rgba(212,168,67,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', flexShrink: 0,
            }}>🌿</div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                color: '#ffffff', fontSize: '0.9375rem', fontWeight: 600,
                letterSpacing: '-0.01em', lineHeight: 1.2,
              }}>L&amp;D MERL</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>
                DoCC · Vanuatu
              </div>
            </div>
          </div>
        </div>

        {/* Nav label */}
        <div style={{ padding: '1rem 1.25rem 0.375rem' }}>
          <span style={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
            Navigation
          </span>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: '0 0.625rem', overflowY: 'auto' }} className="scrollbar-thin">
          {visibleNav.map(({ key, path, label, Icon }) => (
            <NavLink key={key} to={path} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: '0.6rem 0.75rem', borderRadius: 8, margin: '0.125rem 0',
              textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 500,
              transition: 'all 0.15s',
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)',
              background: isActive
                ? 'linear-gradient(135deg, rgba(212,168,67,0.18), rgba(212,168,67,0.08))'
                : 'transparent',
              borderLeft: isActive ? '2.5px solid var(--gold-500)' : '2.5px solid transparent',
            })}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User info + sign out */}
        <div style={{
          padding: '1rem 1.25rem',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--green-600), var(--green-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0,
            }}>{initials}</div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {ROLES[user.role]}
              </div>
            </div>
          </div>
          <button onClick={() => setUser(null)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.4rem', padding: '0.5rem', borderRadius: 7,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#fff'; }}
          onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Top bar */}
        <header style={{
          height: 52, flexShrink: 0,
          background: 'var(--white)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 1.75rem',
          gap: '0.5rem',
        }}>
          <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-3)', fontWeight: 500 }}>
            Vanuatu L&amp;D Fund Development Project
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              fontSize: '0.6875rem', color: 'var(--text-3)',
              padding: '0.25rem 0.625rem',
              background: 'var(--green-50)',
              border: '1px solid var(--green-100)',
              borderRadius: 9999, fontWeight: 600, letterSpacing: '0.04em',
            }}>
              Demo Mode
            </div>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: 'var(--green-500)',
              boxShadow: '0 0 0 3px rgba(74,171,130,0.2)',
            }}/>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Online</span>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--cream)' }} className="scrollbar-thin">
          <Routes>
            <Route path="/" element={<Navigate to={defaultPath} replace />} />
            <Route path="/dashboard" element={allowed.includes('dashboard') ? <Dashboard user={user}/> : <Navigate to={defaultPath} replace />} />
            <Route path="/projects"  element={allowed.includes('projects')  ? <Projects  user={user} projects={projects} setProjects={setProjects}/> : <Navigate to={defaultPath} replace />} />
            <Route path="/datasets"  element={allowed.includes('datasets')  ? <Datasets  user={user}/> : <Navigate to={defaultPath} replace />} />
            <Route path="/analysis"  element={allowed.includes('analysis')  ? <Analysis  user={user}/> : <Navigate to={defaultPath} replace />} />
            <Route path="/reports"   element={allowed.includes('reports')   ? <Reports   user={user}/> : <Navigate to={defaultPath} replace />} />
            <Route path="/admin"     element={allowed.includes('admin')     ? <AdminPanel user={user} projects={projects} setProjects={setProjects}/> : <Navigate to={defaultPath} replace />} />
            <Route path="*"          element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
