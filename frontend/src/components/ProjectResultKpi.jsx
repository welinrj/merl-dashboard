import { useTranslation } from 'react-i18next';
import StatTile from './ui/StatTile';
import { fmtNum } from '../lib/locale';
import { fmtPct } from '../lib/docc/reporting';
import { resultKpiGrade } from '../lib/docc/resultKpiGrade';
import './project-result-kpi.css';
const LABELS = {
  achieved: ['Target achieved', 'Cible atteinte'],
  high: ['90–99% of target', '90–99 % de la cible'],
  middle: ['60–89% of target', '60–89 % de la cible'],
  low: ['Below 60% of target', 'Moins de 60 % de la cible'],
  onTrack: ['On track', 'En bonne voie'], attention: ['Needs attention', 'À surveiller'],
  notDue: ['Not yet due', 'Pas encore dû'], notAssessed: ['Not assessed', 'Non évalué'],
  unreported: ['Not reported', 'Non renseigné'],
};
export default function ProjectResultKpi({ entry, config, onClick }) {
  const { t, i18n } = useTranslation();
  const french = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('fr');
  const actual = entry.progress?.cumulative_actual ?? entry.progress?.actual_this_period;
  const target = entry.progress?.final_target ?? entry.indicator.target_value;
  const grade = resultKpiGrade(entry);
  return <button type="button" className={`kpi-jump project-result-kpi grade-${grade.tone}`}
    data-grade={grade.tone} data-indicator={entry.indicator.id} onClick={onClick}>
    <StatTile label={config.short_label}
      value={actual != null ? `${fmtNum(actual)}${entry.indicator.unit ? ` ${entry.indicator.unit}` : ''}` : entry.status === 'achieved' ? (french ? 'Terminé' : 'Completed') : entry.progress ? (french ? 'Mise à jour reçue' : 'Update recorded') : t('ppa.notReported')}
      placeholder={actual == null && entry.status !== 'achieved'}
      sub={config.show_progress && grade.pct != null
        ? `${fmtPct(grade.pct)} ${french ? 'atteint' : 'progress'}`
        : config.show_target && target != null ? `${french ? 'Cible' : 'Target'}: ${fmtNum(target)}${entry.indicator.unit ? ` ${entry.indicator.unit}` : ''}` : entry.indicator.code}>
      <div className="project-result-grade">
        <span className="project-result-grade-label">{LABELS[grade.label][french ? 1 : 0]}</span>
        {grade.pct != null && <span className="project-result-grade-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, grade.pct))}%` }} /></span>}
      </div>
    </StatTile>
  </button>;
}
