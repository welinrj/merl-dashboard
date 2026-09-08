import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import App from './App';
import PublicDashboard from './pages/PublicDashboard';
import './login-home-link.css';
import './pages/public-refresh.css';

const PUBLIC_PATHS = new Set(['/', '/public']);
const INTERNAL_PREFIXES = ['/login', '/dashboards', '/analytics', '/project-setup', '/merl-reporting', '/reports', '/review', '/admin'];

export default function PublicEntry() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();

  // The bare site URL (with or without a query string) is always public,
  // even if an officer already has an authenticated session on this device.
  if (PUBLIC_PATHS.has(pathname)) return <PublicDashboard />;

  const internal = INTERNAL_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!internal) return <Navigate to="/" replace />;

  // Internal routes retain the existing Supabase session, profile and role gates.
  // Never render the authenticated workspace as a public-route fallback.
  return <>
    <App />
    {pathname === '/login' && <Link className="lg2-home-link" to="/">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      {i18n.resolvedLanguage?.startsWith('fr') ? 'Retour au tableau de bord public' : 'Back to public dashboard'}
    </Link>}
  </>;
}
