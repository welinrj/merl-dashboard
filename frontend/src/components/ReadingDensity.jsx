import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function useReadingDensity() {
  const [density, setDensity] = useState(() => {
    try { return localStorage.getItem('merl.reading-density') === 'compact' ? 'compact' : 'comfortable'; } catch { return 'comfortable'; }
  });
  return [density, value => {
    setDensity(value);
    try { localStorage.setItem('merl.reading-density', value); } catch { /* Storage may be unavailable. */ }
  }];
}
export default function ReadingDensity({ value, onChange }) {
  const { t } = useTranslation();
  return <div className="reading-density" role="group" aria-label={t('reading.density')}>
    {['comfortable','compact'].map(option => <button type="button" key={option} aria-pressed={value === option} onClick={() => onChange(option)}>{t(`reading.${option}`)}</button>)}
  </div>;
}
