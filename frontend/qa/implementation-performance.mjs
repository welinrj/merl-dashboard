// Regression for the user-supplied visx implementation chart. Uses only QA fixtures.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const REF = 'ndntvncboeajanipafeq';
const HOST = `https://${REF}.supabase.co`;
const now = Math.floor(Date.now() / 1000);
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 99999 })}.sig`;
const fixture = JSON.parse(readFileSync(process.env.STUB_FILE || 'qa/fixture.json', 'utf8'));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(([ref, token, exp]) => {
  localStorage.setItem('merl.lang', 'en');
  localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
    access_token: token, token_type: 'bearer', expires_in: 99999, expires_at: exp, refresh_token: 'r',
    user: { id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' },
  }));
}, [REF, jwt, now + 99999]);
await context.route(`${HOST}/**`, async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  if (path.endsWith('/rpc/current_profile')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'u1', full_name: 'Admin', role: 'system_admin' }]) });
  if (path.startsWith('/auth/v1/user')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }) });
  if (path.startsWith('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  if (path.startsWith('/rest/v1/')) {
    const rel = path.replace('/rest/v1/', '').split('/')[0];
    let rows = fixture[rel] ?? [];
    for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) rows = rows.filter((row) => String(row[key]) === value.slice(3));
    if ((route.request().headers()['accept'] || '').includes('vnd.pgrst.object')) {
      const one = rows[0] ?? null;
      return route.fulfill({ status: one ? 200 : 406, contentType: 'application/json', body: JSON.stringify(one) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
});
const assert = (condition, message) => { if (!condition) throw new Error(message); };
try {
  const page = await context.newPage();
  for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [360, 780]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
    const chart = page.locator('.merl-implementation-chart');
    await chart.waitFor({ timeout: 15000 });
    const result = await chart.evaluate((root) => {
      const svg = root.querySelector('svg');
      const box = root.getBoundingClientRect();
      const visual = svg.getBoundingClientRect();
      return {
        rows: root.querySelectorAll('.merl-implementation-row').length,
        arcs: root.querySelectorAll('path[role="button"]').length,
        projectTotal: root.querySelector('.merl-implementation-total')?.textContent,
        innerTotal: [...root.querySelectorAll('.merl-implementation-group-title')].length,
        fits: visual.left >= box.left - 1 && visual.right <= box.right + 1 && visual.width > 0,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        invalid: /NaN|undefined/.test(root.textContent),
      };
    });
    assert(result.rows === 8 && result.arcs === 3 && result.projectTotal === '2' && result.innerTotal === 2 && result.fits && !result.overflow && !result.invalid, `${width}px chart failure: ${JSON.stringify(result)}`);
    const notStarted = chart.locator('.merl-implementation-row').filter({ hasText: 'Not Started' });
    await notStarted.click();
    await page.waitForFunction(() => document.querySelector('.ovx-kpi-projects .kpi-card-value')?.textContent === '1');
    assert(await chart.locator('.merl-implementation-empty').count() === 1, 'No-indicator state is missing');
    await notStarted.click();
    await page.waitForFunction(() => document.querySelector('.ovx-kpi-projects .kpi-card-value')?.textContent === '2');
    const offTrack = chart.locator('.merl-implementation-row').filter({ hasText: 'Off track' });
    await offTrack.click();
    assert(await offTrack.getAttribute('aria-pressed') === 'true', 'Indicator focus did not activate');
    assert(await chart.locator('.merl-implementation-clear').count() === 1, 'Clear-focus action is missing');
    await chart.locator('.merl-implementation-clear').click();
    assert(await offTrack.getAttribute('aria-pressed') === 'false', 'Indicator focus did not clear');
    console.log(`✓ ${width}px: real counts, two rings, project filtering, indicator focus, no clipping`);
  }
} finally {
  await browser.close();
}
