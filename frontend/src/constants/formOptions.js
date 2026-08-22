// =============================================================================
// formOptions.js — Canonical "Core Standard Responses" from the DoCC MERL forms
// (FRM-01…FRM-10, Draft v2.0). Single source of truth for the controlled
// vocabularies used across the data-entry forms, so option lists are not
// re-declared per component.
//
// Convention: dropdown/multi-select values are stored in the database as their
// canonical English label (matching the government form wording), so most
// options use { value === label }. Status-style fields store a lowercase token
// with a separate display label.
// =============================================================================

/** Look up a display label for a stored value; falls back to the raw value. */
export const labelOf = (options, value) =>
  options.find(o => o.value === value)?.label ?? value ?? '';

// ── Project (operational) status — stored as lowercase tokens ────────────────
export const PROJECT_STATUS = [
  { value: 'planning',    label: 'Planning' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'active',      label: 'Active' },
  { value: 'on_hold',     label: 'On Hold' },
  { value: 'completed',   label: 'Completed' },
  { value: 'suspended',   label: 'Suspended' },
  { value: 'cancelled',   label: 'Cancelled' },
];

// ── Registration review workflow status ──────────────────────────────────────
export const REGISTRATION_STATUS = [
  { value: 'draft',          label: 'Draft' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved',       label: 'Approved' },
  { value: 'returned',       label: 'Returned' },
];

// ── Project type (FRM-01 §1) ─────────────────────────────────────────────────
export const PROJECT_TYPE = [
  'Adaptation', 'Mitigation', 'Loss & Damage', 'Community Resilience',
  'Climate Finance', 'Capacity Building', 'Policy & Governance', 'Research',
  'Early Warning', 'Nature-based Solutions', 'Multi-theme',
].map(v => ({ value: v, label: v }));

// ── Climate Theme list (Core Standard Responses) ─────────────────────────────
export const CLIMATE_THEME = [
  'Climate Change Adaptation', 'Climate Change Mitigation', 'Loss and Damage',
  'Community Resilience Building', 'Disaster Risk Reduction', 'Nature-based Solutions',
  'Climate Finance', 'Capacity Building', 'Climate Information & Early Warning Systems',
  'Policy, Planning & Governance', 'Research, Monitoring & Knowledge Management', 'Other',
].map(v => ({ value: v, label: v }));

// ── Expected Outcome list (Core Standard Responses) ──────────────────────────
export const EXPECTED_OUTCOME = [
  'Build Community Resilience', 'Improve Community Resilience', 'Reduce Climate Risk',
  'Improve Disaster Preparedness', 'Strengthen Institutional Capacity', 'Improve Food Security',
  'Improve Water Security', 'Protect Coastal Communities', 'Protect Ecosystems & Biodiversity',
  'Improve Livelihoods', 'Increase Access to Climate Finance', 'Strengthen Climate Governance', 'Other',
].map(v => ({ value: v, label: v }));

// ── Coverage type (FRM-01 §3) ────────────────────────────────────────────────
export const COVERAGE_TYPE = [
  'National', 'Multi-Province', 'Provincial', 'Area Council', 'Community',
].map(v => ({ value: v, label: v }));

// ── Provinces of Vanuatu (canonical order) ───────────────────────────────────
export const PROVINCES = ['TORBA', 'SANMA', 'PENAMA', 'MALAMPA', 'SHEFA', 'TAFEA']
  .map(v => ({ value: v, label: v }));

// ── Donor / Funding source (FRM-01 §4) ───────────────────────────────────────
export const DONOR = [
  'Government of Vanuatu', 'MFAT', 'GCF', 'GEF', 'UNDP', 'SPC',
  'World Bank', 'ADB', 'Australia', 'Japan', 'EU', 'Other',
].map(v => ({ value: v, label: v }));

// ── Currency (FRM-01 §4) ─────────────────────────────────────────────────────
export const CURRENCY = ['VUV', 'USD', 'NZD', 'AUD', 'EUR', 'Other']
  .map(v => ({ value: v, label: v }));

// ── SDGs 1–17 ────────────────────────────────────────────────────────────────
export const SDG = Array.from({ length: 17 }, (_, i) => {
  const n = i + 1;
  return { value: `SDG ${n}`, label: `SDG ${n}` };
});

// ── Indicator reporting frequency (FRM-02 §4) ────────────────────────────────
export const FREQUENCY = ['Monthly', 'Quarterly', 'Annual']
  .map(v => ({ value: v, label: v }));

// ── Results-hierarchy record status (FRM-02 §3) ──────────────────────────────
export const RECORD_STATUS = [
  { value: 'draft',    label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'archived', label: 'Archived' },
];

// ── Activity status (Core Standard Responses) ────────────────────────────────
export const ACTIVITY_STATUS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
  { value: 'delayed',     label: 'Delayed' },
  { value: 'on_hold',     label: 'On Hold' },
  { value: 'cancelled',   label: 'Cancelled' },
];

// ── Progress rating / traffic light (FRM-03) ─────────────────────────────────
export const PROGRESS_RATING = [
  { value: 'on_track',  label: 'On Track' },
  { value: 'at_risk',   label: 'At Risk' },
  { value: 'off_track', label: 'Off Track' },
  { value: 'completed', label: 'Completed' },
];

// ── Progress-report review workflow status (FRM-03) ───────────────────────────
export const REPORT_STATUS = [
  { value: 'draft',          label: 'Draft' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'approved',       label: 'Approved' },
  { value: 'returned',       label: 'Returned' },
];

// ── Indicator link level (FRM-02 §4) ─────────────────────────────────────────
export const LINKED_LEVEL = [
  { value: 'objective', label: 'Objective' },
  { value: 'outcome',   label: 'Outcome' },
  { value: 'output',    label: 'Output' },
  { value: 'activity',  label: 'Activity' },
];

// =============================================================================
// DoCC Standardised MERL Form — additional controlled vocabularies (Forms 3–12)
// =============================================================================

// ── Indicator level (Form 3) ─────────────────────────────────────────────────
export const INDICATOR_LEVEL = [
  { value: 'impact',  label: 'Impact' },
  { value: 'outcome', label: 'Outcome' },
  { value: 'output',  label: 'Output' },
  { value: 'process', label: 'Process/Activity' },
];

// ── Reporting frequency (Form 3) — extends FREQUENCY with DoCC options ────────
export const REPORTING_FREQUENCY = [
  { value: 'Monthly',     label: 'Monthly' },
  { value: 'Quarterly',   label: 'Quarterly' },
  { value: 'Six-monthly', label: 'Six-monthly' },
  { value: 'Annual',      label: 'Annual' },
  { value: 'Ad hoc',      label: 'Ad hoc' },
];

// ── Indicator performance status (Form 4) ────────────────────────────────────
export const PERFORMANCE_STATUS = [
  { value: 'on_track',           label: 'On Track' },
  { value: 'attention_required', label: 'Attention Required' },
  { value: 'off_track',          label: 'Off Track' },
  { value: 'target_achieved',    label: 'Target Achieved' },
  { value: 'no_data',            label: 'No Data' },
];

// ── Risk / issue (Form 9) ────────────────────────────────────────────────────
export const RISK_TYPE = [
  { value: 'risk',  label: 'Risk' },
  { value: 'issue', label: 'Issue' },
];

export const RISK_CATEGORY = [
  { value: 'financial',     label: 'Financial' },
  { value: 'technical',     label: 'Technical' },
  { value: 'operational',   label: 'Operational' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'social_gedsi',  label: 'Social / GEDSI' },
  { value: 'governance',    label: 'Governance' },
  { value: 'procurement',   label: 'Procurement' },
  { value: 'safeguards',    label: 'Safeguards' },
  { value: 'other',         label: 'Other' },
];

export const RISK_STATUS = [
  { value: 'open',       label: 'Open' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'escalated',  label: 'Escalated' },
  { value: 'resolved',   label: 'Resolved' },
  { value: 'closed',     label: 'Closed' },
];

export const LIKELIHOOD_IMPACT = [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) }));

// ── Evidence register (Form 12) ──────────────────────────────────────────────
export const DOCUMENT_TYPE = [
  { value: 'attendance_list',   label: 'Attendance List' },
  { value: 'photograph',        label: 'Photograph' },
  { value: 'monitoring_report', label: 'Monitoring Report' },
  { value: 'survey_data',       label: 'Survey / Data' },
  { value: 'financial_report',  label: 'Financial Report' },
  { value: 'contract',          label: 'Contract' },
  { value: 'completion_report', label: 'Completion Report' },
  { value: 'evaluation',        label: 'Evaluation' },
  { value: 'map',               label: 'Map' },
  { value: 'other',             label: 'Other' },
];

export const VERIFICATION_STATUS = [
  { value: 'pending',    label: 'Pending' },
  { value: 'verified',   label: 'Verified' },
  { value: 'rejected',   label: 'Rejected' },
  { value: 'superseded', label: 'Superseded' },
];

// ── Reporting period submission & approval (Form 11) ─────────────────────────
export const PERIOD_TYPE = [
  { value: 'monthly',     label: 'Monthly' },
  { value: 'quarterly',   label: 'Quarterly' },
  { value: 'six_monthly', label: 'Six-monthly' },
  { value: 'annual',      label: 'Annual' },
  { value: 'final',       label: 'Final' },
  { value: 'ad_hoc',      label: 'Ad hoc' },
];

export const SUBMISSION_STATUS = [
  { value: 'draft',     label: 'Draft' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'returned',  label: 'Returned' },
  { value: 'reviewed',  label: 'Reviewed' },
  { value: 'approved',  label: 'Approved' },
];

// ── DoCC project operational status (Form 1) ─────────────────────────────────
export const DOCC_PROJECT_STATUS = [
  { value: 'pipeline',    label: 'Pipeline' },
  { value: 'approved',    label: 'Approved' },
  { value: 'not_started', label: 'Not Started' },
  { value: 'on_track',    label: 'On Track' },
  { value: 'at_risk',     label: 'At Risk' },
  { value: 'delayed',     label: 'Delayed' },
  { value: 'suspended',   label: 'Suspended' },
  { value: 'completed',   label: 'Completed' },
  { value: 'closed',      label: 'Closed' },
];
