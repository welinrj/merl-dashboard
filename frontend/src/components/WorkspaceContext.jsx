import WorkspaceGuide from './WorkspaceGuide';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../supabaseClient';
import { currentProjects } from '../lib/docc/projectScope';
import { visiblePeriodOptions, workspacePeriodKey } from '../lib/docc/workspacePeriod';
import { useLiveDashboard } from '../lib/useLiveDashboard';
import './WorkspaceContext.css';

const Context = createContext({ period: '', selectPeriod: () => {}, periods: [] });
export const useWorkspaceContext = () => useContext(Context);
function readPeriod(userId, search) {
  const params = new URLSearchParams(search);
  if (params.has('period')) return params.get('period') || '';
  try { return sessionStorage.getItem(workspacePeriodKey(userId)) || ''; } catch { return ''; }
}
export default function WorkspaceContextProvider({ user, children }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [, setParams] = useSearchParams();
  const revision = useLiveDashboard();
  const periodPage = ['/dashboards', '/results-framework', '/reports'].includes(location.pathname) || location.pathname.startsWith('/analytics/');
  const [period, setPeriod] = useState(() => readPeriod(user.id, location.search));
  const [access, setAccess] = useState({ loading: true, error: false, projects: [], periods: [] });
  // The account key prevents a previous user's stored selection leaking into a new session.
  useEffect(() => { setPeriod(readPeriod(user.id, location.search)); }, [user.id]);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('period')) setPeriod(params.get('period') || '');
    else if (periodPage) setParams(prev => { const next = new URLSearchParams(prev); next.set('period', period); return next; }, { replace: true });
  }, [location.pathname, location.search, periodPage]);
  useEffect(() => {
    try { sessionStorage.setItem(workspacePeriodKey(user.id), period); } catch { /* storage may be disabled */ }
  }, [period, user.id]);
  useEffect(() => {
    let alive = true;
    // Keep the current access list on screen during a live recheck.
    setAccess(prev => (prev.loading || prev.error ? { loading: true, error: false, projects: [], periods: [] } : prev));
    Promise.all([
      supabase.from('v_projects').select('id, code, status, has_results_framework, excluded_from_current_portfolio'),
      supabase.from('v_reporting_periods').select('project_id, period_label, period_type, period_end'),
    ]).then(([projectsResponse, periodsResponse]) => {
      if (!alive) return;
      if (projectsResponse.error || periodsResponse.error) throw new Error('access');
      const projects = currentProjects(projectsResponse.data || []);
      setAccess({ loading: false, error: false, projects, periods: visiblePeriodOptions(projects, periodsResponse.data || []) });
    }).catch(() => { if (alive) setAccess(prev => (prev.loading || prev.error ? { loading: false, error: true, projects: [], periods: [] } : prev)); });
    return () => { alive = false; };
  }, [user.id, revision, i18n.resolvedLanguage]);
  const selectPeriod = useCallback(value => {
    setPeriod(value);
    setParams(prev => {
      const next = new URLSearchParams(prev);
      // Explicitly store the empty value so Back can restore All periods.
      next.set('period', value);
      next.delete('frequency');
      return next;
    });
  }, [setParams]);
  const value = useMemo(() => ({ period, selectPeriod, periods: access.periods,
    periodInfo: access.periods.find(row => row.period_label === period) }), [period, access.periods, selectPeriod]);
  return <Context.Provider value={value}>
    <section className="wc-context" aria-label={t('workspace.context')} aria-busy={access.loading}>
      {access.error && <p className="wc-note" role="alert">{t('workspace.accessError')}</p>}
      {!access.loading && !access.error && access.projects.length === 0 && <p className="wc-note">{t('workspace.noAccess')}</p>}
      {periodPage && <details className="wc-period"><summary aria-label={`${t('workspace.period')}: ${period || t('workspace.allPeriods')}`}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/></svg><strong>{period || t('workspace.allPeriods')}</strong></summary>
        <label htmlFor="workspace-period">{t('workspace.period')}</label>
        <select id="workspace-period" className="wc-period-select" value={period} onChange={event => selectPeriod(event.target.value)} disabled={access.loading || access.error}>
          <option value="">{t('workspace.allPeriods')}</option>
          {period && !access.periods.some(row => row.period_label === period) && <option value={period}>{period}</option>}
          {access.periods.map(row => <option key={row.period_label} value={row.period_label}>{row.period_label}</option>)}
        </select><p className="wc-note">{t('workspace.periodBasis')}</p>
      </details>}
      <WorkspaceGuide user={user} />
    </section>
    {children}
  </Context.Provider>;
}
