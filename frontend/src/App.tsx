import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Settings, LogOut, ChevronDown, Bell, Menu, MoreHorizontal,
  Eye, EyeOff, AlertCircle, ShieldCheck, Mail, Lock, ClipboardCheck, ClipboardList, FileBarChart,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import Dashboards from './pages/Dashboards';
import ProjectSetup from './pages/ProjectSetup';
import MerlReporting from './pages/MerlReporting';
import Reports from './pages/Reports';
import AdminPanel  from './pages/AdminPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { LogoCloud } from './components/logo-cloud';
import { supabase, toAppRole } from './supabaseClient';
import type { AppUser, UserRole, NavItem, NavKey } from './types';

// ── Environment ───────────────────────────────────────────────────────────────
// VITE_APP_ENV is set to "production" in the production build .env file.
// The "Staging" badge is shown only when NOT in production.
const IS_STAGING = import.meta.env.VITE_APP_ENV !== 'production';

// Base-aware asset URL so the coat of arms resolves under the GitHub Pages
// project path (/merl-dashboard/) as well as at the site root. HashRouter
// keeps the document at BASE_URL on every route, so this stays correct.
const CREST = `${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`;
// Faded scenic backdrop for the sign-in brand panel. To use a real
// photograph instead, drop a file in public/ and point LOGIN_BG at it.
const LOGIN_BG = `${import.meta.env.BASE_URL}vanuatu-login-bg.svg`;
// Traditional ni-Vanuatu ornament (hand-drawn SVG): a woven-diamond / namele
// chevron band for the header & footer, and a faint sandroing (sand-drawing)
// motif tiled as a background watermark. Base-aware so they resolve under the
// GitHub Pages project path.
const PATTERN_BAND = `${import.meta.env.BASE_URL}pattern-band.svg`;
const PATTERN_WATERMARK = `${import.meta.env.BASE_URL}pattern-watermark.svg`;

// ── RBAC ──────────────────────────────────────────────────────────────────────
const ROLES: Record<UserRole, string> = {
  ROLE_ADMIN:        'System Administrator',
  ROLE_DOCC_SENIOR:  'DoCC Senior Officer',
  ROLE_DOCC_MEO:     'M&E Officer',
  ROLE_PROJ_MANAGER: 'Project Manager',
  ROLE_FIELD_STAFF:  'Field Staff',          // aligned with RFQ Section C
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

// ── Tab access map ────────────────────────────────────────────────────────────
// The legacy pre-DoCC modules (Dashboard, Framework, Registration, Progress,
// Gallery, Files, Datasets, Analysis, Reports) have been retired; the portal now
// exposes the new DoCC MERL module plus Administration. Their DoCC replacements
// (project-setup wizard, dashboards and report generators) are rebuilt in
// follow-up work.
const TAB_ACCESS: Record<UserRole, NavKey[]> = {
  ROLE_ADMIN:        ['dashboards', 'setup', 'merl', 'reports', 'admin'],
  ROLE_DOCC_SENIOR:  ['dashboards', 'setup', 'merl', 'reports'],
  ROLE_DOCC_MEO:     ['dashboards', 'setup', 'merl', 'reports'],
  ROLE_PROJ_MANAGER: ['dashboards', 'setup', 'merl', 'reports'],
  ROLE_FIELD_STAFF:  ['dashboards', 'merl', 'reports'],
};

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboards', path: '/dashboards',    label: 'Dashboards',     Icon: LayoutDashboard },
  { key: 'setup',      path: '/project-setup', label: 'Project Setup',  Icon: ClipboardList   },
  { key: 'merl',       path: '/merl-reporting', label: 'MERL',          Icon: ClipboardCheck  },
  { key: 'reports',    path: '/reports',        label: 'Reports',        Icon: FileBarChart    },
  { key: 'admin',      path: '/admin',          label: 'Administration', Icon: Settings        },
];

// ── Login screen ──────────────────────────────────────────────────────────────
interface LoginScreenProps {
  onLogin: (user: AppUser) => void;
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  // Supabase Auth credential check — direct email/password sign-in.
  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
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
      onLogin(profile);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lg-root">
      <style>{`
        .lg-root{position:relative;min-height:100vh;min-height:100dvh;display:flex;font-family:var(--font-ui);background:var(--cream);color:var(--text-1)}
        .lg-flagbar{position:absolute;top:0;left:0;right:0;height:5px;z-index:20;background:linear-gradient(90deg,var(--red-600) 0 33.33%,var(--gold-500) 33.33% 66.66%,var(--green-600) 66.66% 100%)}
        .lg-flagrule{width:72px;height:3px;border-radius:2px;margin:.15rem auto 0;background:linear-gradient(90deg,var(--red-500) 0 33%,var(--gold-400) 33% 66%,var(--green-500) 66% 100%)}
        .lg-brand{position:relative;width:44%;max-width:560px;flex-shrink:0;overflow:hidden;color:#fff;background:linear-gradient(158deg,var(--green-800) 0%,var(--green-900) 48%,var(--ink) 100%);display:flex;flex-direction:column}
        .lg-photo{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center;transform:scale(1.02)}
        .lg-anim{position:absolute;inset:0;z-index:0;width:100%;height:100%;pointer-events:none}
        .lg-frond--l{transform-box:fill-box;transform-origin:0% 0%}
        .lg-frond--r{transform-box:fill-box;transform-origin:100% 0%}
        @media (prefers-reduced-motion:no-preference){
          .lg-frond--l{animation:lgSwayL 7s ease-in-out infinite alternate}
          .lg-frond--r{animation:lgSwayR 8.5s ease-in-out infinite alternate}
          .lg-glow{animation:lgBreathe 8s ease-in-out infinite}
          .lg-wave--1{animation:lgDrift1 9s ease-in-out infinite alternate}
          .lg-wave--2{animation:lgDrift2 11s ease-in-out infinite alternate}
        }
        @keyframes lgSwayL{from{transform:rotate(-2deg)}to{transform:rotate(2.6deg)}}
        @keyframes lgSwayR{from{transform:rotate(2deg)}to{transform:rotate(-2.6deg)}}
        @keyframes lgBreathe{0%,100%{opacity:.4}50%{opacity:.8}}
        @keyframes lgDrift1{from{transform:translateX(-16px)}to{transform:translateX(16px)}}
        @keyframes lgDrift2{from{transform:translateX(12px)}to{transform:translateX(-14px)}}
        .lg-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(157deg,rgba(6,24,15,.9) 0%,rgba(10,45,30,.5) 42%,rgba(4,7,5,.9) 100%)}
        .lg-brand__texture{position:absolute;inset:0;z-index:2;opacity:.05;pointer-events:none;background-image:radial-gradient(circle at 18% 30%,var(--gold-400) 1px,transparent 1px),radial-gradient(circle at 78% 68%,var(--gold-400) 1px,transparent 1px);background-size:46px 46px}
        .lg-brand__bar{position:relative;display:flex;align-items:center;gap:.6rem;padding:1.05rem 2.75rem;border-bottom:1px solid rgba(255,255,255,.1);font-size:.6875rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-400)}
        .lg-brand__bar::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gold-400);box-shadow:0 0 10px var(--gold-400)}
        .lg-brand__body{position:relative;z-index:3;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2.5rem 2.75rem;gap:1.75rem}
        .lg-crest{width:min(460px,82%);aspect-ratio:1;display:flex;align-items:center;justify-content:center}
        .lg-crest img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 6px 18px rgba(0,0,0,.4))}
        .lg-ident__k{font-size:.6875rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--gold-400)}
        .lg-ident__d{font-size:1rem;font-weight:600;color:rgba(255,255,255,.92);margin-top:.15rem}
        .lg-title{font-family:var(--font-display);font-size:2.4rem;line-height:1.08;letter-spacing:-.03em;font-weight:600;color:#fff;margin:0}
        .lg-sub{font-size:.95rem;line-height:1.6;color:rgba(255,255,255,.62);max-width:40ch;margin:0}
        .lg-trust{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.7rem}
        .lg-trust li{display:flex;align-items:center;gap:.6rem;font-size:.8125rem;color:rgba(255,255,255,.8)}
        .lg-trust svg{color:var(--gold-400);flex-shrink:0}
        .lg-fund{position:relative;margin:0 2.75rem 2.25rem;padding:1rem 1.25rem;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12)}
        .lg-fund__k{font-size:.625rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:.25rem}
        .lg-fund__a{font-size:.875rem;font-weight:600;color:rgba(255,255,255,.9)}
        .lg-fund__b{font-size:.8125rem;color:rgba(255,255,255,.55)}
        .lg-main{flex:1;display:flex;align-items:center;justify-content:center;padding:2.5rem 1.5rem}
        .lg-card{width:100%;max-width:400px}
        .lg-mobile-brand{display:none}
        .lg-mobile-brand__crest{width:44px;height:44px;border-radius:10px;flex-shrink:0;padding:6px;background:var(--green-800);display:flex;align-items:center;justify-content:center}
        .lg-mobile-brand__crest img{width:100%;height:100%;object-fit:contain}
        .lg-eyebrow{display:inline-flex;align-items:center;gap:.4rem;font-size:.6875rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--green-700);margin-bottom:.85rem}
        .lg-h2{font-family:var(--font-display);font-size:1.75rem;font-weight:600;letter-spacing:-.025em;color:var(--text-1);margin:0 0 .4rem}
        .lg-lead{color:var(--text-2);font-size:.9rem;margin:0 0 1.75rem;line-height:1.5}
        .lg-ifield{position:relative}
        .lg-ifield>.lg-ficon{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);color:var(--text-3);pointer-events:none;display:flex}
        .lg-input{padding-left:2.5rem !important}
        .lg-eye{position:absolute;right:.4rem;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:none;border:none;cursor:pointer;color:var(--text-3);border-radius:7px}
        .lg-eye:hover{color:var(--text-2);background:var(--green-50)}
        .lg-alert{display:flex;align-items:flex-start;gap:.5rem;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:.7rem .875rem;color:#991b1b;font-size:.8125rem;line-height:1.4}
        .lg-submit{width:100%;padding:.8rem;font-size:.9375rem;font-weight:600;border-radius:9px;border:none;cursor:pointer;color:#fff;background:linear-gradient(180deg,var(--green-700),var(--green-800));box-shadow:var(--shadow-sm);transition:filter .18s ease,box-shadow .18s ease}
        .lg-submit:hover:not(:disabled){filter:brightness(1.07);box-shadow:var(--shadow-md)}
        .lg-submit:disabled{opacity:.6;cursor:default}
        .lg-notice{display:flex;align-items:flex-start;gap:.55rem;margin-top:1.5rem;padding:.75rem .9rem;border-radius:9px;background:var(--green-50);border:1px solid var(--green-100);font-size:.75rem;line-height:1.45;color:var(--text-2)}
        .lg-notice svg{color:var(--green-700);flex-shrink:0;margin-top:1px}
        .lg-foot{margin-top:1.1rem;text-align:center;font-size:.75rem;color:var(--text-3)}
        @media (max-width:860px){.lg-brand{display:none}.lg-mobile-brand{display:flex;align-items:center;gap:.7rem;justify-content:center;margin-bottom:1.75rem;padding-bottom:1.4rem;border-bottom:1px solid var(--border)}}
        @media (prefers-reduced-motion:reduce){.lg-submit{transition:none}}
      `}</style>
      <div className="lg-flagbar" />
      {/* ── Brand panel ── */}
      <aside className="lg-brand">
        <div className="lg-photo" style={{ backgroundImage: `url(${LOGIN_BG})` }} />
        <svg className="lg-anim" viewBox="0 0 1000 1400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="lgGlow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ffe6ad" stopOpacity="0.5" />
              <stop offset="1" stopColor="#ffe6ad" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse className="lg-glow" cx="500" cy="900" rx="150" ry="150" fill="url(#lgGlow)" />
          <ellipse className="lg-wave lg-wave--1" cx="430" cy="1040" rx="230" ry="26" fill="#cfe8dd" opacity="0.06" />
          <ellipse className="lg-wave lg-wave--2" cx="580" cy="1150" rx="270" ry="30" fill="#cfe8dd" opacity="0.05" />
          <g className="lg-frond lg-frond--l" fill="#06160f" opacity="0.92">
            <path d="M-40 -20 C 150 60 250 150 300 300 C 250 210 150 150 40 130 C 170 150 250 230 280 340 C 210 250 120 210 20 210 C 150 240 210 320 230 400 C 150 300 60 280 -30 300 Z" />
          </g>
          <g className="lg-frond lg-frond--r" fill="#06160f" opacity="0.9">
            <path d="M1040 -30 C 860 50 770 150 720 300 C 780 210 880 150 990 132 C 840 152 760 240 740 350 C 820 250 910 220 1010 220 C 870 250 810 330 795 410 C 880 300 970 285 1050 305 Z" />
          </g>
        </svg>
        <div className="lg-overlay" />
        <div className="lg-brand__texture" />
        <div className="lg-brand__body">
          <div className="lg-crest">
            <img src={CREST} alt="Coat of arms of the Republic of Vanuatu" />
          </div>
          <div>
            <div className="lg-ident__k">Republic of Vanuatu</div>
            <div className="lg-ident__d">Department of Climate Change</div>
            <div className="lg-flagrule" />
          </div>
        </div>
      </aside>

      {/* ── Sign-in panel ── */}
      <div className="lg-main">
        <div className="lg-card">
          <div className="lg-mobile-brand">
            <div className="lg-mobile-brand__crest">
              <img src={CREST} alt="Coat of arms of the Republic of Vanuatu" />
            </div>
            <div>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--green-700)' }}>Republic of Vanuatu</div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-1)' }}>Department of Climate Change</div>
            </div>
          </div>

          {/* ── Sign in: credentials ── */}
          <div className="lg-eyebrow"><Lock size={13} /> Secure sign-in</div>
          <h2 className="lg-h2">Welcome back</h2>
          <p className="lg-lead">Sign in with your official DoCC credentials to continue to the MERL platform.</p>

          <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="field-label" htmlFor="lg-email">Email address</label>
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
                      className="field-input lg-input" style={{ paddingRight: '2.75rem' }}
                      placeholder="Enter your password" autoComplete="current-password" required />
                    <button type="button" className="lg-eye"
                      aria-label={showPass ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPass(!showPass)}>
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="lg-alert" role="alert">
                    <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />{error}
                  </div>
                )}

                <button type="submit" className="lg-submit" disabled={loading} style={{ marginTop: '0.25rem' }}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

          <div className="lg-notice">
            <ShieldCheck size={15} />
            <span>Authorised access only. Activity on this official Government of Vanuatu system is monitored and audited. Unauthorised use is prohibited.</span>
          </div>
          <p className="lg-foot">Vanuatu L&amp;D Fund Development Project · Built by Vanua Spatial Solutions</p>
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
  const defaultPath = visibleNav[0]?.path ?? '/merl-reporting';
  const initials   = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="app-shell scrollbar-thin" style={{ display: 'flex', flexDirection: 'column', overflowX: 'hidden', overflowY: 'hidden', fontFamily: 'var(--font-ui)', background: 'var(--cream)' }}>

      {/* Top navigation */}
      <header className="topnav" style={{
        flexShrink: 0, background: 'var(--white)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
      }}>
        {/* Brand */}
        <div className="topnav-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0, minWidth: 0 }}>
          <div className="topnav-crest" style={{ background: 'var(--green-50)', border: '1px solid var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, flexShrink: 0 }}>
            <img src={CREST} alt="Vanuatu Coat of Arms" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ lineHeight: 1.15, minWidth: 0 }}>
            <div className="topnav-brand-title" style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)', fontWeight: 800, letterSpacing: '-0.01em' }}>L&amp;D MERL</div>
            <div className="topnav-brand-sub" style={{ color: 'var(--text-3)', fontSize: '0.75rem', letterSpacing: '0.04em' }}>DoCC · Vanuatu</div>
          </div>
        </div>

        {/* Center pill nav (desktop) — text-only tabs, like the reference */}
        <nav className="topnav-links" style={{ margin: '0 auto' }}>
          {visibleNav.map(({ key, path, label }) => (
            <NavLink key={key} to={path} className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', flexShrink: 0 }}>
          {IS_STAGING && (
            <div className="topnav-staging" style={{
              fontSize: '0.8125rem', color: 'var(--green-700)',
              padding: '0.35rem 0.8rem', background: 'var(--green-50)',
              border: '1px solid var(--green-100)', borderRadius: 9999,
              fontWeight: 700, letterSpacing: '0.04em',
            }}>
              Staging
            </div>
          )}
          {/* Language switcher (EN / FR) — hidden on small screens, moved into the mobile menu */}
          <div className="topnav-lang" style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['en', 'fr'] as const).map(lng => (
              <button key={lng} onClick={() => i18n.changeLanguage(lng)}
                aria-label={`Switch language to ${lng.toUpperCase()}`}
                style={{
                  padding: '0.42rem 0.75rem', fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '0.03em',
                  border: 'none', cursor: 'pointer',
                  background: i18n.language === lng ? 'var(--green-600)' : 'var(--white)',
                  color: i18n.language === lng ? '#fff' : 'var(--text-3)',
                }}>
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="topnav-icon-btn topnav-bell" title="Notifications" aria-label="Notifications">
            <Bell size={20} />
          </button>

          {/* Account menu */}
          <div className="topnav-account" style={{ position: 'relative' }}>
            <button onClick={() => setUserMenuOpen(o => !o)} aria-label="Account menu" style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.15rem 0.25rem 0.15rem 0.15rem', borderRadius: 9999,
            }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, var(--green-600), var(--green-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.85rem', fontWeight: 700 }}>
                {initials}
              </div>
              <ChevronDown size={17} style={{ color: 'var(--text-3)' }} />
            </button>
            {userMenuOpen && (
              <>
                <div onClick={() => setUserMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, width: 224, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
                  <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--text-3)', marginTop: 2 }}>{ROLES[user.role]}</div>
                  </div>
                  <button onClick={() => { setUserMenuOpen(false); void supabase.auth.signOut(); setUser(null); }} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.75rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--red-600)', fontSize: '0.8125rem', fontWeight: 600,
                  }}>
                    <LogOut size={15} /> Sign Out
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button className="topnav-hamburger topnav-icon-btn" aria-label="Toggle navigation menu" onClick={() => setSidebarOpen(o => !o)}>
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Traditional ni-Vanuatu ornament band (header) */}
      <div aria-hidden="true" style={{
        flexShrink: 0, height: 34, background: 'var(--white)',
        borderBottom: '1px solid var(--border)',
        backgroundImage: `url(${PATTERN_BAND})`, backgroundRepeat: 'repeat-x',
        backgroundPosition: 'center', backgroundSize: 'auto 34px',
      }} />

      {/* Mobile dropdown nav */}
      <nav className={`topnav-mobile${sidebarOpen ? ' open' : ''}`}>
        {visibleNav.map(({ key, path, label, Icon }) => (
          <NavLink key={key} to={path} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}>
            <Icon size={16} />{label}
          </NavLink>
        ))}
        {/* Language switcher inside the mobile menu (the header toggle is hidden on small screens) */}
        <div className="topnav-mobile-lang">
          {(['en', 'fr'] as const).map(lng => (
            <button key={lng} onClick={() => i18n.changeLanguage(lng)}
              aria-label={`Switch language to ${lng.toUpperCase()}`}
              className={i18n.language === lng ? 'active' : ''}>
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
        {/* Account + sign out (the header avatar is hidden on small screens) */}
        <div className="topnav-mobile-account">
          <div>
            <div className="topnav-mobile-account-name">{user.name}</div>
            <div className="topnav-mobile-account-role">{ROLES[user.role]}</div>
          </div>
          <button onClick={() => { setSidebarOpen(false); void supabase.auth.signOut(); setUser(null); }}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </nav>

        {/* Stakeholder logo band */}
        <div style={{ flexShrink: 0, background: 'var(--white)', borderBottom: '1px solid var(--border)' }}>
          <LogoCloud />
        </div>

        <main style={{
          flex: 1, overflowY: 'auto',
          background: 'var(--cream)',
          backgroundImage: `url(${PATTERN_WATERMARK})`, backgroundSize: '150px',
        }} className="scrollbar-thin">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to={defaultPath} replace />} />
              <Route path="/dashboards" element={allowed.includes('dashboards') ? <Dashboards /> : <Navigate to={defaultPath} replace />} />
              <Route path="/project-setup" element={allowed.includes('setup') ? <ProjectSetup user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/merl-reporting" element={allowed.includes('merl') ? <MerlReporting user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/reports" element={allowed.includes('reports') ? <Reports /> : <Navigate to={defaultPath} replace />} />
              <Route path="/admin"     element={allowed.includes('admin')     ? <AdminPanel user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="*"          element={<Navigate to={defaultPath} replace />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Bottom tab bar (mobile only) — quick access to the primary
            destinations, with "More" opening the full menu. */}
        <nav className="bottomnav" aria-label="Primary">
          {visibleNav.slice(0, 3).map(({ key, path, label, Icon }) => (
            <NavLink key={key} to={path}
              className={({ isActive }) => `bottomnav-item${isActive ? ' active' : ''}`}>
              <Icon size={21} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button type="button" onClick={() => setSidebarOpen(o => !o)}
            aria-label="More menu" aria-expanded={sidebarOpen}
            className={`bottomnav-item${sidebarOpen ? ' active' : ''}`}>
            <MoreHorizontal size={21} />
            <span>More</span>
          </button>
        </nav>

    </div>
  );
}
