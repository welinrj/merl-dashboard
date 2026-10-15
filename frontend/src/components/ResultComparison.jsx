import { useTranslation } from 'react-i18next';
import { fmtNum } from '../lib/locale';
export default function ResultComparison({ result }) {
  const { t } = useTranslation();
  if (!result) return null;
  const value = v => v == null || v === '' ? t('resultDetail.missing') : typeof v === 'number' ? fmtNum(v) : String(v);
  return <details className="result-comparison"><summary>{t('resultDetail.comparison')}</summary>
    <dl>{[
      ['basis', t(`resultDetail.${result.basis === 'period' ? 'periodBasis' : 'cumulative'}`)],
      ['target', value(result.target)],
      ['previous', result.previous ? `${value(result.previousActual)} · ${result.previous.reporting_period}` : t('resultDetail.noPrevious')],
      ['change', value(result.change)], ['gap', value(result.gap)],
      ['direction', t(`resultDetail.${result.direction}`, { defaultValue: result.direction })],
      ['approval', result.approval ? t(`rf.states.${result.approval}`, { defaultValue:value(result.approval.replaceAll('_', ' ')) }) : value(null)],
    ].map(([key, text]) => <div key={key}><dt>{t(`resultDetail.${key}`)}</dt><dd>{text}</dd></div>)}</dl>
    <p>{t('resultDetail.methodNote')}</p>
  </details>;
}
