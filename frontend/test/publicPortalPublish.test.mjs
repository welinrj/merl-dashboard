import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overview = readFileSync(new URL('../src/pages/Overview.jsx', import.meta.url), 'utf8');
const i18n = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20260929040321_admin_publish_public_portal.sql', import.meta.url), 'utf8');

test('only system administrators see the public portal publishing control', () => {
  assert.match(overview, /canPublishPublic = user\?\.role === 'ROLE_ADMIN'/);
  assert.match(overview, /\{canPublishPublic && <button/);
  assert.match(overview, /supabase\.rpc\('publish_public_portal'\)/);
  assert.match(overview, /disabled=\{publishingPublic\}/);
  assert.match(overview, /overview\.publishPublic/);
});

test('publishing RPC validates the actor and refreshes both public snapshots', () => {
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /SET search_path = ''/);
  assert.match(migration, /coalesce\(merl\.is_admin\(\), false\) IS NOT TRUE/);
  assert.match(migration, /PERFORM merl\.refresh_public_portal\(\)/);
  assert.match(migration, /PERFORM merl\.refresh_public_indicator_categories\(\)/);
  assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE[\s\S]*TO authenticated, service_role/);
});

test('publishing feedback is translated in English and French', () => {
  assert.match(i18n, /publishPublic:\s+'Publish to public portal'/);
  assert.match(i18n, /publishPublic:\s+'Publier sur le portail public'/);
  assert.match(i18n, /publishSuccess:\s+'The public portal has been updated\.'/);
  assert.match(i18n, /publishSuccess:\s+'Le portail public a été mis à jour\.'/);
});
