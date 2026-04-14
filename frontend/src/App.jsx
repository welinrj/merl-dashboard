import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';

// DoCC DMP Pages
import Dashboard   from './pages/Dashboard';
import Projects    from './pages/Projects';
import Datasets    from './pages/Datasets';
import Analysis    from './pages/Analysis';
import Reports     from './pages/Reports';
import AdminPanel  from './pages/AdminPanel';

// ── RBAC ──────────────────────────────────────────────────────────────────────
const ROLES = {
  ROLE_ADMIN:        'Administrator',
  ROLE_DOCC_SENIOR:  'DoCC Senior Officer',
  ROLE_DOCC_MEO:     'DoCC M&E Officer',
  ROLE_PROJ_MANAGER: 'Project Manager',
  ROLE_PROJ_STAFF:   'Project Staff',
};

const DEMO_USERS = [
  { id:1, username:'admin',   password:'admin123',  role:'ROLE_ADMIN',        name:'Alice Admin',   email:'admin@docc.gov.vu' },
  { id:2, username:'senior',  password:'senior123', role:'ROLE_DOCC_SENIOR',  name:'Bob Senior',    email:'senior@docc.gov.vu' },
  { id:3, username:'meo',     password:'meo123',    role:'ROLE_DOCC_MEO',     name:'Carol MEO',     email:'meo@docc.gov.vu' },
  { id:4, username:'manager', password:'mgr123',    role:'ROLE_PROJ_MANAGER', name:'David Manager', email:'manager@project.vu' },
  { id:5, username:'staff',   password:'staff123',  role:'ROLE_PROJ_STAFF',   name:'Eve Staff',     email:'staff@project.vu' },
];

const TAB_ACCESS = {
  ROLE_ADMIN:        ['dashboard','projects','datasets','analysis','reports','admin'],
  ROLE_DOCC_SENIOR:  ['dashboard','projects','datasets','analysis','reports'],
  ROLE_DOCC_MEO:     ['dashboard','projects','datasets','analysis','reports'],
  ROLE_PROJ_MANAGER: ['dashboard','projects','datasets','analysis','reports'],
  ROLE_PROJ_STAFF:   ['datasets','analysis'],
};

const NAV_ITEMS = [
  { key:'dashboard', path:'/dashboard', label:'Dashboard',    icon:'📊' },
  { key:'projects',  path:'/projects',  label:'Projects',     icon:'📁' },
  { key:'datasets',  path:'/datasets',  label:'Datasets',     icon:'🗄️' },
  { key:'analysis',  path:'/analysis',  label:'Analysis & GIS', icon:'🗺️' },
  { key:'reports',   path:'/reports',   label:'Reports',      icon:'📄' },
  { key:'admin',     path:'/admin',     label:'Admin',        icon:'⚙️' },
];

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [u, setU]         = useState('');
  const [p, setP]         = useState('');
  const [err, setErr]     = useState('');
  const [hints, setHints] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const user = DEMO_USERS.find(x => x.username === u && x.password === p);
    if (user) onLogin(user);
    else setErr('Invalid credentials — check demo hints below.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-900 via-green-800 to-emerald-700">
      <div className="bg-white rounded-2xl shadow-2xl p-12 w-96">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-700 to-emerald-500 flex items-center justify-center text-3xl mx-auto mb-4">🌿</div>
          <h1 className="text-xl font-bold text-green-900">DoCC M&amp;E Monitoring Platform</h1>
          <p className="text-sm text-gray-500 mt-1">Department of Climate Change · Vanuatu</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Username</label>
            <input value={u} onChange={e=>setU(e.target.value)}
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Enter username" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
            <input type="password" value={p} onChange={e=>setP(e.target.value)}
              className="w-full border border-green-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="Enter password" required />
          </div>
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
          <button type="submit"
            className="w-full bg-gradient-to-r from-green-700 to-emerald-500 text-white rounded-lg py-2.5 text-sm font-semibold hover:opacity-90 transition">
            Sign In
          </button>
        </form>
        <div className="mt-4 text-center">
          <button onClick={()=>setHints(!hints)}
            className="text-xs text-emerald-600 underline cursor-pointer">
            {hints ? 'Hide' : 'Show'} demo credentials
          </button>
          {hints && (
            <div className="mt-3 bg-green-50 rounded-lg p-3 text-left space-y-1">
              {DEMO_USERS.map(u => (
                <div key={u.id} className="text-xs text-gray-700">
                  <span className="font-semibold">{u.username}</span> / {u.password}
                  <span className="text-gray-400 ml-2">({ROLES[u.role]})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);

  if (!user) return <LoginScreen onLogin={setUser} />;

  const allowed     = TAB_ACCESS[user.role] || [];
  const visibleNav  = NAV_ITEMS.filter(n => allowed.includes(n.key));
  const defaultPath = visibleNav[0]?.path || '/datasets';
  const initials    = user.name.split(' ').map(n=>n[0]).join('').slice(0,2);

  return (
    <div className="flex h-screen overflow-hidden bg-green-50">
      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-gradient-to-b from-green-900 to-green-800 shadow-xl">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-green-700">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center text-lg flex-shrink-0">🌿</div>
            <div>
              <div className="text-white text-xs font-bold leading-tight">DoCC DMP</div>
              <div className="text-emerald-300 text-xs">M&amp;E Platform</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {visibleNav.map(item => (
            <NavLink key={item.key} to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border-l-2 ${
                  isActive
                    ? 'bg-white/15 text-white border-emerald-400'
                    : 'text-emerald-200 border-transparent hover:bg-white/10 hover:text-white'
                }`
              }>
              <span className="text-base">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-green-700">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">{initials}</div>
            <div className="overflow-hidden">
              <div className="text-white text-xs font-semibold truncate">{user.name}</div>
              <div className="text-emerald-300 text-xs truncate">{ROLES[user.role]}</div>
            </div>
          </div>
          <button onClick={()=>setUser(null)}
            className="w-full text-xs text-emerald-300 border border-green-700 rounded-md py-1 hover:bg-white/10 hover:text-white transition">
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to={defaultPath} replace />} />
          <Route path="/dashboard" element={allowed.includes('dashboard') ? <Dashboard user={user}/> : <Navigate to={defaultPath} replace />} />
          <Route path="/projects"  element={allowed.includes('projects')  ? <Projects  user={user}/> : <Navigate to={defaultPath} replace />} />
          <Route path="/datasets"  element={allowed.includes('datasets')  ? <Datasets  user={user}/> : <Navigate to={defaultPath} replace />} />
          <Route path="/analysis"  element={allowed.includes('analysis')  ? <Analysis  user={user}/> : <Navigate to={defaultPath} replace />} />
          <Route path="/reports"   element={allowed.includes('reports')   ? <Reports   user={user}/> : <Navigate to={defaultPath} replace />} />
          <Route path="/admin"     element={allowed.includes('admin')     ? <AdminPanel user={user}/> : <Navigate to={defaultPath} replace />} />
          <Route path="*"          element={<Navigate to={defaultPath} replace />} />
        </Routes>
      </main>
    </div>
  );
}
