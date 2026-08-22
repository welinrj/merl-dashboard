// =============================================================================
// dashboardFilters.jsx — shared global-filter state for the Overview dashboard.
// Both the sidebar "Filter Quick Links" (in the app shell) and the Overview's
// global filter bar bind to this one context, so a change in either place — or
// a cross-filter click on a chart — updates every widget consistently.
// =============================================================================
import { createContext, useContext, useMemo, useState, useCallback } from 'react';

const EMPTY = { fy: '', status: '', theme: '', province: '', partner: '' };

// Project operational statuses grouped into the four dashboard buckets.
export const STATUS_BUCKETS = {
  on_track:    ['on_track'],
  at_risk:     ['at_risk', 'delayed', 'suspended'],
  not_started: ['pipeline', 'approved', 'not_started'],
  completed:   ['completed', 'closed'],
};
export const STATUS_BUCKET_LABEL = {
  on_track: 'On Track', at_risk: 'At Risk / Delayed', not_started: 'Not Started', completed: 'Completed',
};
export const bucketOf = (status) =>
  Object.keys(STATUS_BUCKETS).find((k) => STATUS_BUCKETS[k].includes(status)) ?? 'not_started';

const Ctx = createContext(null);

export function DashboardFilterProvider({ children }) {
  const [filters, setFilters] = useState(EMPTY);
  const setFilter = useCallback((key, value) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? '' : value })), []);
  const patch = useCallback((obj) => setFilters((f) => ({ ...f, ...obj })), []);
  const reset = useCallback(() => setFilters(EMPTY), []);
  const active = Object.values(filters).some(Boolean);
  const value = useMemo(() => ({ filters, setFilter, patch, reset, active }), [filters, setFilter, patch, reset, active]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboardFilters() {
  const v = useContext(Ctx);
  if (!v) return { filters: EMPTY, setFilter: (_k, _v) => {}, patch: (_o) => {}, reset: () => {}, active: false };
  return v;
}

// Predicate: does a project row pass the active filters?
export function projectMatches(p, filters) {
  if (filters.status && !STATUS_BUCKETS[filters.status]?.includes(p.status)) return false;
  if (filters.theme && p.category !== filters.theme) return false;
  if (filters.partner && p.donor !== filters.partner) return false;
  if (filters.province && !(p.provinces || []).includes(filters.province)) return false;
  if (filters.fy) {
    const y = Number(filters.fy);
    const sy = p.start_date ? new Date(p.start_date).getFullYear() : null;
    const ey = p.end_date ? new Date(p.end_date).getFullYear() : null;
    if (sy != null && ey != null) { if (y < sy || y > ey) return false; }
    else if (sy != null) { if (y < sy) return false; }
  }
  return true;
}
