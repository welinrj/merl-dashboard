import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const destinations = ['home', 'projects', 'results', 'map', 'about'];

export default function PublicMobileNavigation({ copy, onNavigate }) {
  const { i18n } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const lang = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const choose = (id) => { setOpen(false); onNavigate(id); };
  return <>
    <button type="button" className="pub-menu-toggle" aria-expanded={open} aria-controls="pub-mobile-navigation" aria-label={lang === 'fr' ? 'Menu de navigation' : 'Navigation menu'} onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open ? 'M5 5l14 14M19 5L5 19' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
      <span>{lang === 'fr' ? 'Menu' : 'Menu'}</span>
    </button>
    <nav id="pub-mobile-navigation" className="pub-mobile-nav" aria-label={lang === 'fr' ? 'Navigation publique' : 'Public navigation'} hidden={!open}>
      {destinations.map(id => <button type="button" key={id} onClick={() => choose(id)}>{copy[id]}</button>)}
      <div className="pub-mobile-lang" role="group" aria-label={lang === 'fr' ? 'Langue' : 'Language'}>
        <button type="button" lang="en" aria-pressed={lang === 'en'} onClick={() => void i18n.changeLanguage('en')}>EN</button>
        <button type="button" lang="fr" aria-pressed={lang === 'fr'} onClick={() => void i18n.changeLanguage('fr')}>FR</button>
      </div>
    </nav>
  </>;
}
