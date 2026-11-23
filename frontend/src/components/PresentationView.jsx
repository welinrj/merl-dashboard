import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './presentation-view.css';

export function PresentationMetric({ label, value, stamp }) {
  return <article className="presentation-metric"><h3>{label}</h3><strong>{value}</strong><p>{stamp}</p></article>;
}

export default function PresentationView({ title, subtitle, slides, lang = 'en', onClose }) {
  const french = lang.startsWith('fr');
  const dialog = useRef(null), surface = useRef(null), headingId = useId();
  const [active, setActive] = useState(slides[0]?.id);
  const [fullScreen, setFullScreen] = useState(false);
  const current = slides.find(slide => slide.id === active) || slides[0];
  useEffect(() => {
    const element = dialog.current, content = surface.current, previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    const sync = () => setFullScreen(document.fullscreenElement === content);
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (document.fullscreenElement === content) void document.exitFullscreen?.().catch(() => {});
      element.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const toggleFullScreen = () => {
    if (fullScreen) void document.exitFullscreen?.().catch(() => {});
    else void surface.current?.requestFullscreen?.().catch(() => {});
  };
  return createPortal(<dialog ref={dialog} className="presentation-dialog" aria-labelledby={headingId} onClose={onClose}>
    <div ref={surface} className="presentation-surface">
      <header className="presentation-header"><div><div className="presentation-brand"><img src={`${import.meta.env.BASE_URL}vanuatu-coat-of-arms.svg`} alt="Coat of arms of Vanuatu"/><img src={`${import.meta.env.BASE_URL}docc-logo.png`} alt="Department of Climate Change, Vanuatu"/><span>MERL</span></div><h2 id={headingId}>{title}</h2><p>{subtitle}</p></div>
        <div className="presentation-actions">{document.fullscreenEnabled && <button type="button" onClick={toggleFullScreen}>{fullScreen ? (french ? 'Réduire' : 'Leave full screen') : (french ? 'Plein écran du navigateur' : 'Browser full screen')}</button>}
          <button type="button" onClick={() => dialog.current.close()}>{french ? 'Quitter la présentation' : 'Exit presentation'}</button></div>
      </header>
      <nav className="presentation-nav" aria-label={french ? 'Vues de présentation' : 'Presentation views'}>{slides.map(slide => <button type="button" key={slide.id} aria-pressed={current.id === slide.id} onClick={() => setActive(slide.id)}>{slide.label}</button>)}</nav>
      <section key={current.id} className="presentation-content" aria-label={current.label}>{current.content}</section>
    </div>
  </dialog>, document.body);
}
