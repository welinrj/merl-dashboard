// Executive KPI primitive adapted from the user-supplied 21st.dev score-card concept.
// The caller owns every metric, label and destination. This component never generates data.
import { cn } from '@/lib/utils';

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function strengthFor(value) {
  if (value == null) return 'No data';
  const n = clampPct(value);
  if (n >= 80) return 'Strong';
  if (n >= 40) return 'Moderate';
  return 'Needs attention';
}

function ScoreGauge({ value }) {
  const pct = clampPct(value);
  const tone = value == null ? 'none' : pct >= 80 ? 'strong' : pct >= 40 ? 'moderate' : 'weak';
  return (
    <div className={`k21-gauge tone-${tone}`} aria-hidden="true">
      <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet" role="presentation">
        <path className="k21-gauge-track" d="M 10 78 A 70 70 0 0 1 150 78" pathLength="100" />
        <path className="k21-gauge-value" d="M 10 78 A 70 70 0 0 1 150 78" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - pct} />
      </svg>
      <span className="k21-gauge-label">{strengthFor(value)}</span>
    </div>
  );
}

const OVERVIEW_METRIC_STYLES = `
  /* One shared reading rhythm: label, value, context, visual and destination.
     The percentage value is no longer pushed below the other three metrics. */
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
    grid-template-rows:40px 44px minmax(38px,auto) minmax(50px,1fr) auto!important;
    align-content:stretch!important;
    gap:.45rem!important;
    min-height:250px!important;
    padding:1.05rem 1.1rem!important;
    border:1px solid #dfe7f2!important;
    border-radius:18px!important;
    background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(249,252,255,.96))!important;
    box-shadow:0 8px 28px rgba(28,67,133,.07)!important;
    overflow:hidden!important;
    isolation:isolate;
  }
  .dsh .ovx .ovx-kpis .ovx-kpi::before{
    content:''!important;
    display:block!important;
    position:absolute!important;
    width:150px!important;
    height:150px!important;
    right:-72px!important;
    top:-74px!important;
    border-radius:999px!important;
    background:radial-gradient(circle,rgba(61,116,214,.13),rgba(61,116,214,0) 70%)!important;
    pointer-events:none!important;
  }
  .dsh .ovx .ovx-kpis button.ovx-kpi:hover{
    transform:translateY(-2px);
    border-color:#bfd0ea!important;
    box-shadow:0 12px 32px rgba(28,67,133,.11)!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-head{min-width:0;align-self:start;}
  .dsh .ovx .ovx-kpis .kpi-card-label{
    color:#66758a!important;
    font-size:.72rem!important;
    font-weight:700!important;
    line-height:1.35!important;
    letter-spacing:.02em!important;
    text-transform:none!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-value{
    display:flex!important;
    align-items:center!important;
    min-width:0;
    margin:0!important;
    color:#172d57!important;
    font-size:clamp(1.85rem,2.5vw,2.5rem)!important;
    font-weight:780!important;
    font-variant-numeric:tabular-nums!important;
    letter-spacing:-.04em!important;
    line-height:1.1!important;
    white-space:nowrap;
  }
  .dsh .ovx .ovx-kpis .kpi-card-sub{
    min-width:0;
    color:#728096!important;
    font-size:.76rem!important;
    line-height:1.45!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-visual{
    display:flex;
    align-items:flex-end;
    min-width:0;
    min-height:50px;
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
  }
  .dsh .ovx .ovx-kpis button.ovx-kpi:hover .kpi-card-link{
    text-decoration:underline!important;
    text-underline-offset:3px!important;
  }
  .k21-gauge{width:min(160px,100%);height:64px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;}
  .k21-gauge svg{display:block;width:100%;height:48px;overflow:visible;}
  .k21-gauge-track,.k21-gauge-value{fill:none;stroke-width:9;stroke-linecap:round;}
  .k21-gauge-track{stroke:#e8eef7;}
  .k21-gauge-value{stroke:#205fc8;transition:stroke-dashoffset .8s cubic-bezier(.33,1,.68,1);}
  .k21-gauge.tone-strong .k21-gauge-value{stroke:#22a565;}
  .k21-gauge.tone-moderate .k21-gauge-value{stroke:#e0a12a;}
  .k21-gauge.tone-weak .k21-gauge-value{stroke:#dc5d52;}
  .k21-gauge.tone-none .k21-gauge-value{stroke:#a8b4c5;}
  .k21-gauge-label{color:#7b8799;font-size:.61rem;font-weight:700;line-height:1.2;text-transform:uppercase;letter-spacing:.06em;}
  @media(max-width:1100px){
    .dsh .ovx .ovx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
  }
  @media(max-width:560px){
    .dsh .ovx .ovx-kpis{grid-template-columns:1fr!important;}
    .dsh .ovx .ovx-kpis .ovx-kpi{min-height:238px!important;}
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
        <div
          className="kpi-card-value text-[clamp(1.45rem,2vw,1.85rem)] font-extrabold leading-none tracking-tight text-[var(--navy-900)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {value}
        </div>
        <div className="kpi-card-sub text-xs leading-snug text-[var(--text-3)]">
          {sub}
          {children}
        </div>
        <div className="kpi-card-visual">
          {showGauge && <ScoreGauge value={progress} />}
        </div>
        {progress != null && (
          <div className="kpi-card-progress h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-2)]">
            <div
              className="kpi-card-progress-fill h-full rounded-[3px]"
              style={{ width: `${clampPct(progress)}%`, background: progressColor || 'var(--green-600)' }}
            />
          </div>
        )}
        {linkLabel && <span className="kpi-card-link text-xs font-semibold text-[var(--green-700)]">{linkLabel}</span>}
      </Tag>
    </>
  );
}
