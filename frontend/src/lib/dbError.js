// dbError.js — turn a PostgREST/Postgres error into something a MERL officer
// can act on.
//
// Supabase returns the raw database error, so a failed save surfaced in the UI
// as things like:
//
//     null value in column "budget_vuv" of relation "projects"
//     violates not-null constraint
//
//     new row for relation "beneficiaries" violates check constraint
//     "beneficiaries_gender_reconciles"
//
// Each names an internal column or constraint, tells the officer nothing about
// what to do, and reads like a crash rather than a validation message.
//
// Named constraints are matched first and exactly. Guessing from a constraint
// name by substring (the previous approach) is unreliable — "project_activities
// _physical_progress_pct_check" contains none of the field names we know, and
// "projects_status_check" happens to contain "status" only by luck. Where a
// constraint carries a rule worth explaining, it gets a written message here.
//
// Deliberate RAISE EXCEPTION messages from our own RPCs ("Project title is
// required", "You do not have access to this project") are already written for
// the person reading them and pass through untouched.

// Internal column name → the label shown above that input on the form.
const FIELD_LABELS = {
  budget_vuv: 'Approved Budget',
  category: 'Theme / Sector',
  name: 'Project Title',
  code: 'Project Code',
  status: 'Status',
  currency: 'Currency',
  start_date: 'Start Date',
  end_date: 'End Date',
  indicator_level: 'Level',
  reporting_period: 'Reporting Period',
  project_id: 'Project',
  indicator_id: 'Indicator',
  output_id: 'Linked Output',
  title: 'Document Title',
  statement: 'Statement',
  email: 'Email Address',
  full_name: 'Full Name',
};

// Constraint name → the rule it enforces, in the words of the form.
const CONSTRAINT_MESSAGES = {
  // Beneficiaries & GEDSI (Form 8)
  beneficiaries_gender_reconciles:
    'Female, male and other/not reported together cannot exceed Total Direct Beneficiaries.',
  beneficiaries_subsets_within_total:
    'Youth and persons with disabilities cannot each exceed Total Direct Beneficiaries.',

  // Project profile (Form 1)
  projects_budget_nonneg: 'Approved Budget cannot be negative.',

  // Indicators (Form 3)
  indicators_baseline_year_plausible: 'Baseline Year must be between 1980 and 2100.',

  // Risks & Issues (Form 9)
  risks_resolved_after_identified:
    'Date Resolved cannot be earlier than Date Identified.',
  risks_issues_likelihood_check: 'Likelihood must be between 1 and 5.',
  risks_issues_impact_check: 'Impact must be between 1 and 5.',

  // Locations
  locations_not_empty:
    'Enter at least a province, island or community for this location.',
  project_locations_latitude_check: 'Latitude must be between -90 and 90.',
  project_locations_longitude_check: 'Longitude must be between -180 and 180.',
  project_locations_beneficiaries_check: 'Beneficiaries cannot be negative.',

  // Activities
  project_activities_physical_progress_pct_check:
    'Physical Progress must be between 0 and 100.',
  project_activities_dates_check:
    'The planned end date cannot be earlier than the planned start date.',
};

// Fall back to the column name made readable — "persons_with_disability"
// becomes "Persons with disability", so a generated sentence still starts with
// a capital letter.
const labelFor = (col) => {
  if (FIELD_LABELS[col]) return FIELD_LABELS[col];
  const words = col.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

// "beneficiaries_female_check" → "Female" — the generic shape our numeric
// column guards use, so a negative count names the field that carries it.
const NEGATIVE_COUNT = /^(?:beneficiaries|financial_progress|indicator_progress)_(\w+?)_check$/;

/**
 * @param {{message?: string, code?: string, details?: string} | null} error
 * @param {string} [fallback] used when the error carries no message at all
 * @returns {string} a message worth showing to the user
 */
export function dbErrorMessage(error, fallback = 'Could not save. Please try again.') {
  const raw = error?.message?.trim();
  if (!raw) return fallback;

  // 23514 check_violation — match the named constraint before anything else.
  const check = raw.match(/violates check constraint "([^"]+)"/i);
  if (check) {
    const named = CONSTRAINT_MESSAGES[check[1]];
    if (named) return named;

    const negative = check[1].match(NEGATIVE_COUNT);
    if (negative) return `${labelFor(negative[1])} cannot be negative.`;

    const col = Object.keys(FIELD_LABELS).find((c) => check[1].endsWith(`_${c}_check`));
    return col
      ? `${labelFor(col)} is not a valid value.`
      : 'One of the values entered is not allowed.';
  }

  // 22001 string_data_right_truncation — the value is longer than the column.
  const tooLong = raw.match(/value too long for type character varying\((\d+)\)/i);
  if (tooLong) {
    return `One of the values entered is too long (limit ${tooLong[1]} characters). `
         + 'Shorten it and try again.';
  }

  // 23502 not_null_violation — a required field arrived empty.
  const notNull = raw.match(/null value in column "([^"]+)"/i);
  if (notNull) return `${labelFor(notNull[1])} is required.`;

  // 23505 unique_violation — the record already exists.
  const unique = raw.match(/duplicate key value violates unique constraint "([^"]+)"/i);
  if (unique) {
    const col = Object.keys(FIELD_LABELS).find((c) => unique[1].includes(c));
    return col
      ? `That ${labelFor(col)} is already in use.`
      : 'That record already exists.';
  }

  // 23503 foreign_key_violation — points at a record that is gone or in use.
  if (/violates foreign key constraint/i.test(raw)) {
    return /update or delete/i.test(raw)
      ? 'This record is still referenced elsewhere and cannot be removed.'
      : 'A linked record could not be found. Refresh and try again.';
  }

  // 42501 / RLS — the user is signed in but not permitted.
  if (/row-level security|permission denied|insufficient_privilege/i.test(raw)) {
    return 'You do not have permission to make this change.';
  }

  // Anything else — including our own RPC validation messages, which are
  // already written for the officer reading them.
  return raw;
}
