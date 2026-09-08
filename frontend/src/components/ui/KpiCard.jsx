// Executive KPI primitive adapted from the user-supplied 21st.dev score-card.
// The caller owns the values, labels and destinations; no demonstration data is used.
import { cn } from '@/lib/utils';

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function ScoreGauge({ value, displayValue }) {
  const pct = clampPct(value);
  const tone = value == null ? 'none' : pct >= 80 ? 'strong' : pct >= 40 ? 'moderate' : 'weak';
  return (
    <div className={`k21-gauge tone-${tone}`}>
      <svg viewBox="0 0 200 112" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <path className="k21-gauge-track" d="M 12 100 A 88 88 0 0 1 188 100" pathLength="100" />
        <path className="k21-gauge-value" d="M 12 100 A 88 88 0 0 1 188 100" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - pct} />
      </svg>
      <div className="k21-gauge-copy">
        <span className="kpi-card-value">{displayValue}</span>
        <span className="k21-gauge-unit">100% scale</span>
      </div>
    </div>
  );
}

const OVERVIEW_METRIC_STYLES = `
  /* Match the supplied score-card hierarchy: title, large visual with its
     number inside, supporting context and a bottom-aligned destination. */
  .dsh .ovx .ovx-kpis{
    display:grid!important;
    grid-template-columns:repeat(4,minmax(0,1fr))!important;
    gap:1rem!important;
    margin-bottom:1.15rem!important;
    overflow:visible!important;
    border:0!important;
    border-radius:0!important;
    background:transparent!important;
    box-shadow:none!important;
  }
  .dsh .ovx .ovx-kpis .ovx-kpi{
    display:grid!important;
    grid-template-columns:minmax(0,1fr)!important;
    grid-template-rows:minmax(36px,auto) minmax(150px,1fr) auto auto!important;
    align-content:stretch!important;
    gap:.65rem!important;
    min-height:310px!important;
    padding:1.15rem!important;
    border:1px solid #dfe7f2!important;
    border-radius:18px!important;
    background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(249,252,255,.96))!important;
    box-shadow:0 8px 28px rgba(28,67,133,.07)!important;
    overflow:hidden!important;
    isolation:isolate;
  }
  .dsh .ovx .ovx-kpis .ovx-kpi::before{content:none!important;display:none!important;}
  .dsh .ovx .ovx-kpis button.ovx-kpi:hover{
    transform:translateY(-2px);
    border-color:#bfd0ea!important;
    box-shadow:0 12px 32px rgba(28,67,133,.11)!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-head{min-width:0;align-self:start;text-align:left;}
  .dsh .ovx .ovx-kpis .kpi-card-label{
    color:#172d57!important;
    font-size:.85rem!important;
    font-weight:740!important;
    line-height:1.35!important;
    letter-spacing:0!important;
    text-transform:none!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-visual{
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    min-width:0;
    min-height:150px;
    padding:0!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-value{
    display:block!important;
    min-width:0;
    margin:0!important;
    color:#172d57!important;
    font-family:var(--font-display)!important;
    font-size:clamp(1.9rem,2.5vw,2.5rem)!important;
    font-weight:780!important;
    font-variant-numeric:tabular-nums!important;
    letter-spacing:-.04em!important;
    line-height:1.1!important;
    white-space:nowrap;
    text-align:center!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-sub{
    min-width:0;
    min-height:2.8em;
    color:#728096!important;
    font-size:.76rem!important;
    line-height:1.45!important;
    text-align:center;
  }
  .dsh .ovx .ovx-kpis .kpi-card-progress{display:none!important;}
  .dsh .ovx .ovx-kpis .kpi-card-link{
    margin:0!important;
    align-self:end!important;
    color:#205fc8!important;
    font-size:.72rem!important;
    font-weight:700!important;
    line-height:1.35!important;
    opacity:1!important;
    text-align:center;
    justify-self:center;
  }
  .dsh .ovx .ovx-kpis button.ovx-kpi:hover .kpi-card-link{
    text-decoration:underline!important;
    text-underline-offset:3px!important;
  }
  .k21-gauge{
    position:relative;
    width:min(220px,100%);
    aspect-ratio:200/112;
    flex:none;
  }
  .k21-gauge svg{display:block;width:100%;height:100%;overflow:visible;}
  .k21-gauge-track,.k21-gauge-value{fill:none;stroke-width:12;stroke-linecap:butt;}
  .k21-gauge-track{stroke:#e8eef7;}
  .k21-gauge-value{stroke:#205fc8;transition:stroke-dashoffset .8s cubic-bezier(.33,1,.68,1);}
  .k21-gauge.tone-strong .k21-gauge-value{stroke:#22a565;}
  .k21-gauge.tone-moderate .k21-gauge-value{stroke:#e0a12a;}
  .k21-gauge.tone-weak .k21-gauge-value{stroke:#dc5d52;}
  .k21-gauge.tone-none .k21-gauge-value{stroke:#a8b4c5;}
  .k21-gauge-copy{
    position:absolute;
    inset:45% 0 5%;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:flex-end;
    gap:2px;
    pointer-events:none;
  }
  .dsh .ovx .ovx-kpis .k21-gauge-copy .kpi-card-value{
    font-size:clamp(1.65rem,2.3vw,2.2rem)!important;
  }
  .k21-gauge-unit{
    color:#7b8799;
    font-size:.62rem;
    font-weight:650;
    line-height:1.25;
    letter-spacing:.02em;
  }
  @media(max-width:1100px){
    .dsh .ovx .ovx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
  }
  @media(max-width:560px){
    .dsh .ovx .ovx-kpis{grid-template-columns:1fr!important;}
    .dsh .ovx .ovx-kpis .ovx-kpi{min-height:290px!important;}
  }
  @media(prefers-reduced-motion:reduce){
    .k21-gauge-value{transition:none;}
    .dsh .ovx .ovx-kpis button.ovx-kpi:hover{transform:none;}
  }
`;

export default function KpiCard({
  label, value, sub, progress, progressColor, linkLabel,
  onClick, children, className,
}) {
  const Tag = onClick ? 'button' : 'div';
  const injectOverviewStyles = typeof className === 'string' && className.includes('ovx-kpi-progress');
  const showGauge = progress != null;

  return (
    <>
      {injectOverviewStyles && <style>{OVERVIEW_METRIC_STYLES}</style>}
      <Tag
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        className={cn(
          'group relative flex w-full min-w-0 flex-col gap-2.5 rounded-[var(--radius-card)] border',
          'border-[var(--border)] bg-white p-4 text-left transition-all duration-200',
          onClick && 'cursor-pointer hover:border-[var(--border-strong)]',
          className,
        )}
      >
        <div className="kpi-card-head min-w-0">
          <div className="kpi-card-label text-[0.72rem] font-semibold leading-tight text-[var(--text-2)]">{label}</div>
        </div>
        <div className="kpi-card-visual">
          {showGauge ? (
            <ScoreGauge value={progress} displayValue={value} />
          ) : (
            <div className="kpi-card-value">{value}</div>
          )}
        </div>
        <div className="kpi-card-sub text-xs leading-snug text-[var(--text-3)]">
          {sub}
          {children}
        </div>
        {progress != null && (
          <div className="kpi-card-progress h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-2)]">
            <div className="kpi-card-progress-fill h-full rounded-[3px]" style={{ width: `${clampPct(progress)}%`, background: progressColor || 'var(--green-600)' }} />
          </div>
        )}
        {linkLabel && <span className="kpi-card-link text-xs font-semibold text-[var(--green-700)]">{linkLabel}</span>}
      </Tag>
    </>
  );
}
