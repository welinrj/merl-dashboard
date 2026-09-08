import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import App from './App';
import PublicDashboard from './pages/PublicDashboard';
import './login-home-link.css';

const INTERNAL_PREFIXES = ['/login','/dashboards','/analytics','/project-setup','/merl-reporting','/reports','/review','/admin'];

export default function PublicEntry() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const internal = INTERNAL_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!internal) return <PublicDashboard />;

  // All internal routes retain the existing Supabase session, profile and role gates.
  // The public dashboard never receives an internal user or elevated data access.
  return <>
    <App />
    {pathname === '/login' && <Link className="lg2-home-link" to="/">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      {i18n.resolvedLanguage?.startsWith('fr') ? 'Retour au tableau de bord public' : 'Back to public dashboard'}
    </Link>}
  </>;
}
