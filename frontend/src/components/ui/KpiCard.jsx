// KpiCard — headline stat card for the Dashboard Overview KPI row. Matches the
// app's flat, bordered card language (.card / .card-hover in index.css): 8px
// radius, 1px border, restrained shadow, border-colour change on hover — no
// lift, no scale, no shadow escalation.
//
// The card carries no icon. A KPI is read from its label and its number; an
// icon beside every metric is decoration, and a coloured circle around that
// icon is the signature of a generic template. Where a metric genuinely needs
// a symbol (the GEDSI beneficiary breakdown), the page passes it via `children`.
import { ArrowRight } from './icons';
import { cn } from '@/lib/utils';

export default function KpiCard({
  label, value, sub, progress, progressColor, linkLabel,
  onClick, children, className,
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex w-full min-w-0 flex-col gap-3 rounded-lg border',
        'border-[var(--border)] bg-white p-4 text-left shadow-[var(--shadow-sm)]',
        'transition-colors duration-150',
        onClick && 'cursor-pointer hover:border-[var(--green-200)]',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[0.68rem] font-bold uppercase tracking-wide text-[var(--text-3)]">
          {label}
        </div>
        <div
          className="mt-1 truncate text-[clamp(1.3rem,1.9vw,1.75rem)] font-extrabold leading-none tracking-tight text-[var(--navy-900)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {value}
        </div>
      </div>

      {sub && <div className="text-xs leading-snug text-[var(--text-2)]">{sub}</div>}

      {children}

      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%`, background: progressColor || 'var(--green-600)' }}
          />
        </div>
      )}

      {linkLabel && (
        <span className="mt-auto inline-flex items-center gap-1 self-start text-xs font-semibold text-[var(--green-700)] group-hover:underline">
          {linkLabel}
          <ArrowRight size={13} aria-hidden="true" />
        </span>
      )}
    </Tag>
  );
}
