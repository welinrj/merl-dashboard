// EmptyState — a consistent, professional empty state (spec §60). Never a blank
// white card. Optional icon, title, description and a call-to-action.
//
//   <EmptyState icon={Inbox} title="No reports awaiting review"
//               description="You're up to date." />
//   <EmptyState title="No indicators configured"
//               description="Add an indicator to begin results monitoring."
//               action={<button className="btn-primary" onClick={add}>Add indicator</button>} />

export default function EmptyState({ icon: Icon, title, description, action, compact = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', gap: '0.5rem', padding: compact ? '1.5rem 1rem' : '2.75rem 1.5rem', color: 'var(--text-3)' }}>
      {Icon && (
        <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--green-50)', color: 'var(--green-600)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.15rem' }}>
          <Icon size={22} aria-hidden="true" />
        </div>
      )}
      {title && <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>}
      {description && <div style={{ fontSize: '0.83rem', maxWidth: 380, lineHeight: 1.5 }}>{description}</div>}
      {action && <div style={{ marginTop: '0.6rem' }}>{action}</div>}
    </div>
  );
}
