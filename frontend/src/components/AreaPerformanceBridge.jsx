import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';

const STYLE = `
  .area-performance-active > .ovx-performance-list,
  .area-performance-active > .ovx-card-link {
    display: none !important;
  }

  .area-performance-panel {
    display: flex;
    flex-direction: column;
    gap: .8rem;
    margin-top: .35rem;
  }

  .area-performance-scope {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .8rem;
    padding: .72rem .78rem;
    border: 1px solid #e3deea;
    border-left: 3px solid #67508f;
    border-radius: 7px;
    background: #faf9fc;
  }

  .area-performance-scope-copy { min-width: 0; }
  .area-performance-eyebrow { display:block; margin-bottom:.12rem; color:#8c8495; font-size:.6rem; font-weight:700; letter-spacing:.02em; }
  .area-performance-area { display:block; overflow:hidden; color:#352b45; font-size:.82rem; font-weight:760; line-height:1.25; text-overflow:ellipsis; white-space:nowrap; }
  .area-performance-projects { display:block; margin-top:.12rem; color:#817989; font-size:.64rem; }
  .area-performance-clear { flex:0 0 auto; padding:.35rem .5rem; border:0; background:transparent; color:#604786; font:inherit; font-size:.65rem; font-weight:700; cursor:pointer; }
  .area-performance-clear:hover { text-decoration:underline; text-underline-offset:3px; }
  .area-performance-rows { display:flex; flex-direction:column; gap:.72rem; }
  .area-performance-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.34rem .7rem; align-items:center; }
  .area-performance-row-label { min-width:0; color:#655d70; font-size:.72rem; font-weight:650; }
  .area-performance-row-value { color:#3d3153; font-size:.76rem; font-weight:780; }
  .area-performance-track { grid-column:1/-1; height:6px; overflow:hidden; border-radius:3px; background:#efecf3; }
  .area-performance-track > span { display:block; height:100%; border-radius:3px; background:#7056a5; }
  .area-performance-detail { grid-column:1/-1; color:#96909d; font-size:.62rem; }
  .area-performance-state { padding:1rem .75rem; border:1px dashed #ddd7e5; border-radius:7px; color:#837b8b; font-size:.7rem; text-align:center; }
  .coverage-map path.area-performance-selected { stroke:#241833 !important; stroke-width:3 !important; stroke-opacity:1 !important; filter:drop-shadow(0 0 2px rgba(36,24,51,.45)); }
  @media (max-width:560px) { .area-performance-scope { align-items:flex-start; } }
`;

const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);
function fmtNum(value) { return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0); }
function fmtVUV(value) { const n = Number(value) || 0; if (n >= 1e9) return `VT ${(n / 1e9).toFixed(2)}B`; if (n >= 1e6) return `VT ${(n / 1e6).toFixed(2)}M`; if (n >= 1e3) return `VT ${(n / 1e3).toFixed(1)}K`; return `VT ${fmtNum(n)}`; }
function labelForProject(project) { if (!project) return ''; if (project.code && project.name) return `${project.code} — ${project.name}`; return project.name || project.code || ''; }
function latestByProject(rows) { const latest = new Map(); for (const row of rows) { const previous = latest.get(row.project_id); if (!previous || String(row.created_at || '') > String(previous.created_at || '')) latest.set(row.project_id, row); } return latest; }
function latestIndicatorProgress(rows) { const latest = new Map(); for (const row of rows) { const previous = latest.get(row.indicator_id); const rank = row.created_at ?? row.reporting_period ?? ''; const previousRank = previous?.created_at ?? previous?.reporting_period ?? ''; if (!previous || rank > previousRank) latest.set(row.indicator_id, row); } return latest; }

export default function AreaPerformanceBridge() {
  const [target, setTarget] = useState(null);
  const [selection, setSelection] = useState(null);
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selectedPathRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const findTarget = () => {
      const performanceList = document.querySelector('.ovx-secondary-grid > .ovx-card:first-child > .ovx-performance-list');
      const card = performanceList?.closest('.ovx-card') || null;
      setTarget((current) => (current === card ? current : card));
    };
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const clearSelection = () => {
    requestRef.current += 1;
    if (selectedPathRef.current) selectedPathRef.current.classList.remove('area-performance-selected');
    selectedPathRef.current = null;
    setSelection(null);
    setRows(null);
    setError('');
    setLoading(false);
    document.querySelector('.coverage-map .leaflet-popup-close-button')?.click();
  };

  useEffect(() => {
    const handleMapClick = (event) => {
      const node = event.target instanceof Element ? event.target.closest('.coverage-map .leaflet-overlay-pane path.leaflet-interactive') : null;
      if (!node) return;
      const opacity = Number(node.getAttribute('fill-opacity'));
      if (!Number.isFinite(opacity) || opacity >= 0.9) return;
      window.setTimeout(() => {
        const popup = document.querySelector('.coverage-map .leaflet-popup-content');
        if (!popup) return;
        const area = popup.querySelector('strong')?.textContent?.trim();
        if (!area) return;
        const projectLabels = [...popup.querySelectorAll('ul li')].map((item) => item.textContent?.trim()).filter(Boolean);
        document.querySelectorAll('.coverage-map path.area-performance-selected').forEach((path) => path.classList.remove('area-performance-selected'));
        node.classList.add('area-performance-selected');
        selectedPathRef.current = node;
        setSelection({ area, projectLabels });
      }, 20);
    };
    document.addEventListener('click', handleMapClick, true);
    return () => document.removeEventListener('click', handleMapClick, true);
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (selectedPathRef.current && !selectedPathRef.current.isConnected) clearSelection();
    });
    const map = document.querySelector('.coverage-map');
    if (map) observer.observe(map, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [selection]);

  useEffect(() => {
    if (!target) return undefined;
    target.classList.toggle('area-performance-active', Boolean(selection));
    return () => target.classList.remove('area-performance-active');
  }, [selection, target]);

  useEffect(() => {
    if (!selection) return undefined;
    let alive = true;
    const requestId = ++requestRef.current;
    setRows(null); setError(''); setLoading(true);
    (async () => {
      try {
        const projectsResponse = await supabase.from('v_projects').select('id,code,name,budget_vuv');
        if (projectsResponse.error) throw projectsResponse.error;
        const labelSet = new Set(selection.projectLabels);
        const selectedProjects = (projectsResponse.data || []).filter((project) => labelSet.has(labelForProject(project)));
        const ids = selectedProjects.map((project) => project.id);
        if (!ids.length) {
          if (alive && requestRef.current === requestId) setRows([
            { key:'indicators', label:'Indicators on track', value:0, detail:'0 / 0' },
            { key:'activities', label:'Activities completed', value:0, detail:'0 / 0' },
            { key:'budget', label:'Budget utilisation', value:0, detail:'VT 0 / VT 0' },
            { key:'reporting', label:'Reporting compliance', value:0, detail:'0 / 0' },
          ]);
          return;
        }
        const [financialResponse, activitiesResponse, indicatorsResponse, progressResponse, reportingResponse] = await Promise.all([
          supabase.from('v_financial_progress').select('project_id,cumulative_expenditure,created_at').in('project_id', ids),
          supabase.from('v_project_activities').select('project_id,status').in('project_id', ids),
          supabase.from('v_project_indicators').select('project_id,id').in('project_id', ids),
          supabase.from('v_indicator_progress').select('project_id,indicator_id,performance_status,reporting_period,created_at').in('project_id', ids),
          supabase.from('v_reporting_periods').select('project_id,submission_status').in('project_id', ids),
        ]);
        const failed = [financialResponse, activitiesResponse, indicatorsResponse, progressResponse, reportingResponse].find((response) => response.error);
        if (failed?.error) throw failed.error;
        const activities = activitiesResponse.data || [];
        const indicators = indicatorsResponse.data || [];
        const reporting = reportingResponse.data || [];
        const financeLatest = latestByProject(financialResponse.data || []);
        const progressLatest = latestIndicatorProgress(progressResponse.data || []);
        const indicatorsOnTrack = indicators.filter((indicator) => progressLatest.get(indicator.id)?.performance_status === 'on_track').length;
        const activitiesDone = activities.filter((activity) => activity.status === 'completed').length;
        const reportsApproved = reporting.filter((report) => report.submission_status === 'approved').length;
        const totalBudget = selectedProjects.reduce((total, project) => total + (Number(project.budget_vuv) || 0), 0);
        const totalExpenditure = [...financeLatest.values()].reduce((total, row) => total + (Number(row.cumulative_expenditure) || 0), 0);
        const budgetUtilisation = pct(totalExpenditure, totalBudget);
        const nextRows = [
          { key:'indicators', label:'Indicators on track', value:pct(indicatorsOnTrack, indicators.length), detail:`${fmtNum(indicatorsOnTrack)} / ${fmtNum(indicators.length)}` },
          { key:'activities', label:'Activities completed', value:pct(activitiesDone, activities.length), detail:`${fmtNum(activitiesDone)} / ${fmtNum(activities.length)}` },
          { key:'budget', label:'Budget utilisation', value:budgetUtilisation, detail:`${fmtVUV(totalExpenditure)} / ${fmtVUV(totalBudget)}` },
          { key:'reporting', label:'Reporting compliance', value:pct(reportsApproved, reporting.length), detail:`${fmtNum(reportsApproved)} / ${fmtNum(reporting.length)}` },
        ];
        if (alive && requestRef.current === requestId) setRows(nextRows);
      } catch (err) {
        if (alive && requestRef.current === requestId) setError(err?.message || 'Area performance data could not be loaded.');
      } finally {
        if (alive && requestRef.current === requestId) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [selection]);

  const projectCount = selection?.projectLabels?.length || 0;
  const content = useMemo(() => {
    if (!selection) return null;
    return (
      <div className="area-performance-panel" aria-live="polite">
        <div className="area-performance-scope">
          <div className="area-performance-scope-copy">
            <span className="area-performance-eyebrow">Area Council selection</span>
            <strong className="area-performance-area">{selection.area}</strong>
            <span className="area-performance-projects">{projectCount} {projectCount === 1 ? 'project' : 'projects'} in this area</span>
          </div>
          <button type="button" className="area-performance-clear" onClick={clearSelection}>Clear area</button>
        </div>
        {loading && <div className="area-performance-state">Updating portfolio performance for {selection.area}…</div>}
        {error && <div className="area-performance-state">{error}</div>}
        {!loading && !error && rows && (
          <div className="area-performance-rows">
            {rows.map((row) => (
              <div className="area-performance-row" key={row.key}>
                <span className="area-performance-row-label">{row.label}</span>
                <strong className="area-performance-row-value">{row.value}%</strong>
                <div className="area-performance-track"><span style={{ width:`${Math.min(100, Math.max(0, row.value))}%` }} /></div>
                <span className="area-performance-detail">{row.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [error, loading, projectCount, rows, selection]);

  return <><style>{STYLE}</style>{target && content ? createPortal(content, target) : null}</>;
}
