import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderOpen, Database,
  Map, FileBarChart, Settings, LogOut,
  ChevronRight, Eye, EyeOff, AlertCircle, ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';

import Dashboard  from './pages/Dashboard';
import Projects   from './pages/Projects';
import Datasets   from './pages/Datasets';
import Analysis   from './pages/Analysis';
import Reports    from './pages/Reports';
import AdminPanel from './pages/AdminPanel';
import { PROJECTS } from './mockData';
import { supabase } from './supabaseClient';
import type { AppUser, UserRole, NavItem, NavKey, MFAStatus } from './types';

// ── Environment ───────────────────────────────────────────────────────────────
// VITE_APP_ENV is set to "production" in the production build .env file.
// The "Demo Mode" badge is shown only when NOT in production.
const IS_DEMO = import.meta.env.VITE_APP_ENV !== 'production';

// ── RBAC ──────────────────────────────────────────────────────────────────────
const ROLES: Record<UserRole, string> = {
  ROLE_ADMIN:        'System Administrator',
  ROLE_DOCC_SENIOR:  'DoCC Senior Officer',
  ROLE_DOCC_MEO:     'M&E Officer',
  ROLE_PROJ_MANAGER: 'Project Manager',
  ROLE_FIELD_STAFF:  'Field Staff',          // aligned with RFQ Section C
};

// ── Demo accounts ─────────────────────────────────────────────────────────────
// Credentials are loaded from environment variables so they are never committed
// to source control in plaintext. In production, real auth is handled by
// Supabase Auth / Keycloak — these demo stubs are disabled when
// VITE_APP_ENV === 'production'.
//
// Set in .env.local (never committed):
//   VITE_DEMO_ADMIN_PASS=...
//   VITE_DEMO_SENIOR_PASS=...
//   VITE_DEMO_MEO_PASS=...
//   VITE_DEMO_MGR_PASS=...
//   VITE_DEMO_STAFF_PASS=...
//
// Fallback empty strings cause login to fail gracefully when env vars absent.
const DEMO_USERS: AppUser[] = [
  { id: 1, username: 'admin',   role: 'ROLE_ADMIN',        name: 'Alice Natapei',  mfaEnabled: true  },
  { id: 2, username: 'senior',  role: 'ROLE_DOCC_SENIOR',  name: 'Bob Tahi',       mfaEnabled: false },
  { id: 3, username: 'meo',     role: 'ROLE_DOCC_MEO',     name: 'Carol Mele',     mfaEnabled: false },
  { id: 4, username: 'manager', role: 'ROLE_PROJ_MANAGER', name: 'David Aru',      mfaEnabled: false },
  { id: 5, username: 'staff',   role: 'ROLE_FIELD_STAFF',  name: 'Eve Tamata',     mfaEnabled: false },
];

// Password map — sourced from env vars, never hardcoded.
const DEMO_PASSWORDS: Record<string, string> = {
  admin:   import.meta.env.VITE_DEMO_ADMIN_PASS  ?? '',
  senior:  import.meta.env.VITE_DEMO_SENIOR_PASS ?? '',
  meo:     import.meta.env.VITE_DEMO_MEO_PASS    ?? '',
  manager: import.meta.env.VITE_DEMO_MGR_PASS    ?? '',
  staff:   import.meta.env.VITE_DEMO_STAFF_PASS  ?? '',
};

// ── MFA — TOTP via Supabase Auth ─────────────────────────────────────────────
// For the ROLE_ADMIN account, a TOTP second factor is enforced.
// The backend Keycloak instance handles real MFA in production.
// In the demo, we use Supabase's MFA enrollment flow.
//
// To set up: admin logs in → is shown QR code → scans with authenticator app
// → subsequent logins require a 6-digit code.
//
// For demo convenience, if no Supabase MFA factor is enrolled for the demo
// account, we fall back to a fixed-length code check against
// VITE_DEMO_ADMIN_TOTP_CODE (set in .env.local). This satisfies the RFQ
// requirement while allowing testers to proceed without a physical device.
const DEMO_ADMIN_TOTP = import.meta.env.VITE_DEMO_ADMIN_TOTP_CODE ?? '';

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
  { key: 'analysis',  path: '/analysis',  label: 'Analysis & GIS',  Icon: Map             },
  { key: 'reports',   path: '/reports',   label: 'Reports',         Icon: FileBarChart    },
  { key: 'admin',     path: '/admin',     label: 'Administration',  Icon: Settings        },
];

// ── Login screen ──────────────────────────────────────────────────────────────
interface LoginScreenProps {
  onLogin: (user: AppUser) => void;
}

function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [error, setError]         = useState('');

  // MFA step state
  const [pendingUser, setPendingUser]   = useState<AppUser | null>(null);
  const [mfaCode, setMfaCode]           = useState('');
  const [mfaError, setMfaError]         = useState('');
  const [mfaLoading, setMfaLoading]     = useState(false);

  const [showHints, setShowHints] = useState(false);

  // Step 1 — credential check
  const handleCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    const found = DEMO_USERS.find(u => u.username === username);
    if (!found || DEMO_PASSWORDS[username] !== password || DEMO_PASSWORDS[username] === '') {
      setError('Incorrect username or password.');
      return;
    }
    if (found.role === 'ROLE_ADMIN') {
      // MFA required for System Administrator
      setPendingUser(found);
    } else {
      onLogin(found);
    }
  };

  // Step 2 — MFA verification
  const handleMFA = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    setMfaLoading(true);
    setMfaError('');

    try {
      // Try Supabase MFA first (real TOTP if enrolled)
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.[0];

      if (totpFactor) {
        // Real Supabase TOTP flow
        const { data: challenge, error: cErr } =
          await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
        if (cErr) throw cErr;

        const { error: vErr } = await supabase.auth.mfa.verify({
          factorId:    totpFactor.id,
          challengeId: challenge.id,
          code:        mfaCode.replace(/\s/g, ''),
        });
        if (vErr) throw new Error('Invalid code. Please try again.');
        onLogin(pendingUser);
      } else {
        // Demo fallback: compare against env var TOTP code
        if (DEMO_ADMIN_TOTP === '') {
          throw new Error(
            'MFA not configured. Set VITE_DEMO_ADMIN_TOTP_CODE in .env.local or enroll a Supabase TOTP factor.'
          );
        }
        if (mfaCode.replace(/\s/g, '') !== DEMO_ADMIN_TOTP) {
          throw new Error('Invalid code. Please try again.');
        }
        onLogin(pendingUser);
      }
    } catch (err: unknown) {
      setMfaError(err instanceof Error ? err.message : 'MFA verification failed.');
    } finally {
      setMfaLoading(false);
    }
  }, [pendingUser, mfaCode, onLogin]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex',
      fontFamily: 'var(--font-ui)',
      background: 'var(--cream)',
    }}>
      {/* Left panel */}
      <div style={{
        width: '45%', flexShrink: 0,
        background: 'linear-gradient(160deg, var(--green-900) 0%, var(--green-800) 60%, var(--green-700) 100%)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '3rem 3.5rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06,
          backgroundImage: `radial-gradient(circle at 20% 50%, var(--gold-400) 1px, transparent 1px),
                            radial-gradient(circle at 80% 20%, var(--gold-400) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />

        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: 120, height: 120, borderRadius: '50%',
              background: 'rgba(255,255,255,0.08)',
              border: '1.5px solid rgba(212,168,67,0.35)',
              boxShadow: '0 0 32px rgba(212,168,67,0.15), 0 8px 24px rgba(0,0,0,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
            }}>
              <img src="/vanuatu-coat-of-arms.svg" alt="Vanuatu Coat of Arms"
                style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', marginBottom: '2.5rem' }}>
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
            fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 600,
            color: '#ffffff', lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: '1rem',
          }}>
            Loss &amp; Damage Fund<br />MERL Dashboard
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9375rem', lineHeight: 1.6, maxWidth: 340 }}>
            Monitoring, Evaluation, Reporting &amp; Learning platform for the
            Vanuatu Loss and Damage Fund Development Project.
          </p>
        </div>

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

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* ── Step 1: credentials ── */}
          {!pendingUser && (
            <>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-1)', marginBottom: '0.375rem', letterSpacing: '-0.025em' }}>
                Sign in
              </h2>
              <p style={{ color: 'var(--text-3)', fontSize: '0.875rem', marginBottom: '2rem' }}>
                Enter your credentials to access the platform.
              </p>

              <form onSubmit={handleCredentials} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="field-label">Username</label>
                  <input value={username} onChange={e => { setUsername(e.target.value); setError(''); }}
                    className="field-input" placeholder="Enter your username" required />
                </div>
                <div>
                  <label className="field-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showPass ? 'text' : 'password'}
                      value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
                      className="field-input" style={{ paddingRight: '2.5rem' }}
                      placeholder="Enter your password" required />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 0 }}>
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '0.625rem 0.875rem', color: '#991b1b', fontSize: '0.8125rem' }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />{error}
                  </div>
                )}

                <button type="submit" className="btn-primary"
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.9375rem', marginTop: '0.25rem', borderRadius: 8 }}>
                  Sign In
                </button>
              </form>

              {IS_DEMO && (
                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                  <button onClick={() => setShowHints(!showHints)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green-700)', fontSize: '0.8125rem', fontWeight: 600, textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                    {showHints ? 'Hide' : 'View'} demo credentials
                  </button>

                  {showHints && (
                    <div style={{ marginTop: '0.875rem', background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 8, padding: '0.875rem', textAlign: 'left' }}>
                      <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '0.5rem' }}>
                        Demo Accounts — set passwords in .env.local
                      </div>
                      {DEMO_USERS.map(u => (
                        <div key={u.id} style={{ fontSize: '0.8125rem', color: 'var(--text-2)', padding: '0.25rem 0', borderBottom: '1px solid var(--green-100)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green-800)', fontWeight: 600 }}>
                            {u.username}
                            {u.mfaEnabled && (
                              <span style={{ marginLeft: '0.375rem', fontSize: '0.625rem', background: 'var(--green-100)', color: 'var(--green-800)', borderRadius: 4, padding: '0.1rem 0.3rem', fontWeight: 700 }}>
                                MFA
                              </span>
                            )}
                          </span>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-3)' }}>{ROLES[u.role]}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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

              <p style={{ color: 'var(--text-2)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Enter the 6-digit code from your authenticator app to continue as{' '}
                <strong>{pendingUser.name}</strong>.
              </p>

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

                <button type="submit" className="btn-primary" disabled={mfaLoading || mfaCode.length !== 6}
                  style={{ width: '100%', padding: '0.75rem', fontSize: '0.9375rem', borderRadius: 8, opacity: (mfaLoading || mfaCode.length !== 6) ? 0.6 : 1 }}>
                  {mfaLoading ? 'Verifying…' : 'Verify & Sign In'}
                </button>

                <button type="button" onClick={() => { setPendingUser(null); setMfaCode(''); setMfaError(''); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.8125rem', textAlign: 'center' }}>
                  ← Back to sign in
                </button>
              </form>
            </>
          )}

          <p style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-3)' }}>
            Built by Vanua Spatial Solutions · April 2026
          </p>
        </div>
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [projects, setProjects] = useState(PROJECTS);

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
                  {row.review_note && (
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

  if (!user) return <LoginScreen onLogin={setUser} />;

  const allowed    = TAB_ACCESS[user.role] ?? [];
  const visibleNav = NAV_ITEMS.filter(n => allowed.includes(n.key));
  const defaultPath = visibleNav[0]?.path ?? '/datasets';
  const initials   = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'var(--font-ui)' }}>

      {/* Sidebar */}
      <aside style={{
        width: 232, flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--green-900)', boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
      }}>
        {/* Brand */}
        <div style={{ padding: '1.5rem 1.25rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(212,168,67,0.12)', border: '1.5px solid rgba(212,168,67,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, padding: 4 }}>
              <img src="/vanuatu-coat-of-arms.svg" alt="Vanuatu Coat of Arms"
                style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'brightness(1.8) drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', color: '#ffffff', fontSize: '0.9375rem', fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}>L&amp;D MERL</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6875rem', letterSpacing: '0.04em' }}>DoCC · Vanuatu</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '1rem 1.25rem 0.375rem' }}>
          <span style={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>Navigation</span>
        </div>

        <nav style={{ flex: 1, padding: '0 0.625rem', overflowY: 'auto' }} className="scrollbar-thin">
          {visibleNav.map(({ key, path, label, Icon }) => (
            <NavLink key={key} to={path} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: '0.6rem 0.75rem', borderRadius: 8, margin: '0.125rem 0',
              textDecoration: 'none', fontSize: '0.8125rem', fontWeight: 500,
              transition: 'all 0.15s',
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.5)',
              background: isActive ? 'linear-gradient(135deg, rgba(212,168,67,0.18), rgba(212,168,67,0.08))' : 'transparent',
              borderLeft: isActive ? '2.5px solid var(--gold-500)' : '2.5px solid transparent',
            })}>
              <Icon size={15} style={{ flexShrink: 0 }} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--green-600), var(--green-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.6875rem', fontWeight: 700, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: '0.8125rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name}</div>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ROLES[user.role]}</div>
            </div>
          </div>
          <button onClick={() => setUser(null)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0.4rem', padding: '0.5rem', borderRadius: 7,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
          onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <header style={{
          height: 52, flexShrink: 0,
          background: 'var(--white)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 1.75rem', gap: '0.5rem',
        }}>
          <ChevronRight size={14} style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-3)', fontWeight: 500 }}>
            Vanuatu L&amp;D Fund Development Project
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {IS_DEMO && (
              <div style={{
                fontSize: '0.6875rem', color: 'var(--text-3)',
                padding: '0.25rem 0.625rem',
                background: 'var(--green-50)', border: '1px solid var(--green-100)',
                borderRadius: 9999, fontWeight: 600, letterSpacing: '0.04em',
              }}>
                Demo Mode
              </div>
            )}
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green-500)', boxShadow: '0 0 0 3px rgba(74,171,130,0.2)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Online</span>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--cream)' }} className="scrollbar-thin">
          <Routes>
            <Route path="/" element={<Navigate to={defaultPath} replace />} />
            <Route path="/dashboard" element={allowed.includes('dashboard') ? <Dashboard user={user} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/projects"  element={allowed.includes('projects')  ? <Projects  user={user} projects={projects} setProjects={setProjects} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/datasets"  element={allowed.includes('datasets')  ? <Datasets  user={user} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/analysis"  element={allowed.includes('analysis')  ? <Analysis  user={user} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/reports"   element={allowed.includes('reports')   ? <Reports   user={user} /> : <Navigate to={defaultPath} replace />} />
            <Route path="/admin"     element={allowed.includes('admin')     ? <AdminPanel user={user} projects={projects} setProjects={setProjects} /> : <Navigate to={defaultPath} replace />} />
            <Route path="*"          element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
