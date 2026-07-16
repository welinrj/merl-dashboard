// =============================================================================
// types.ts — Core TypeScript interfaces for the MERL Dashboard
// Project: Vanuatu Loss and Damage Fund Development Project
// =============================================================================

// ── User & Auth ───────────────────────────────────────────────────────────────

export type UserRole =
  | 'ROLE_ADMIN'
  | 'ROLE_DOCC_SENIOR'
  | 'ROLE_DOCC_MEO'
  | 'ROLE_PROJ_MANAGER'
  | 'ROLE_FIELD_STAFF';

export interface AppUser {
  id: number | string;
  username: string;
  role: UserRole;
  name: string;
  /** project codes this user is assigned to; empty = all projects for senior roles */
  assignedProjects?: string[];
  mfaEnabled?: boolean;
}

export type MFAStatus = 'required' | 'verified' | 'not_required';

// ── RBAC ──────────────────────────────────────────────────────────────────────

export type NavKey =
  | 'dashboard'
  | 'framework'
  | 'gallery'
  | 'registration'
  | 'projects'
  | 'datasets'
  | 'analysis'
  | 'reports'
  | 'admin';

export interface NavItem {
  key: NavKey;
  path: string;
  label: string;
  Icon: React.ComponentType<{ size?: number | string; style?: React.CSSProperties }>;
}

// ── Projects & RBM ───────────────────────────────────────────────────────────

export type TrafficLight = 'green' | 'amber' | 'red';
export type ActivityStatus = 'completed' | 'in_progress' | 'not_started' | 'delayed';
export type ProjectStatus = 'active' | 'completed' | 'suspended';

export interface Activity {
  id: string;
  text: string;
  status: ActivityStatus;
  pct: number;
}

export interface Output {
  id: string;
  text: string;
  activities: Activity[];
}

export interface Outcome {
  id: string;
  text: string;
  outputs: Output[];
}

export interface RBMChain {
  goal: string;
  outcomes: Outcome[];
}

export interface Indicator {
  id: number;
  code: string;
  name: string;
  unit: string;
  baseline: number;
  target: number;
  current: number;
  target_year: number;
  freq: string;
  traffic: TrafficLight;
  category?: string;
}

export interface QuarterlyData {
  q: string;
  planned: number;
  actual: number;
}

export interface Project {
  id: number;
  code: string;
  category: string;
  category_color: string;
  name: string;
  description: string;
  status: ProjectStatus;
  start_date: string;
  end_date: string;
  budget_vuv: number;
  spent_vuv: number;
  lead_agency: string;
  provinces: string[];
  latitude: number;
  longitude: number;
  rbm: RBMChain;
  indicators: Indicator[];
  quarterly: QuarterlyData[];
}

// ── FRM-01 Project Registration & FRM-02 Results Framework ───────────────────

export type RegistrationStatus = 'draft' | 'pending_review' | 'approved' | 'returned';
export type RecordStatus = 'draft' | 'approved' | 'archived';
export type LinkedLevel = 'objective' | 'outcome' | 'output' | 'activity';

/** Row shape returned by public.v_projects after migration 0008 (FRM-01). */
export interface ProjectRegistration {
  id: string;
  code: string;
  name: string;
  category: string;
  lead_agency: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_vuv: number;
  spent_vuv: number;
  status: string;
  provinces: string[];
  acronym: string | null;
  project_type: string | null;
  primary_climate_theme: string | null;
  secondary_climate_themes: string[];
  expected_primary_outcome: string | null;
  nsdp_alignment: string[];
  sdg_alignment: string[];
  coverage_type: string | null;
  islands: string[];
  area_councils: string[];
  communities: string[];
  donor: string | null;
  funding_window: string | null;
  currency: string;
  executing_agency: string | null;
  implementing_partners: string[];
  project_manager_id: string | null;
  project_manager_name: string | null;
  me_officer_id: string | null;
  me_officer_name: string | null;
  finance_officer_id: string | null;
  finance_officer_name: string | null;
  approval_date: string | null;
  est_direct_beneficiaries: number | null;
  est_indirect_beneficiaries: number | null;
  expected_households: number | null;
  expected_communities: number | null;
  registration_status: RegistrationStatus;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObjectiveRecord {
  id: string;
  project_id: string;
  code: string;
  statement: string;
  climate_theme: string | null;
  expected_outcome: string | null;
  notes: string | null;
  status: RecordStatus;
}

export interface OutcomeRecord {
  id: string;
  project_id: string;
  objective_id: string;
  objective_code: string;
  code: string;
  statement: string;
  responsible_officer_id: string | null;
  responsible_officer_name: string | null;
  status: RecordStatus;
}

export interface OutputRecord {
  id: string;
  project_id: string;
  outcome_id: string;
  outcome_code: string;
  code: string;
  statement: string;
  responsible_officer_id: string | null;
  responsible_officer_name: string | null;
  status: RecordStatus;
}

export interface ProjectActivityRecord {
  id: string;
  project_id: string;
  output_id: string;
  output_code: string;
  code: string;
  name: string;
  description: string | null;
  responsible_officer_id: string | null;
  responsible_officer_name: string | null;
  status: ActivityStatus | 'cancelled';
}

export interface ProjectIndicatorRecord {
  id: string;
  project_id: string;
  code: string;
  name: string;
  unit: string | null;
  baseline_value: number | null;
  target_value: number | null;
  means_of_verification: string | null;
  frequency: string | null;
  linked_level: LinkedLevel | null;
  linked_id: string | null;
  linked_code: string | null;
}

// ── Datasets ─────────────────────────────────────────────────────────────────

export type DatasetStatus = 'pending' | 'approved' | 'rejected';
export type DatasetType = 'csv' | 'xlsx' | 'geojson' | 'kml' | 'shapefile' | 'pdf' | 'jpg' | 'png';

export interface Dataset {
  id: string;
  name: string;
  type: DatasetType;
  size_kb: number;
  uploaded_by: string;
  project_code: string;
  status: DatasetStatus;
  reviewed_by?: string;
  review_note?: string;
  created_at: string;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export type ReportTypeId = 'quarterly' | 'annual' | 'midterm' | 'endline' | 'adhoc';

export interface ReportType {
  id: ReportTypeId;
  label: string;
  icon: string;
  desc: string;
  sections: string[];
}

// ── Admin / Users ─────────────────────────────────────────────────────────────

export interface SystemUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  project?: string;
  active: boolean;
  last_login: string | null;
}

export interface AuditLogEntry {
  id: number;
  timestamp: string;
  user: string;
  action: string;
  table_name: string;
  record_id?: string;
  summary: string;
}

// ── Dashboard Summary ─────────────────────────────────────────────────────────

export interface DashboardSummary {
  total_indicators: number;
  on_track: number;
  at_risk: number;
  off_track: number;
  total_budget_vuv: number;
  total_spent_vuv: number;
  total_communities: number;
  total_beneficiaries: number;
}

// ── GeoJSON types (minimal) ───────────────────────────────────────────────────

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface MapMarker extends GeoPoint {
  id: string | number;
  label: string;
  color?: string;
  traffic?: TrafficLight;
}
