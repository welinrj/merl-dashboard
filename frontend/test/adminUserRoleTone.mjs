import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ADMIN_USER_ROLE_TONES, userRoleTone } from '../src/components/ui/adminUserRoleTone.js';

const expected = {
  system_admin: 'admin',
  docc_me_officer: 'meo',
  project_manager: 'manager',
  viewer: 'viewer',
};

test('each official user role has a distinct, stable row tone', () => {
  assert.deepEqual(ADMIN_USER_ROLE_TONES, expected);
  assert.equal(new Set(Object.values(expected)).size, 4);
  for (const [role, tone] of Object.entries(expected)) assert.equal(userRoleTone(role), tone);
});

test('unknown, missing and retired roles remain neutral', () => {
  for (const role of [null, undefined, '', 'data_entry_officer', 'unknown', '__proto__']) {
    assert.equal(userRoleTone(role), null);
  }
});

test('all role tones have a background, hover and accent without changing row controls', () => {
  const css = readFileSync('src/components/ui/admin-data-table.css', 'utf8');
  const source = readFileSync('src/components/ui/AdminDataTable.jsx', 'utf8');
  for (const tone of Object.values(expected)) {
    assert.ok(css.includes(`data-user-role="${tone}"`));
  }
  assert.match(css, /--adt-role-bg:/);
  assert.match(css, /--adt-role-hover:/);
  assert.match(css, /--adt-role-accent:/);
  assert.match(source, /userRoleTone\(row\.role\)/);
  assert.match(source, /data-user-role=\{roleTone \|\| undefined\}/);
  assert.match(source, /onClick=\{\(\) => \{setMenuId\(null\); option\.onClick\(\);\}\}/);
});
