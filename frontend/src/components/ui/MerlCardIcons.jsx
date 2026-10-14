// Approved card artwork. Vite imports keep asset URLs valid on GitHub Pages.
import projects from '../../assets/merl-card-icons/projects-in-portfolio.svg';
import progress from '../../assets/merl-card-icons/overall-progress.svg';
import budget from '../../assets/merl-card-icons/budget-utilisation.svg';
import beneficiaries from '../../assets/merl-card-icons/beneficiaries-reached.svg';
import attention from '../../assets/merl-card-icons/needs-attention.svg';
import reporting from '../../assets/merl-card-icons/reporting-completion.svg';

function cardIcon(src) {
  return function CardIcon({ size = 30 }) {
    return <img src={src} alt="" aria-hidden="true" width={size} height={size}
      draggable={false} style={{ display: 'block', width: size, height: size, flexShrink: 0 }} />;
  };
}

export const PortfolioCardIcon = cardIcon(projects);
export const ProgressCardIcon = cardIcon(progress);
export const BudgetCardIcon = cardIcon(budget);
export const BeneficiariesCardIcon = cardIcon(beneficiaries);
export const AttentionCardIcon = cardIcon(attention);
export const ReportingCardIcon = cardIcon(reporting);
