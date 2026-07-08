import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderOpen, Database,
  Activity, FileBarChart, Settings, LogOut,
  ChevronRight, ChevronDown, Bell, Menu, Eye, EyeOff, AlertCircle, ShieldCheck,
  Mail, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Dashboard  from './pages/Dashboard';
import Projects   from './pages/Projects';
import Datasets   from './pages/Datasets';
import Analysis   from './pages/Analysis';
import Reports    from './pages/Reports';
import AdminPanel from './pages/AdminPanel';
import ErrorBoundary from './components/ErrorBoundary';
import { supabase, toAppRole } from './supabaseClient';
import type { AppUser, UserRole, NavItem, NavKey, MFAStatus } from './types';

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
// Partner / funder logos shown in the portal footer. Both are the official
// transparent marks: MFAT (New Zealand Ministry of Foreign Affairs & Trade,
// Manatū Aorere) and the Department of Climate Change (Government of Vanuatu).
// The footer's <img> keeps an onError fallback to a national-emblem lockup as
// a safety net if the DoCC logo ever fails to load.
const MFAT_LOGO = `${import.meta.env.BASE_URL}mfat-logo.png`;
const DOCC_LOGO = `${import.meta.env.BASE_URL}docc-logo.png`;

// ── RBAC ──────────────────────────────────────────────────────────────────────
const ROLES: Record<UserRole, string> = {
  ROLE_ADMIN:        'System Administrator',
  ROLE_DOCC_SENIOR:  'DoCC Senior Officer',
  ROLE_DOCC_MEO:     'M&E Officer',
  ROLE_PROJ_MANAGER: 'Project Manager',
  ROLE_FIELD_STAFF:  'Field Staff',          // aligned with RFQ Section C
};

// ── Supabase Auth ─────────────────────────────────────────────────────────────
// Sign-in is email/password against Supabase Auth. The signed-in user's
// platform profile (name + contract role) comes from the current_profile()
// RPC (migration 0003), which resolves auth.uid() → merl.users. TOTP MFA is
// enforced for the System Administrator role: an admin without an enrolled
// factor is walked through QR enrollment on first sign-in.
async function loadProfile(): Promise<AppUser | null> {
  const { data, error } = await supabase.rpc('current_profile');
  if (error || !data || data.length === 0) return null;
  const p = data[0] as { id: string; email: string; full_name: string; role: string };
  return {
    id: p.id,
    username: p.email,
    role: toAppRole(p.role),
    name: p.full_name,
    mfaEnabled: p.role === 'administrator',
  };
}

// ── Tab access map ────────────────────────────────────────────────────────────
const TAB_ACCESS: Record<UserRole, NavKey[]> = {
  ROLE_ADMIN:        ['dashboard', 'projects', 'datasets', 'analysis', 'reports', 'admin'],
  ROLE_DOCC_SENIOR:  ['dashboard', 'projects', 'datasets', 'analysis', 'reports'],
  ROLE_DOCC_MEO:     ['dashboard', 'projects', 'datasets', 'analysis', 'reports'],
  ROLE_PROJ_MANAGER: ['dashboard', 'projects', 'datasets', 'analysis', 'reports'],
  ROLE_FIELD_STAFF:  ['datasets', 'analysis'],
};

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/dashboard', label: 'Dashboard',       Icon: LayoutDashboard },
  { key: 'projects',  path: '/projects',  label: 'L&D Components',  Icon: FolderOpen      },
  { key: 'datasets',  path: '/datasets',  label: 'Datasets',        Icon: Database        },
  { key: 'analysis',  path: '/analysis',  label: 'Analysis',        Icon: Activity        },
  { key: 'reports',   path: '/reports',   label: 'Reports',         Icon: FileBarChart    },
  { key: 'admin',     path: '/admin',     label: 'Administration',  Icon: Settings        },
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

  // MFA step state
  const [pendingUser, setPendingUser] = useState<AppUser | null>(null);
  const [factorId, setFactorId]       = useState('');
  const [enrollQr, setEnrollQr]       = useState('');   // non-empty ⇒ enrollment step
  const [enrollSecret, setEnrollSecret] = useState('');
  const [mfaCode, setMfaCode]         = useState('');
  const [mfaError, setMfaError]       = useState('');
  const [mfaLoading, setMfaLoading]   = useState(false);

  // Step 1 — Supabase Auth credential check
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
      if (profile.role !== 'ROLE_ADMIN') {
        onLogin(profile);
        return;
      }
      // MFA required for System Administrator
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.find(f => f.status === 'verified') ?? factors?.totp?.[0];
      if (totpFactor) {
        setFactorId(totpFactor.id);
        setPendingUser(profile);
      } else {
        // First sign-in: enroll a TOTP factor before granting access
        const { data: enroll, error: eErr } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
        if (eErr || !enroll) {
          await supabase.auth.signOut();
          setError(eErr?.message ?? 'Could not start MFA enrollment.');
          return;
        }
        setFactorId(enroll.id);
        setEnrollQr(enroll.totp.qr_code);
        setEnrollSecret(enroll.totp.secret);
        setPendingUser(profile);
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — MFA verification (covers both enrolled factors and enrollment)
  const handleMFA = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    setMfaLoading(true);
    setMfaError('');
    try {
      const { data: challenge, error: cErr } =
        await supabase.auth.mfa.challenge({ factorId });
      if (cErr) throw cErr;

      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code:        mfaCode.replace(/\s/g, ''),
      });
      if (vErr) throw new Error('Invalid code. Please try again.');
      onLogin(pendingUser);
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'MFA verification failed.');
    } finally {
      setMfaLoading(false);
    }
  }, [pendingUser, factorId, mfaCode, onLogin]);

  const cancelMFA = useCallback(async () => {
    await supabase.auth.signOut();
    setPendingUser(null);
    setFactorId('');
    setEnrollQr('');
    setEnrollSecret('');
    setMfaCode('');
    setMfaError('');
  }, []);

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
        .lg-mfa-badge{width:42px;height:42px;border-radius:11px;background:var(--green-50);border:1px solid var(--green-100);display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .lg-link{background:none;border:none;cursor:pointer;color:var(--text-3);font-size:.8125rem;padding:.5rem;width:100%}
        .lg-link:hover{color:var(--green-700)}
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

          {/* ── Step 1: credentials ── */}
          {!pendingUser && (
            <>
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
            </>
          )}

          {/* ── Step 2: MFA ── */}
          {pendingUser && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--green-50)', border: '1px solid var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={20} style={{ color: 'var(--green-700)' }} />
                </div>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.025em' }}>
                    Two-factor authentication
                  </h2>
                  <p style={{ color: 'var(--text-3)', fontSize: '0.8125rem', margin: 0 }}>
                    Required for System Administrator access
                  </p>
                </div>
              </div>

              {enrollQr ? (
                <div style={{ marginBottom: '1.5rem' }}>
                  <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                    First sign-in for <strong>{pendingUser.name}</strong>: scan this QR code with your
                    authenticator app (Google Authenticator, Authy, …), then enter the 6-digit code
                    it shows to activate two-factor authentication.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
                    <img src={enrollQr} alt="TOTP enrollment QR code"
                      style={{ width: 168, height: 168, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }} />
                  </div>
                  <div style={{ textAlign: 'center', fontSize: '0.6875rem', color: 'var(--text-3)' }}>
                    Can't scan? Enter this key manually:{' '}
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-2)', wordBreak: 'break-all' }}>{enrollSecret}</span>
                  </div>
                </div>
              ) : (
                <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                  Enter the 6-digit code from your authenticator app to continue as{' '}
                  <strong>{pendingUser.name}</strong>.
                </p>
              )}

              <form onSubmit={handleMFA} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="field-label">Authenticator code</label>
                  <input
                    value={mfaCode}
                    onChange={e => { setMfaCode(e.target.value.replace(/[^0-9]/g, '')); setMfaError(''); }}
                    className="field-input"
                    placeholder="000000"
                    maxLength={6}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    style={{ fontSize: '1.5rem', letterSpacing: '0.3em', textAlign: 'center' }}
                  />
                </div>

                {mfaError && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.625rem 0.875rem', color: '#991b1b', fontSize: '0.8125rem' }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />{mfaError}
                  </div>
                )}

                <button type="submit" className="lg-submit" disabled={mfaLoading || mfaCode.length !== 6}>
                  {mfaLoading ? 'Verifying…' : enrollQr ? 'Activate & sign in' : 'Verify & sign in'}
                </button>

                <button type="button" className="lg-link" onClick={cancelMFA}>
                  ← Back to sign in
                </button>
              </form>
            </>
          )}

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

  // ── Real-time: dataset upload notifications ──────────────────────────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('global-dataset-notifications')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'datasets' },
        payload => {
          const row = payload.new as Record<string, unknown>;
          if (row.uploaded_by === user.name) return;

          const ext  = typeof row.type === 'string' ? row.type.toUpperCase() : 'FILE';
          const sizeKb = typeof row.size_kb === 'number' ? row.size_kb : 0;
          const size = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

          toast.custom(t => (
            <div onClick={() => toast.dismiss(t.id)} style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
              background: '#1e293b', border: '1px solid rgba(74,171,130,0.35)',
              borderLeft: '3px solid #4aab82', borderRadius: 10,
              padding: '0.875rem 1.125rem', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              cursor: 'pointer', maxWidth: 340,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'rgba(74,171,130,0.15)', border: '1px solid rgba(74,171,130,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem' }}>📎</div>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.2rem' }}>New upload</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
                  <span style={{ color: '#4aab82', fontWeight: 600 }}>{String(row.uploaded_by)}</span>
                  {' '}uploaded{' '}
                  <span style={{ color: '#f1f5f9', fontWeight: 600 }}>{String(row.name)}</span>
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.2rem' }}>
                  {ext} · {size} · {String(row.project_code)}
                </div>
              </div>
            </div>
          ), { duration: 6000, position: 'top-right' });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Real-time: dataset approval/rejection ────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('global-approval-notifications')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'datasets' },
        payload => {
          const row = payload.new as Record<string, unknown>;
          const isPersonal = row.uploaded_by === user.name;

          if (row.status === 'approved') {
            toast.custom(t => (
              <div onClick={() => toast.dismiss(t.id)} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                background: '#1e293b', border: '1px solid rgba(22,163,74,0.35)',
                borderLeft: '3px solid #16a34a', borderRadius: 10,
                padding: '0.875rem 1.125rem', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                cursor: 'pointer', maxWidth: 340,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'rgba(22,163,74,0.15)', border: '1px solid rgba(22,163,74,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem' }}>✅</div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.2rem' }}>
                    {isPersonal ? 'Your upload was approved' : 'Dataset approved'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#f1f5f9', lineHeight: 1.4, marginBottom: '0.2rem' }}>{String(row.name)}</div>
                  <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>by {String(row.reviewed_by ?? 'Admin')}</div>
                </div>
              </div>
            ), { duration: 6000, position: 'top-right' });
          } else if (row.status === 'rejected' && isPersonal) {
            toast.custom(t => (
              <div onClick={() => toast.dismiss(t.id)} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                background: '#1e293b', border: '1px solid rgba(220,38,38,0.35)',
                borderLeft: '3px solid #dc2626', borderRadius: 10,
                padding: '0.875rem 1.125rem', boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                cursor: 'pointer', maxWidth: 340,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(220,38,38,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem' }}>❌</div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.2rem' }}>Upload rejected</div>
                  <div style={{ fontSize: '0.75rem', color: '#f1f5f9', lineHeight: 1.4, marginBottom: '0.2rem' }}>{String(row.name)}</div>
                  {!!row.review_note && (
                    <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>{String(row.review_note)}</div>
                  )}
                </div>
              </div>
            ), { duration: 6000, position: 'top-right' });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (booting) return null;
  if (!user) return <LoginScreen onLogin={setUser} />;

  const allowed    = TAB_ACCESS[user.role] ?? [];
  const visibleNav = NAV_ITEMS.filter(n => allowed.includes(n.key));
  const defaultPath = visibleNav[0]?.path ?? '/datasets';
  const initials   = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font-ui)', background: 'var(--cream)' }}>

      {/* Top navigation */}
      <header style={{
        flexShrink: 0, background: 'var(--white)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--green-50)', border: '1px solid var(--green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, flexShrink: 0 }}>
            <img src={CREST} alt="Vanuatu Coat of Arms" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: 'var(--font-display)', color: 'var(--text-1)', fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.01em' }}>L&amp;D MERL</div>
            <div style={{ color: 'var(--text-3)', fontSize: '0.625rem', letterSpacing: '0.04em' }}>DoCC · Vanuatu</div>
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
            <div style={{
              fontSize: '0.6875rem', color: 'var(--green-700)',
              padding: '0.25rem 0.625rem', background: 'var(--green-50)',
              border: '1px solid var(--green-100)', borderRadius: 9999,
              fontWeight: 700, letterSpacing: '0.04em',
            }}>
              Staging
            </div>
          )}
          <button className="topnav-icon-btn" title="Notifications" aria-label="Notifications">
            <Bell size={17} />
          </button>

          {/* Account menu */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setUserMenuOpen(o => !o)} aria-label="Account menu" style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.15rem 0.25rem 0.15rem 0.15rem', borderRadius: 9999,
            }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, var(--green-600), var(--green-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 700 }}>
                {initials}
              </div>
              <ChevronDown size={15} style={{ color: 'var(--text-3)' }} />
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

      {/* Mobile dropdown nav */}
      <nav className={`topnav-mobile${sidebarOpen ? ' open' : ''}`}>
        {visibleNav.map(({ key, path, label, Icon }) => (
          <NavLink key={key} to={path} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}>
            <Icon size={16} />{label}
          </NavLink>
        ))}
      </nav>

        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--cream)' }} className="scrollbar-thin">
          <ErrorBoundary key={location.pathname}>
            <Routes>
              <Route path="/" element={<Navigate to={defaultPath} replace />} />
              <Route path="/dashboard" element={allowed.includes('dashboard') ? <Dashboard user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/projects"  element={allowed.includes('projects')  ? <Projects /> : <Navigate to={defaultPath} replace />} />
              <Route path="/datasets"  element={allowed.includes('datasets')  ? <Datasets  user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="/analysis"  element={allowed.includes('analysis')  ? <Analysis /> : <Navigate to={defaultPath} replace />} />
              <Route path="/reports"   element={allowed.includes('reports')   ? <Reports /> : <Navigate to={defaultPath} replace />} />
              <Route path="/admin"     element={allowed.includes('admin')     ? <AdminPanel user={user} /> : <Navigate to={defaultPath} replace />} />
              <Route path="*"          element={<Navigate to={defaultPath} replace />} />
            </Routes>
          </ErrorBoundary>
        </main>

        {/* Partner / funder footer */}
        <footer style={{
          flexShrink: 0, background: 'var(--white)', borderTop: '1px solid var(--border)',
          padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '1rem', rowGap: '0.5rem', flexWrap: 'wrap',
        }}>
          {/* Implementing agency — Department of Climate Change */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
            <img
              src={DOCC_LOGO}
              alt="Department of Climate Change — Government of Vanuatu"
              style={{ height: 38, width: 'auto' }}
              onError={(e) => {
                const img = e.currentTarget;
                img.style.display = 'none';
                const fb = img.nextElementSibling as HTMLElement | null;
                if (fb) fb.style.display = 'flex';
              }}
            />
            {/* Fallback identity lockup (national emblem) until the DoCC logo file is provided */}
            <span style={{ display: 'none', alignItems: 'center', gap: '0.5rem' }}>
              <img src={CREST} alt="" style={{ height: 28, width: 'auto', filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' }} />
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>Department of Climate Change</span>
                <span style={{ fontSize: '0.625rem', color: 'var(--text-3)', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Republic of Vanuatu</span>
              </span>
            </span>
          </div>

          {/* Funder — New Zealand MFAT */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <span style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
              Funded by
            </span>
            <img
              src={MFAT_LOGO}
              alt="New Zealand Ministry of Foreign Affairs and Trade — Manatū Aorere"
              style={{ height: 36, width: 'auto' }}
            />
          </div>
        </footer>
    </div>
  );
}
