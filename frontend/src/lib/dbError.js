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
// constraint carries a rule worth explaining, it gets a written message in the
// `err` namespace of i18n.js, in every supported language.
//
// The i18next instance is used directly rather than a hook: these messages are
// produced inside submit handlers, not during render.
//
// Deliberate RAISE EXCEPTION messages from our own RPCs ("Project title is
// required", "You do not have access to this project") come from the database
// in one language and pass through untouched.
import i18n from '../i18n';

// Internal column names that have a written label above their input on the
// form. Anything not listed falls back to the column name made readable.
const FIELD_COLUMNS = [
  'budget_vuv', 'category', 'name', 'code', 'status', 'currency',
  'start_date', 'end_date', 'indicator_level', 'reporting_period',
  'project_id', 'indicator_id', 'output_id', 'title', 'statement',
  'email', 'full_name', 'female', 'male', 'youth',
];

// Constraints that carry a rule worth explaining, keyed by constraint name.
const EXPLAINED_CONSTRAINTS = new Set([
  // Beneficiaries & GEDSI (Form 8)
  'beneficiaries_gender_reconciles',
  'beneficiaries_subsets_within_total',
  // Project profile (Form 1)
  'projects_budget_nonneg',
  // Indicators (Form 3)
  'indicators_baseline_year_plausible',
  // Risks & Issues (Form 9)
  'risks_resolved_after_identified',
  'risks_issues_likelihood_check',
  'risks_issues_impact_check',
  // Locations
  'locations_not_empty',
  'project_locations_latitude_check',
  'project_locations_longitude_check',
  'project_locations_beneficiaries_check',
  // Activities
  'project_activities_physical_progress_pct_check',
  'project_activities_dates_check',
]);

// Fall back to the column name made readable — "persons_with_disability"
// becomes "Persons with disability", so a generated sentence still starts with
// a capital letter. Untranslated by nature: it is the database's own wording.
const labelFor = (col) => {
  if (FIELD_COLUMNS.includes(col)) return i18n.t(`err.field_${col}`);
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
export function dbErrorMessage(error, fallback) {
  const raw = error?.message?.trim();
  if (!raw) return fallback ?? i18n.t('err.fallback');

  // 23514 check_violation — match the named constraint before anything else.
  const check = raw.match(/violates check constraint "([^"]+)"/i);
  if (check) {
    if (EXPLAINED_CONSTRAINTS.has(check[1])) return i18n.t(`err.${check[1]}`);

    const negative = check[1].match(NEGATIVE_COUNT);
    if (negative) return i18n.t('err.negative', { field: labelFor(negative[1]) });

    const col = FIELD_COLUMNS.find((c) => check[1].endsWith(`_${c}_check`));
    return col
      ? i18n.t('err.invalidValue', { field: labelFor(col) })
      : i18n.t('err.notAllowed');
  }

  // 22001 string_data_right_truncation — the value is longer than the column.
  const tooLong = raw.match(/value too long for type character varying\((\d+)\)/i);
  if (tooLong) return i18n.t('err.tooLong', { limit: tooLong[1] });

  // 23502 not_null_violation — a required field arrived empty.
  const notNull = raw.match(/null value in column "([^"]+)"/i);
  if (notNull) return i18n.t('err.required', { field: labelFor(notNull[1]) });

  // 23505 unique_violation — the record already exists.
  const unique = raw.match(/duplicate key value violates unique constraint "([^"]+)"/i);
  if (unique) {
    const col = FIELD_COLUMNS.find((c) => unique[1].includes(c));
    return col
      ? i18n.t('err.duplicateField', { field: labelFor(col) })
      : i18n.t('err.duplicateRecord');
  }

  // 23503 foreign_key_violation — points at a record that is gone or in use.
  if (/violates foreign key constraint/i.test(raw)) {
    return /update or delete/i.test(raw)
      ? i18n.t('err.stillReferenced')
      : i18n.t('err.linkedMissing');
  }

  // 42501 / RLS — the user is signed in but not permitted.
  if (/row-level security|permission denied|insufficient_privilege/i.test(raw)) {
    return i18n.t('err.noPermission');
  }

  // Anything else — including our own RPC validation messages, which are
  // already written for the officer reading them.
  return raw;
}
