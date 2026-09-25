import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../src/App.tsx');
const entry = read('../src/main.jsx');
const css = read('../src/mobile-dashboard.css');
const browserQa = read('../qa/header-brand-layout.mjs');

test('mobile navigation lives inside the authenticated shell and uses its role-filtered links', () => {
  assert.doesNotMatch(entry, /MobileThumbNav|dsh-mobile-nav/);
  assert.match(app, /if \(!user\) return <LoginScreen/);
  assert.match(app, /visibleNav = NAV_ITEMS\.filter\(n => allowed\.includes\(n\.key\)\)/);
  assert.match(app, /mobileNav = visibleNav\.filter/);
  assert.match(app, /mobileNav\.map\(\(\{ key, path, Icon \}\)/);
  assert.match(app, /visibleNav\.map\(\(\{ key, path, search, Icon \}\)/);
});

test('Results Framework deep links check the same permission as the navigation', () => {
  assert.match(app, /'\/results-framework': 'results'/);
  assert.match(app, /path="\/results-framework" element=\{gate\('\/results-framework'\) \? <ResultsWorkspace/);
  assert.match(app, /<button type="button" aria-label=\{t\('shell\.toggleMenu'\)\}/);
  assert.match(css, /grid-auto-columns:minmax\(0,1fr\)/);
  assert.match(browserQa, /authenticated&&width<=560/);
  assert.match(browserQa, /\.dsh-mobile-nav button/);
});
