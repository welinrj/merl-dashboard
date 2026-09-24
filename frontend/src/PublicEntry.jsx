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
import './pages/public-phone.css';

const DEFAULT_PATH = '/dashboards';
const SPECIAL_AUTHORISED_PATHS = ['/docc-project-register'];
const INTERNAL_PREFIXES = ['/login', '/dashboards', '/analytics', '/project-setup', '/results-framework', '/merl-reporting', '/reports', '/review', '/admin', ...SPECIAL_AUTHORISED_PATHS];

export default function PublicEntry() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const [session, setSession] = useState(undefined);
  const [profileValid, setProfileValid] = useState(undefined);

  useEffect(() => {
    let alive = true;
    const validate = async (nextSession) => {
      if (!alive) return;
      setSession(nextSession || null);
      if (!nextSession) { setProfileValid(false); return; }
      setProfileValid(undefined);
      try {
        const { profile } = await loadCurrentProfile();
        const valid = !!profile?.id && !!profile?.role;
        if (!alive) return;
        setProfileValid(valid);
        if (!valid) await supabase.auth.signOut();
      } catch {
        if (!alive) return;
        setProfileValid(false);
        try { await supabase.auth.signOut(); } catch { /* non-fatal */ }
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => { void validate(nextSession); });
    void supabase.auth.getSession().then(({ data }) => validate(data.session)).catch(() => validate(null));
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const checking = session === undefined || (!!session && profileValid === undefined);
  if (checking) return <div role="status" className="pbd-state">{i18n.resolvedLanguage?.startsWith('fr') ? 'Ouverture de MERL…' : 'Opening MERL…'}</div>;
  const authorised = !!session && profileValid === true;
  if (!authorised) {
    if (pathname !== DEFAULT_PATH) return <Navigate to={DEFAULT_PATH} replace />;
    return <PublicDashboard />;
  }
  if (pathname === '/' || pathname === '/public') return <Navigate to={DEFAULT_PATH} replace />;
  const internal = INTERNAL_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!internal) return <Navigate to={DEFAULT_PATH} replace />;
  if (pathname === '/docc-project-register') return <DoCCProjectRegister />;
  if (pathname === '/login') return <Navigate to={DEFAULT_PATH} replace />;
  return <App />;
}
