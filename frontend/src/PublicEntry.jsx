import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import App from './App';
import PublicDashboard from './pages/PublicDashboard';
import { supabase } from './supabaseClient';
import './login-home-link.css';
import './pages/public-refresh.css';

const DEFAULT_PATH = '/dashboards';
const INTERNAL_PREFIXES = ['/login', '/dashboards', '/analytics', '/project-setup', '/merl-reporting', '/reports', '/review', '/admin'];

export default function PublicEntry() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  // undefined means the initial session check has not finished. A session is
  // not authorisation: App still verifies the profile and applies its role gates.
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let alive = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      if (event === 'SIGNED_OUT') navigate(DEFAULT_PATH, { replace: true });
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(current => current === undefined ? data.session : current);
    }).catch(() => {
      if (alive) setSession(current => current === undefined ? null : current);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [navigate]);

  // Old public bookmarks and the bare site URL resolve to the one shared entry.
  if (pathname === '/' || pathname === '/public') return <Navigate to={DEFAULT_PATH} replace />;

  const internal = INTERNAL_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!internal) return <Navigate to={DEFAULT_PATH} replace />;

  // Guests see only the approved-public snapshot. Signed-in users enter the
  // existing workspace, whose profile and role checks remain unchanged.
  if (pathname === DEFAULT_PATH) {
    if (session === undefined) {
      return <div role="status" className="pbd-state">
        {i18n.resolvedLanguage?.startsWith('fr') ? 'Ouverture de MERL…' : 'Opening MERL…'}
      </div>;
    }
    if (!session) return <PublicDashboard />;
  }

  // The existing login form establishes the session; return to the same entry.
  if (pathname === '/login' && session) return <Navigate to={DEFAULT_PATH} replace />;

  return <>
    <App />
    {pathname === '/login' && <Link className="lg2-home-link" to={DEFAULT_PATH}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      {i18n.resolvedLanguage?.startsWith('fr') ? 'Retour au tableau de bord public' : 'Back to public dashboard'}
    </Link>}
  </>;
}
