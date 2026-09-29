import * as ProgressPrimitive from '@radix-ui/react-progress';

// Adapted from the 21st.dev "Stats card with progress" component by Ephraim Duncan:
// https://21st.dev/@ephraimduncan/components/stats-cards-with-links/stats-card-with-progress
// The content remains portal-specific; this supplies the Card and Progress composition.
const clampPercent = value => Math.max(0, Math.min(100, Number(value) || 0));

export function IndicatorProgressCard({
  className = '',
  icon,
  title,
  value,
  progress,
  meta,
  actionLabel,
  open = false,
  controls,
  onClick,
}) {
  const percentage = clampPercent(progress);

  return (
    <button
      type="button"
      data-slot="card"
      className={`pbd-activity-category pbd-21st-progress-card ${className}`}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onClick}
    >
      <span data-slot="card-content" className="pbd-21st-card-content">
        <span data-slot="card-header" className="pbd-21st-card-header">
          <span className="pbd-activity-category-icon" aria-hidden="true">{icon}</span>
          <span data-slot="card-title" className="pbd-21st-card-title">{title}</span>
          <strong className="pbd-21st-card-value">{value}</strong>
        </span>

        <ProgressPrimitive.Root
          data-slot="progress"
          className="pbd-21st-card-progress"
          value={percentage}
          aria-hidden="true"
        >
          <ProgressPrimitive.Indicator
            data-slot="progress-indicator"
            className="pbd-21st-card-progress-indicator"
            style={{ transform: `translateX(-${100 - percentage}%)` }}
          />
        </ProgressPrimitive.Root>

        <span data-slot="card-footer" className="pbd-21st-card-footer">
          <span>{meta}</span>
          <span className="pbd-21st-card-action">{actionLabel}</span>
        </span>
      </span>
    </button>
  );
}
