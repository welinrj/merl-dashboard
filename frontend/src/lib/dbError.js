// dbError.js — turn a PostgREST/Postgres error into something a MERL officer
// can act on.
//
// Supabase returns the raw database error, so a missing field surfaced in the
// UI as:
//
//     null value in column "budget_vuv" of relation "projects"
//     violates not-null constraint
//
// That names an internal column and a constraint class, tells the officer
// nothing about what to do, and reads like a crash rather than a validation
// message. This maps the constraint classes we can actually recognise onto the
// field label the user sees, and otherwise passes the message through — a
// deliberate, hand-written RAISE EXCEPTION from one of our RPCs ("Project title
// is required", "End date cannot be earlier than start date") is already the
// right message and should not be swallowed.

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
};

const labelFor = (col) => FIELD_LABELS[col] || col.replace(/_/g, ' ');

/**
 * @param {{message?: string, code?: string, details?: string} | null} error
 * @param {string} [fallback] used when the error carries no message at all
 * @returns {string} a message worth showing to the user
 */
export function dbErrorMessage(error, fallback = 'Could not save. Please try again.') {
  const raw = error?.message?.trim();
  if (!raw) return fallback;

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

  // 23514 check_violation — a value fell outside its allowed set/range.
  const check = raw.match(/violates check constraint "([^"]+)"/i);
  if (check) {
    const col = Object.keys(FIELD_LABELS).find((c) => check[1].includes(c));
    return col
      ? `${labelFor(col)} is not a valid value.`
      : 'One of the values entered is not allowed.';
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
