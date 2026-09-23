import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminPanel = readFileSync(new URL('../src/pages/AdminPanel.jsx', import.meta.url), 'utf8');
const passwordModal = readFileSync(new URL('../src/components/ui/ChangePasswordModal.jsx', import.meta.url), 'utf8');
const adminAuth = readFileSync(new URL('../src/lib/adminAuth.js', import.meta.url), 'utf8');
const publicLogin = readFileSync(new URL('../src/components/PublicHeaderLogin.jsx', import.meta.url), 'utf8');

test('credential lifecycle never writes passwords through database RPCs', () => {
  const source = `${adminPanel}\n${passwordModal}`;
  for (const legacyRpc of [
    'admin_create_user',
    'admin_reset_password',
    'admin_set_password',
    'admin_provision_login',
    'change_my_password',
  ]) {
    assert.equal(source.includes(`rpc('${legacyRpc}'`), false, legacyRpc);
  }
});

test('administrator credential actions use the protected Edge Function', () => {
  assert.match(adminAuth, /functions\.invoke\('admin-user-auth'/);
  for (const action of ['create-user', 'reset-password', 'provision-login']) {
    assert.match(adminPanel, new RegExp(`adminAuth\\('${action}'`));
  }
  assert.match(passwordModal, /adminAuth\('set-password'/);
});

test('self-service password changes verify the old password then use Auth', () => {
  assert.match(passwordModal, /auth\.signInWithPassword/);
  assert.match(passwordModal, /auth\.updateUser\(\{ password: next \}\)/);
});

test('mobile login keeps failed input available for correction', () => {
  assert.match(publicLogin, /showPassword/);
  assert.match(publicLogin, /showPassword \? 'text' : 'password'/);
  assert.doesNotMatch(publicLogin, /if \(authError\)[\s\S]{0,160}setPassword\(''\)/);
  assert.match(publicLogin, /replace\(\/\[\\r\\n\]\//);
});
