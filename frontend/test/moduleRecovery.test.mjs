import test from 'node:test';
import assert from 'node:assert/strict';
import {
  freshPageUrl, isModuleLoadError, recoverModuleLoad, loadPageModule,
  MODULE_RECOVERY_KEY, MODULE_RECOVERY_COOLDOWN,
} from '../src/lib/moduleRecovery.js';

const webkitError = () => new TypeError('Importing a module script failed.');
function fixture() {
  const stored = new Map();
  const navigations = [];
  return {
    stored, navigations,
    browser: {
      navigator: { onLine: true },
      sessionStorage: {
        getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value),
      },
      location: {
        href: 'https://example.test/merl-dashboard/?keep=value#/results-framework?project=pa&period=q3',
        replace: url => navigations.push(url),
      },
    },
  };
}

test('recognizes WebKit, Chromium, Firefox and CSS import failures only', () => {
  for (const message of [
    'Importing a module script failed.',
    'Failed to fetch dynamically imported module: https://example.test/old.js',
    'error loading dynamically imported module: https://example.test/old.js',
    'Loading chunk results-123 failed.',
    'Unable to preload CSS for /assets/results.css',
  ]) assert.equal(isModuleLoadError(new TypeError(message)), true, message);
  for (const error of [undefined, {}, 'Failed to fetch', new Error('t is not defined'), new Error('Permission denied')]) {
    assert.equal(isModuleLoadError(error), false);
  }
});

test('refreshes stale HTML once and preserves the full project/period route', () => {
  const { browser, stored, navigations } = fixture();
  stored.set('other-session-state', 'keep');
  assert.equal(recoverModuleLoad(webkitError(), browser, 1000000), true);
  assert.equal(navigations.length, 1);
  const url = new URL(navigations[0]);
  assert.equal(url.pathname, '/merl-dashboard/');
  assert.equal(url.searchParams.get('keep'), 'value');
  assert.equal(url.searchParams.get('_merl_refresh'), '1000000');
  assert.equal(url.hash, '#/results-framework?project=pa&period=q3');
  assert.equal(stored.get('other-session-state'), 'keep');
  assert.equal(stored.get(MODULE_RECOVERY_KEY), '1000000');
  assert.equal(recoverModuleLoad(webkitError(), browser, 1000001), false);
  assert.equal(navigations.length, 1, 'persistent guard prevents a reload loop');
});

test('allows recovery from a later independent deployment failure after the cooldown', () => {
  const { browser, navigations } = fixture();
  recoverModuleLoad(webkitError(), browser, 1000000);
  assert.equal(recoverModuleLoad(webkitError(), browser, 1000000 + MODULE_RECOVERY_COOLDOWN), true);
  assert.equal(navigations.length, 2);
});

test('does not reload offline and leaves the guard available after reconnecting', () => {
  const { browser, stored, navigations } = fixture();
  browser.navigator.onLine = false;
  assert.equal(recoverModuleLoad(webkitError(), browser, 1000000), false);
  assert.equal(navigations.length, 0);
  assert.equal(stored.has(MODULE_RECOVERY_KEY), false);
  browser.navigator.onLine = true;
  assert.equal(recoverModuleLoad(webkitError(), browser, 1000001), true);
});

test('storage or navigation failures fall back to the visible error boundary', () => {
  for (const method of ['getItem', 'setItem']) {
    const { browser, navigations } = fixture();
    browser.sessionStorage[method] = () => { throw new Error('Storage blocked'); };
    assert.equal(recoverModuleLoad(webkitError(), browser), false);
    assert.equal(navigations.length, 0);
  }
  const { browser } = fixture();
  browser.location.replace = () => { throw new Error('Navigation blocked'); };
  assert.equal(recoverModuleLoad(webkitError(), browser), false);
});

test('ordinary runtime errors are never hidden behind automatic reloads', async () => {
  const { browser, stored, navigations } = fixture();
  const error = new Error('t is not defined');
  assert.equal(recoverModuleLoad(error, browser), false);
  await assert.rejects(loadPageModule(() => Promise.reject(error), browser), error);
  assert.equal(navigations.length, 0);
  assert.equal(stored.size, 0);
});

test('lazy loader returns actual modules and propagates unrecoverable import errors', async () => {
  const { browser } = fixture();
  const module = { default: () => null };
  assert.equal(await loadPageModule(() => Promise.resolve(module), browser), module);
  browser.navigator.onLine = false;
  const error = webkitError();
  await assert.rejects(loadPageModule(() => Promise.reject(error), browser), error);
});

test('a recovering lazy import stays pending while the new document loads', async () => {
  const { browser, navigations } = fixture();
  let settled = false;
  void loadPageModule(() => Promise.reject(webkitError()), browser).then(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(navigations.length, 1);
  assert.equal(settled, false);
});

test('manual refresh replaces its cache-busting key instead of growing the URL', () => {
  const first = freshPageUrl('https://example.test/merl-dashboard/?x=1#/reports?period=q3', 1);
  const url = new URL(freshPageUrl(first, 2));
  assert.deepEqual(url.searchParams.getAll('_merl_refresh'), ['2']);
  assert.equal(url.searchParams.get('x'), '1');
  assert.equal(url.hash, '#/reports?period=q3');
});
