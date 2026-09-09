// Keep the existing KPI primitive unchanged. Only the authenticated Overview
// beneficiary card gets the additional, filter-aware aggregate breakdown.
import KpiCardBase from './KpiCardBase';
import BeneficiarySummary from './BeneficiarySummary';

export default function KpiCard(props) {
  const classes = typeof props.className === 'string' ? props.className.split(/\s+/) : [];
  if (classes.includes('ovx-kpi-beneficiaries')) return <BeneficiarySummary {...props} />;
  return <KpiCardBase {...props} />;
}
