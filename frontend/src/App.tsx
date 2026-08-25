import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation, useParams } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Target, Activity, ListChecks, Wallet, MapPin,
  AlertTriangle, FolderOpen, FileBarChart, Settings, LogOut, Menu,
  Eye, EyeOff, AlertCircle, ShieldCheck, Mail, Lock, ClipboardCheck,
} from './components/ui/icons';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from './i18n';

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
import { DashboardFilterProvider } from './lib/dashboardFilters';
import { supabase, toAppRole } from './supabaseClient';
import type { AppUser, UserRole, NavKey } from './types';

// Sidebar item shape (richer than the old NavItem: carries the header title).
interface SideItem {
  // `key` doubles as the i18n key: nav.<key> is the sidebar label and
  // head.<key> the page title, so a new entry cannot be added without its
  // translations existing.
  key: NavKey; path: string;
  // Optional query string. Two entries may share a pathname and be told apart
  // by this — Documents & Evidence opens MERL Reporting on its Evidence module.
  search?: string;
  Icon: React.ComponentType<{ size?: number | string }>;
  // Set when the page carries a subtitle under its title (head.<key>Sub).
  hasSub?: boolean;
}

// ── Environment ───────────────────────────────────────────────────────────────
// VITE_APP_ENV is set to "production" in the production build .env file.
// The "Staging" badge is shown only when NOT in production.
const IS_STAGING = import.meta.env.VITE_APP_ENV !== 'production';

// Base-aware asset URL so the coat of arms resolves under the GitHub Pages
// project path (/merl-dashboard/) as well as at the site root. HashRouter
// keeps the document at BASE_URL on every route, so this stays correct.
const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
// Login visuals (login page only). The Tanna, Vanuatu photograph is the main
// image on the right; vu.svg is the accurate island silhouette shown over the
// white-to-photo transition (recoloured teal via CSS mask so the supplied SVG
// paths are used unmodified). Drop the two files in public/ and they are used
// automatically:
//   public/login-tanna.jpg  (or .webp — update the path below if you convert it)
//   public/vu.svg
const TANNA_PHOTO = `${import.meta.env.BASE_URL}login-tanna.jpg`;
const TANNA_WEBP  = `${import.meta.env.BASE_URL}login-tanna.webp`;
const VU_MAP      = `${import.meta.env.BASE_URL}vu.svg`;

// ── RBAC ──────────────────────────────────────────────────────────────────────


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

// ── Sidebar navigation ────────────────────────────────────────────────────────
// Every entry is named for what it actually opens, and each opens somewhere
// distinct. Three used not to:
//
//   · "Indicators" and "Results Framework" both resolved to the same Dashboards
//     tab (LENS_TO_TAB maps indicators -> results), so one is now the single
//     "Results & Indicators" entry. /analytics/indicators still resolves, so
//     existing bookmarks keep working.
//   · "Activities & Workplan" opened the periodic reporting workspace, which
//     has no activities module at all — activities are Form 5, in Project
//     Setup. It is now "MERL Reporting", which is what it is.
//   · "Documents" pointed at the same route as the entry above it and landed on
//     Indicator Progress. It now deep-links to the Evidence module.
//
// The analytics entries are read-only lenses; the records behind them are
// entered in Project Setup and MERL Reporting.
const NAV_ITEMS: SideItem[] = [
  { key: 'overview', path: '/dashboards', Icon: LayoutDashboard, hasSub: true },
  { key: 'projects', path: '/project-setup', Icon: FolderKanban },
  // One analytics entry per Dashboards tab. These are read-only lenses on the
  // portfolio — the data behind them is entered in Project Setup and MERL
  // Reporting — so they are named for the analysis, not the record they show.
  { key: 'results', path: '/analytics/results', Icon: Target },
  { key: 'finances', path: '/analytics/financial', Icon: Wallet },
  { key: 'locations', path: '/analytics/geographic', Icon: MapPin },
  { key: 'risks', path: '/analytics/risks', Icon: AlertTriangle },
  // The periodic reporting workspace: Forms 4, 6, 8, 9, 10 and 12 against a
  // reporting period. Documents & Evidence is the same workspace opened on its
  // Evidence module rather than a second, identical destination.
  { key: 'activities', path: '/merl-reporting', Icon: ListChecks },
  { key: 'documents', path: '/merl-reporting', search: '?module=evidence', Icon: FolderOpen },
  { key: 'reports', path: '/reports', Icon: FileBarChart },
  { key: 'review', path: '/review', Icon: ClipboardCheck },
  { key: 'admin', path: '/admin', Icon: Settings },
];

// Navigation by role (spec §18). Functions a role can't use are hidden.
const TAB_ACCESS: Record<UserRole, NavKey[]> = {
  // System Administrator — full portal incl. Administration
  ROLE_ADMIN:        ['overview', 'projects', 'results', 'activities', 'finances', 'locations', 'risks', 'reports', 'review', 'documents', 'admin'],
  // DoCC M&E Officer — portfolio-wide MERL + Review & Approval; no Administration
  ROLE_DOCC_MEO:     ['overview', 'projects', 'results', 'activities', 'finances', 'locations', 'risks', 'reports', 'review', 'documents'],
  // Project Manager — assigned projects only (route data is project-scoped by RLS)
  ROLE_PROJ_MANAGER: ['overview', 'projects', 'results', 'activities', 'finances', 'locations', 'risks', 'reports', 'documents'],
  // Data Entry / Project Officer — data entry for assigned projects; no approval/admin
  ROLE_DATA_ENTRY:   ['overview', 'projects', 'results', 'activities', 'locations', 'risks', 'documents'],
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
  const { t, i18n } = useTranslation();
  const [email, setEmail]       = useState(() => { try { return localStorage.getItem('docc.email') || ''; } catch { return ''; } });
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(() => { try { return localStorage.getItem('docc.email') != null; } catch { return false; } });
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Supabase Auth credential check — direct email/password sign-in. (Unchanged.)
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) {
        setError(t('login.badCredentials'));
        return;
      }
      const profile = await loadProfile();
      if (!profile) {
        await supabase.auth.signOut();
        setError(t('login.noProfile'));
        return;
      }
      // "Keep me signed in" prefills the email on this device only (never the password).
      try {
        if (remember) localStorage.setItem('docc.email', email);
        else localStorage.removeItem('docc.email');
      } catch { /* storage unavailable — non-fatal */ }
      onLogin(profile);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg2-root">
      <style>{`
        .lg2-root{
          --nv:#08233C; --tl:#008C88; --tld:#00736F; --tx:#172B3A; --mut:#65758A; --bd:#D7DEE7;
          position:relative; min-height:100vh; min-height:100dvh; height:100dvh; display:flex;
          font-family:var(--font-ui); background:#fff; color:var(--tx); overflow:hidden;
        }
        /* LEFT — white login area (narrower; content anchored upper/middle-left) */
        .lg2-left{ position:relative; flex:0 0 37%; max-width:37%; background:#fff; display:flex;
          flex-direction:column; justify-content:flex-start;
          padding:clamp(2.4rem,6vh,3.4rem) clamp(2rem,3.2vw,4rem) 5.5rem; z-index:3; }
        .lg2-inner{ width:100%; max-width:420px; }
        /* EN/FR switch — the portal is used in both official languages, so the
           choice has to be reachable before anyone signs in. */
        .lg2-lang{ display:flex; justify-content:flex-end; gap:.25rem; margin-bottom:.9rem; }
        .lg2-lang button{ min-width:42px; min-height:32px; padding:.3rem .55rem; font:inherit;
          font-size:.72rem; font-weight:700; border:1px solid var(--bd); border-radius:6px;
          background:#fff; color:var(--mut); cursor:pointer; }
        .lg2-lang button[aria-pressed="true"]{ background:var(--tl); border-color:var(--tl); color:#fff; }
        .lg2-brand{ display:flex; align-items:center; gap:.85rem; margin-bottom:clamp(1.4rem,4.5vh,2.5rem); }
        .lg2-crest{ width:60px; height:60px; object-fit:contain; flex-shrink:0; }
        .lg2-brand-country{ font-size:1.05rem; font-weight:800; letter-spacing:.02em; color:var(--nv); line-height:1.1; }
        .lg2-brand-dept{ font-size:.88rem; font-weight:600; color:var(--tx); margin-top:.15rem; }
        .lg2-brand-gov{ font-size:.76rem; color:var(--mut); margin-top:.05rem; }
        .lg2-title{ font-family:var(--font-display); font-size:clamp(48px,4.2vw,64px); font-weight:800;
          letter-spacing:-.02em; color:var(--nv); margin:0; line-height:1; }
        .lg2-underline{ width:72px; height:4px; border-radius:2px; background:var(--tl); margin:clamp(.8rem,1.6vh,1.1rem) 0; }
        .lg2-descriptor{ display:flex; align-items:center; gap:.55rem; flex-wrap:nowrap; white-space:nowrap;
          font-size:clamp(.82rem,1vw,.92rem); font-weight:600; color:var(--tx); margin-bottom:clamp(1.2rem,3.4vh,2rem); }
        .lg2-dot{ width:5px; height:5px; border-radius:50%; background:var(--tl); display:inline-block; flex-shrink:0; }
        .lg2-signin{ font-family:var(--font-display); font-size:1.02rem; font-weight:700; color:var(--tx); margin:0 0 clamp(.8rem,1.6vh,1.05rem); }
        .lg2-form{ display:flex; flex-direction:column; gap:clamp(.7rem,1.4vh,.95rem); }
        .lg2-field{ position:relative; }
        .lg2-ficon{ position:absolute; left:.9rem; top:50%; transform:translateY(-50%); color:var(--mut); display:flex; pointer-events:none; }
        .lg2-input{ width:100%; height:58px; padding:0 2.9rem 0 2.9rem; border:1px solid var(--bd); border-radius:9px;
          font-size:.95rem; font-family:var(--font-ui); color:var(--tx); background:#fff; outline:none;
          transition:border-color .15s, box-shadow .15s; }
        .lg2-input::placeholder{ color:var(--mut); }
        .lg2-input:hover{ border-color:#c2ccd8; }
        .lg2-input:focus{ border-color:var(--tl); box-shadow:0 0 0 3px rgba(0,140,136,.10); }
        .lg2-eye{ position:absolute; right:.6rem; top:50%; transform:translateY(-50%); width:34px; height:34px;
          display:flex; align-items:center; justify-content:center; background:none; border:none; cursor:pointer;
          color:var(--mut); border-radius:6px; }
        .lg2-eye:hover{ color:var(--tx); }
        .lg2-keep{ display:inline-flex; align-items:center; gap:.5rem; font-size:.88rem; color:var(--tx); cursor:pointer; user-select:none; }
        .lg2-keep input{ width:16px; height:16px; accent-color:var(--tl); }
        .lg2-alert{ display:flex; align-items:flex-start; gap:.5rem; background:#fef2f2; border:1px solid #fca5a5;
          border-radius:8px; padding:.65rem .8rem; color:#991b1b; font-size:.83rem; line-height:1.4; }
        .lg2-submit{ width:100%; height:56px; margin-top:clamp(.2rem,.8vh,.4rem); border:none; border-radius:9px; cursor:pointer;
          background:var(--tl); color:#fff; font-size:1rem; font-weight:700; font-family:var(--font-ui);
          transition:background .15s; }
        .lg2-submit:hover:not(:disabled){ background:var(--tld); }
        .lg2-submit:disabled{ opacity:.65; cursor:default; }
        .lg2-secure{ display:flex; align-items:center; gap:.5rem; margin-top:24px; font-size:.85rem; color:var(--nv); }
        .lg2-secure svg{ color:var(--tl); flex-shrink:0; }
        .lg2-foot{ position:absolute; left:clamp(2rem,3.2vw,4rem); bottom:clamp(20px,3vh,28px); margin:0;
          font-size:.75rem; color:var(--mut); line-height:1.5; }
        .lg2-attr{ margin-top:.4rem; font-size:.66rem; color:#9aa7b5; max-width:34ch; }
        .sr-only{ position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }

        /* RIGHT — Tanna photograph (more visible; crop tuned) */
        .lg2-photo{ position:relative; flex:1 1 63%; height:100%;
          background-color:#3a3632; background-position:55% center; background-size:cover; background-repeat:no-repeat;
          background-image:url("${TANNA_PHOTO}");
          background-image:-webkit-image-set(url("${TANNA_WEBP}") type("image/webp"), url("${TANNA_PHOTO}") type("image/jpeg"));
          background-image:image-set(url("${TANNA_WEBP}") type("image/webp"), url("${TANNA_PHOTO}") type("image/jpeg")); }
        /* soft, shorter white-to-photo transition — strongest only near the seam */
        .lg2-fade{ position:absolute; inset:0; pointer-events:none; z-index:2; background:linear-gradient(
          to right, rgba(255,255,255,.99) 0%, rgba(255,255,255,.92) 7%, rgba(255,255,255,.60) 16%,
          rgba(255,255,255,.20) 26%, rgba(255,255,255,0) 36%); }
        /* subtle darkening at the bottom-right only, for tagline readability */
        .lg2-photo::after{ content:""; position:absolute; inset:0; z-index:1; pointer-events:none;
          background:linear-gradient(to top left, rgba(0,0,0,.30) 0%, rgba(0,0,0,0) 38%); }
        .lg2-tagline{ position:absolute; right:clamp(40px,5vw,85px); bottom:clamp(38px,6vh,70px); z-index:3;
          display:flex; flex-direction:column; gap:.12rem; padding-left:1rem; border-left:3px solid var(--tl); color:#fff;
          font-size:clamp(1rem,1.5vw,1.4rem); font-weight:600; line-height:1.3; text-shadow:0 1px 6px rgba(0,0,0,.4); }

        /* Vanuatu island silhouette (supplied vu.svg, recoloured teal via mask so its
           paths are used unmodified). Moved right into the transition, taller, subtler.
           Rings sit behind the fade so they dissolve over the white area. */
        .lg2-map{ position:absolute; left:-2%; top:8vh; height:78vh; max-height:800px; width:42%; z-index:4; opacity:.72;
          -webkit-mask:url("${VU_MAP}") no-repeat center/contain; mask:url("${VU_MAP}") no-repeat center/contain;
          background-color:#0B8B87; }
        .lg2-rings{ position:absolute; left:16%; top:46%; z-index:1; pointer-events:none; }
        .lg2-rings span{ position:absolute; border:1px solid rgba(255,255,255,.28); border-radius:50%;
          left:50%; top:50%; transform:translate(-50%,-50%); }
        .lg2-rings span:nth-child(1){ width:260px; height:260px; }
        .lg2-rings span:nth-child(2){ width:460px; height:460px; border-color:rgba(255,255,255,.22); }
        .lg2-rings span:nth-child(3){ width:660px; height:660px; border-color:rgba(255,255,255,.16); }
        .lg2-rings span:nth-child(4){ width:860px; height:860px; border-color:rgba(255,255,255,.12); }

        /* Landscape tablet / iPad — keep the desktop composition but tighten scale
           so the whole page fits one viewport (no clipped footer/tagline). */
        @media (min-width:900px) and (max-width:1200px) and (orientation:landscape){
          .lg2-left{ flex-basis:42%; max-width:42%; padding:clamp(1.6rem,4vh,2.4rem) 2.2rem 4.75rem; }
          .lg2-inner{ max-width:390px; }
          .lg2-title{ font-size:clamp(40px,4vw,52px); }
          .lg2-brand{ margin-bottom:clamp(1rem,3vh,1.6rem); }
          .lg2-crest{ width:52px; height:52px; }
          .lg2-input{ height:52px; }
          .lg2-submit{ height:52px; }
          .lg2-secure{ margin-top:18px; }
          .lg2-map{ height:70vh; left:-4%; width:44%; }
        }
        /* Portrait tablet */
        @media (max-width:1100px) and (min-width:821px){
          .lg2-left{ flex-basis:42%; max-width:42%; }
          .lg2-map{ left:-4%; width:44%; opacity:.7; }
          .lg2-rings span:nth-child(4){ display:none; }
        }
        /* Mobile — stack; allow the page to scroll (no fixed viewport clipping).
           Map + rings stay inside the short photo header so they never touch the form. */
        @media (max-width:820px){
          .lg2-root{ flex-direction:column; height:auto; min-height:100dvh; overflow:auto; }
          .lg2-left{ flex:1 1 auto; max-width:100%; padding:2rem 1.4rem 2.5rem; }
          .lg2-inner{ max-width:460px; margin:0 auto; }
          .lg2-descriptor{ flex-wrap:wrap; white-space:normal; }
          .lg2-foot{ position:static; margin-top:1.75rem; }
          .lg2-photo{ flex:0 0 auto; height:240px; order:-1; }
          .lg2-fade{ background:linear-gradient(to bottom, rgba(255,255,255,0) 52%, rgba(255,255,255,.88) 86%, #fff 100%); }
          .lg2-map{ left:auto; right:8%; top:8%; height:76%; max-height:none; width:30%; opacity:.8; }
          .lg2-rings{ left:auto; right:16%; top:42%; }
          .lg2-rings span:nth-child(3),.lg2-rings span:nth-child(4){ display:none; }
          .lg2-tagline{ right:1.2rem; bottom:1rem; font-size:1rem; }
        }
        @media (max-width:480px){
          .lg2-photo{ height:200px; }
          .lg2-tagline{ display:none; }
        }
      `}</style>

      {/* LEFT — white login content */}
      <div className="lg2-left">
        <div className="lg2-inner">
          <div className="lg2-lang" role="group" aria-label={t('login.language')}>
            {LANGUAGES.map(({ code, label, name }) => (
              <button key={code} type="button" lang={code} title={name} aria-label={name}
                aria-pressed={i18n.resolvedLanguage === code}
                onClick={() => void i18n.changeLanguage(code)}>
                {label}
              </button>
            ))}
          </div>
          <div className="lg2-brand">
            <img className="lg2-crest" src={CREST} alt={t('login.crestAlt')} />
            <div>
              <div className="lg2-brand-country">{t('login.country')}</div>
              <div className="lg2-brand-dept">{t('login.department')}</div>
              <div className="lg2-brand-gov">{t('login.government')}</div>
            </div>
          </div>

          <h1 className="lg2-title">{t('login.portal')}</h1>
          <div className="lg2-underline" />
          <div className="lg2-descriptor">
            <span>{t('login.monitoring')}</span><i className="lg2-dot" aria-hidden="true" />
            <span>{t('login.evaluation')}</span><i className="lg2-dot" aria-hidden="true" />
            <span>{t('login.reporting')}</span><i className="lg2-dot" aria-hidden="true" />
            <span>{t('login.learning')}</span>
          </div>

          <h2 className="lg2-signin">{t('login.signInTitle')}</h2>

          <form className="lg2-form" onSubmit={handleCredentials}>
            <div className="lg2-field">
              <label htmlFor="lg-email" className="sr-only">{t('login.email')}</label>
              <span className="lg2-ficon" aria-hidden="true"><Mail size={18} /></span>
              <input id="lg-email" type="email" value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                className="lg2-input" placeholder={t('login.email')} autoComplete="username" required />
            </div>
            <div className="lg2-field">
              <label htmlFor="lg-pass" className="sr-only">{t('login.password')}</label>
              <span className="lg2-ficon" aria-hidden="true"><Lock size={18} /></span>
              <input id="lg-pass" type={showPass ? 'text' : 'password'} value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                className="lg2-input" placeholder={t('login.password')} autoComplete="current-password" required />
              <button type="button" className="lg2-eye"
                aria-label={showPass ? t('login.hidePass') : t('login.showPass')}
                onClick={() => setShowPass(!showPass)}>
                {showPass ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>

            <label className="lg2-keep">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
              {t('login.keepSignedIn')}
            </label>

            {error && (
              <div className="lg2-alert" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />{error}
              </div>
            )}

            <button type="submit" className="lg2-submit" disabled={loading}>
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>

          <div className="lg2-secure">
            <ShieldCheck size={16} aria-hidden="true" /> {t('login.secure')}
          </div>

          <footer className="lg2-foot">
            <div>{t('login.copyright')}</div>
            <div>{t('login.rights')}</div>
            <div className="lg2-attr">{t('login.photoCredit')}</div>
          </footer>
        </div>
      </div>

      {/* RIGHT — Tanna, Vanuatu photograph */}
      <div className="lg2-photo" role="img" aria-label={t('login.photoAlt')}>
        <div className="lg2-fade" aria-hidden="true" />
        {/* Decorative rings + Vanuatu island silhouette over the transition */}
        <div className="lg2-rings" aria-hidden="true"><span /><span /><span /><span /></div>
        <div className="lg2-map" aria-hidden="true" />
        <div className="lg2-tagline">
          <span>{t('login.fund')}</span>
          <span>{t('login.programme')}</span>
        </div>
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);   // mobile nav dropdown
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { t, i18n } = useTranslation();
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
  // Match the query string too: Documents & Evidence and MERL Reporting share a
  // pathname and are distinguished only by ?module=.
  const activeItem = NAV_ITEMS.find(n => n.path === location.pathname && (n.search ?? '') === location.search)
    ?? NAV_ITEMS.find(n => n.path === location.pathname && !n.search)
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
          <img src={CREST} alt={t('login.crestAlt')} />
          <div className="dsh-brand-dept">{t('shell.department')}</div>
          <div className="dsh-brand-title">{t('shell.productName')}</div>
        </div>
        <nav className="dsh-nav" aria-label={t('shell.primaryNav')}>
          {visibleNav.map(({ key, path, search, Icon }) => (
            <NavLink key={key} to={{ pathname: path, search: search ?? '' }}
              onClick={() => setSidebarOpen(false)}
              className={key === activeItem.key ? 'active' : ''}>
              <Icon size={16} aria-hidden="true" />{t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ── Main column ── */}
      <div className="dsh-main">
        <header className="dsh-head">
          <button className="dsh-hamburger" aria-label={t('shell.toggleMenu')} onClick={() => setSidebarOpen(o => !o)}><Menu size={18} aria-hidden="true" /></button>
          <div style={{ minWidth: 0 }}>
            <div className="dsh-head-title">{t(`head.${activeItem.key}`)}</div>
            {activeItem.hasSub && <div className="dsh-head-sub">{t(`head.${activeItem.key}Sub`)}</div>}
          </div>
          <div className="dsh-head-actions">
            <GlobalSearch />
            {IS_STAGING && (
              <span style={{ fontSize: '0.72rem', color: 'var(--green-700)', padding: '0.25rem 0.6rem', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 9999, fontWeight: 700 }}>{t('shell.staging')}</span>
            )}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {LANGUAGES.map(({ code, label, name }) => (
                <button key={code} onClick={() => void i18n.changeLanguage(code)}
                  lang={code} aria-label={name} title={name}
                  aria-pressed={i18n.resolvedLanguage === code}
                  style={{ padding: '0.34rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                    background: i18n.resolvedLanguage === code ? 'var(--green-600)' : 'var(--white)',
                    color: i18n.resolvedLanguage === code ? '#fff' : 'var(--text-3)' }}>
                  {label}
                </button>
              ))}
            </div>
            <NotificationBell user={user} />
            <div style={{ position: 'relative' }}>
              <button className="dsh-user" onClick={() => setUserMenuOpen(o => !o)} aria-label={t('shell.accountMenu')}>
                <span className="dsh-avatar">{initials}</span>
                <span className="dsh-user-meta">
                  <span className="dsh-user-name" style={{ display: 'block' }}>{user.name}</span>
                  <span className="dsh-user-role">{t(`roles.${user.role}`)}</span>
                </span>
              </button>
              {userMenuOpen && (
                <>
                  <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, width: 220, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                    <div style={{ padding: '0.8rem 1rem', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: 2 }}>{t(`roles.${user.role}`)}</div>
                    </div>
                    <button onClick={() => { setUserMenuOpen(false); void supabase.auth.signOut(); setUser(null); }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 1rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-600)', fontSize: '0.8rem', fontWeight: 600 }}>
                      <LogOut size={16} aria-hidden="true" /> {t('shell.signOut')}
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

// /analytics/:lens → the tabbed analytics dashboard with the tab preselected.
function AnalyticsRoute() {
  const { lens } = useParams();
  return <Dashboards initialTab={LENS_TO_TAB[lens ?? ''] ?? 'portfolio'} />;
}
