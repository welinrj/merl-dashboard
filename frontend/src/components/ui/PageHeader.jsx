// PageHeader — the standard page header (spec §13). Left: optional breadcrumb,
// title, subtitle. Right: actions. Reused across pages so every screen opens the
// same way.
//
//   <PageHeader
//     title="Review & Approval"
//     subtitle="Reporting-period submissions across the portfolio."
//     breadcrumb={[{ label:'Projects', to:'/project-setup' }, { label:'PRJ-0004' }]}
//     actions={<button className="btn-primary">Save</button>} />
import { NavLink } from 'react-router-dom';

export default function PageHeader({ title, subtitle, breadcrumb, actions, icon: Icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
      <div style={{ minWidth: 0 }}>
        {Array.isArray(breadcrumb) && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem', marginBottom: '0.4rem', fontSize: '0.75rem', color: 'var(--text-3)' }}>
            {breadcrumb.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                {i > 0 && <span aria-hidden="true" style={{ color: 'var(--text-3)' }}>/</span>}
                {c.to ? (
                  <NavLink to={c.to} style={{ color: 'var(--text-3)', textDecoration: 'none' }}>{c.label}</NavLink>
                ) : (
                  <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          {Icon && <Icon size={22} style={{ color: 'var(--green-700)', flexShrink: 0 }} aria-hidden="true" />}
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.35rem, 3.5vw, 1.7rem)', fontWeight: 700,
            letterSpacing: '-0.01em', color: 'var(--text-1)', margin: 0 }}>{title}</h1>
        </div>
        {subtitle && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', margin: '0.3rem 0 0', maxWidth: 640, lineHeight: 1.5 }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>{actions}</div>
      )}
    </div>
  );
}
