// Shared filters and operational status classification for the MERL dashboard.
import { createContext, useContext, useMemo, useState, useCallback } from 'react';

const EMPTY = { fy: '', status: '', theme: '', province: '', partner: '' };

// Include both the current Form 1 vocabulary and legacy operational values.
// Registration approval is a separate workflow and is not an operational status.
export const STATUS_BUCKETS = {
  on_track: ['active', 'on_track', 'ongoing', 'in_progress'],
  at_risk: ['at_risk', 'delayed', 'suspended', 'on_hold'],
  not_started: ['planning', 'not_started', 'pipeline', 'approved'],
  completed: ['completed', 'closed'],
  cancelled: ['cancelled'],
};
export const STATUS_BUCKET_LABEL = {
  on_track: 'Ongoing / On Track',
  at_risk: 'At Risk / Delayed / On Hold',
  not_started: 'Planning / Not Started',
  completed: 'Completed',
  cancelled: 'Cancelled',
  unknown: 'Other / Unclassified',
};
export const bucketOf = (status) =>
  Object.keys(STATUS_BUCKETS).find((k) => STATUS_BUCKETS[k].includes(status)) ?? 'unknown';

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

export function projectMatches(p, filters) {
  if (filters.status && bucketOf(p.status) !== filters.status) return false;
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
