// ── Supabase client — DoCC MERL Dashboard ────────────────────────────────────
// Project: merl-dashboard-docc  |  Region: ap-southeast-2
import { createClient } from '@supabase/supabase-js';
import type { UserRole } from './types';

const SUPABASE_URL  = 'https://mgqveofmnofmwejxrbxp.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncXZlb2Ztbm9mbXdlanhyYnhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNzAxMDIsImV4cCI6MjA5MTg0NjEwMn0.2EnzuxujaAHSlQoXaFQZsdIW1Rmj4FHAxexYzv0gk-8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Role mapping ──────────────────────────────────────────────────────────────
// The database enum merl.user_role (supabase/migrations/0002_role_alignment.sql)
// uses snake_case values; the app uses the ROLE_* constants in types.ts.

export type DbUserRole =
  | 'administrator'
  | 'docc_senior_officer'
  | 'docc_me_officer'
  | 'project_manager'
  | 'field_staff';

const DB_TO_APP_ROLE: Record<DbUserRole, UserRole> = {
  administrator:       'ROLE_ADMIN',
  docc_senior_officer: 'ROLE_DOCC_SENIOR',
  docc_me_officer:     'ROLE_DOCC_MEO',
  project_manager:     'ROLE_PROJ_MANAGER',
  field_staff:         'ROLE_FIELD_STAFF',
};

const APP_TO_DB_ROLE: Record<UserRole, DbUserRole> = {
  ROLE_ADMIN:        'administrator',
  ROLE_DOCC_SENIOR:  'docc_senior_officer',
  ROLE_DOCC_MEO:     'docc_me_officer',
  ROLE_PROJ_MANAGER: 'project_manager',
  ROLE_FIELD_STAFF:  'field_staff',
};

/** Convert a merl.user_role value from the database to the app's UserRole. */
export function toAppRole(dbRole: string): UserRole {
  const role = DB_TO_APP_ROLE[dbRole as DbUserRole];
  if (!role) throw new Error(`Unknown database role: ${dbRole}`);
  return role;
}

/** Convert an app UserRole to the merl.user_role value stored in the database. */
export function toDbRole(appRole: UserRole): DbUserRole {
  return APP_TO_DB_ROLE[appRole];
}
