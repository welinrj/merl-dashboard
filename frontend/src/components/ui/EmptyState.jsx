// EmptyState — a consistent, professional empty state (spec §60). Never a blank
// white card. A concise operational message and, where the user can act, one
// call-to-action. No icon and no illustration: an empty table is explained by
// the sentence, not by a decorative symbol above it.
//
//   <EmptyState title="No reports awaiting review"
//               description="You're up to date." />
//   <EmptyState title="No indicators configured"
//               description="Add an indicator to begin results monitoring."
//               action={<button className="btn-primary" onClick={add}>Add indicator</button>} />

export default function EmptyState({ title, description, action, compact = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', gap: '0.4rem', padding: compact ? '1.5rem 1rem' : '2.25rem 1.5rem', color: 'var(--text-3)' }}>
      {title && <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>}
      {description && <div style={{ fontSize: '0.83rem', maxWidth: 380, lineHeight: 1.5 }}>{description}</div>}
      {action && <div style={{ marginTop: '0.6rem' }}>{action}</div>}
    </div>
  );
}
