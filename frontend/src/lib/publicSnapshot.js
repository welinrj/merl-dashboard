import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';

export const PUBLIC_SNAPSHOT_KEY = ['merl', 'approved-public-snapshot'];

// Never read internal v_* views or use an elevated credential from this module.
// A cancelled request must not overwrite a newer approved snapshot. All three
// reads must succeed before React Query replaces the previously displayed data.
export async function fetchPublicSnapshot({ signal } = {}) {
  const [summary, projects, areas] = await Promise.all([
    supabase.from('public_portal_summary').select('*').abortSignal(signal).single(),
    supabase.from('public_portal_projects').select('*').order('name').abortSignal(signal),
    supabase.from('public_portal_area_councils').select('*').order('project_count', { ascending: false }).abortSignal(signal),
  ]);
  const failed = [summary, projects, areas].find(result => result.error);
  if (failed) throw failed.error;
  return { summary: summary.data, projects: projects.data || [], areas: areas.data || [] };
}

export function usePublicSnapshot() {
  return useQuery({
    queryKey: PUBLIC_SNAPSHOT_KEY,
    queryFn: ({ signal }) => fetchPublicSnapshot({ signal }),
    staleTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
}

const finite = value => value != null && value !== '' && Number.isFinite(Number(value));
export const average = values => {
  const known = values.filter(finite).map(Number);
  return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length * 10) / 10 : null;
};
export const total = values => {
  const known = values.filter(finite).map(Number);
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
};
export function publicTotals(projects, summary, allScope) {
  if (allScope) return {
    progress: summary?.overall_progress_pct ?? null,
    investment: summary?.total_investment_vuv ?? null,
    beneficiaries: summary?.published_beneficiaries ?? null,
  };
  return {
    progress: average(projects.map(project => project.progress_pct)),
    investment: total(projects.map(project => project.budget_vuv)),
    beneficiaries: total(projects.map(project => project.published_beneficiaries)),
  };
}
