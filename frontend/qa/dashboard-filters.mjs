// Regression for the user-approved 21st.dev hierarchy: title, chart with its
// value inside, context, and destination. No production data is modified.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
mkdirSync('qa-artifacts', { recursive: true });

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

try {
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5199/#/dashboards');
  const panel = page.locator('.dashboard-filters');
  await panel.waitFor({ timeout: 15000 });
  const toggle = panel.locator('.dashboard-filters-toggle');
  if (await panel.locator('select').first().isVisible()) throw new Error('Phone filters must start collapsed');
  await toggle.click();
  if (await toggle.getAttribute('aria-expanded') !== 'true') throw new Error('Filter expansion not announced');
  if (await panel.locator('select:visible').count() !== 7) throw new Error('Every field must be available');
  for (const label of await panel.locator('.dashboard-filter-field').all()) {
    const caption = label.locator('span');
    if (!(await caption.isVisible()) || !(await caption.innerText()).trim()) throw new Error('A filter label is hidden');
  }
  await panel.getByLabel('Province', { exact: true }).selectOption('TAFEA');
  const chip = panel.getByRole('button', { name: 'Remove filter: Province: TAFEA', exact: true });
  await chip.waitFor();
  await panel.getByRole('button', { name: 'Show results', exact: true }).click();
  if (await panel.locator('select').first().isVisible() || !(await chip.isVisible())) throw new Error('Selections must remain visible when collapsed');
  if (await toggle.getAttribute('aria-expanded') !== 'false') throw new Error('Closed state not announced');
  if (!(await toggle.evaluate(el => el === document.activeElement))) throw new Error('Closing filters must restore focus');
  await page.screenshot({ path: 'qa-artifacts/header-filter-phone.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  if (await panel.locator('select:visible').count() !== 7) throw new Error('Desktop fields must always be visible');
  if (await panel.getByLabel('Province', { exact: true }).inputValue() !== 'TAFEA') throw new Error('Resizing changed the selected province');
  await chip.click();
  if (await panel.getByLabel('Province', { exact: true }).inputValue() !== '') throw new Error('Removing chip did not clear the field');
  await panel.getByLabel('Province', { exact: true }).selectOption('TAFEA');
  await panel.getByLabel('Status', { exact: true }).selectOption('on_track');
  await panel.getByRole('button', { name: 'Clear all', exact: true }).click();
  if (await panel.locator('.dashboard-filter-selections li').count()) throw new Error('Clear all left active filters');
  for (const field of await panel.locator('select').all()) if (await field.inputValue()) throw new Error('Clear all left a selected field');
  await page.screenshot({ path: 'qa-artifacts/header-filter-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 360, height: 780 });
  await toggle.click();
  const overflow = await panel.evaluate(el => el.scrollWidth > el.clientWidth + 1);
  if (overflow) throw new Error('Phone filter panel overflows');
  await page.screenshot({ path: 'qa-artifacts/header-filter-expanded-phone.png', animations: 'disabled' });
  console.log('PASS Labelled phone filters, selection chips, focus, individual removal, clear all and desktop resize persistence');
} finally { await browser.close(); }
