import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
test('both institutional logos are bundled and base-aware', () => {
  const component = read('src/components/HeaderPartnerLogos.tsx');
  for (const name of ['docc-logo.png', 'mfat-logo.png']) {
    assert.ok(existsSync(resolve(root, 'public', name)));
    assert.ok(component.includes(name));
  }
  assert.match(component, /import\.meta\.env\.BASE_URL/);
  assert.match(component, /alt="Department of Climate Change, Vanuatu"/);
  assert.match(component, /alt="New Zealand Ministry of Foreign Affairs and Trade"/);
});
test('public and authenticated headers use one shared branding component', () => {
  assert.match(read('src/App.tsx'), /<HeaderPartnerLogos \/>/);
  assert.match(read('src/pages/PublicDashboard.jsx'), /<HeaderPartnerLogos\/>/);
});
test('branding stays in the header and does not replace access controls', () => {
  const app = read('src/App.tsx');
  const publicPage = read('src/pages/PublicDashboard.jsx');
  assert.match(app, /<GlobalSearch \/>/);
  assert.match(app, /<NotificationBell user=\{user\} \/>/);
  assert.match(publicPage, /<PublicHeaderLogin\/>/);
  assert.match(read('src/components/header-partner-logos.css'), /object-fit:contain/);
});
