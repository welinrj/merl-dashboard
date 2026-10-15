import { useTranslation } from 'react-i18next';
// Executive KPI primitive adapted from the user-supplied 21st.dev score-card.
// The caller owns the values, labels and destinations; no demonstration data is used.
import { cn } from '@/lib/utils';

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function ScoreGauge({ value, displayValue }) {
  const { t } = useTranslation();
  const pct = clampPct(value);
  const tone = value == null ? 'none' : pct >= 80 ? 'strong' : pct >= 40 ? 'moderate' : 'weak';
  return (
    <div className={`k21-gauge tone-${tone}`}>
      <svg viewBox="0 0 200 112" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <path className="k21-gauge-track" d="M 12 100 A 88 88 0 0 1 188 100" pathLength="100" />
        <path className="k21-gauge-value" d="M 12 100 A 88 88 0 0 1 188 100" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - pct} />
        <path className="k21-gauge-target" d="M 188 94 V 106" />
      </svg>
      <div className="k21-gauge-copy">
        <span className="kpi-card-value">{displayValue}</span>
        <span className="k21-gauge-unit">{t('visual.fullScale')}</span>
      </div>
      <div className="k21-compact-track" aria-hidden="true">
        <span className="k21-compact-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const OVERVIEW_METRIC_STYLES = `
  /* The legacy blue workspace assigns a two-column named grid to every KPI.
     Reset that grid completely: merely changing its columns/rows leaves the
     old named areas in force and places the new score-card children wrongly. */
  .dsh .ovx .ovx-kpis{
    display:grid!important;
    grid-template-columns:repeat(3,minmax(0,1fr))!important;
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
    grid-template-areas:none!important;
    grid-template-rows:minmax(36px,auto) minmax(76px,1fr) auto auto!important;
    grid-auto-flow:row!important;
    align-content:stretch!important;
    align-items:stretch!important;
    gap:.5rem!important;
    min-height:232px!important;
    padding:.875rem!important;
    border:1px solid var(--visual-border)!important;
    border-radius:var(--visual-radius)!important;
    background:#fff!important;
    box-shadow:var(--visual-shadow)!important;
    overflow:hidden!important;
    isolation:isolate;
  }
  .dsh .ovx .ovx-kpis .ovx-kpi::before{content:none!important;display:none!important;}
  .dsh .ovx .ovx-kpis button.ovx-kpi:hover{
    transform:translateY(-2px);
    border-color:#bfd0ea!important;
    box-shadow:0 12px 32px rgba(28,67,133,.11)!important;
  }
  /* Explicit placement also overrides the old metric/sub/link grid-area rules. */
  .dsh .ovx .ovx-kpis .ovx-kpi > .kpi-card-head{
    grid-area:auto!important;
    grid-column:1!important;
    grid-row:1!important;
    min-width:0;
    align-self:start;
    align-items:flex-start;
    text-align:left;
  }
  .dsh .ovx .ovx-kpis .kpi-card-label{
    color:var(--visual-ink)!important;
    font-size:.9375rem!important;
    font-weight:700!important;
    line-height:1.35!important;
    letter-spacing:0!important;
    text-transform:none!important;
  }
  .dsh .ovx .ovx-kpis .ovx-kpi > .kpi-card-visual{
    grid-area:auto!important;
    grid-column:1!important;
    grid-row:2!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    min-width:0;
    min-height:80px;
    padding:0!important;
  }
  .dsh .ovx .ovx-kpis .kpi-card-value{
    display:block!important;
    min-width:0;
    margin:0!important;
    color:var(--visual-ink)!important;
    font-family:var(--font-display)!important;
    font-size:clamp(1.75rem,2.1vw,2.25rem)!important;
    font-weight:780!important;
    font-variant-numeric:tabular-nums!important;
    letter-spacing:-.04em!important;
    line-height:1.1!important;
    white-space:nowrap;
    text-align:center!important;
  }
  .dsh .ovx .ovx-kpis .ovx-kpi > .kpi-card-sub{
    grid-area:auto!important;
    grid-column:1!important;
    grid-row:3!important;
    min-width:0;
    min-height:2em;
    color:var(--visual-muted)!important;
    font-size:.875rem!important;
    line-height:1.45!important;
    text-align:center;
  }
  .dsh .ovx .ovx-kpis .kpi-card-progress{display:none!important;}
  .dsh .ovx .ovx-kpis .ovx-kpi > .kpi-card-link{
    grid-area:auto!important;
    grid-column:1!important;
    grid-row:4!important;
    margin:0!important;
    align-self:end!important;
    justify-self:stretch!important;
    display:flex;
    align-items:center;
    justify-content:center;
    min-height:44px;
    padding:.5rem .65rem;
    border:1px solid #d5e9ea;
    border-radius:9px;
    background:#f1f8f8;
    color:var(--visual-accent)!important;
    font-size:.875rem!important;
    font-weight:700!important;
    line-height:1.35!important;
    opacity:1!important;
    text-align:center;
  }
  .dsh .ovx .ovx-kpis button.ovx-kpi:hover .kpi-card-link{
    text-decoration:underline!important;
    text-underline-offset:3px!important;
  }
  .k21-gauge{
    position:relative;
    width:min(136px,100%);
    aspect-ratio:200/112;
    flex:none;
  }
  .k21-gauge svg{display:block;width:100%;height:100%;overflow:visible;}
  .k21-gauge-track,.k21-gauge-value{fill:none;stroke-width:12;stroke-linecap:butt;}
  .k21-gauge-track{stroke:#e6edf2;}
  .k21-gauge-target{fill:none;stroke:#526277;stroke-width:1.5;}
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
    font-size:clamp(1.5rem,2vw,1.9rem)!important;
  }
  .k21-gauge-unit{
    color:var(--visual-muted);
    font-size:.6875rem;
    font-weight:650;
    line-height:1.25;
    letter-spacing:.02em;
  }
  .dsh .ovx{container-type:inline-size;}
  .k21-compact-track{display:none;}
  .dsh .ovx .ovx-kpis button.ovx-kpi:focus-visible{outline:3px solid #168c96;outline-offset:3px;}
  @container(min-width:1580px){
    .dsh .ovx .ovx-kpis{grid-template-columns:repeat(6,minmax(0,1fr))!important;}
  }
  @container(max-width:839px){
    .dsh .ovx .ovx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
  }
  @container(max-width:519px){
    .dsh .ovx .ovx-kpis{grid-template-columns:1fr!important;}
    .dsh .ovx .ovx-kpis .ovx-kpi{min-height:0!important;height:auto!important;align-self:start;grid-template-rows:auto 64px auto auto!important;gap:8px!important;padding:14px 14px 22px!important;}
    .dsh .ovx .ovx-kpis .ovx-kpi > .kpi-card-visual{min-height:64px!important;}
    .dsh .ovx .ovx-kpis .ovx-kpi > .kpi-card-sub{min-height:0!important;font-size:14px!important;line-height:1.4!important;}
    .dsh .ovx .ovx-kpis .kpi-card-label{font-size:14px!important;}
    .dsh .ovx .ovx-kpis .ovx-kpi > .kpi-card-link{font-size:14px!important;padding:8px!important;box-sizing:border-box;}
    .dsh .ovx .ovx-kpis .kpi-card-value,.dsh .ovx .ovx-kpis .k21-gauge-copy .kpi-card-value{font-size:28px!important;}
    .k21-gauge{width:100%;height:64px;aspect-ratio:auto;display:flex;flex-direction:column;justify-content:center;gap:6px;}
    .k21-gauge svg{display:none;}
    .k21-gauge-copy{position:static;}
    .k21-gauge-unit{display:block;font-size:11px;}
    .k21-compact-track{display:block;height:8px;width:100%;border-radius:4px;background:#e8eef7;overflow:hidden;}
    .k21-compact-fill{display:block;height:100%;border-radius:4px;background:#168c96;}
    .tone-strong .k21-compact-fill{background:#22a565;}
    .tone-moderate .k21-compact-fill{background:#e0a12a;}
    .tone-weak .k21-compact-fill{background:#dc5d52;}
  }
  @supports not (container-type:inline-size){
  @media(max-width:1100px){
    .dsh .ovx .ovx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
  }
  @media(max-width:560px){
    .dsh .ovx .ovx-kpis{grid-template-columns:1fr!important;}
    .dsh .ovx .ovx-kpis .ovx-kpi{min-height:232px!important;}
  }
  }
  @media(prefers-reduced-motion:reduce){
    .k21-gauge-value{transition:none;}
    .dsh .ovx .ovx-kpis button.ovx-kpi:hover{transform:none;}
  }
`;

export default function KpiCard({
  label, value, sub, progress, progressColor, linkLabel,
  onClick, onExplain, children, className, icon: Icon,
}) {
  const { t } = useTranslation();
  const Tag = onClick && !onExplain ? 'button' : 'div';
  const injectOverviewStyles = typeof className === 'string' && className.includes('ovx-kpi-progress');
  const showGauge = progress != null;

  return (
    <>
      {injectOverviewStyles && <style>{OVERVIEW_METRIC_STYLES}</style>}
      <Tag
        type={onClick && !onExplain ? 'button' : undefined}
        onClick={onExplain ? undefined : onClick}
        className={cn(
          'island-metric group relative flex w-full min-w-0 flex-col gap-2.5 rounded-[var(--radius-card)] border',
          'border-[var(--border)] bg-white p-4 text-left transition-all duration-200',
          onClick && 'cursor-pointer hover:border-[var(--border-strong)]',
          className,
        )}
      >
        <div className="kpi-card-head min-w-0">
          {Icon && <span className="merl-card-icon"><Icon size={30} /></span>}
          <div className="kpi-card-label text-[0.72rem] font-semibold leading-tight text-[var(--text-2)]">{label}</div>
          {onExplain && <button type="button" className="kpi-card-explain" onClick={onExplain} aria-label={t('figure.explainMetric', { metric: label })}>{t('figure.explain')}</button>}
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
        {linkLabel && (onExplain ? <button type="button" className="kpi-card-link text-xs font-semibold text-[var(--green-700)]" onClick={onClick}>{linkLabel}</button> : <span className="kpi-card-link text-xs font-semibold text-[var(--green-700)]">{linkLabel}</span>)}
      </Tag>
    </>
  );
}
