import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Navigation stays outside the document captured by Word/PDF exports.
export default function ReportContents({ onOpen, revision }) {
  const { t } = useTranslation();
  const [sections, setSections] = useState([]);
  const [active, setActive] = useState('');
  useEffect(() => {
    const root = document.getElementById('report-preview');
    if (!root) return;
    const refresh = () => {
      const items = [...root.querySelectorAll('h2,h3')].filter(node => !node.closest('.island-report-cover')).map((node, index) => {
        node.id = `report-section-${index}`;
        return { id:node.id, title:node.textContent.trim() };
      });
      setSections(previous => JSON.stringify(previous) === JSON.stringify(items) ? previous : items);
      setActive('');
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(root, { childList:true, subtree:true, characterData:true });
    return () => observer.disconnect();
  }, [revision]);
  if (!sections.length) return null;
  const go = id => {
    onOpen();
    setActive(id);
    requestAnimationFrame(() => {
      const heading = document.getElementById(id);
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll:true });
      heading.scrollIntoView({ block:'start', behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  };
  return <nav className="report-contents rp-noprint" aria-label={t('reading.contents')}>
    <strong>{t('reading.contents')}</strong>
    <p>{t('reading.contentsHelp')}</p>
    <ol>{sections.map(section => <li key={section.id}><button type="button" aria-current={active === section.id ? 'location' : undefined} onClick={() => go(section.id)}>{section.title}</button></li>)}</ol>
  </nav>;
}
