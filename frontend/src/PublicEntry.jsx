import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import App from './App';
import PublicDashboard from './pages/PublicDashboard';
import DoCCProjectRegister from './pages/DoCCProjectRegister';
import { supabase } from './supabaseClient';
import { loadCurrentProfile } from './lib/authProfile';
import './login-home-link.css';
import './pages/public-refresh.css';

const DEFAULT_PATH = '/dashboards';
const SPECIAL_AUTHORISED_PATHS = ['/docc-project-register'];
const INTERNAL_PREFIXES = ['/login', '/dashboards', '/analytics', '/project-setup', '/merl-reporting', '/reports', '/review', '/admin', ...SPECIAL_AUTHORISED_PATHS];

export default function PublicEntry() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  // undefined means the authentication/profile check is still running.
  const [session, setSession] = useState(undefined);
  const [profileValid, setProfileValid] = useState(undefined);

  useEffect(() => {
    let alive = true;

    const validate = async (nextSession) => {
      if (!alive) return;
      setSession(nextSession || null);
      if (!nextSession) {
        setProfileValid(false);
        return;
      }
      setProfileValid(undefined);
      try {
        // Do not reject a valid MERL user because the first profile RPC fires a
        // fraction too early after SIGNED_IN/TOKEN_REFRESHED. The shared helper
        // retries briefly, then fails closed if no linked profile exists.
        const { profile } = await loadCurrentProfile();
        const valid = !!profile?.id && !!profile?.role;
        if (!alive) return;
        setProfileValid(valid);
        // A Supabase session without a valid MERL profile is not a valid portal
        // credential. Clear it so every protected link falls back to public.
        if (!valid) await supabase.auth.signOut();
      } catch {
        if (!alive) return;
        setProfileValid(false);
        try { await supabase.auth.signOut(); } catch { /* non-fatal */ }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      void validate(nextSession);
    });

    void supabase.auth.getSession()
      .then(({ data }) => validate(data.session))
      .catch(() => validate(null));

    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const checking = session === undefined || (!!session && profileValid === undefined);
  if (checking) {
    return <div role="status" className="pbd-state">
      {i18n.resolvedLanguage?.startsWith('fr') ? 'Ouverture de MERL…' : 'Opening MERL…'}
    </div>;
  }

  const authorised = !!session && profileValid === true;

  // Security/default-entry rule: any visitor without valid MERL credentials,
  // regardless of the URL/hash they were given, lands on the public dashboard.
  if (!authorised) {
    if (pathname !== DEFAULT_PATH) return <Navigate to={DEFAULT_PATH} replace />;
    return <PublicDashboard />;
  }

  // Valid users entering the bare/public/unknown URL are taken to the internal
  // dashboard rather than left on an obsolete or malformed route.
  if (pathname === '/' || pathname === '/public') return <Navigate to={DEFAULT_PATH} replace />;
  const internal = INTERNAL_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!internal) return <Navigate to={DEFAULT_PATH} replace />;

  // The legacy DoCC register remains reachable only to authenticated users.
  if (pathname === '/docc-project-register') return <DoCCProjectRegister />;

  // A signed-in user no longer needs the standalone login route.
  if (pathname === '/login') return <Navigate to={DEFAULT_PATH} replace />;

  return <App />;
}
