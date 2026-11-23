
// Adapted from the 21st.dev "Stats card with progress" component by Ephraim Duncan:
// https://21st.dev/@ephraimduncan/components/stats-cards-with-links/stats-card-with-progress
// Retains the accessible card composition. Category counts are not achievement
// percentages, so no progress bar is rendered.

export function IndicatorProgressCard({
  className = '',
  icon,
  title,
  value,
  meta,
  actionLabel,
  open = false,
  controls,
  onClick,
}) {

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

        <span data-slot="card-footer" className="pbd-21st-card-footer">
          <span>{meta}</span>
          <span className="pbd-21st-card-action">{actionLabel}</span>
        </span>
      </span>
    </button>
  );
}
