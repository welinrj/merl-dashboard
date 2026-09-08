import { useLayoutEffect, useRef } from 'react';
import './header-partner-logos.css';

// Reuse the institutional assets already supplied with the MERL portal.
// BASE_URL keeps them working at the GitHub Pages project path.
const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`;

export default function HeaderPartnerLogos() {
  const groupRef = useRef<HTMLDivElement>(null);

  // The institutional band and controls can wrap at different widths. Keep
  // the existing sticky sidebar below the actual header, not a guessed height.
  useLayoutEffect(() => {
    const header = groupRef.current?.closest('.dsh-head');
    const shell = header?.closest('.dsh');
    if (!header || !shell) return;

    const update = () => {
      shell.style.setProperty('--workspace-header-h', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => {
        window.removeEventListener('resize', update);
        shell.style.removeProperty('--workspace-header-h');
      };
    }
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => {
      observer.disconnect();
      shell.style.removeProperty('--workspace-header-h');
    };
  }, []);

  return (
    <div ref={groupRef} className="merl-partner-logos" role="group" aria-label="Institutional partners">
      <img className="merl-partner-crest" src={asset('vanuatu-coat-of-arms.svg')} alt="Coat of arms of Vanuatu" />
      <img className="merl-partner-docc" src={asset('docc-logo.png')} alt="Department of Climate Change, Vanuatu" />
      <img className="merl-partner-mfat" src={asset('mfat-logo.png')} alt="New Zealand Ministry of Foreign Affairs and Trade" />
    </div>
  );
}
