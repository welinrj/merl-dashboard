import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { normalizePublishedProjects, normalizeProvince } from './publicProvinces';

export const PUBLIC_SNAPSHOT_KEY = ['merl', 'approved-public-snapshot'];

// Production fallback for verified project profile fields while the public
// snapshot database migration is pending. Database values always win; these
// source-backed values only fill blanks/zero placeholder budgets.
const PROJECT_PROFILE_FALLBACKS = [
  { match: p => p.code === 'VCCRP-001' || p.acronym === 'VCCRP' || /community.*climate.*resilien/i.test(p.name || ''), values: { currency:'USD', budget_vuv:25000000, project_manager:'Louise Nassak' } },
  { match: p => ['23A398','VCAP2-001'].includes(p.code) || ['VCAP2','VCAP II'].includes(p.acronym) || /coastal adaptation project.*(phase 2|ii)/i.test(p.name || ''), values: { currency:'USD', budget_vuv:12544037, project_manager:'Jackson Tambe Vire' } },
  { match: p => p.acronym === 'STRENGTH' || /strength.*loss.*damage/i.test(p.name || ''), values: { currency:'USD', budget_vuv:127680, project_manager:'Brian Maltera' } },
  { match: p => p.acronym === 'CBIT' || /capacity-building initiative for transparency/i.test(p.name || ''), values: { currency:'USD', budget_vuv:1137215, project_manager:'Stephanie Stephens' } },
  { match: p => p.code === '24B298' || /loss and damage.*(project|fund development)/i.test(p.name || ''), values: { currency:'VUV', budget_vuv:289393720.16, project_manager:'Willy Missack' } },
  { match: p => /pebaccc/i.test(p.name || '') || /^PEBAC/i.test(p.acronym || ''), values: { project_manager:'William Bani' } },
  { match: p => ['23B398','PARTNER-2-PLUS-VU'].includes(p.code) || /partner/i.test(p.name || ''), values: { project_manager:'Johnnie Tari' } },
  { match: p => p.code === 'ICAT-VU-II' || /initiative for climate action transparency|icat vanuatu/i.test(p.name || ''), values: { project_manager:'Zechariah Bani' } },
];

const blank = value => value == null || String(value).trim() === '';
function enrichPublishedProject(project) {
  const fallback = PROJECT_PROFILE_FALLBACKS.find(entry => entry.match(project));
  if (!fallback) return project;
  const next = { ...project };
  for (const [key, value] of Object.entries(fallback.values)) {
    const current = next[key];
    const missing = key === 'budget_vuv' ? !(Number(current) > 0) : blank(current);
    if (missing) next[key] = value;
  }
  return next;
}

// Never read internal v_* views or use an elevated credential from this module.
// All reads must succeed before React Query replaces the previously displayed data.
export async function fetchPublicSnapshot({ signal } = {}) {
  const [summary, projects, areas, kpis, indicatorCategories, indicatorDetails] = await Promise.all([
    supabase.from('public_portal_summary').select('*').abortSignal(signal).single(),
    supabase.from('public_portal_projects').select('*').order('name').abortSignal(signal),
    supabase.from('public_portal_area_councils').select('*').order('project_count', { ascending: false }).abortSignal(signal),
    supabase.from('public_portal_kpis').select('*').order('display_order').abortSignal(signal),
    supabase.from('public_portal_indicator_categories').select('*').order('category_key').abortSignal(signal),
    supabase.from('public_portal_indicator_details').select('*').order('project_name').order('indicator_code').abortSignal(signal),
  ]);
  const failed = [summary, projects, areas, kpis, indicatorCategories, indicatorDetails].find(result => result.error);
  if (failed) throw failed.error;
  const byProject = new Map();
  for (const row of kpis.data || []) {
    if (!byProject.has(String(row.project_id))) byProject.set(String(row.project_id), []);
    byProject.get(String(row.project_id)).push(row);
  }
  return {
    summary: summary.data,
    projects: normalizePublishedProjects(projects.data || []).map(enrichPublishedProject).map(project => ({
      ...project,
      public_kpis: byProject.get(String(project.id)) || [],
    })),
    areas: (areas.data || []).map(area => ({...area, province: normalizeProvince(area.province)})),
    indicatorCategories: indicatorCategories.data || [],
    indicatorDetails: indicatorDetails.data || [],
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
    utilised: summary?.total_utilised_vuv ?? null,
    utilisation: summary?.financial_utilisation_pct ?? null,
  };
  const investment = total(projects.map(project => project.budget_vuv));
  const utilised = total(projects.map(project => project.cumulative_expenditure_vuv));
  return {
    progress: average(projects.map(project => project.progress_pct)),
    investment,
    beneficiaries: total(projects.map(project => project.published_beneficiaries)),
    utilised,
    utilisation: investment > 0 && utilised != null ? Math.round(utilised / investment * 1000) / 10 : null,
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
