// Preserve the existing KPI primitive and its navigation.
import KpiCardBase from './KpiCardBase';
import BeneficiarySummary from './BeneficiarySummary';
import ProjectStatusSummary from './ProjectStatusSummary';

export default function KpiCard(props) {
  const classes = typeof props.className === 'string' ? props.className.split(/\s+/) : [];
  if (classes.includes('ovx-kpi-beneficiaries')) return <BeneficiarySummary {...props} />;
  if (classes.includes('ovx-kpi-projects')) return <><KpiCardBase {...props} /><ProjectStatusSummary /></>;
  return <KpiCardBase {...props} />;
}
