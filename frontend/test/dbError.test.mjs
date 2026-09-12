// Checks for lib/dbError.js — specifically that a raw database diagnostic never
// reaches the screen while the messages our own RPCs write for officers do.
//
// The portal talks to PostgREST directly, so a failed call returns the
// database's own error. Some of those are ours: the SECURITY DEFINER RPCs raise
// plain-language messages meant to be read ("Approver access required"). The
// rest are Postgres diagnostics naming relations, columns, constraints and
// function signatures — a free map of the schema for whoever provoked one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dbErrorMessage } from '../src/lib/dbError.js';

const check = (name, fn) => test(name, fn);

// The exact messages the migrations raise. These are written for the officer
// and must survive untouched, or the portal starts saying "Could not save.
// Please try again." when it knows perfectly well what is wrong.
const OUR_RPC_MESSAGES = [
  'Approver access required (DoCC M&E Officer)',
  'You do not have access to this project',
  'Reporting period not found or not awaiting review',
  'A review comment is required when returning a submission for correction',
  'This reporting period is approved and locked. Reopen it before editing.',
  'A reason is required to reopen an approved reporting period',
  'Your current password is not correct',
  'The new password must be at least 10 characters',
  'The new password must be different from the current one',
  'Administrator access required',
  'User not found',
  'This user has no login account',
  'This profile has no login account',
  'Enter a new password',
];

for (const message of OUR_RPC_MESSAGES) {
  check(`passes through our own message: "${message.slice(0, 40)}…"`, () => {
    assert.equal(dbErrorMessage({ message }), message);
  });
}

// Raw diagnostics. Each names something about the schema that a user has no
// business learning from an error toast.
const INTERNAL_DIAGNOSTICS = [
  'relation "merl.reporting_periods" does not exist',
  'column users.encrypted_password does not exist',
  'function public.upsert_indicator_progress(uuid, text) does not exist',
  'permission denied for schema merl',
  'syntax error at or near "SELECT" at character 42',
  'invalid input syntax for type uuid: "not-a-uuid"',
  'operator does not exist: text = uuid',
  'PGRST202: Could not find the function public.foo',
  'could not open relation with OID 16384 (SQLSTATE XX000)',
];

for (const raw of INTERNAL_DIAGNOSTICS) {
  check(`withholds internal diagnostic: "${raw.slice(0, 40)}…"`, () => {
    const out = dbErrorMessage({ message: raw });
    assert.notEqual(out, raw, 'the raw diagnostic reached the caller');
    assert.ok(!/merl\.|public\.|relation |column |SQLSTATE|PGRST/i.test(out),
      `schema detail leaked through: ${out}`);
  });
}

// The recognised classes still produce their specific, useful message rather
// than being swallowed by the new fallback.
check('a not-null violation still names the field', () => {
  const out = dbErrorMessage({ message: 'null value in column "name" of relation "projects" violates not-null constraint' });
  assert.ok(/required/i.test(out), out);
  assert.ok(!/relation|projects/i.test(out), `leaked: ${out}`);
});
check('an RLS refusal still says it is a permission problem', () => {
  const out = dbErrorMessage({ message: 'new row violates row-level security policy for table "projects"' });
  assert.ok(/permission/i.test(out), out);
});
// The schema-prefix marker must not fire on ordinary prose that happens to end
// a sentence with one of those words.
check('a sentence ending in a schema-like word is not suppressed', () => {
  for (const message of [
    'This project record is now public.',
    'The evidence file was saved to storage.',
    'Sign-in is handled by auth.',
  ]) {
    assert.equal(dbErrorMessage({ message }), message, `wrongly suppressed: ${message}`);
  }
});

check('an empty or missing message does not become "undefined"', () => {
  assert.ok(dbErrorMessage({ message: '' }).length > 0);
  assert.ok(dbErrorMessage({}).length > 0);
});
