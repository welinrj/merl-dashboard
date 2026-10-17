import { useTranslation } from 'react-i18next';
import { fmtNum } from '../lib/locale';

export default function ResultAchievement({ value }) {
  const { t } = useTranslation();
  if (value == null || !Number.isFinite(Number(value))) return null;
  const actual = Number(value);
  return <figure className="reading-achievement">
    <figcaption>{t('rf.progress')}: <strong>{fmtNum(actual)}%</strong></figcaption>
    <div className="reading-achievement-track" role="img" aria-label={t('reading.achievementScale', { value:fmtNum(actual) })}>
      <span style={{ width:`${Math.max(0, Math.min(100, actual))}%` }} />
      <i aria-hidden="true" />
    </div>
    <div className="reading-achievement-axis" aria-hidden="true"><span>0%</span><span>{t('reading.targetMarker')}</span></div>
  </figure>;
}
