// Headline metric primitive for the executive dashboard.
//
// On the Overview page these metrics are deliberately presented as ONE
// executive summary strip, not four independent dashboard cards. That removes
// the generic "four KPI cards" pattern and gives the page a stronger reporting
// hierarchy: one primary portfolio result followed by three supporting facts.
import { cn } from '@/lib/utils';

const OVERVIEW_METRIC_STYLES = `
  /* Executive portfolio strip -------------------------------------------------
     Overview.jsx still supplies the data and routes. This layer only changes
     presentation. It intentionally outranks that page's older local KPI-card
     rules so the strip cannot regress to four rounded, coloured cards. */
  .ovx .ovx-kpis{
    display:grid!important;
    grid-template-columns:1.22fr repeat(3,minmax(0,1fr))!important;
    gap:0!important;
    margin-bottom:1rem!important;
    overflow:hidden!important;
    border:1px solid var(--border)!important;
    border-radius:10px!important;
    background:#fff!important;
    box-shadow:none!important;
  }
  .ovx .ovx-kpis .ovx-kpi{
    min-height:148px!important;
    padding:1.15rem 1.25rem .95rem!important;
    border:0!important;
    border-radius:0!important;
    background:#fff!important;
    box-shadow:none!important;
    gap:.58rem!important;
    transition:background-color var(--dur-fast) var(--ease-out)!important;
  }
  .ovx .ovx-kpis .ovx-kpi::before{
    content:none!important;
    display:none!important;
  }
  .ovx .ovx-kpis .ovx-kpi + .ovx-kpi{
    border-left:1px solid var(--border)!important;
  }
  .ovx .ovx-kpis .ovx-kpi-progress{
    background:#f8f6fb!important;
  }
  @media (hover:hover) and (pointer:fine){
    .ovx .ovx-kpis button.ovx-kpi:hover{background:#faf9fc!important;}
    .ovx .ovx-kpis button.ovx-kpi-progress:hover{background:#f4f0f9!important;}
  }

  .ovx .ovx-kpis .kpi-card-label{
    color:#6f6978!important;
    font-size:.72rem!important;
    font-weight:650!important;
    letter-spacing:0!important;
    text-transform:none!important;
  }
  .ovx .ovx-kpis .kpi-card-value{
    margin-top:.36rem!important;
    color:#2d2543!important;
    font-size:clamp(1.85rem,2.5vw,2.25rem)!important;
    font-weight:760!important;
    letter-spacing:-.035em!important;
    line-height:.98!important;
  }
  .ovx .ovx-kpis .ovx-kpi-progress .kpi-card-value{
    font-size:clamp(2.15rem,3vw,2.65rem)!important;
  }
  .ovx .ovx-kpis .kpi-card-sub{
    color:#817a89!important;
    font-size:.74rem!important;
    line-height:1.42!important;
  }
  .ovx .ovx-kpis .kpi-card-progress{
    width:min(190px,88%)!important;
    height:4px!important;
    margin-top:.12rem!important;
    border-radius:2px!important;
    background:#e8e5ec!important;
  }
  .ovx .ovx-kpis .kpi-card-progress-fill{
    border-radius:2px!important;
    background:#5a4784!important;
  }
  .ovx .ovx-kpis .kpi-card-link{
    margin-top:auto!important;
    color:#665e70!important;
    font-size:.7rem!important;
    font-weight:600!important;
    line-height:1.2!important;
    text-decoration:none!important;
    opacity:.82!important;
  }
  .ovx .ovx-kpis button.ovx-kpi:hover .kpi-card-link{
    color:#49386f!important;
    opacity:1!important;
    text-decoration:underline!important;
    text-underline-offset:3px!important;
  }

  /* Tablet: a composed 2x2 summary panel, still one surface. */
  @media(max-width:980px){
    .ovx .ovx-kpis{grid-template-columns:repeat(2,minmax(0,1fr))!important;}
    .ovx .ovx-kpis .ovx-kpi:nth-child(3){border-left:0!important;}
    .ovx .ovx-kpis .ovx-kpi:nth-child(n+3){border-top:1px solid var(--border)!important;}
  }

  /* Phone: a vertical executive facts list, not stacked cards. */
  @media(max-width:560px){
    .ovx .ovx-kpis{grid-template-columns:1fr!important;}
    .ovx .ovx-kpis .ovx-kpi{
      min-height:124px!important;
      padding:1rem!important;
      border-left:0!important;
    }
    .ovx .ovx-kpis .ovx-kpi + .ovx-kpi{border-top:1px solid var(--border)!important;}
    .ovx .ovx-kpis .kpi-card-progress{width:min(220px,90%)!important;}
  }
`;

export default function KpiCard({
  label, value, sub, progress, progressColor, linkLabel,
  onClick, children, className,
}) {
  const Tag = onClick ? 'button' : 'div';
  // The first Overview metric injects the strip stylesheet once. Other uses of
  // KpiCard elsewhere keep the shared card primitive unchanged.
  const injectOverviewStyles = typeof className === 'string' && className.includes('ovx-kpi-progress');

  return (
    <>
      {injectOverviewStyles && <style>{OVERVIEW_METRIC_STYLES}</style>}
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
          <div className="kpi-card-label text-[0.72rem] font-semibold leading-tight text-[var(--text-2)]">
            {label}
          </div>
          <div
            className="kpi-card-value mt-1.5 truncate text-[clamp(1.45rem,2vw,1.85rem)] font-extrabold leading-none tracking-tight text-[var(--navy-900)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {value}
          </div>
        </div>

        {sub && <div className="kpi-card-sub text-xs leading-snug text-[var(--text-3)]">{sub}</div>}

        {children}

        {progress != null && (
          <div className="kpi-card-progress h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-2)]">
            <div
              className="kpi-card-progress-fill h-full rounded-[3px]"
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
    </>
  );
}
