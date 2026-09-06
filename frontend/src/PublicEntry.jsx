import { useLocation } from 'react-router-dom';
import App from './App';
import PublicPortal from './pages/PublicPortal';

const INTERNAL_PREFIXES = ['/login','/dashboards','/analytics','/project-setup','/merl-reporting','/reports','/review','/admin'];

export default function PublicEntry() {
  const { pathname } = useLocation();
  const internal = INTERNAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return internal ? <App /> : <PublicPortal />;
}
