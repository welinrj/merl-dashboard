import { OverviewIcon, FundingIcon, BeneficiariesIcon, LocationsIcon, ReportsIcon, ResultsIcon, ReviewIcon } from './MerlIcons';
// SectionCard — a titled content card (spec §7 "form section card" variant).
// Standard white card with a header row (title + optional description + actions)
// and a body. Keeps section spacing/typography consistent across pages.
//
//   <SectionCard title="Indicator Progress" description="Form 4"
//                actions={<button className="btn-secondary">Add</button>}>
//     …content…
//   </SectionCard>

// No icon slot: the title and its description carry the hierarchy on their own.
export default function SectionCard({ title, description, actions, children, bodyStyle, style, icon }) {
  const name = typeof title === 'string' ? title : '';
  const Icon = icon || (/financ|budget|fund|financement/i.test(name) ? FundingIcon : /beneficiar|bénéfic/i.test(name) ? BeneficiariesIcon : /location|geograph|géograph|lieu/i.test(name) ? LocationsIcon : /risk|risque|review|examen/i.test(name) ? ReviewIcon : /report|rapport/i.test(name) ? ReportsIcon : /result|résultat|indicator|indicateur/i.test(name) ? ResultsIcon : OverviewIcon);
  return (
    <div className="card island-section" style={{ padding: 0, overflow: 'hidden', ...style }}>
      {(title || actions) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
          flexWrap: 'wrap', padding: '0.9rem 1.15rem', borderBottom: '1px solid var(--border)' }}>
          <div className="island-section-heading" style={{ minWidth: 0 }}>
            <span className="merl-card-icon"><Icon size={24} /></span>
            <div>
            {title && <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>}
            {description && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: 1 }}>{description}</div>}
            </div>
          </div>
          {actions && <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: '1.1rem 1.15rem', ...bodyStyle }}>{children}</div>
    </div>
  );
}
