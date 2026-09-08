import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addInitScript(() => localStorage.setItem('merl.lang', 'en'));
await context.route('https://ndntvncboeajanipafeq.supabase.co/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname.startsWith('/auth/v1/')) {
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
  }
  const relation = url.pathname.split('/').pop();
  const rows = relation === 'public_portal_summary'
    ? [{ project_count: 0, overall_progress_pct: null, published_beneficiaries: null, total_investment_vuv: null }]
    : [];
  const single = (route.request().headers().accept || '').includes('vnd.pgrst.object');
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? rows[0] ?? null : rows) });
});
await context.route('https://services.arcgis.com/**', route => route.abort());
await context.route('https://unpkg.com/**', route => route.abort());

const page = await context.newPage();
const assertSingleSignIn = async label => {
  const links = page.locator('.pbd-root a[href="#/login"]');
  const header = page.locator('.pbd-root .dsh-head a.pbd-signin[href="#/login"]');
  if (await links.count() !== 1 || await header.count() !== 1) {
    throw new Error(`${label}: expected exactly one sign-in link, in the header`);
  }
  console.log(`PASS ${label}`);
};

try {
  await page.goto('http://localhost:5199/#/dashboards', { waitUntil: 'domcontentloaded' });
  await page.locator('.pbd-root .pbd-kpis').waitFor({ timeout: 15000 });
  await assertSingleSignIn('Public overview');
  for (const name of ['Projects', 'Results', 'Geographic Coverage', 'Public Overview']) {
    await page.locator('.pbd-root .dsh-nav').getByRole('button', { name, exact: true }).click();
    await assertSingleSignIn(name);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await assertSingleSignIn('Mobile menu open');
  await page.getByRole('button', { name: 'Close menu' }).click();
  await assertSingleSignIn('Mobile menu closed');
  await page.locator('.pbd-root .dsh-head a.pbd-signin').click();
  if (!new URL(page.url()).hash.startsWith('#/login')) throw new Error('Header sign-in did not open login');
  console.log('PASS Header sign-in opens the existing login');
} finally {
  await browser.close();
}
