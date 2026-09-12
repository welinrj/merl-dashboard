import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { normalizePublishedProjects, normalizeProvince } from './publicProvinces';

export const PUBLIC_SNAPSHOT_KEY = ['merl', 'approved-public-snapshot'];

// The inventory RPC exposes counts only. Never read internal v_* views or use
// an elevated credential from this module. All reads must succeed before React
// Query replaces the previously displayed data.
export async function fetchPublicSnapshot({ signal } = {}) {
  const [summary, projects, areas, kpis, inventory] = await Promise.all([
    supabase.from('public_portal_summary').select('*').abortSignal(signal).single(),
    supabase.from('public_portal_projects').select('*').order('name').abortSignal(signal),
    supabase.from('public_portal_area_councils').select('*').order('project_count', { ascending: false }).abortSignal(signal),
    supabase.from('public_portal_kpis').select('*').order('display_order').abortSignal(signal),
    supabase.rpc('public_portal_project_inventory').abortSignal(signal).single(),
  ]);
  const failed = [summary, projects, areas, kpis, inventory].find(result => result.error);
  if (failed) throw failed.error;
  const byProject = new Map();
  for (const row of kpis.data || []) {
    if (!byProject.has(String(row.project_id))) byProject.set(String(row.project_id), []);
    byProject.get(String(row.project_id)).push(row);
  }
  return {
    summary: summary.data,
    projects: normalizePublishedProjects(projects.data || []).map(project => ({
      ...project,
      public_kpis: byProject.get(String(project.id)) || [],
    })),
    areas: (areas.data || []).map(area => ({...area, province: normalizeProvince(area.province)})),
    inventory: inventory.data,
  };
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

// Inventory is independent of the public-results filters. Never substitute a
// filtered published count for the total number of records in MERL.
export function publicProjectCount(inventory, publishedCount, allScope) {
  if (!allScope) return { value: publishedCount, scope: 'published' };
  const fields = ['total_projects', 'approved_projects', 'other_projects'];
  if (!inventory || fields.some(field => inventory[field] == null || !Number.isFinite(Number(inventory[field])))) {
    return { value: null, scope: 'unavailable' };
  }
  return {
    value: Number(inventory.total_projects),
    approved: Number(inventory.approved_projects),
    other: Number(inventory.other_projects),
    scope: 'all',
  };
}
