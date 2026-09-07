import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import App from './App';
import PublicPortal from './pages/PublicPortal';
import './login-home-link.css';

const INTERNAL_PREFIXES = ['/login','/dashboards','/analytics','/project-setup','/merl-reporting','/reports','/review','/admin'];

export default function PublicEntry() {
  const { pathname } = useLocation();
  const { i18n } = useTranslation();
  const internal = INTERNAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!internal) return <PublicPortal />;

  return <>
    <App />
    {pathname === '/login' && <Link className="lg2-home-link" to="/">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      {i18n.resolvedLanguage?.startsWith('fr') ? 'Retour à l’accueil' : 'Back to public homepage'}
    </Link>}
  </>;
}
