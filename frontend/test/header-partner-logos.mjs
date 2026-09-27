import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = p => readFileSync(resolve(root, p), 'utf8');

test('the two requested institutional logos are bundled and base-aware', () => {
  const component = read('src/components/HeaderPartnerLogos.tsx');
  for (const name of ['vanuatu-coat-of-arms.svg', 'docc-logo.png']) {
    assert.ok(existsSync(resolve(root, 'public', name)));
    assert.ok(component.includes(name));
  }
  assert.match(component, /import\.meta\.env\.BASE_URL/);
  assert.match(component, /alt="Coat of arms of Vanuatu"/);
  assert.match(component, /alt="Department of Climate Change, Vanuatu"/);
  assert.doesNotMatch(component, /mfat-logo/);
  assert.doesNotMatch(component, />\s*DoCC\s*</);
  assert.doesNotMatch(component, /The republic of Vanuatu/);
});

test('public and authenticated headers use one shared branding component', () => {
  assert.match(read('src/App.tsx'), /<HeaderPartnerLogos \/>/);
  assert.match(read('src/pages/PublicDashboard.jsx'), /<HeaderPartnerLogos\/>/);
});

test('branding stays in the header and does not replace access controls', () => {
  const app = read('src/App.tsx');
  const publicPage = read('src/pages/PublicDashboard.jsx');
  const css = read('src/components/header-partner-logos.css');
  const layout = read('src/header-institutional-layout.css');
  const finalBranding = read('src/header-two-logo.css');
  assert.match(app, /<GlobalSearch \/>/);
  assert.match(app, /<NotificationBell user=\{user\} \/>/);
  assert.match(publicPage, /<PublicHeaderLogin\/>/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(layout, /\.merl-partner-crest/);
  assert.match(layout, /\.dsh-side \.dsh-brand/);
  assert.match(layout, /max-width:\s*600px/);
  assert.match(layout, /max-width:\s*760px/);
  assert.match(layout, /\.pbd-overlay/);
  assert.match(finalBranding, /object-position:\s*left center/);
  assert.match(finalBranding, /\.dsh\.pbd-root/);
  assert.match(finalBranding, /\.dsh:not\(\.pbd-root\)/);
});

test('obsolete header wordmark rules do not compete with the institutional layout', () => {
  const css = read('src/header-logo.css');
  assert.doesNotMatch(css, /\.dsh-head\s*\{/);
  assert.doesNotMatch(css, /\.dsh-head-title/);
  assert.match(css, /\.dsh-side \.dsh-brand/);
});
