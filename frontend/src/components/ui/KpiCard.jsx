// Headline KPI card for the executive dashboard.
// The hierarchy is label → value → context → optional progress → drill-down.
// It deliberately avoids ornamental icons, coloured icon discs and arrow marks:
// the metric itself is the visual anchor and the link label already describes
// the destination.
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
        'group relative flex w-full min-w-0 flex-col gap-2.5 rounded-[var(--radius-card)] border',
        'border-[var(--border)] bg-white p-4 text-left',
        'transition-colors duration-150',
        onClick && 'cursor-pointer hover:border-[var(--border-strong)]',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-[0.72rem] font-semibold leading-tight text-[var(--text-2)]">
          {label}
        </div>
        <div
          className="mt-1.5 truncate text-[clamp(1.45rem,2vw,1.85rem)] font-extrabold leading-none tracking-tight text-[var(--navy-900)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {value}
        </div>
      </div>

      {sub && <div className="text-xs leading-snug text-[var(--text-3)]">{sub}</div>}

      {children}

      {progress != null && (
        <div className="h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-2)]">
          <div
            className="h-full rounded-[3px]"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%`, background: progressColor || 'var(--green-600)' }}
          />
        </div>
      )}

      {linkLabel && (
        <span className="kpi-card-link mt-auto self-start text-xs font-semibold text-[var(--green-700)]">
          {linkLabel}
        </span>
      )}
    </Tag>
  );
}
