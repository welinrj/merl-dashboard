import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useParams } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Target, Activity, ListChecks, Wallet, MapPin,
  AlertTriangle, FolderOpen, FileBarChart, Settings, LogOut, Menu,
  Eye, EyeOff, AlertCircle, ShieldCheck, Mail, Lock, ClipboardCheck,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import Overview from './pages/Overview';
import Dashboards from './pages/Dashboards';
import ProjectSetup from './pages/ProjectSetup';
import MerlReporting from './pages/MerlReporting';
import Reports from './pages/Reports';
import AdminPanel  from './pages/AdminPanel';
import ReviewApproval from './pages/ReviewApproval';
import ErrorBoundary from './components/ErrorBoundary';
import GlobalSearch from './components/GlobalSearch';
import NotificationBell from './components/NotificationBell';
import { DashboardFilterProvider, useDashboardFilters } from './lib/dashboardFilters';
import { supabase, toAppRole } from './supabaseClient';
import type { AppUser, UserRole, NavKey } from './types';

// Sidebar item shape (richer than the old NavItem: carries the header title).
interface SideItem {
  key: NavKey; path: string; label: string;
  Icon: React.ComponentType<{ size?: number | string }>;
  head: string; sub?: string;
}

// ── Environment ───────────────────────────────────────────────────────────────
// VITE_APP_ENV is set to "production" in the production build .env file.
// The "Staging" badge is shown only when NOT in production.
const IS_STAGING = import.meta.env.VITE_APP_ENV !== 'production';

// Base-aware asset URL so the coat of arms resolves under the GitHub Pages
// project path (/merl-dashboard/) as well as at the site root. HashRouter
// keeps the document at BASE_URL on every route, so this stays correct.
const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
// Login background. A short, muted, compressed climate/landscape clip provides
// the only cinematic moment in the app; drop it at public/login-bg.mp4 and it is
// used automatically. Until then (and as the poster / reduced-motion / mobile
// fallback) LOGIN_POSTER is shown over a solid navy backdrop, so the screen
// always reads as a credible secure government sign-in.
const LOGIN_VIDEO  = `${import.meta.env.BASE_URL}login-bg.mp4`;
const LOGIN_POSTER = `${import.meta.env.BASE_URL}vanuatu-login-bg.svg`;

// ── RBAC ──────────────────────────────────────────────────────────────────────
const ROLES: Record<UserRole, string> = {
  ROLE_ADMIN:        'System Administrator',
  ROLE_DOCC_MEO:     'DoCC M&E Officer',
  ROLE_PROJ_MANAGER: 'Project Manager / Project Focal Point',
  ROLE_DATA_ENTRY:   'Data Entry / Project Officer',
  ROLE_VIEWER:       'Viewer / Executive',
};

// ── Supabase Auth ─────────────────────────────────────────────────────────────
// Sign-in is email/password against Supabase Auth. Accounts are created by the
// administrator (who issues a password), and users sign in directly with those
// credentials — there is no second factor. The signed-in user's platform
// profile (name + contract role) comes from the current_profile() RPC
// (migration 0003), which resolves auth.uid() → merl.users.
async function loadProfile(): Promise<AppUser | null> {
  const { data, error } = await supabase.rpc('current_profile');
  if (error || !data || data.length === 0) return null;
  const p = data[0] as { id: string; email: string; full_name: string; role: string };
  return {
    id: p.id,
    username: p.email,
    role: toAppRole(p.role),
    name: p.full_name,
  };
}

// ── Sidebar navigation (matches the approved sample) ───────────────────────────
// Analytical lenses (Results/Indicators/Finances/Locations/Risks) open the
// tabbed analytics dashboard; Projects/Activities/Documents open the DoCC data
// pages; Overview is the executive dashboard.
const NAV_ITEMS: SideItem[] = [
  { key: 'overview',   path: '/dashboards',           label: 'Overview',             Icon: LayoutDashboard, head: 'MERL Project Portfolio Dashboard', sub: 'Monitoring, Evaluation, Reporting & Learning' },
  { key: 'projects',   path: '/project-setup',        label: 'Projects',             Icon: FolderKanban,    head: 'Project Setup' },
  { key: 'results',    path: '/analytics/results',    label: 'Results Framework',    Icon: Target,          head: 'Results Framework' },
  { key: 'indicators', path: '/analytics/indicators', label: 'Indicators',           Icon: Activity,        head: 'Indicators' },
  { key: 'activities', path: '/merl-reporting',       label: 'Activities & Workplan', Icon: ListChecks,     head: 'Activities & Workplan' },
  { key: 'finances',   path: '/analytics/financial',  label: 'Finances',             Icon: Wallet,          head: 'Finances' },
  { key: 'locations',  path: '/analytics/geographic', label: 'Locations',            Icon: MapPin,          head: 'Geographic Coverage' },
  { key: 'risks',      path: '/analytics/risks',      label: 'Risks & Issues',       Icon: AlertTriangle,   head: 'Risks & Issues' },
  { key: 'reports',    path: '/reports',              label: 'Reports',              Icon: FileBarChart,    head: 'Reports' },
  { key: 'review',     path: '/review',               label: 'Review & Approval',    Icon: ClipboardCheck,  head: 'Review & Approval' },
  { key: 'documents',  path: '/merl-reporting',       label: 'Documents',            Icon: FolderOpen,      head: 'Documents & Evidence' },
  { key: 'admin',      path: '/admin',                label: 'Administration',       Icon: Settings,        head: 'Administration' },
];

// Navigation by role (spec §18). Functions a role can't use are hidden.
const TAB_ACCESS: Record<UserRole, NavKey[]> = {
  // System Administrator — full portal incl. Administration
  ROLE_ADMIN:        ['overview', 'projects', 'results', 'indicators', 'activities', 'finances', 'locations', 'risks', 'reports', 'review', 'documents', 'admin'],
  // DoCC M&E Officer — portfolio-wide MERL + Review & Approval; no Administration
  ROLE_DOCC_MEO:     ['overview', 'projects', 'results', 'indicators', 'activities', 'finances', 'locations', 'risks', 'reports', 'review', 'documents'],
  // Project Manager — assigned projects only (route data is project-scoped by RLS)
  ROLE_PROJ_MANAGER: ['overview', 'projects', 'results', 'indicators', 'activities', 'finances', 'locations', 'risks', 'reports', 'documents'],
  // Data Entry / Project Officer — data entry for assigned projects; no approval/admin
  ROLE_DATA_ENTRY:   ['overview', 'projects', 'indicators', 'activities', 'locations', 'risks', 'documents'],
  // Viewer / Executive — read-only overview, projects, results and reports
  ROLE_VIEWER:       ['overview', 'projects', 'results', 'reports'],
};

// Which access key gates each real route.
const ROUTE_GATE: Record<string, NavKey> = {
  '/dashboards': 'overview', '/project-setup': 'projects', '/merl-reporting': 'activities',
  '/reports': 'reports', '/review': 'review', '/admin': 'admin',
};

// Map an /analytics/:lens segment to a Dashboards tab.
const LENS_TO_TAB: Record<string, string> = {
  results: 'results', indicators: 'results', financial: 'financial',
  geographic: 'geographic', risks: 'risks', portfolio: 'portfolio', reporting: 'reporting',
};

// ── Login screen ──────────────────────────────────────────────────────────────
interface LoginScreenProps {
  onLogin: (user: AppUser) => void;
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail]       = useState(() => { try { return localStorage.getItem('docc.email') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('docc.email') != null; } catch { return false; } });
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [loading, setLoading]   = useState(false);

  // Supabase Auth credential check — direct email/password sign-in.
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) {
        setError('Incorrect email or password.');
        return;
      }
      const profile = await loadProfile();
      if (!profile) {
        await supabase.auth.signOut();
        setError('No active platform profile is linked to this account. Contact the system administrator.');
        return;
      }
      // "Remember me" keeps the email prefilled on this device only (never the password).
      try {
        if (remember) localStorage.setItem('docc.email', email);
        else localStorage.removeItem('docc.email');
      } catch { /* storage unavailable — non-fatal */ }
      onLogin(profile);
    } finally {
      setLoading(false);
    }
  };

  // Forgot password — trigger a Supabase reset email. The response is intentionally
  // generic so it never reveals whether an account exists.
  const handleForgot = async () => {
    setError('');
    if (!email) { setError('Enter your email address first, then select “Forgot password”.'); return; }
    await supabase.auth.resetPasswordForEmail(email);
    setNotice('If an account exists for that email, a password reset link has been sent.');
  };

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div className="lg-root">
      <style>{`
        .lg-root{position:relative;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;font-family:var(--font-ui);background:var(--navy-900);color:#fff;overflow:hidden}
        .lg-flagbar{position:absolute;top:0;left:0;right:0;height:4px;z-index:20;background:linear-gradient(90deg,var(--red-600) 0 33.33%,var(--gold-500) 33.33% 66.66%,var(--green-600) 66.66% 100%)}
        /* Video fills the viewport; a solid navy sits behind it as the base so the
           screen is credible before the clip loads or when it is absent. */
        .lg-video{position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover}
        .lg-overlay{position:absolute;inset:0;z-index:1;background:rgba(11,31,58,.62)}
        .lg-content{position:relative;z-index:2;flex:1;display:flex;align-items:center;justify-content:center;gap:clamp(2rem,6vw,5rem);padding:2.5rem 1.5rem;flex-wrap:wrap}
        .lg-ident{max-width:34rem;color:#fff}
        .lg-ident__crest{width:64px;height:64px;margin-bottom:1.25rem}
        .lg-ident__crest img{width:100%;height:100%;object-fit:contain}
        .lg-ident__gov{font-size:.75rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.72)}
        .lg-ident__dept{font-size:1.05rem;font-weight:600;color:#fff;margin-top:.1rem}
        .lg-ident__title{font-family:var(--font-display);font-size:clamp(1.9rem,4vw,2.6rem);line-height:1.1;letter-spacing:-.02em;font-weight:700;color:#fff;margin:1.4rem 0 .6rem}
        .lg-ident__sub{font-size:1rem;line-height:1.55;color:rgba(255,255,255,.78);max-width:36ch;margin:0}
        .lg-card{width:100%;max-width:400px;background:var(--white);color:var(--text-1);border:1px solid rgba(15,23,42,.08);border-radius:8px;box-shadow:0 8px 28px rgba(8,15,30,.28);padding:2rem}
        .lg-card__mobile{display:none}
        .lg-h2{font-family:var(--font-display);font-size:1.4rem;font-weight:700;letter-spacing:-.01em;color:var(--text-1);margin:0 0 .3rem}
        .lg-lead{color:var(--text-2);font-size:.85rem;margin:0 0 1.5rem;line-height:1.5}
        .lg-ifield{position:relative}
        .lg-ifield>.lg-ficon{position:absolute;left:.8rem;top:50%;transform:translateY(-50%);color:var(--text-3);pointer-events:none;display:flex}
        .lg-input{padding-left:2.4rem !important}
        .lg-eye{position:absolute;right:.35rem;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:none;border:none;cursor:pointer;color:var(--text-3);border-radius:6px}
        .lg-eye:hover{color:var(--text-2);background:var(--surface-1)}
        .lg-optionrow{display:flex;align-items:center;justify-content:space-between;gap:.5rem;font-size:.8rem}
        .lg-remember{display:inline-flex;align-items:center;gap:.4rem;color:var(--text-2);cursor:pointer}
        .lg-remember input{width:15px;height:15px;accent-color:var(--navy-active)}
        .lg-forgot{background:none;border:none;padding:0;cursor:pointer;color:var(--navy-active);font-size:.8rem;font-weight:600}
        .lg-forgot:hover{text-decoration:underline}
        .lg-alert{display:flex;align-items:flex-start;gap:.5rem;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:.65rem .8rem;color:#991b1b;font-size:.8rem;line-height:1.4}
        .lg-info{display:flex;align-items:flex-start;gap:.5rem;background:var(--surface-1);border:1px solid var(--border);border-radius:6px;padding:.65rem .8rem;color:var(--text-2);font-size:.8rem;line-height:1.4}
        .lg-submit{width:100%;padding:.75rem;font-size:.9rem;font-weight:600;border-radius:6px;border:none;cursor:pointer;color:#fff;background:var(--navy-active);transition:background .18s ease}
        .lg-submit:hover:not(:disabled){background:#2a61d8}
        .lg-submit:disabled{opacity:.6;cursor:default}
        .lg-foot{position:relative;z-index:2;text-align:center;padding:1rem;font-size:.75rem;color:rgba(255,255,255,.7)}
        .lg-foot a{color:rgba(255,255,255,.85);text-decoration:none;margin:0 .4rem}
        .lg-foot a:hover{text-decoration:underline}
        @media (max-width:820px){
          .lg-ident{display:none}
          .lg-card__mobile{display:flex;align-items:center;gap:.7rem;margin-bottom:1.5rem;padding-bottom:1.2rem;border-bottom:1px solid var(--border)}
          .lg-card__mobile img{width:40px;height:40px;object-fit:contain;flex-shrink:0}
        }
      `}</style>
      <div className="lg-flagbar" />

      {/* Cinematic climate video background (login only). Falls back to the poster
          over solid navy; not autoplayed under reduced-motion. */}
      <video className="lg-video" poster={LOGIN_POSTER}
        autoPlay={!reduceMotion} muted loop playsInline preload="metadata"
        aria-hidden="true" tabIndex={-1}>
        <source src={LOGIN_VIDEO} type="video/mp4" />
      </video>
      <div className="lg-overlay" />

      <div className="lg-content">
        {/* Identity block */}
        <div className="lg-ident">
          <div className="lg-ident__crest"><img src={CREST} alt="Coat of arms of the Republic of Vanuatu" /></div>
          <div className="lg-ident__gov">Government of Vanuatu</div>
          <div className="lg-ident__dept">Department of Climate Change</div>
          <h1 className="lg-ident__title">DoCC MERL Dashboard</h1>
          <p className="lg-ident__sub">Monitoring, Evaluation, Reporting &amp; Learning for Climate Action in Vanuatu</p>
        </div>

        {/* Sign-in card */}
        <div className="lg-card">
          <div className="lg-card__mobile">
            <img src={CREST} alt="Coat of arms of the Republic of Vanuatu" />
            <div>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Government of Vanuatu</div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)' }}>Department of Climate Change</div>
            </div>
          </div>

          <h2 className="lg-h2">Sign in</h2>
          <p className="lg-lead">Use your authorised DoCC MERL account.</p>

          <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="field-label" htmlFor="lg-email">Email</label>
              <div className="lg-ifield">
                <span className="lg-ficon"><Mail size={16} /></span>
                <input id="lg-email" type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  className="field-input lg-input" placeholder="you@example.gov.vu"
                  autoComplete="username" required />
              </div>
            </div>
            <div>
              <label className="field-label" htmlFor="lg-pass">Password</label>
              <div className="lg-ifield">
                <span className="lg-ficon"><Lock size={16} /></span>
                <input id="lg-pass" type={showPass ? 'text' : 'password'}
                  value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="field-input lg-input" style={{ paddingRight: '2.6rem' }}
                  placeholder="Enter your password" autoComplete="current-password" required />
                <button type="button" className="lg-eye"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPass(!showPass)}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="lg-optionrow">
              <label className="lg-remember">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
                Remember me
              </label>
              <button type="button" className="lg-forgot" onClick={handleForgot}>Forgot password</button>
            </div>

            {error && (
              <div className="lg-alert" role="alert">
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}
              </div>
            )}
            {notice && !error && (
              <div className="lg-info" role="status">
                <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--green-700)' }} />{notice}
              </div>
            )}

            <button type="submit" className="lg-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>

      <footer className="lg-foot">
        Department of Climate Change · Government of Vanuatu
      </footer>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);   // mobile nav dropdown
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { i18n } = useTranslation();
  const location = useLocation();

  // ── Session restore ────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const profile = await loadProfile();
        if (profile) setUser(profile);
      }
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (booting) return null;
  if (!user) return <LoginScreen onLogin={setUser} />;

  const allowed    = TAB_ACCESS[user.role] ?? [];
  const visibleNav = NAV_ITEMS.filter(n => allowed.includes(n.key));
  const defaultPath = visibleNav[0]?.path ?? '/dashboards';
  const initials   = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const activeItem = NAV_ITEMS.find(n => n.path === location.pathname)
    ?? (location.pathname.startsWith('/analytics') ? NAV_ITEMS.find(n => n.key === 'results') : undefined)
    ?? NAV_ITEMS.find(n => n.key === 'overview')!;
  const gate = (path: string) => allowed.includes(ROUTE_GATE[path]);

  return (
    <DashboardFilterProvider>
    <div className="dsh">
      {sidebarOpen && <div className="dsh-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* ── Sidebar ── */}
      <aside className={`dsh-side${sidebarOpen ? ' open' : ''}`}>
        <div className="dsh-brand">
          <img src={CREST} alt="Coat of arms of the Republic of Vanuatu" />
          <div className="dsh-brand-dept">Department of<br />Climate Change (DoCC)</div>
          <div className="dsh-brand-title">MERL Dashboard</div>
        </div>
        <nav className="dsh-nav" aria-label="Primary">
          {visibleNav.map(({ key, path, label, Icon }) => (
            <NavLink key={key} to={path} onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </nav>
        <SidebarQuickFilters />
      </aside>

      {/* ── Main column ── */}
      <div className="dsh-main">
        <header className="dsh-head">
          <button className="dsh-hamburger" aria-label="Toggle menu" onClick={() => setSidebarOpen(o => !o)}><Menu size={20} /></button>
          <div style={{ minWidth: 0 }}>
            <div className="dsh-head-title">{activeItem.head}</div>
            {activeItem.sub && <div className="dsh-head-sub">{activeItem.sub}</div>}
          </div>
          <div className="dsh-head-actions">
            <GlobalSearch />
            {IS_STAGING && (
              <span style={{ fontSize: '0.72rem', color: 'var(--green-700)', padding: '0.25rem 0.6rem', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 9999, fontWeight: 700 }}>Staging</span>
            )}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {(['en', 'fr'] as const).map(lng => (
                <button key={lng} onClick={() => i18n.changeLanguage(lng)} aria-label={`Language ${lng.toUpperCase()}`}
                  style={{ padding: '0.34rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                    background: i18n.language === lng ? 'var(--green-600)' : 'var(--white)', color: i18n.language === lng ? '#fff' : 'var(--text-3)' }}>
                  {lng.toUpperCase()}
                </button>
              ))}
            </div>
            <NotificationBell user={user} />
            <div style={{ position: 'relative' }}>
              <button className="dsh-user" onClick={() => setUserMenuOpen(o => !o)} aria-label="Account menu">
                <span className="dsh-avatar">{initials}</span>
                <span className="dsh-user-meta">
                  <span className="dsh-user-name" style={{ display: 'block' }}>{user.name}</span>
                  <span className="dsh-user-role">{ROLES[user.role]}</span>
                </span>
              </button>
              {userMenuOpen && (
                <>
                  <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, width: 220, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>{ROLES[user.role]}</div>
                    </div>
                    <button onClick={() => { setUserMenuOpen(false); void supabase.auth.signOut(); setUser(null); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)', fontSize: '0.8rem', fontWeight: 600 }}>
                      <LogOut size={15} /> Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <div className="dsh-scroll scrollbar-thin">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to={defaultPath} replace />} />
              <Route path="/dashboards" element={gate('/dashboards') ? <Overview user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/analytics/:lens" element={allowed.includes('overview') ? <AnalyticsRoute /> : <Navigate to={defaultPath} replace />} />
              <Route path="/project-setup" element={gate('/project-setup') ? <ProjectSetup user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/merl-reporting" element={gate('/merl-reporting') ? <MerlReporting user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/reports" element={gate('/reports') ? <Reports /> : <Navigate to={defaultPath} replace />} />
              <Route path="/review" element={gate('/review') ? <ReviewApproval user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/admin" element={gate('/admin') ? <AdminPanel user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="*" element={<Navigate to={defaultPath} replace />} />
            </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </div>
    </DashboardFilterProvider>
  );
}

// Sidebar "Filter Quick Links" — bound to the shared dashboard filter context.
function SidebarQuickFilters() {
  const { filters, patch, reset } = useDashboardFilters();
  const nowY = new Date().getFullYear();
  const years = [nowY + 1, nowY, nowY - 1, nowY - 2, nowY - 3];
  const provinces = ['TORBA', 'SANMA', 'PENAMA', 'MALAMPA', 'SHEFA', 'TAFEA'];
  const themes = ['Climate Change Adaptation', 'Climate Change Mitigation', 'Loss and Damage', 'Community Resilience Building', 'Disaster Risk Reduction', 'Nature-based Solutions', 'Other'];
  const partners = ['Government of Vanuatu', 'MFAT', 'GCF', 'GEF', 'UNDP', 'SPC', 'World Bank', 'ADB', 'Other'];
  return (
    <div className="dsh-qf">
      <div className="dsh-qf-h">Filter Quick Links</div>
      <label htmlFor="qf-fy">Financial Year</label>
      <select id="qf-fy" value={filters.fy} onChange={e => patch({ fy: e.target.value })}>
        <option value="">All</option>
        {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
      </select>
      <label htmlFor="qf-partner">Funding Partner</label>
      <select id="qf-partner" value={filters.partner} onChange={e => patch({ partner: e.target.value })}>
        <option value="">All</option>
        {partners.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <label htmlFor="qf-theme">Theme / Sector</label>
      <select id="qf-theme" value={filters.theme} onChange={e => patch({ theme: e.target.value })}>
        <option value="">All</option>
        {themes.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <label htmlFor="qf-prov">Province</label>
      <select id="qf-prov" value={filters.province} onChange={e => patch({ province: e.target.value })}>
        <option value="">All</option>
        {provinces.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <button className="dsh-qf-clear" onClick={reset}>Clear Filters</button>
    </div>
  );
}

// /analytics/:lens → the tabbed analytics dashboard with the tab preselected.
function AnalyticsRoute() {
  const { lens } = useParams();
  return <Dashboards initialTab={LENS_TO_TAB[lens ?? ''] ?? 'portfolio'} />;
}
