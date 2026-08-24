// KpiCard — shadcn/ui-shaped stat card (rounded border, soft shadow, icon
// chip) with a 21st.dev-style hover treatment: the whole card lifts and its
// footer affordance brightens on hover/focus, rather than only a small link
// inside it. Used for the Dashboard Overview's headline KPI row.
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function KpiCard({
  icon: Icon, label, value, sub, progress, progressColor, linkLabel,
  onClick, accent = 'var(--green-600)', solid, children, className,
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex w-full min-w-0 flex-col gap-3 rounded-2xl border',
        'border-[var(--border)] bg-white p-4 text-left shadow-[var(--shadow-sm)]',
        'transition-all duration-200 sm:p-5',
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] hover:border-[color-mix(in_srgb,var(--green-600)_45%,var(--border))]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
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
        {Icon && (
          <span
            className="flex h-10 w-10 flex-none items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105"
            style={solid
              ? { background: accent, color: '#fff' }
              : { background: `color-mix(in srgb, ${accent} 14%, white)`, color: accent }}
            aria-hidden="true"
          >
            <Icon size={19} strokeWidth={2.1} />
          </span>
        )}
      </div>

      {sub && <div className="text-xs leading-snug text-[var(--text-2)]">{sub}</div>}

      {children}

      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%`, background: progressColor || accent }}
          />
        </div>
      )}

      {linkLabel && (
        <span className="mt-auto inline-flex items-center gap-1 self-start text-xs font-semibold text-[var(--green-700)] opacity-80 transition-opacity duration-200 group-hover:opacity-100 group-hover:underline">
          {linkLabel}
          <ArrowRight size={13} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      )}
    </Tag>
  );
}
