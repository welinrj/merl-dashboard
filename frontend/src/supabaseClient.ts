// ── Supabase client — DoCC MERL Dashboard ────────────────────────────────────
// Project: merl-dashboard-staging (ndntvncboeajanipafeq)  |  Region: ap-southeast-2
// Override per environment with VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
import { createClient } from '@supabase/supabase-js';
import type { UserRole } from './types';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
  ?? 'https://ndntvncboeajanipafeq.supabase.co';
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5kbnR2bmNib2VhamFuaXBhZmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyODA3ODEsImV4cCI6MjA5ODg1Njc4MX0.EPLQbtDvTPIVY57NCZEjsUJzxrbMhP-gngVyP1Vfpm4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Role mapping ──────────────────────────────────────────────────────────────
// The database enum merl.user_role (supabase/migrations/0002_role_alignment.sql)
// uses snake_case values; the app uses the ROLE_* constants in types.ts.

// Official DB enum values (migration 0031). The legacy values (administrator,
// docc_senior_officer, field_staff) are still accepted on read so the app keeps
// working across the rename regardless of deploy order.
export type DbUserRole =
  | 'system_admin'
  | 'docc_me_officer'
  | 'project_manager'
  | 'data_entry_officer'
  | 'viewer';

// Read mapping accepts BOTH the official and the legacy DB values.
const DB_TO_APP_ROLE: Record<string, UserRole> = {
  // official
  system_admin:        'ROLE_ADMIN',
  docc_me_officer:     'ROLE_DOCC_MEO',
  project_manager:     'ROLE_PROJ_MANAGER',
  data_entry_officer:  'ROLE_DATA_ENTRY',
  viewer:              'ROLE_VIEWER',
  // legacy (pre-0031) — kept for a seamless transition
  administrator:       'ROLE_ADMIN',
  docc_senior_officer: 'ROLE_VIEWER',
  field_staff:         'ROLE_DATA_ENTRY',
};

// Write mapping always targets the official DB values.
const APP_TO_DB_ROLE: Record<UserRole, DbUserRole> = {
  ROLE_ADMIN:        'system_admin',
  ROLE_DOCC_MEO:     'docc_me_officer',
  ROLE_PROJ_MANAGER: 'project_manager',
  ROLE_DATA_ENTRY:   'data_entry_officer',
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
