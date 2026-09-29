import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260929225619_database_security_hardening.sql', import.meta.url),
  'utf8',
);

test('all previously unprotected tables are covered by RLS', () => {
  for (const table of [
    'merl.audit_logs',
    'merl.period_label_fix_backup',
    'merl.translatable_fields',
  ]) {
    assert.match(migration, new RegExp(`ALTER TABLE ${table.replace('.', '\\.') } ENABLE ROW LEVEL SECURITY`, 'i'));
  }
  assert.match(migration, /audit_logs_admin_select[\s\S]*TO authenticated[\s\S]*USING \(\(SELECT merl\.is_admin\(\)\)\)/i);
  assert.match(migration, /DROP EXTENSION IF EXISTS postgis/i);
});

test('anonymous public portal RPCs read RLS-protected snapshots as invokers', () => {
  assert.match(migration, /public_portal_inventory[\s\S]*ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /public_portal_project_plans[\s\S]*ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /FUNCTION public\.public_portal_project_inventory\(\)[\s\S]*SECURITY INVOKER/i);
  assert.match(migration, /FUNCTION public\.public_portal_project_plan\(\)[\s\S]*SECURITY INVOKER/i);
  assert.match(migration, /refresh_public_portal_supplemental\(\)/i);
});

test('privileged functions are not anonymously executable', () => {
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon/i);
  assert.match(migration, /DROP EXTENSION IF EXISTS postgis/i);
  assert.match(migration, /translation_coverage[\s\S]*Authentication required/i);
});
