// ── Supabase client — DoCC MERL Dashboard ────────────────────────────────────
// Project: merl-dashboard-staging (ndntvncboeajanipafeq)  |  Region: ap-southeast-2
// Override per environment with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
import { createClient } from '@supabase/supabase-js';
import type { UserRole } from './types';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
  ?? 'https://ndntvncboeajanipafeq.supabase.co';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kbnR2bmNib2VhamFuaXBhZmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyODA3ODEsImV4cCI6MjA5ODg1Njc4MX0.EPLQbtDvTPIVY57NCZEjsUJzxrbMhP-gngVyP1Vfpm4';

export type SupabaseReadFailure = { status: number; method: string };
let lastSupabaseReadFailure: SupabaseReadFailure | null = null;

export function getLastSupabaseReadFailure(): SupabaseReadFailure | null {
  return lastSupabaseReadFailure;
}

function publishReadFailure(failure: SupabaseReadFailure) {
  lastSupabaseReadFailure = failure;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('merl:supabase-read-error', { detail: failure }));
  }
}

/**
 * Supabase normally returns PostgREST read failures as `{ data: null, error }`.
 * A dashboard can accidentally coalesce that null to [] and display believable
 * zeroes. Record and emit failed REST reads so the UI blocks those values.
 */
/**
 * Was this rejection the caller cancelling the request rather than the network
 * or the database failing it? Browsers reject an aborted fetch with a DOMException
 * named "AbortError"; the signal itself is checked too, since a request aborted
 * before it was even issued can surface differently.
 */
const isAbort = (error: unknown, init?: RequestInit): boolean =>
  (error as { name?: string } | null)?.name === 'AbortError'
  || init?.signal?.aborted === true;

const monitoredFetch: typeof fetch = async (input, init) => {
  try {
    const response = await fetch(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = String(init?.method ?? (typeof input === 'string' || input instanceof URL ? 'GET' : input.method) ?? 'GET').toUpperCase();
    const isDataRead = url.includes('/rest/v1/') && (method === 'GET' || method === 'HEAD');

    // 406 is commonly used by PostgREST for an intentionally empty .single()
    // result, so it must not put the whole portal into data-unavailable mode.
    if (isDataRead && !response.ok && response.status !== 406) {
      // contentLocale intentionally probes for an optional i18n column, then
      // retries without it when a rebuilt view does not expose translations.
      // Do not turn that expected schema-probe response into a portal-wide
      // "data unavailable" modal.
      let optionalI18nProbe = false;
      if (response.status === 400) {
        try {
          const body = await response.clone().text();
          optionalI18nProbe = /i18n/i.test(body)
            && (/42703/.test(body) || /does not exist/i.test(body) || /column/i.test(body));
        } catch { /* if inspection fails, treat it as a real failed read */ }
      }
      if (!optionalI18nProbe) publishReadFailure({ status: response.status, method });
    }
    return response;
  } catch (error) {
    // A request the app itself cancelled says nothing about whether the data is
    // available. React Query aborts in-flight reads when a query is no longer
    // needed — fetchPublicSnapshot passes `.abortSignal(signal)` — so simply
    // navigating away from the public dashboard while its snapshot was still
    // loading recorded a "failure" and left the whole portal behind the
    // data-unavailable dialog, over a page whose reads were perfectly fine.
    // It only reproduced when a read was still in flight at the moment of
    // navigation, which is why it presented as an intermittent QA failure.
    // A genuine transport failure still records and still blocks.
    if (!isAbort(error, init)) {
      publishReadFailure({ status: 0, method: String(init?.method ?? 'GET').toUpperCase() });
    }
    throw error;
  }
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  global: { fetch: monitoredFetch },
});

// ── Role mapping ──────────────────────────────────────────────────────────────
// The database enum merl.user_role (supabase/migrations/0002_role_alignment.sql)
// uses snake_case values; the app uses the ROLE_* constants in types.ts.

// Official DB enum values (migration 0031, less the role retired by 0041). The
// legacy values (administrator, docc_senior_officer, field_staff) are still
// accepted on read so the app keeps working across the rename regardless of
// deploy order.
export type DbUserRole =
  | 'system_admin'
  | 'docc_me_officer'
  | 'project_manager'
  | 'viewer';

// Read mapping accepts BOTH the official and the legacy DB values.
const DB_TO_APP_ROLE: Record<string, UserRole> = {
  // official
  system_admin:        'ROLE_ADMIN',
  docc_me_officer:     'ROLE_DOCC_MEO',
  project_manager:     'ROLE_PROJ_MANAGER',
  viewer:              'ROLE_VIEWER',
  // legacy (pre-0031) — kept for a seamless transition
  administrator:       'ROLE_ADMIN',
  docc_senior_officer: 'ROLE_VIEWER',
  // retired (0041) — the enum value survives in the database because Postgres
  // cannot drop one, and 0041 moved every account off it. An account that
  // somehow still carries it signs in read-only instead of throwing below,
  // which would leave an officer staring at a blank portal.
  data_entry_officer:  'ROLE_VIEWER',
  field_staff:         'ROLE_VIEWER',
};

// Write mapping always targets the official DB values.
const APP_TO_DB_ROLE: Record<UserRole, DbUserRole> = {
  ROLE_ADMIN:        'system_admin',
  ROLE_DOCC_MEO:     'docc_me_officer',
  ROLE_PROJ_MANAGER: 'project_manager',
  ROLE_VIEWER:       'viewer',
};

/** Convert a merl.user_role value from the database to the app's UserRole. */
export function toAppRole(dbRole: string): UserRole {
  const role = DB_TO_APP_ROLE[dbRole];
  if (!role) throw new Error(`Unknown database role: ${dbRole}`);
  return role;
}

/** Convert an app UserRole to the merl.user_role value stored in the database. */
export function toDbRole(appRole: UserRole): DbUserRole {
  return APP_TO_DB_ROLE[appRole];
}
