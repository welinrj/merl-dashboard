import { useTranslation } from 'react-i18next';

// The wordmark is a presentation element; the current page title remains
// available to assistive technology and to the page content below.
export default function WorkspaceHeaderBrand({ title }: { title: string }) {
  const { i18n } = useTranslation();
  const french = i18n.resolvedLanguage?.startsWith('fr');
  return (
    <div className="workspace-header-brand" aria-label={title}>
      <img src={`${import.meta.env.BASE_URL}merl-favicon.png`} alt="" className="workspace-header-emblem" />
      <div className="workspace-header-wordmark" aria-hidden="true">
        <strong>MERL</strong>
        <span>{french ? 'SUIVI · ÉVALUATION · RAPPORTAGE · APPRENTISSAGE' : 'MONITORING · EVALUATION · REPORTING · LEARNING'}</span>
      </div>
    </div>
  );
}
